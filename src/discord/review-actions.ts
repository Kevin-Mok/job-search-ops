import { ReplayedReviewInteractionError, type JobStore } from "../db/store.js";
import type { ReviewStatus } from "../core/types.js";

export interface JobReviewAuthorization {
  verifiedHandoff: boolean;
  expectedTarget: string;
  allowedUserIds: string[];
  allowedChannelIds: string[];
  allowedThreadIds: string[];
}

export interface JobReviewInteraction {
  id: string;
  userId: string;
  target: string;
  channelId: string;
  threadId: string;
  rootMessageId: string;
  action: "approve" | "reject" | "note" | "apply-status";
  note?: string;
  status?: "approved_for_manual_apply" | "applied_manually" | "needs_review";
  manualApplicationConfirmed?: boolean;
}

export type JobReviewActionOutcome =
  | { ok: true; action: JobReviewInteraction["action"]; leadId: string; reviewStatus: ReviewStatus }
  | { ok: false; code: string; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

function isAllowlist(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isId);
}

function denied(code: string, message: string): JobReviewActionOutcome {
  return { ok: false, code, message };
}

/** The caller must authenticate Discord before constructing this envelope/config; message text is never authority. */
export function handleJobReviewAction(params: {
  store: JobStore;
  interaction: unknown;
  authorization: unknown;
}): JobReviewActionOutcome {
  const { store, interaction, authorization } = params;
  if (!isRecord(authorization) || authorization.verifiedHandoff !== true) {
    return denied("unverified_handoff", "A verified Discord handoff is required.");
  }
  if (!isId(authorization.expectedTarget) || !isAllowlist(authorization.allowedUserIds)
    || !isAllowlist(authorization.allowedChannelIds) || !isAllowlist(authorization.allowedThreadIds)) {
    return denied("invalid_authorization", "Explicit target, user, parent channel and thread allowlists are required.");
  }
  if (!isRecord(interaction) || ![interaction.id, interaction.userId, interaction.target, interaction.channelId,
    interaction.threadId, interaction.rootMessageId].every(isId)) {
    return denied("invalid_interaction", "Authenticated interaction identity and complete thread provenance are required.");
  }
  const { id, userId, target, channelId, threadId, rootMessageId } = interaction as Record<string, unknown> & {
    id: string; userId: string; target: string; channelId: string; threadId: string; rootMessageId: string;
  };
  if (!authorization.allowedUserIds.includes(userId)) return denied("unauthorized_user", "Discord user is not authorized.");
  if (target !== authorization.expectedTarget) return denied("unauthorized_target", "Discord destination is not authorized.");
  if (!authorization.allowedChannelIds.includes(channelId)) return denied("unauthorized_channel", "Discord parent channel is not authorized.");
  if (!authorization.allowedThreadIds.includes(threadId)) return denied("unauthorized_thread", "Discord thread is not authorized.");
  if (target.startsWith("discord:") && target !== `discord:${channelId}`) {
    return denied("target_channel_mismatch", "Discord parent channel does not match the configured destination.");
  }
  const action = interaction.action;
  if (action !== "approve" && action !== "reject" && action !== "note" && action !== "apply-status") {
    return denied("invalid_action", "Use approve, reject, note or apply-status.");
  }
  if ((action === "note" || interaction.note !== undefined)
    && (typeof interaction.note !== "string" || !interaction.note.trim())) {
    return denied("invalid_note", "An operator note must contain text.");
  }
  let status: ReviewStatus | undefined;
  if (action === "approve") status = "approved_for_manual_apply";
  if (action === "reject") status = "rejected";
  if (action === "apply-status") {
    if (interaction.status !== "approved_for_manual_apply" && interaction.status !== "applied_manually" && interaction.status !== "needs_review") {
      return denied("invalid_status", "Use approved_for_manual_apply, applied_manually or needs_review.");
    }
    status = interaction.status;
    if (status === "applied_manually" && interaction.manualApplicationConfirmed !== true) {
      return denied("manual_confirmation_required", "The operator must explicitly confirm they submitted the application manually.");
    }
  }
  const bindings = store.linkedin.listDeliveries(target).filter(delivery => delivery.threadId === threadId);
  if (bindings.length !== 1 || bindings[0].status !== "delivered" || bindings[0].messageId !== rootMessageId) {
    return denied("unbound_thread", "Thread and original alert must identify exactly one delivered job in the configured destination.");
  }
  const lead = store.getLead(bindings[0].leadId);
  if (!lead || lead.source !== "linkedin") return denied("unbound_thread", "Persisted thread has no canonical LinkedIn job.");
  try {
    const updated = store.updateLeadReview({
      leadId: lead.leadId,
      status,
      note: typeof interaction.note === "string" ? interaction.note : undefined,
      reviewContext: {
        interactionId: id, userId, parentChannelId: channelId, threadId, rootMessageId, target,
        ...(status === "applied_manually" ? { manualApplicationConfirmed: true } : {})
      }
    });
    return { ok: true, action, leadId: updated.leadId, reviewStatus: updated.reviewStatus };
  } catch (error) {
    if (error instanceof ReplayedReviewInteractionError) return denied("replayed_interaction", error.message);
    throw error;
  }
}
