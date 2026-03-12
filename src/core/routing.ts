import { RESUME_VARIANTS, SUPPORT_FAMILIES } from "./resume-catalog.js";
import type { JobFamily, ParsedLeadInput, ResumeMatch, ResumeVariant } from "./types.js";

const HARD_SKILLS = new Set([
  "python",
  "django",
  "aws",
  "sql",
  "active directory",
  "ticketing",
  "customer service",
  "phone support",
  "react",
  "typescript",
  "javascript",
  "linux"
]);

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function countOverlap(required: string[], available: string[]): number {
  const requiredSet = new Set(required);
  return available.filter((skill) => requiredSet.has(skill)).length;
}

function familyBonus(jobFamily: JobFamily, variant: ResumeVariant): number {
  return variant.jobFamilies.includes(jobFamily) ? 25 : 0;
}

function laneBonus(jobFamily: JobFamily, variant: ResumeVariant): number {
  if (SUPPORT_FAMILIES.includes(jobFamily)) {
    return variant.lane === "support" ? 15 : 0;
  }
  return variant.lane === "engineering" ? 15 : 0;
}

function keywordBoost(lead: ParsedLeadInput, variant: ResumeVariant): number {
  const text = `${lead.title} ${lead.normalizedDescription}`.toLowerCase();
  if (variant.id === "web-dev-django" && text.includes("django")) return 12;
  if (variant.id === "aws-python" && text.includes("aws") && text.includes("python")) return 12;
  if (variant.id === "it-support-sql" && text.includes("sql")) return 12;
  if (variant.id === "it-support-aws" && text.includes("aws")) return 12;
  if (variant.id === "call-centre" && text.includes("phone")) return 12;
  return 0;
}

export function chooseResumeVariant(lead: ParsedLeadInput, jobFamily: JobFamily): ResumeMatch {
  const ranked = RESUME_VARIANTS.map((variant) => {
    const overlap = countOverlap(lead.skills, variant.skills);
    const score = familyBonus(jobFamily, variant) + laneBonus(jobFamily, variant) + overlap * 8 + keywordBoost(lead, variant);

    return {
      variant,
      score,
      overlap
    };
  }).sort((a, b) => b.score - a.score);

  const winner = ranked[0];
  const missingRequirements = unique(
    lead.skills.filter((skill) => HARD_SKILLS.has(skill) && !winner.variant.skills.includes(skill))
  );
  const matchReasons = unique(
    [
      ...winner.variant.supportedEvidence.slice(0, 2),
      ...lead.skills.filter((skill) => winner.variant.skills.includes(skill)).map((skill) => `Matches required skill: ${skill}`)
    ].slice(0, 4)
  );

  return {
    variantId: winner.variant.id,
    fitScore: Math.max(20, Math.min(100, winner.score + winner.overlap * 4)),
    matchReasons,
    missingRequirements
  };
}
