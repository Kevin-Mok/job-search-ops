import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { prepareJobResume, renderPreparedJobResume } from "../src/core/job-resume.js";

const sha256 = (text: string | Buffer): string => crypto.createHash("sha256").update(text).digest("hex");
function fixture() {
  return {
    jobId: "synthetic-canonical-job", postingVersion: "synthetic-v1", threadId: "synthetic-thread",
    target: { title: "Python Developer", company: "Example Employer" },
    candidate: {
      name: "Alex Example", email: "alex@example.test",
      profile: {
        version: 1 as const,
        baseline: { variantId: "web-dev" as const, sources: [{ path: "lib/synthetic-resume.json", sha256: "a".repeat(64) }] },
        contact: { phone: "555-0100", linkedin: "linkedin.com/in/alex-example", github: "github.com/alex-example" },
        sectionTitles: { experience: "Experience", projects: "Projects", skills: "Skills", education: "Education" },
        primarySectionOrder: "experience-first" as const,
        experience: [
          { company: "Example Studio", companyUrl: "https://example.test/studio", title: "Developer", date: "2024 - 2025", languages: ["Python", "TypeScript"], evidenceIds: ["synthetic-ui", "synthetic-python"] },
          { company: "Historical Example", title: "Intern", date: "2023", languages: ["Go"], evidenceIds: [], evidenceUrl: "https://example.test/contributions", evidenceLabel: "Open-source contributions" }
        ],
        projects: [{ name: "Example Importer", url: "https://example.test/importer", date: "2026", languages: ["Python"], evidenceIds: ["synthetic-project"] }],
        skills: ["Python", "TypeScript", "Git"], skillsBold: ["Python"],
        education: [{ institution: "Example University", degree: "Computer Science", gpa: "3.8 GPA. Graduated with distinction.", date: "2019 - 2023" }]
      }
    },
    evidence: [
      { id: "synthetic-ui", claim: "Implemented typed interface configuration for shared navigation.", source: "synthetic://approved/ui", approved: true },
      { id: "synthetic-python", claim: "Built **Python** parsing with actionable validation errors.", source: "synthetic://approved/python", approved: true },
      { id: "synthetic-project", claim: "Validated saved imports before loading local application data.", source: "synthetic://approved/project", approved: true },
      { id: "synthetic-unrouted", claim: "Documented an unrelated synthetic workflow.", source: "synthetic://approved/unrouted", approved: true }
    ]
  };
}

