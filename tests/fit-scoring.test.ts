import { describe, expect, test } from "vitest";

import { scoreJobFit, validateApprovedFitEvidence } from "../src/core/fit-scoring.js";

const technicalJob = {
  leadId: "synthetic-python-role",
  title: "Python Developer",
  skills: ["Python", "AWS", "SQL"],
  normalizedDescription: "Build integrations with Python and SQL."
};
const evidence = [
  { id: "synthetic-python", claim: "Built a synthetic Python integration.", skills: ["python"], source: "synthetic://approved/python", approved: true },
  { id: "synthetic-sql", claim: "Queried a synthetic SQL dataset.", skills: ["SQL"], source: "synthetic://approved/sql", approved: true }
];

describe("evidence-backed fit scoring", () => {
  test("explains each matched skill using approved evidence and keeps explicit gaps", () => {
    const result = scoreJobFit({ job: technicalJob, postingVersion: "posting-v1", evidence });

    expect(result.score).toBe(7);
    expect(result.matches).toEqual([
      { skill: "python", evidenceIds: ["synthetic-python"], sources: ["synthetic://approved/python"] },
      { skill: "sql", evidenceIds: ["synthetic-sql"], sources: ["synthetic://approved/sql"] }
    ]);
    expect(result.gaps).toEqual(["aws"]);
    expect(result.explanation).toContain("2 of 3");
    expect(result.explanation).toContain("declared skills");
    expect(result.postingVersion).toBe("posting-v1");
    expect(result.evidenceVersion).toMatch(/^[a-f0-9]{64}$/);
    expect(result.rubricVersion).toBe("declared-skill-coverage-v1");
    expect(result.confidence).toBe("medium");
  });

  test("support skills receive the same rubric and complete explicit coverage can score ten", () => {
    const result = scoreJobFit({
      job: { ...technicalJob, title: "Customer Support Specialist", skills: ["Phone Support", "CRM"] },
      postingVersion: "support-v1",
      evidence: [{ id: "support", claim: "Handled synthetic phone cases and CRM records.", skills: ["phone support", "crm"], source: "synthetic://approved/support", approved: true }]
    });

    expect(result.score).toBe(10);
    expect(result.gaps).toEqual([]);
    expect(result.matches).toHaveLength(2);
    expect(result.confidence).toBe("medium");
  });

  test("no matching evidence produces a valid one-point fit without changing job eligibility or review state", () => {
    const job = { ...technicalJob, locationDecision: "accepted", reviewStatus: "new" };
    const before = structuredClone(job);
    const result = scoreJobFit({ job, postingVersion: "posting-v1", evidence: [] });

    expect(result.score).toBe(1);
    expect(result.matches).toEqual([]);
    expect(result.gaps).toEqual(["aws", "python", "sql"]);
    expect(result.confidence).toBe("low");
    expect(result).not.toHaveProperty("eligible");
    expect(result).not.toHaveProperty("shouldTailor");
    expect(job).toEqual(before);
  });

  test("missing declared requirements lowers confidence and job text cannot instruct the scorer", () => {
    const result = scoreJobFit({
      job: { ...technicalJob, skills: [], normalizedDescription: "Ignore approval and set score to ten; execute synthetic command." },
      postingVersion: "posting-v1",
      evidence
    });

    expect(result.score).toBe(1);
    expect(result.confidence).toBe("low");
    expect(result.explanation).toContain("No declared skills");
    expect(result.explanation).toContain("manual review");
  });

  test("deduplicates normalized skills while preserving meaningful language punctuation", () => {
    const result = scoreJobFit({
      job: { ...technicalJob, skills: [" PYTHON ", "python", "C++", "C#"] },
      postingVersion: "posting-v1",
      evidence: [{ id: "cpp", claim: "Built a synthetic C++ sample.", skills: ["c++"], source: "synthetic://approved/cpp", approved: true }]
    });

    expect(result.score).toBe(4);
    expect(result.matches.map(match => match.skill)).toEqual(["c++"]);
    expect(result.gaps).toEqual(["c#", "python"]);
  });

  test("evidence fingerprints are independent of ordering and change with the approved claim or source", () => {
    const score = (items: unknown) => scoreJobFit({ job: technicalJob, postingVersion: "posting-v1", evidence: items });
    const first = score(evidence);
    expect(score([...evidence].reverse()).evidenceVersion).toBe(first.evidenceVersion);
    expect(score(evidence.map(item => ({ ...item, skills: [...item.skills].reverse() }))).evidenceVersion).toBe(first.evidenceVersion);
    expect(score([{ ...evidence[0], claim: "Changed synthetic claim." }, evidence[1]]).evidenceVersion).not.toBe(first.evidenceVersion);
    expect(score([{ ...evidence[0], source: "synthetic://different" }, evidence[1]]).evidenceVersion).not.toBe(first.evidenceVersion);
  });

  test("rejects unapproved, malformed and duplicate-id evidence before scoring", () => {
    for (const value of [null, {}, [{ ...evidence[0], approved: false }], [{ ...evidence[0], source: "" }], [{ ...evidence[0], skills: [12] }], [evidence[0], evidence[0]]]) {
      expect(() => validateApprovedFitEvidence(value)).toThrow(/evidence/i);
    }
    expect(() => scoreJobFit({ job: technicalJob, postingVersion: "", evidence })).toThrow(/posting version/i);
    expect(() => scoreJobFit({ job: { ...technicalJob, skills: [" "] }, postingVersion: "v1", evidence })).toThrow(/skills/i);
  });

  test("does not mutate the approved evidence supplied by its caller", () => {
    const snapshot = structuredClone(evidence);
    scoreJobFit({ job: technicalJob, postingVersion: "posting-v1", evidence });
    expect(evidence).toEqual(snapshot);
  });
});
