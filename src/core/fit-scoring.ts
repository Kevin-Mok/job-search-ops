import crypto from "node:crypto";

import type { JobLeadRecord } from "./types.js";

export interface ApprovedFitEvidence {
  id: string;
  claim: string;
  skills: string[];
  source: string;
  approved: true;
}

export interface FitEvidenceMatch {
  skill: string;
  evidenceIds: string[];
  sources: string[];
}

export interface FitScoreResult {
  leadId: string;
  score: number;
  explanation: string;
  matches: FitEvidenceMatch[];
  gaps: string[];
  confidence: "low" | "medium";
  rubricVersion: "declared-skill-coverage-v1";
  postingVersion: string;
  evidenceVersion: string;
}

export type FitScoringJob = Pick<JobLeadRecord, "leadId" | "title" | "skills" | "normalizedDescription">;

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${label} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value.trim();
}

function normalizeSkills(input: unknown, label: string): string[] {
  if (!Array.isArray(input) || input.length > 200) {
    throw new Error(`${label} must be an array of at most 200 skill names.`);
  }
  return [...new Set(input.map(skill => requiredText(skill, label, 250)
    .normalize("NFKC").toLowerCase().replace(/\s+/g, " ")))].sort();
}

/** Validate an approval artifact supplied by the trusted operator; this does not establish authorship. */
export function validateApprovedFitEvidence(input: unknown): ApprovedFitEvidence[] {
  if (!Array.isArray(input) || input.length > 1000) {
    throw new Error("Approved fit evidence must be an array of at most 1000 entries.");
  }
  const ids = new Set<string>();
  return input.map((item: unknown): ApprovedFitEvidence => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Each approved fit evidence entry must be an object.");
    }
    const row = item as Record<string, unknown>;
    if (row.approved !== true) {
      throw new Error("Fit evidence requires explicit approved: true from the trusted evidence handoff.");
    }
    const id = requiredText(row.id, "Evidence id", 250);
    if (ids.has(id)) throw new Error(`Duplicate evidence id: ${id}`);
    ids.add(id);
    return {
      id,
      claim: requiredText(row.claim, "Evidence claim", 10_000),
      skills: normalizeSkills(row.skills, "Evidence skills"),
      source: requiredText(row.source, "Evidence source", 4000),
      approved: true
    };
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Score explicit skill coverage only. Eligibility and every-job tailoring are separate workflows. */
export function scoreJobFit(params: {
  job: FitScoringJob;
  postingVersion: string;
  evidence: unknown;
}): FitScoreResult {
  const leadId = requiredText(params.job.leadId, "Job lead id", 1000);
  const postingVersion = requiredText(params.postingVersion, "Posting version", 512);
  const requiredSkills = normalizeSkills(params.job.skills, "Job skills");
  const evidence = validateApprovedFitEvidence(params.evidence);
  const evidenceVersion = crypto.createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
  const matches: FitEvidenceMatch[] = [];
  const gaps: string[] = [];

  for (const skill of requiredSkills) {
    const supporting = evidence.filter(item => item.skills.includes(skill));
    if (!supporting.length) {
      gaps.push(skill);
      continue;
    }
    matches.push({
      skill,
      evidenceIds: supporting.map(item => item.id),
      sources: [...new Set(supporting.map(item => item.source))].sort()
    });
  }

  const score = requiredSkills.length ? 1 + Math.round(9 * matches.length / requiredSkills.length) : 1;
  const explanation = requiredSkills.length
    ? `${matches.length} of ${requiredSkills.length} unique declared skills have approved evidence. Each declared skill has equal weight; score = 1 + round(9 × coverage).`
    : "No declared skills were supplied; score 1 is provisional and requires manual review.";

  return {
    leadId,
    score,
    explanation: `${explanation} This exact-skill rubric does not evaluate experience depth, hard requirements or work authorization, and is not a hiring probability or an eligibility decision.`,
    matches,
    gaps,
    confidence: requiredSkills.length > 0 && matches.length > 0 ? "medium" : "low",
    rubricVersion: "declared-skill-coverage-v1",
    postingVersion,
    evidenceVersion
  };
}
