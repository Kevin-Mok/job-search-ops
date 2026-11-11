import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";
import { prepareJobResume, renderPreparedJobResume, type ResumeCandidate, type CanonicalResumeProfile, type ApprovedResumeClaim } from "../src/core/job-resume.js";
import { renderResumeProfile } from "../src/core/resume-profile.js";

const portfolioRoot = process.env.JOB_OPS_PORTFOLIO_ROOT;
const hash = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");
function command(executable: string, args: string[]) {
  const result = spawnSync(executable, args, { encoding: "utf8", timeout: 60_000 });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}
function boxes(pdf: string) {
  const xml = command("pdftotext", ["-bbox-layout", pdf, "-"]);
  return [...xml.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)]
    .map(match => ({ text: match[5], bounds: match.slice(1, 5).map(Number) }));
}

// The oracle uses the actual portfolio base/typography/utility sources and page wrapper,
// independently of the adapter's reduced print context. No portfolio build or writes.
test.runIf(Boolean(portfolioRoot))("matches canonical same-content Letter geometry, including wrapping and vertical rhythm", async () => {
  const root = portfolioRoot!;
  const read = (name: string) => fs.readFileSync(path.join(root, name), "utf8");
  const directory = process.env.JOB_OPS_LAYOUT_PROOF_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "resume-layout-"));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const candidate: ResumeCandidate & { profile: CanonicalResumeProfile } = JSON.parse(fs.readFileSync("fixtures/resume/representative-candidate.json", "utf8"));
  const evidence: ApprovedResumeClaim[] = JSON.parse(fs.readFileSync("fixtures/resume/representative-evidence.json", "utf8"));
  candidate.profile.baseline.sources[0].sha256 = hash(fs.readFileSync(path.join(root, candidate.profile.baseline.sources[0].path)));
  const fontCss = read("app/styles/03-fonts.css").replace(/url\("(\/fonts\/[^\"]+)"\)/g,
    (_match, localPath: string) => `url("${pathToFileURL(path.join(root, "public", localPath)).href}")`);
  const css = [fontCss, ...["05-base", "06-typography", "09-utilities", "13-resume-latex"].map(name => read(`app/styles/${name}.css`))].join("\n");
  const cases = [
    { id: "developer", title: "Junior Python Developer", company: "Maple Systems" },
    { id: "support", title: "Customer Support Specialist", company: "BrightDesk" },
    { id: "long", title: "Python Developer for Customer Support Integrations and Internal Application Tooling", company: "Example Application Systems" }
  ];
  for (const target of cases) {
    const input = structuredClone(candidate);
    const prepared = prepareJobResume({ jobId: `synthetic-${target.id}`, postingVersion: "v1", threadId: `synthetic-thread-${target.id}`, candidate: input, target, evidence });
    const artifact = await renderPreparedJobResume({ prepared, outputDir: path.join(directory, target.id), portfolioRoot: root });
    const content = renderResumeProfile({ ...prepared.candidate, profile: prepared.candidate.profile! }, target, prepared.claims);
    const reference = path.join(directory, `${target.id}-canonical`);
    // px-3 is the canonical unlayered utility: 1.5rem per side. The PDF
    // page wrapper contributes no vertical padding in the retained reference.
    fs.writeFileSync(`${reference}.html`, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="px-3"><div class="resume-page-container"><div class="resume-page-surface">${content}</div></div></div></body></html>`);
    command("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-background-networking", `--user-data-dir=${reference}-chrome`, "--virtual-time-budget=2000", "--no-pdf-header-footer", `--print-to-pdf=${reference}.pdf`, pathToFileURL(`${reference}.html`).href]);
    fs.rmSync(`${reference}-chrome`, { recursive: true, force: true });
    const actual = boxes(artifact.pdfPath);
    const expected = boxes(`${reference}.pdf`);
    fs.writeFileSync(path.join(directory, `${target.id}-geometry.json`), JSON.stringify({ artifact: { sha256: artifact.sha256, pdfPath: artifact.pdfPath, previewPath: artifact.previewPath }, actual, expected }, null, 2));
    // PDF text extraction rounds fractional CSS pixels. 0.3pt permits only
    // subpixel rounding, never the prior 18pt inset error or an extra line.
    expect(Math.min(...actual.map(word => word.bounds[0]))).toBeCloseTo(32.25, 1);
    expect(Math.max(...actual.map(word => word.bounds[2]))).toBeCloseTo(579.75, 1);
    expect(actual.map(word => word.text)).toEqual(expected.map(word => word.text));
    for (let index = 0; index < expected.length; index++) {
      for (let axis = 0; axis < 4; axis++) expect(Math.abs(actual[index].bounds[axis] - expected[index].bounds[axis]), `${target.id} word ${index} axis ${axis}`).toBeLessThanOrEqual(0.3);
    }
    expect(actual.every(word => word.bounds[0] >= 32 && word.bounds[2] <= 580 && word.bounds[1] >= 0 && word.bounds[3] < 771)).toBe(true);
  }
  const overflow = structuredClone(candidate);
  overflow.profile.experience[0].title = "Application Developer for Data Import Validation and Customer Support Integrations";
  overflow.profile.projects[1].name = "Example Project Portal for Shared Application Configuration and Account Administration";
  const target = cases[2];
  const prepared = prepareJobResume({ jobId: "synthetic-overflow", postingVersion: "v1", threadId: "synthetic-overflow-thread", candidate: overflow, target, evidence });
  await expect(renderPreparedJobResume({ prepared, outputDir: path.join(directory, "overflow"), portfolioRoot: root })).rejects.toThrow(/exactly one page/);

}, 120_000);
