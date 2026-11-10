import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { describe, expect, test, vi } from "vitest";
import { JobStore } from "../src/db/store.js";
import { ingestLinkedInEmail } from "../src/core/linkedin-route.js";
function setup() {
  const store = new JobStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "review-audit-")), "jobs.sqlite"));
  const email = JSON.parse(fs.readFileSync("fixtures/email/linkedin-alert-2026-03-12.json", "utf8"));
  const { leadIds } = ingestLinkedInEmail(store, email, { fixture: true });
  return { store, leadId: leadIds[0] };
}
const context = { interactionId: "synthetic-interaction", userId: "synthetic-user", parentChannelId: "synthetic-channel", threadId: "synthetic-thread", rootMessageId: "synthetic-root", target: "fixture:review", manualApplicationConfirmed: true };
describe("operator review provenance transaction", () => {
  test("stores bound actor/interaction provenance with the state event across restart", () => {
    const { store, leadId } = setup();
    store.updateLeadReview({ leadId, status: "applied_manually", reviewContext: context });
    const events = new JobStore(store.dbPath).listReviewEvents(leadId);
    expect(events.at(-1)?.payload).toMatchObject({ ...context, status: "applied_manually" });
  });
  test("audit failure rolls back canonical operator state", () => {
    const { store, leadId } = setup();
    const before = store.getLead(leadId)!.reviewStatus;
    vi.spyOn(store, "appendReviewEvent").mockImplementation(() => { throw new Error("Intentional synthetic audit failure"); });
    expect(() => store.updateLeadReview({ leadId, status: "applied_manually", reviewContext: context })).toThrow(/audit failure/);
    expect(store.getLead(leadId)!.reviewStatus).toBe(before);
  });
  test("failed status-plus-note audit rolls back all effects and leaves the interaction retryable", () => {
    const { store, leadId } = setup();
    const before = store.getLead(leadId);
    const append = store.appendReviewEvent.bind(store);
    const failure = vi.spyOn(store, "appendReviewEvent").mockImplementation((id, action, payload) => {
      if (action === "note") throw new Error("Intentional synthetic note audit failure");
      append(id, action, payload);
    });
    expect(() => store.updateLeadReview({ leadId, status: "applied_manually", note: "Submitted manually.", reviewContext: context })).toThrow(/note audit failure/);
    expect(store.getLead(leadId)).toEqual(before);
    expect(store.listReviewEvents()).toEqual([]);
    failure.mockRestore();

    store.updateLeadReview({ leadId, status: "applied_manually", note: "Submitted manually.", reviewContext: context });
    const events = new JobStore(store.dbPath).listReviewEvents();
    expect(events).toHaveLength(2);
    expect(() => store.updateLeadReview({ leadId, status: "rejected", reviewContext: context })).toThrow(/already recorded/);
    expect(store.listReviewEvents()).toEqual(events);
    expect(store.getLead(leadId)?.reviewStatus).toBe("applied_manually");
  });
  test("a note-only interaction is admitted once across leads", () => {
    const { store, leadId } = setup();
    const otherLeadId = store.listLeads().find(lead => lead.leadId !== leadId)!.leadId;
    store.updateLeadReview({ leadId, note: "First operator note.", reviewContext: context });
    const beforeOther = store.getLead(otherLeadId);
    expect(() => store.updateLeadReview({ leadId: otherLeadId, status: "rejected", reviewContext: context })).toThrow(/already recorded/);
    expect(store.getLead(otherLeadId)).toEqual(beforeOther);
    expect(store.listReviewEvents()).toHaveLength(1);
  });
  test("ordinary CLI reviews without interaction provenance remain repeatable", () => {
    const { store, leadId } = setup();
    store.updateLeadReview({ leadId, status: "approved_for_manual_apply" });
    store.updateLeadReview({ leadId, status: "rejected" });
    expect(store.getLead(leadId)?.reviewStatus).toBe("rejected");
    expect(store.listReviewEvents()).toHaveLength(2);
  });
});
