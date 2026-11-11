import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { prepareJobResume, renderPreparedJobResume, validateJobResumeArtifact } from "../src/core/job-resume.js";

const input = {
  jobId: "synthetic-python-role", postingVersion: "posting-v1", threadId: "synthetic-thread",
  candidate: { name: "Alex Example", email: "alex@example.test" },
  target: { title: "Python Developer", company: "Example Employer" },
  evidence: [
    { id: "claim-docs", claim: "Documented service investigation steps for an internal support workflow.", source: "https://example.test/commit/docs", approved: true as const },
    { id: "claim-python", claim: "Built **Python** import validation with explicit parsing errors and regression fixtures.", source: "https://example.test/commit/python", approved: true as const }
  ]
};
function directory(): string { return fs.mkdtempSync(path.join(os.tmpdir(), "job-resume-")); }
function minimalPdf(pages: number, width: number, height: number): Buffer {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages} >>`];
  for (let index = 0; index < pages; index += 1) {
    const content = "BT /F1 12 Tf 36 700 Td (Alex Example Python Developer Example Employer) Tj ET";
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents ${4 + index * 2} 0 R >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

describe("job-specific resume artifact boundary", () => {
  test("prepares only exact approved claims, binds posting/thread and deterministically ranks relevant evidence", () => {
    const prepared = prepareJobResume(input);
    expect(prepared.claims.map(claim => claim.id)).toEqual(["claim-python", "claim-docs"]);
    expect(prepared.claims[0].claim).toBe(input.evidence[1].claim);
    expect(prepared).toMatchObject({ jobId: input.jobId, postingVersion: "posting-v1", threadId: "synthetic-thread" });
    expect(prepareJobResume(input).inputHash).toBe(prepared.inputHash);
    expect(prepareJobResume({ ...input, postingVersion: "posting-v2" }).inputHash).not.toBe(prepared.inputHash);
    expect(prepared.requiredText).toEqual(expect.arrayContaining(["Alex Example", "Python Developer", "Example Employer"]));
  });

  test("rejects unapproved, missing, duplicate and placeholder evidence instead of inventing content", () => {
    expect(() => prepareJobResume({ ...input, evidence: [{ ...input.evidence[0], approved: false }] })).toThrow(/approved/i);
    expect(() => prepareJobResume({ ...input, selectedEvidenceIds: ["invented-id"] })).toThrow(/evidence/i);
    expect(() => prepareJobResume({ ...input, evidence: [] })).toThrow(/evidence/i);
    expect(() => prepareJobResume({ ...input, evidence: [input.evidence[0], input.evidence[0]] })).toThrow(/duplicate/i);
    expect(() => prepareJobResume({ ...input, evidence: [{ ...input.evidence[0], claim: "TODO fill in experience" }] })).toThrow(/placeholder/i);
  });

  test("rejects corrupt or hash-mismatched artifacts before invoking PDF tools", async () => {
    const dir = directory();
    const pdfPath = path.join(dir, "invalid.pdf");
    fs.writeFileSync(pdfPath, "synthetic non-PDF");
    const params = { pdfPath, jobId: input.jobId, postingVersion: input.postingVersion, threadId: input.threadId, candidateName: input.candidate.name, targetTitle: input.target.title, targetCompany: input.target.company, outputDir: dir, portfolioRoot: "/nonexistent-synthetic-portfolio" };
    await expect(validateJobResumeArtifact(params)).rejects.toThrow(/PDF/i);
    await expect(validateJobResumeArtifact({ ...params, expectedSha256: "0".repeat(64) })).rejects.toThrow(/hash/i);
  });

  test.runIf(spawnSync("pdfinfo", ["-v"]).status === 0)("rejects executable multi-page, wrong-size and non-CMU PDF artifacts", async () => {
    const dir = directory();
    const source = path.join(dir, "synthetic-portfolio");
    fs.mkdirSync(source);
    for (const [pages, width, height, expected] of [[2, 612, 792, /exactly one page/], [1, 595, 842, /US Letter/], [1, 612, 792, /Computer Modern/]] as const) {
      const pdfPath = path.join(dir, `${pages}-${width}.pdf`);
      fs.writeFileSync(pdfPath, minimalPdf(pages, width, height));
      await expect(validateJobResumeArtifact({ pdfPath, jobId: input.jobId, postingVersion: input.postingVersion, threadId: input.threadId, candidateName: input.candidate.name, targetTitle: input.target.title, targetCompany: input.target.company, outputDir: path.join(dir, "out"), portfolioRoot: source })).rejects.toThrow(expected);
    }
  });

  test.runIf(Boolean(process.env.JOB_OPS_PORTFOLIO_ROOT))("renders private CMU PDF, validates exact bytes and keeps page-image review pending", async () => {
    const portfolioRoot = process.env.JOB_OPS_PORTFOLIO_ROOT!;
    const dir = directory();
    const prepared = prepareJobResume(input);
    await expect(renderPreparedJobResume({ prepared: { ...prepared, target: { ...prepared.target, company: "Unbound Employer" } }, outputDir: dir, portfolioRoot })).rejects.toThrow(/input hash/);
    const artifact = await renderPreparedJobResume({ prepared, outputDir: dir, portfolioRoot });
    expect(artifact).toMatchObject({ jobId: input.jobId, postingVersion: input.postingVersion, threadId: input.threadId, visualReview: "pending" });
    expect(artifact.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(crypto.createHash("sha256").update(artifact.bytes).digest("hex")).toBe(artifact.sha256);
    expect(fs.readFileSync(artifact.pdfPath)).toEqual(artifact.bytes);
    expect(fs.existsSync(artifact.previewPath)).toBe(true);
    await expect(validateJobResumeArtifact({ pdfPath: artifact.pdfPath, jobId: input.jobId, postingVersion: input.postingVersion, threadId: input.threadId, candidateName: "Wrong Candidate", targetTitle: input.target.title, targetCompany: input.target.company, outputDir: dir, portfolioRoot })).rejects.toThrow(/required text/i);
  }, 60_000);
});
