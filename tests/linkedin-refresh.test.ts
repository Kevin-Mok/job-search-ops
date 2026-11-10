import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";
import { ingestLinkedInEmail } from "../src/core/linkedin-route.js";
import { parseEmailFixture } from "../src/core/parsing.js";
import { ingestParsedLeads } from "../src/core/pipeline.js";
import { JobStore } from "../src/db/store.js";
import type { EmailFixture } from "../src/core/types.js";

const email = JSON.parse(fs.readFileSync("fixtures/email/linkedin-alert-2026-03-12.json", "utf8")) as EmailFixture;

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "linkedin-refresh-"));
  const store = new JobStore(path.join(directory, "jobs.sqlite"));
  const first = { ...email, textBody: email.textBody.split("\n---\n")[0] };
  const { leadIds } = ingestLinkedInEmail(store, first, { fixture: true });
  return { store, first, leadId: leadIds[0] };
}

describe("LinkedIn source refresh preserves operator decisions", () => {
  test.each([false, true])("retains a CLI resume selection when posting content changes: %s", changed => {
    const { store, first, leadId } = setup();
    const selection = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "set-resume", "--db", store.dbPath, "--lead-id", leadId, "--resume", "sales"], { encoding: "utf8", timeout: 30_000 });
    expect(selection.status, selection.stderr).toBe(0);
    const selected = store.getLead(leadId)!;
    expect(selected.resumeMatch.variantId).toBe("sales");
    const title = changed ? "Cloud Engineer" : selected.title;
    ingestLinkedInEmail(store, {
      ...first,
      messageId: "newer-posting-observation",
      receivedAt: "2026-03-13T10:00:00Z",
      textBody: first.textBody.replace("Title: Junior Python Developer", `Title: ${title}`)
    }, { fixture: true });
    const refreshed = new JobStore(store.dbPath).getLead(leadId)!;
    expect(refreshed.resumeMatch).toEqual(selected.resumeMatch);
    expect(refreshed.draftPacket.chosenResume).toBe("sales");
    expect(refreshed.draftPacket.tailoredSummary).toContain(`Maple Systems is hiring for ${title}. Use sales`);
    expect(refreshed.draftPacket.rationale).toContain("Selected sales");
    expect(store.listReviewEvents(leadId).filter(event => event.action === "resume_changed")).toHaveLength(1);
  });

  test("legacy ingestion retains the CLI selection over a higher-scoring automatic route", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-resume-refresh-"));
    const store = new JobStore(path.join(directory, "jobs.sqlite"));
    const [parsed] = parseEmailFixture({ ...email, source: "indeed", textBody: email.textBody.split("\n---\n")[0] }, "legacy-alert.json");
    const first = { ...parsed, skills: [], normalizedDescription: "Maintain internal services." };
    const { touchedLeadIds: [leadId] } = ingestParsedLeads(store, [first]);
    const selection = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "set-resume", "--db", store.dbPath, "--lead-id", leadId, "--resume", "sales"], { encoding: "utf8", timeout: 30_000 });
    expect(selection.status, selection.stderr).toBe(0);
    const selected = store.getLead(leadId)!;
    const incoming = { ...parsed, sourceMessageId: "newer-legacy-alert", skills: ["python", "automation", "sql", "apis", "data processing", "aws"], normalizedDescription: "Maintain Python and AWS services with automation and SQL reporting." };
    const control = new JobStore(path.join(directory, "automatic-control.sqlite"));
    const [automatic] = ingestParsedLeads(control, [incoming]).leads;
    expect(automatic.resumeMatch.fitScore).toBeGreaterThan(selected.resumeMatch.fitScore);
    expect(automatic.resumeMatch.variantId).not.toBe("sales");
    ingestParsedLeads(store, [incoming]);
    const refreshed = new JobStore(store.dbPath).getLead(leadId)!;
    expect(refreshed.normalizedDescription).toBe(incoming.normalizedDescription);
    expect(refreshed.resumeMatch).toEqual(selected.resumeMatch);
    expect(refreshed.draftPacket.chosenResume).toBe("sales");
    expect(refreshed.draftPacket.tailoredSummary).toContain("Use sales");
    expect(refreshed.draftPacket.rationale).toContain("Selected sales");
  });

  test.each(["rejected", "approved_for_manual_apply", "applied_manually"] as const)("refresh derives the draft from the final %s operator state", status => {
    const { store, first, leadId } = setup();
    store.updateLeadReview({ leadId, status, note: "Synthetic manual decision." });
    const before = store.listReviewEvents(leadId);
    ingestLinkedInEmail(store, {
      ...first,
      messageId: "newer-posting-observation",
      receivedAt: "2026-03-13T10:00:00Z",
      textBody: first.textBody.replace("Company: Maple Systems", "Company: Updated Employer")
    }, { fixture: true });
    const refreshed = new JobStore(store.dbPath).getLead(leadId)!;
    expect(refreshed.reviewStatus).toBe(status);
    expect(refreshed.draftPacket.recommendation).toBe(status === "rejected"
      ? "Reject or archive. The role failed either location policy, fit scoring, or risk checks."
      : "Shortlist for manual operator review in Discord. Final submission should remain manual in v1.");
    expect(refreshed.draftPacket.tailoredSummary).toContain("Updated Employer is hiring");
    expect(store.listReviewEvents(leadId)).toEqual(before);
  });
});
