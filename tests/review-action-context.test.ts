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
});