describe("canonical resume profile", () => {
  test("retains baseline metadata and provenance in the immutable prepared input", () => {
    const input = fixture();
    const prepared = prepareJobResume(input);
    expect(prepared.candidate).toMatchObject({ profile: {
      baseline: input.candidate.profile.baseline, contact: input.candidate.profile.contact,
      education: input.candidate.profile.education, skills: input.candidate.profile.skills,
      experience: [{ company: "Example Studio" }, { company: "Historical Example", evidenceIds: [] }]
    } });
    expect(prepared.requiredText).toEqual(expect.arrayContaining(["555-0100", "linkedin.com/in/alex-example", "github.com/alex-example", "Historical Example", "Intern", "2023", "Example Importer", "Example University", "3.8 GPA. Graduated with distinction."]));
    const changed = fixture();
    changed.candidate.profile.education[0].date = "2020 - 2023";
    expect(prepareJobResume(changed).inputHash).not.toBe(prepared.inputHash);
    changed.candidate.profile.education[0].date = "2019 - 2023";
    changed.candidate.profile.baseline.sources[0].sha256 = "b".repeat(64);
    expect(prepareJobResume(changed).inputHash).not.toBe(prepared.inputHash);
  });

  test("routes only exact approved claims to canonical entries and ranks inside each entry", () => {
    const input = fixture();
    const prepared = prepareJobResume(input);
    expect(prepared.claims.map(claim => claim.id)).toEqual(["synthetic-python", "synthetic-ui", "synthetic-project"]);
    expect(prepared.candidate).toMatchObject({ profile: { experience: [{ evidenceIds: ["synthetic-python", "synthetic-ui"] }, { evidenceIds: [] }] } });
    expect(prepared.requiredText).toContain("Built Python parsing with actionable validation errors.");
    expect(prepared.requiredText).not.toContain("Documented an unrelated synthetic workflow.");
    expect(prepared.claims[0].claim).toBe(input.evidence[1].claim);
  });

  test("selected approved evidence narrows bullets while retaining canonical entry metadata", () => {
    const prepared = prepareJobResume({ ...fixture(), selectedEvidenceIds: ["synthetic-project", "synthetic-python"] });
    expect(prepared.claims.map(claim => claim.id)).toEqual(["synthetic-python", "synthetic-project"]);
    expect(prepared.candidate).toMatchObject({ profile: { experience: [{ evidenceIds: ["synthetic-python"] }, { company: "Historical Example", evidenceIds: [] }] } });
    expect(prepared.requiredText).not.toContain("Implemented typed interface configuration for shared navigation.");
  });

  test("requires only visible section headings when an optional section has no entries", () => {
    const input = fixture();
    Object.assign(input.candidate.profile.sectionTitles, { otherExperience: "Other roles" });
    expect(prepareJobResume(input).requiredText).not.toContain("Other roles");
  });

  test("never treats SRC-only retained statements or absent claim references as approved bullets", () => {
    const missing = fixture();
    missing.candidate.profile.projects[0].evidenceIds = ["missing-approval"];
    expect(() => prepareJobResume(missing)).toThrow(/approved evidence/i);
    const retained = fixture();
    retained.candidate.profile.projects[0].evidenceIds = ["SRC-EXAMPLE-01"];
    retained.evidence[2].id = "SRC-EXAMPLE-01";
    expect(() => prepareJobResume(retained)).toThrow(/SRC|retained/i);
  });

  test.each([
    ["missing provenance", (input: ReturnType<typeof fixture>) => { input.candidate.profile.baseline.sources = []; }],
    ["invalid source hash", (input: ReturnType<typeof fixture>) => { input.candidate.profile.baseline.sources[0].sha256 = "invalid"; }],
    ["source traversal", (input: ReturnType<typeof fixture>) => { input.candidate.profile.baseline.sources[0].path = "../outside.json"; }],
    ["unsafe link", (input: ReturnType<typeof fixture>) => { input.candidate.profile.projects[0].url = "javascript:alert(1)"; }],
    ["empty education", (input: ReturnType<typeof fixture>) => { input.candidate.profile.education = []; }],
    ["placeholder metadata", (input: ReturnType<typeof fixture>) => { input.candidate.profile.education[0].degree = "TODO fill degree"; }],
    ["duplicate entry reference", (input: ReturnType<typeof fixture>) => { input.candidate.profile.projects[0].evidenceIds = ["synthetic-ui"]; }],
    ["unknown bullet content", (input: ReturnType<typeof fixture>) => { Object.assign(input.candidate.profile.projects[0], { bullets: ["Invented contribution"] }); }]
  ])("rejects %s before output creation", (_label, mutate) => {
    const input = fixture();
    mutate(input);
    expect(() => prepareJobResume(input)).toThrow(/profile|source|provenance|placeholder|evidence|URL/i);
  });

  test.runIf(Boolean(process.env.JOB_OPS_PORTFOLIO_ROOT))("renders complete canonical sections, local bold CMU, exact links and pending image review", async () => {
    const portfolioRoot = process.env.JOB_OPS_PORTFOLIO_ROOT!;
    const input = fixture();
    const sourcePath = "app/styles/13-resume-latex.css";
    input.candidate.profile.baseline.sources = [{ path: sourcePath, sha256: sha256(fs.readFileSync(path.join(portfolioRoot, sourcePath))) }];
    const prepared = prepareJobResume(input);
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "canonical-resume-"));
    const changedProfile = structuredClone(prepared);
    changedProfile.candidate.profile!.education[0].degree = "Unbound degree";
    await expect(renderPreparedJobResume({ prepared: changedProfile, outputDir, portfolioRoot })).rejects.toThrow(/input hash/i);
    const artifact = await renderPreparedJobResume({ prepared, outputDir, portfolioRoot });
    const pdf = spawnSync("pdftotext", ["-layout", artifact.pdfPath, "-"], { encoding: "utf8" });
    expect(pdf.status).toBe(0);
    const text = pdf.stdout.replace(/\s+/g, " ");
    expect(text).toContain("Application target: Python Developer | Example Employer");
    for (const value of ["Experience", "Projects", "Skills", "Education", "555-0100", "linkedin.com/in/alex-example", "github.com/alex-example", "Example Studio", "Historical Example", "Open-source contributions", "Example Importer", "Example University", "Computer Science", "3.8 GPA. Graduated with distinction.", "Python Developer", "Example Employer"]) expect(text).toContain(value);
    expect(text).not.toContain("Selected contribution evidence");
    expect(text).not.toContain("unrelated synthetic workflow");
    expect(artifact.visualReview).toBe("pending");
    expect(artifact.bytes).toEqual(fs.readFileSync(artifact.pdfPath));
    expect(sha256(artifact.bytes)).toBe(artifact.sha256);
    expect(fs.existsSync(artifact.previewPath)).toBe(true);
    const renderDirectory = fs.readdirSync(outputDir).find(name => name.startsWith("render-"))!;
    const html = fs.readFileSync(path.join(outputDir, renderDirectory, `${prepared.inputHash}.html`), "utf8");
    expect(html).toContain("resume-variant-web-dev");
    expect(html).toContain("<strong>Python</strong>");
    expect(html).toContain('href="https://example.test/studio"');
    expect(html).toContain('href="https://linkedin.com/in/alex-example"');
    expect(html).toContain('href="mailto:alex@example.test"');
    const fonts = spawnSync("pdffonts", [artifact.pdfPath], { encoding: "utf8" });
    expect(fonts.status).toBe(0);
    expect(fonts.stdout).toMatch(/CMUSerif-Bold\s/);
    expect(artifact.layoutMeasurement).toMatchObject({ pageWidthPts: 612, pageHeightPts: 792 });
  }, 60_000);

  test.runIf(Boolean(process.env.JOB_OPS_PORTFOLIO_ROOT))("rejects stale baseline bytes before creating artifacts", async () => {
    const input = fixture();
    input.candidate.profile.baseline.sources[0].path = "app/styles/13-resume-latex.css";
    const outputDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "canonical-stale-")), "not-created");
    await expect(renderPreparedJobResume({ prepared: prepareJobResume(input), outputDir, portfolioRoot: process.env.JOB_OPS_PORTFOLIO_ROOT! })).rejects.toThrow(/source.*hash|baseline.*changed/i);
    expect(fs.existsSync(outputDir)).toBe(false);
  });
});
