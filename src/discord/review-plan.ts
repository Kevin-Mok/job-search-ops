import type { JobLeadRecord, ReviewBoardProjection, ReviewThreadProjection, ReviewEventRecord } from "../core/types.js";

function channelForStatus(status: JobLeadRecord["reviewStatus"]): string {
  switch (status) {
    case "approved_for_manual_apply":
      return "job-ops-approved";
    case "applied_manually":
      return "job-ops-applied";
    case "needs_review":
      return "job-ops-needs-review";
    case "rejected":
    case "duplicate":
      return "job-ops-archive";
    default:
      return "job-ops-review";
  }
}

function buildCommands(leadId: string): string[] {
  return [
    `/job_review ${leadId}`,
    `/job_approve ${leadId}`,
    `/job_reject ${leadId} <reason>`,
    `/job_note ${leadId} <note>`,
    `/resume_choice ${leadId} <resume-id>`,
    `/job_apply_status ${leadId} <status>`,
    `/draft_packet ${leadId}`
  ];
}

function summarizeEvents(events: ReviewEventRecord[]): string {
  if (events.length === 0) return "No operator actions recorded yet.";
  return events
    .slice(-3)
    .map((event) => `${event.createdAt}: ${event.action}`)
    .join("\n");
}

export function buildReviewBoard(leads: JobLeadRecord[], events: ReviewEventRecord[]): ReviewBoardProjection {
  const shortlistFeed = leads
    .filter((lead) => lead.reviewStatus !== "rejected" && lead.reviewStatus !== "duplicate")
    .sort((a, b) => b.score - a.score)
    .map((lead) => `${lead.company} | ${lead.title} | ${lead.reviewStatus} | score ${lead.score}`);

  const threads = leads
    .filter((lead) => lead.reviewStatus !== "duplicate")
    .map((lead): ReviewThreadProjection => {
      const leadEvents = events.filter((event) => event.leadId === lead.leadId);
      const locationDetail =
        lead.workModel === "remote"
          ? lead.canadaEligibleRemote
            ? "Remote in Canada accepted."
            : "Remote eligibility failed Canada policy."
          : lead.distanceKm !== undefined
            ? `${lead.distanceKm.toFixed(1)} km from M1E 4V4.`
            : "Distance unavailable.";

      return {
        leadId: lead.leadId,
        statusChannel: channelForStatus(lead.reviewStatus),
        threadKey: `${lead.leadId}-${lead.reviewStatus}`,
        threadTitle: `${lead.company} - ${lead.title}`,
        feedSummary: `${lead.title} at ${lead.company} (${lead.reviewStatus}, score ${lead.score})`,
        starterMessage: [
          `Lead: ${lead.title} @ ${lead.company}`,
          `Status: ${lead.reviewStatus}`,
          `Work model: ${lead.workModel}`,
          `Location policy: ${lead.locationDecision}. ${locationDetail}`,
          `Resume: ${lead.resumeMatch.variantId} (fit ${lead.resumeMatch.fitScore})`,
          `Risk flags: ${lead.riskFlags.length > 0 ? lead.riskFlags.join(", ") : "none"}`,
          `Draft summary: ${lead.draftPacket.tailoredSummary}`,
          "Recent actions:",
          summarizeEvents(leadEvents)
        ].join("\n"),
        commands: buildCommands(lead.leadId)
      };
    });

  return {
    shortlistFeed,
    threads
  };
}
