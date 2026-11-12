import type { DraftPacket, JobLeadRecord, ResumeMatch } from "./types.js";

export function generateDraftPacket(lead: Omit<JobLeadRecord, "draftPacket">, resumeMatch: ResumeMatch): DraftPacket {
  return {
    chosenResume: resumeMatch.variantId,
    rationale: "Description held: alert text is lead/snippet only. Capture a full local description before approved-evidence work.",
    tailoredSummary: "",
    coverLetterDraft: "",
    screenerAnswerDrafts: [],
    recommendation: "Hold for full-description review; use the approved-evidence workflow after confirmation."
  };
}
