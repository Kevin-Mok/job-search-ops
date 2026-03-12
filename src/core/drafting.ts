import { getResumeVariant } from "./resume-catalog.js";
import type { DraftPacket, JobLeadRecord, ResumeMatch } from "./types.js";

function joinEvidence(evidence: string[]): string {
  return evidence.slice(0, 3).join(" ");
}

function buildRecommendation(lead: JobLeadRecord): string {
  if (lead.reviewStatus === "rejected") {
    return "Reject or archive. The role failed either location policy, fit scoring, or risk checks.";
  }

  if (lead.reviewStatus === "needs_review") {
    return "Manual review required before shortlisting because the office location or policy outcome is ambiguous.";
  }

  return "Shortlist for manual operator review in Discord. Final submission should remain manual in v1.";
}

export function generateDraftPacket(lead: Omit<JobLeadRecord, "draftPacket">, resumeMatch: ResumeMatch): DraftPacket {
  const variant = getResumeVariant(resumeMatch.variantId);
  const evidence = joinEvidence(variant.supportedEvidence);
  const missing = resumeMatch.missingRequirements.length > 0 ? ` Missing or manual-check items: ${resumeMatch.missingRequirements.join(", ")}.` : "";

  const rationale = `Selected ${variant.id} because it best matches the ${lead.jobFamily} lane and the posting keywords. ${resumeMatch.matchReasons.join(" ")}${missing}`;
  const tailoredSummary = `${lead.company} is hiring for ${lead.title}. Use ${variant.id} and emphasize: ${evidence}`;
  const coverLetterDraft = [
    `Dear ${lead.company} hiring team,`,
    `I am interested in the ${lead.title} opportunity. The closest honest resume lane for this posting is ${variant.id}, which highlights experience that overlaps with the role's focus areas without overstating scope.`,
    `${evidence}`,
    `I would value the chance to discuss how that background can support ${lead.company}'s team.`
  ].join("\n\n");

  return {
    chosenResume: variant.id,
    rationale,
    tailoredSummary,
    coverLetterDraft,
    screenerAnswerDrafts: [
      {
        question: "Why are you a fit for this role?",
        answer: evidence
      },
      {
        question: "Can you support the required work model?",
        answer:
          lead.workModel === "remote"
            ? "Candidate is Toronto-based. Confirm any Canada-specific remote eligibility or employment paperwork manually before submission."
            : `Candidate is based in Toronto. The current policy evaluation marked this role as ${lead.locationDecision}${lead.distanceKm ? ` at ${lead.distanceKm.toFixed(1)} km from M1E 4V4.` : "."}`
      },
      {
        question: "Are there any items to confirm manually?",
        answer:
          resumeMatch.missingRequirements.length > 0
            ? `Confirm these requirements manually before submission: ${resumeMatch.missingRequirements.join(", ")}.`
            : "Confirm work authorization, salary expectations, and any application form specifics manually before submission."
      }
    ],
    recommendation: buildRecommendation(lead as JobLeadRecord)
  };
}
