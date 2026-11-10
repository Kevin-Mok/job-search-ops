import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { prepareResumeProfile, renderResumeProfile, type CanonicalResumeProfile } from "./resume-profile.js";

export type { CanonicalResumeProfile, CanonicalResumeWork, CanonicalResumeProject, ResumeSource } from "./resume-profile.js";

const execFileAsync = promisify(execFile);
const placeholder = /\b(?:TODO|TBD|PLACEHOLDER|lorem ipsum)\b|\{\{[^}]+\}\}|\[INSERT\b/i;
const hash = (bytes: string | Uint8Array): string => crypto.createHash("sha256").update(bytes).digest("hex");
const plain = (text: string): string => text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\s+/g, " ").trim();
function required(value: unknown, label: string, limit = 2000): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`Resume ${label} must be nonempty bounded text.`);
  if (placeholder.test(value)) throw new Error(`Resume ${label} contains an unresolved placeholder.`);
  return value.trim();
}
export interface ApprovedResumeClaim { id: string; claim: string; source: string; approved: boolean }
export interface ResumeCandidate { name: string; email: string; profile?: CanonicalResumeProfile }
export interface JobResumeInput {
  jobId: string;
  postingVersion: string;
  threadId: string;
  candidate: ResumeCandidate;
  target: { title: string; company: string };
  evidence: ApprovedResumeClaim[];
  selectedEvidenceIds?: string[];
}
export interface PreparedJobResume {
  version: 1;
  jobId: string;
  postingVersion: string;
  threadId: string;
  candidate: ResumeCandidate;
  target: { title: string; company: string };
  claims: ApprovedResumeClaim[];
  requiredText: string[];
  evidenceVersion: string;
  inputHash: string;
}
export interface ValidatedResumeArtifact {
  jobId: string;
  postingVersion: string;
  threadId: string;
  sha256: string;
  bindingHash: string;
  bytes: Buffer;
  pdfPath: string;
  previewPath: string;
  validatedAt: string;
  visualReview: "pending";
  renderer: "portfolio-cmu-private-adapter-v1" | "external-portfolio-artifact";
  layoutMeasurement?: { pageWidthPts: number; pageHeightPts: number; topWhitespacePts: number; bottomWhitespacePts: number };
}
export interface ValidateJobResumeParams {
  pdfPath: string;
  jobId: string;
  postingVersion: string;
  threadId: string;
  candidateName: string;
  targetTitle: string;
  targetCompany: string;
  outputDir: string;
  portfolioRoot: string;
  expectedSha256?: string;
  requiredText?: string[];
}

