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
const postingCases = JSON.parse(fs.readFileSync("fixtures/resume/posting-cases.json", "utf8")) as { roles: { id: string; target: { title: string; company: string }; selectedEvidenceIds: string[]; requirements: { id: string; importance: string; coverage: string; evidenceIds: string[]; gap: string }[] }[] };
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

function assertGeometry(actual: ReturnType<typeof boxes>, expected: ReturnType<typeof boxes>) {
  if (JSON.stringify(actual.map(word => word.text)) !== JSON.stringify(expected.map(word => word.text))) throw new Error("Canonical text/wrapping mismatch");
  for (let index = 0; index < expected.length; index++) {
    for (let axis = 0; axis < 4; axis++) {
      if (Math.abs(actual[index].bounds[axis] - expected[index].bounds[axis]) > 0.3) throw new Error(`Canonical spacing mismatch at word ${index}, axis ${axis}`);
    }
  }
  if (!actual.every(word => word.bounds[0] >= 32 && word.bounds[2] <= 580 && word.bounds[1] >= 0 && word.bounds[3] < 771)) throw new Error("Text clipping or overflow");
}

// Native disc markers are not reliably emitted by pdftotext. Inspect the
// rendered pixels at each approved claim's first-line marker, using Poppler PGM.
function markerPixels(pdf: string, words: ReturnType<typeof boxes>, claims: ApprovedResumeClaim[]) {
  const raster = spawnSync("pdftoppm", ["-f", "1", "-singlefile", "-r", "144", "-gray", pdf], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  expect(raster.status, raster.stderr.toString()).toBe(0);
  const header = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(raster.stdout.subarray(0, 80).toString("ascii"));
  expect(header).not.toBeNull();
  const width = Number(header![1]);
  const height = Number(header![2]);
  const pixels = raster.stdout.subarray(header![0].length);
  expect(pixels.length).toBe(width * height);
  return claims.map(claim => {
    const prefix = claim.claim.replaceAll("**", "").split(/\s+/).slice(0, 4);
    const first = words.find((_, index) => prefix.every((text, offset) => words[index + offset]?.text === text));
    expect(first, claim.id).toBeDefined();
    // Canonical native disc is centered at32.25pt; text starts beyond43pt.
    // This5pt strip excludes the approved text and covers the first line only.
    const top = Math.floor(first!.bounds[1] * 2);
    const bottom = Math.ceil(first!.bounds[3] * 2);
    let ink = 0;
    for (let y = top; y < bottom; y++) for (let x = 60; x < 70; x++) if (pixels[y * width + x] < 128) ink++;
    return { id: claim.id, ink };
  });
}

test("frozen synthetic postings select differing supported evidence and retain honest gaps", () => {
  const candidate = JSON.parse(fs.readFileSync("fixtures/resume/representative-candidate.json", "utf8"));
  const evidence = JSON.parse(fs.readFileSync("fixtures/resume/representative-evidence.json", "utf8"));
  const prepared = postingCases.roles.map(role => {
    for (const requirement of role.requirements) {
      expect(requirement.importance).toBeTruthy();
      expect(requirement.gap).toBeTruthy();
      for (const id of requirement.evidenceIds) expect(role.selectedEvidenceIds).toContain(id);
    }
    return prepareJobResume({ jobId: role.id, postingVersion: "frozen", threadId: role.id, candidate, evidence, target: role.target, selectedEvidenceIds: role.selectedEvidenceIds });
  });
  expect(prepared[0].claims.map(claim => claim.id)).not.toEqual(prepared[1].claims.map(claim => claim.id));
  expect(prepared[0].claims).toHaveLength(11);
  expect(prepared[1].claims).toHaveLength(11);
  expect(prepared[0].candidate.profile!.education).toEqual(prepared[1].candidate.profile!.education);
});

// The oracle uses the actual portfolio base/typography/utility sources and page wrapper,
// independently of the adapter's reduced print context. No portfolio build or writes.
test.runIf(Boolean(portfolioRoot))("matches canonical same-content Letter geometry, including wrapping and vertical rhythm", async () => {
  const root = portfolioRoot!;
  const read = (name: string) => fs.readFileSync(path.join(root, name), "utf8");
  const directory = process.env.JOB_OPS_LAYOUT_PROOF_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), "resume-layout-"));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const candidate: ResumeCandidate & { profile: CanonicalResumeProfile } = JSON.parse(fs.readFileSync("fixtures/resume/representative-candidate.json", "utf8"));
  const evidence: ApprovedResumeClaim[] = JSON.parse(fs.readFileSync("fixtures/resume/representative-evidence.json", "utf8"));
  // Preserve the fixture's pinned provenance; a changed canonical CSS must fail.
  expect(candidate.profile.baseline.sources[0].sha256).toBe(hash(fs.readFileSync(path.join(root, candidate.profile.baseline.sources[0].path))));
  candidate.profile.contact.linkedin = "https://example.test/in/alex-example";
  candidate.profile.contact.github = "https://example.test/alex-example";
  const fontCss = read("app/styles/03-fonts.css").replace(/url\("(\/fonts\/[^\"]+)"\)/g,
    (_match, localPath: string) => `url("${pathToFileURL(path.join(root, "public", localPath)).href}")`);
  const css = [fontCss, ...["05-base", "06-typography", "09-utilities", "13-resume-latex"].map(name => read(`app/styles/${name}.css`))].join("\n");
  const cases = [
    ...postingCases.roles.map(role => ({ id: role.id, ...role.target, selectedEvidenceIds: role.selectedEvidenceIds })),
    { id: "long", title: "Python Developer for Customer Support Integrations and Internal Application Tooling", company: "Example Application Systems", selectedEvidenceIds: evidence.map(claim => claim.id) }
  ];
  for (const target of cases) {
    const input = structuredClone(candidate);
    const prepared = prepareJobResume({ jobId: `synthetic-${target.id}`, postingVersion: "v1", threadId: `synthetic-thread-${target.id}`, candidate: input, target, evidence, selectedEvidenceIds: target.selectedEvidenceIds });
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
    assertGeometry(actual, expected);
    const actualMarkers = markerPixels(artifact.pdfPath, actual, prepared.claims);
    const canonicalMarkers = markerPixels(`${reference}.pdf`, expected, prepared.claims);
    fs.writeFileSync(path.join(directory, `${target.id}-markers.json`), JSON.stringify({ actualMarkers, canonicalMarkers }, null, 2));
    for (const marker of [...actualMarkers, ...canonicalMarkers]) expect(marker.ink, `Visible disc for ${target.id}/${marker.id}`).toBeGreaterThan(4);
    // PR2's full 12-bullet controls end 40.465–55.465pt above the bottom.
    // Omitting one approved bullet permits at most three canonical 15pt lines.
    expect(artifact.layoutMeasurement!.bottomWhitespacePts).toBeGreaterThanOrEqual(35);
    expect(artifact.layoutMeasurement!.bottomWhitespacePts).toBeLessThanOrEqual(100.5);
    const fonts = command("pdffonts", [artifact.pdfPath]);
    expect(fonts).toMatch(/CMUSerif-Roman\s/);
    expect(fonts).toMatch(/CMUSerif-Bold\s/);
    const links = command("pdfinfo", ["-url", artifact.pdfPath]);
    for (const url of ["mailto:alex@example.test", "https://example.test/studio", "https://example.test/importer", "https://example.test/portal", "https://example.test/in/alex-example", "https://example.test/alex-example"]) expect(links).toContain(url);
    fs.writeFileSync(path.join(directory, `${target.id}-coverage.json`), JSON.stringify({ target, selectedClaims: prepared.claims, requirements: postingCases.roles.find(role => role.id === target.id)?.requirements, measurement: artifact.layoutMeasurement, pdfSha256: artifact.sha256, pngSha256: hash(fs.readFileSync(artifact.previewPath)) }, null, 2));
    if (target.id === "support") {
      // Executable counterexample: recreate the previous missing horizontal context.
      const wrong = `${reference}-wrong`;
      fs.writeFileSync(`${wrong}.html`, fs.readFileSync(`${reference}.html`, "utf8").replace("</style>", ".px-3{padding-inline:0!important}</style>"));
      command("google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--disable-background-networking", `--user-data-dir=${wrong}-chrome`, "--virtual-time-budget=2000", "--no-pdf-header-footer", `--print-to-pdf=${wrong}.pdf`, pathToFileURL(`${wrong}.html`).href]);
      fs.rmSync(`${wrong}-chrome`, { recursive: true, force: true });
      expect(Math.min(...boxes(`${wrong}.pdf`).map(word => word.bounds[0]))).toBeLessThan(32);
      expect(() => assertGeometry(boxes(`${wrong}.pdf`), expected)).toThrow(/Canonical spacing mismatch|Canonical text\/wrapping mismatch|Text clipping/);
      fs.writeFileSync(path.join(directory, "negative-spacing.json"), JSON.stringify({ rejected: true, reason: "Removed canonical wrapper inset", actual: boxes(`${wrong}.pdf`), expected }, null, 2));
    }
  }
  const overflow = structuredClone(candidate);
  overflow.profile.experience[0].title = "Application Developer for Data Import Validation and Customer Support Integrations";
  overflow.profile.projects[1].name = "Example Project Portal for Shared Application Configuration and Account Administration";
  const target = cases[2];
  const prepared = prepareJobResume({ jobId: "synthetic-overflow", postingVersion: "v1", threadId: "synthetic-overflow-thread", candidate: overflow, target, evidence, selectedEvidenceIds: target.selectedEvidenceIds });
  await expect(renderPreparedJobResume({ prepared, outputDir: path.join(directory, "overflow"), portfolioRoot: root })).rejects.toThrow(/exactly one page/);

}, 120_000);