export function prepareJobResume(input: JobResumeInput): PreparedJobResume {
  const jobId = required(input.jobId, "job ID", 512);
  const postingVersion = required(input.postingVersion, "posting version", 512);
  const threadId = required(input.threadId, "thread ID", 512);
  const candidate: ResumeCandidate = { name: required(input.candidate?.name, "candidate name", 200), email: required(input.candidate?.email, "candidate email", 254) };
  const target = { title: required(input.target?.title, "target title", 300), company: required(input.target?.company, "target company", 300) };
  if (!Array.isArray(input.evidence) || input.evidence.length === 0 || input.evidence.length > 200) throw new Error("Resume requires a bounded approved evidence set.");
  const evidence = input.evidence.map(entry => {
    if (!entry || entry.approved !== true) throw new Error("Every resume claim must be explicitly approved evidence.");
    const claim = required(entry.claim, "claim");
    if (/<[^>]+>/.test(claim)) throw new Error("Resume evidence uses plain text or **bold** emphasis, never executable HTML.");
    return { id: required(entry.id, "evidence ID", 200), claim, source: required(entry.source, "evidence source", 2000), approved: true };
  });
  const byId = new Map(evidence.map(entry => [entry.id, entry]));
  if (byId.size !== evidence.length) throw new Error("Duplicate resume evidence IDs are not allowed.");
  let claims = evidence;
  if (input.selectedEvidenceIds) {
    if (!Array.isArray(input.selectedEvidenceIds) || !input.selectedEvidenceIds.length || new Set(input.selectedEvidenceIds).size !== input.selectedEvidenceIds.length) throw new Error("Selected resume evidence must contain unique approved IDs.");
    claims = input.selectedEvidenceIds.map(id => {
      const entry = byId.get(id);
      if (!entry) throw new Error("Selected resume evidence ID is not approved.");
      return entry;
    });
  } else {
    const words = new Set(target.title.toLowerCase().match(/[a-z0-9+#]+/g) ?? []);
    const relevance = (entry: ApprovedResumeClaim): number => [...words].filter(word => word.length > 2 && plain(entry.claim).toLowerCase().split(/[^a-z0-9+#]+/).includes(word)).length;
    claims = [...claims].sort((a, b) => relevance(b) - relevance(a));
  }
  let profileText: string[] = [];
  if (input.candidate.profile !== undefined) {
    const canonical = prepareResumeProfile(input.candidate.profile, evidence, target.title, input.selectedEvidenceIds);
    candidate.profile = canonical.profile;
    claims = canonical.claims;
    profileText = canonical.requiredText;
  }
  const evidenceVersion = hash(JSON.stringify(evidence));
  const base = { version: 1 as const, jobId, postingVersion, threadId, candidate, target, claims, evidenceVersion };
  return { ...base, requiredText: [candidate.name, candidate.email, target.title, target.company, ...profileText, ...claims.map(entry => plain(entry.claim))], inputHash: hash(JSON.stringify(base)) };
}

async function verifyProfileSources(profile: CanonicalResumeProfile, portfolioRoot: string): Promise<void> {
  const root = await fs.realpath(portfolioRoot);
  for (const source of profile.baseline.sources) {
    const file = await fs.realpath(path.join(root, source.path));
    const relative = path.relative(root, file);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error("Resume profile source resolves outside the read-only portfolio.");
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024 || hash(await fs.readFile(file)) !== source.sha256) throw new Error("Resume profile baseline source hash changed; revalidate the private profile provenance.");
  }
}

/** Revalidate persisted inputs before rendering or attaching their bound PDF. */
export async function verifyPreparedJobResume(prepared: PreparedJobResume, portfolioRoot: string): Promise<PreparedJobResume> {
  if (prepared?.version !== 1) throw new Error("Prepared resume version must be 1.");
  const checked = prepareJobResume({ ...prepared, evidence: prepared.claims, selectedEvidenceIds: prepared.claims?.map(entry => entry.id) });
  const { version, jobId, postingVersion, threadId, candidate, target, claims, evidenceVersion } = prepared;
  if (hash(JSON.stringify({ version, jobId, postingVersion, threadId, candidate, target, claims, evidenceVersion })) !== prepared.inputHash) throw new Error("Prepared resume input hash does not match its bound claims and target.");
  if (JSON.stringify(prepared.requiredText) !== JSON.stringify(checked.requiredText)) throw new Error("Prepared resume required text does not match its validated profile and claims.");
  if (checked.candidate.profile) await verifyProfileSources(checked.candidate.profile, portfolioRoot);
  return checked;
}

async function safeOutputDirectory(outputDir: string, portfolioRoot: string): Promise<string> {
  const source = await fs.realpath(portfolioRoot);
  const resolved = path.resolve(outputDir);
  const relative = path.relative(source, resolved);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) throw new Error("Resume output must remain outside the read-only portfolio checkout.");
  await fs.mkdir(resolved, { recursive: true, mode: 0o700 });
  const real = await fs.realpath(resolved);
  const realRelative = path.relative(source, real);
  if (!realRelative || (!realRelative.startsWith(`..${path.sep}`) && realRelative !== ".." && !path.isAbsolute(realRelative))) throw new Error("Resume output resolves inside the read-only portfolio checkout.");
  return real;
}
async function command(executable: string, args: string[], cwd?: string): Promise<string> {
  try {
    return (await execFileAsync(executable, args, { cwd, timeout: 60_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, LC_ALL: "C" } })).stdout;
  } catch {
    throw new Error(`Resume verification command ${path.basename(executable)} failed; inspect the private artifact and tool installation.`);
  }
}

export async function validateJobResumeArtifact(params: ValidateJobResumeParams): Promise<ValidatedResumeArtifact> {
  const bytes = await fs.readFile(params.pdfPath);
  const sha256 = hash(bytes);
  if (params.expectedSha256 && params.expectedSha256 !== sha256) throw new Error("Resume artifact hash does not match the approved bytes.");
  if (bytes.length < 100 || bytes.length > 10 * 1024 * 1024 || bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Resume artifact is not a bounded PDF file.");
  const outputDir = await safeOutputDirectory(params.outputDir, params.portfolioRoot);
  const pdfPath = path.join(outputDir, `${sha256}.pdf`);
  if (path.resolve(params.pdfPath) !== pdfPath) {
    try { await fs.writeFile(pdfPath, bytes, { mode: 0o600, flag: "wx" }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if ((await fs.lstat(pdfPath)).isSymbolicLink() || hash(await fs.readFile(pdfPath)) !== sha256) throw new Error("Resume snapshot path is occupied by an unrelated artifact.");
    }
  }
  const info = await command("pdfinfo", [pdfPath]);
  if (!/^Pages:\s+1\s*$/m.test(info)) throw new Error("Resume PDF must contain exactly one page.");
  if (!/^Page size:\s+612(?:\.0+)? x 792(?:\.0+)? pts \(letter\)\s*$/mi.test(info)) throw new Error("Resume PDF must use one-page US Letter dimensions.");
  const fonts = (await command("pdffonts", [pdfPath])).split("\n").slice(2).map(line => line.trim()).filter(Boolean);
  if (!fonts.length || fonts.some(line => !/^(?:[A-Z]+\+)?CMUSerif(?:[-\w]*)?\s/.test(line))) throw new Error("Resume PDF must use only local Computer Modern Serif fonts.");
  if (!fonts.some(line => /CMUSerif[^\s]*Bold/i.test(line))) throw new Error("Resume PDF is missing the required embedded bold font face.");
  if (fonts.some(line => !/\byes\s+(?:yes|no)\s+(?:yes|no)\s+\d+\s+\d+\s*$/.test(line))) throw new Error("Resume PDF fonts must be embedded.");
  const text = plain(await command("pdftotext", ["-layout", pdfPath, "-"]));
  if (placeholder.test(text)) throw new Error("Resume PDF contains unresolved placeholders.");
  const requiredText = [params.candidateName, params.targetTitle, params.targetCompany, ...(params.requiredText ?? [])];
  if (requiredText.some(value => !text.includes(plain(required(value, "required text"))))) throw new Error("Resume PDF is missing required text for this candidate or target.");
  const measured: unknown = JSON.parse(await command(process.execPath, [path.join(params.portfolioRoot, "scripts/measure-resume-bottom-whitespace.mjs"), "--pdf", pdfPath, "--json"], params.portfolioRoot));
  const measurements = measured && typeof measured === "object" ? (measured as { results?: unknown }).results : undefined;
  if (!Array.isArray(measurements) || measurements.length !== 1 || !measurements[0] || typeof measurements[0] !== "object") throw new Error("Portfolio layout measurement did not return this exact artifact.");
  const metrics = measurements[0] as Record<string, unknown>;
  const layoutMeasurement = { pageWidthPts: Number(metrics.pageWidthPts), pageHeightPts: Number(metrics.pageHeightPts), topWhitespacePts: Number(metrics.topWhitespacePts), bottomWhitespacePts: Number(metrics.bottomWhitespacePts) };
  if (Object.values(layoutMeasurement).some(value => !Number.isFinite(value))) throw new Error("Portfolio layout measurement contains invalid metrics.");
  await command(process.execPath, [path.join(params.portfolioRoot, "scripts/verify-resume-layout.mjs"), "--pdf", pdfPath, "--json"], params.portfolioRoot);
  const previewPrefix = path.join(outputDir, sha256);
  await command("pdftoppm", ["-f", "1", "-singlefile", "-scale-to", "1400", "-png", pdfPath, previewPrefix]);
  if (hash(await fs.readFile(pdfPath)) !== sha256) throw new Error("Resume PDF changed during validation; validate the final bytes again.");
  const jobId = required(params.jobId, "job ID", 512);
  const postingVersion = required(params.postingVersion, "posting version", 512);
  const threadId = required(params.threadId, "thread ID", 512);
  return { jobId, postingVersion, threadId, sha256, bindingHash: hash(JSON.stringify({ jobId, postingVersion, threadId, sha256 })), bytes, pdfPath, previewPath: `${previewPrefix}.png`, validatedAt: new Date().toISOString(), visualReview: "pending", renderer: "external-portfolio-artifact", layoutMeasurement };
}

function escapeHtml(text: string): string { return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function emphasized(text: string): string { return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"); }

export async function renderPreparedJobResume(params: {
  prepared: PreparedJobResume; outputDir: string; portfolioRoot: string; chromeBinary?: string;
}): Promise<ValidatedResumeArtifact> {
  const checked = await verifyPreparedJobResume(params.prepared, params.portfolioRoot);
  const outputDir = await safeOutputDirectory(params.outputDir, params.portfolioRoot);
  const { prepared } = params;
  const fontCss = (await fs.readFile(path.join(params.portfolioRoot, "app/styles/03-fonts.css"), "utf8"))
    .replace(/url\("(\/fonts\/[^\"]+)"\)/g, (_match, localPath: string) => `url("${pathToFileURL(path.join(params.portfolioRoot, "public", localPath)).href}")`);
  const layoutCss = await fs.readFile(path.join(params.portfolioRoot, "app/styles/13-resume-latex.css"), "utf8");
  const renderDir = await fs.mkdtemp(path.join(outputDir, "render-"));
  const htmlPath = path.join(renderDir, `${prepared.inputHash}.html`);
  const generatedPath = path.join(renderDir, `${prepared.inputHash}-generated.pdf`);
  const content = prepared.candidate.profile ? renderResumeProfile({ ...prepared.candidate, profile: prepared.candidate.profile }, prepared.target, prepared.claims) : `<main class="resume-latex resume-latex--pdf"><header class="resume-header"><h1 class="resume-name">${escapeHtml(prepared.candidate.name)}</h1><div class="resume-contact-columns"><div class="resume-contact-column"><span class="contact-label">${escapeHtml(prepared.candidate.email)}</span></div></div></header><section class="resume-section"><h2 class="resume-section-title">${escapeHtml(prepared.target.title)}</h2><p class="resume-summary">Application target: ${escapeHtml(prepared.target.company)}</p></section><section class="resume-section"><h2 class="resume-section-title">Selected contribution evidence</h2><ul class="resume-bullets">${prepared.claims.map(entry => `<li>${emphasized(entry.claim)}</li>`).join("")}</ul></section></main>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src file:"><title>${escapeHtml(prepared.candidate.name)} | ${escapeHtml(prepared.target.title)} | ${escapeHtml(prepared.jobId)}</title><style>html,body{margin:0;padding:0}*{box-sizing:border-box}${fontCss}\n${layoutCss}</style></head><body class="resume-page-surface">${content}</body></html>`;
  await fs.writeFile(htmlPath, html, { mode: 0o600 });
  const chromeProfile = path.join(renderDir, ".chrome-profile");
  try {
    await command(params.chromeBinary ?? "google-chrome", ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-sync", `--user-data-dir=${chromeProfile}`, "--run-all-compositor-stages-before-draw", "--virtual-time-budget=2000", "--no-pdf-header-footer", `--print-to-pdf=${generatedPath}`, pathToFileURL(htmlPath).href]);
  } finally {
    await fs.rm(chromeProfile, { recursive: true, force: true });
  }
  const artifact = await validateJobResumeArtifact({ pdfPath: generatedPath, jobId: prepared.jobId, postingVersion: prepared.postingVersion, threadId: prepared.threadId, candidateName: prepared.candidate.name, targetTitle: prepared.target.title, targetCompany: prepared.target.company, requiredText: checked.requiredText, outputDir, portfolioRoot: params.portfolioRoot });
  const renderer = "portfolio-cmu-private-adapter-v1" as const;
  await fs.writeFile(path.join(outputDir, `${artifact.sha256}.json`), JSON.stringify({ ...prepared, artifact: { ...artifact, bytes: undefined, renderer }, styleSha256: hash(layoutCss), fontCssSha256: hash(fontCss) }, null, 2) + "\n", { mode: 0o600 });
  return { ...artifact, renderer };
}
