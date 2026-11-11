import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, test } from "vitest";
import { JobStore } from "../src/db/store.js";
import { ingestLinkedInEmail, drainLinkedInAlerts } from "../src/core/linkedin-route.js";
import { ingestParsedLeads } from "../src/core/pipeline.js";
import { parseEmailFixture } from "../src/core/parsing.js";
import { postingVersion, processLinkedInWork, queueLinkedInWork, attachLinkedInResume } from "../src/core/job-workflow.js";
import { planCodexResumeDispatch } from "../src/core/codex-resume-dispatch.js";
import { createFixtureLinkedInTransport } from "../src/discord/linkedin-transport.js";
import type { EmailFixture } from "../src/core/types.js";

const email = JSON.parse(fs.readFileSync("fixtures/email/linkedin-alert-2026-03-12.json", "utf8")) as EmailFixture;
const evidence = [{ id: "approved-synthetic", claim: "Built synthetic support fixtures.", source: "synthetic://approved", skills: ["ticketing"], approved: true }];
const candidate = { name: "Synthetic Candidate", email: "synthetic@example.test" };
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "eligibility-version-"));
  roots.push(directory);
  const store = new JobStore(path.join(directory, "jobs.sqlite"));
  const transport = createFixtureLinkedInTransport(path.join(directory, "discord.json"));
  return { directory, store, transport };
}

function observation(remoteEligibility: string | undefined, messageId: string, receivedAt: string): EmailFixture {
  const body = email.textBody.split("\n---\n")[2].replace(/^Remote eligibility:.*\n/m, "").replace("Description: ", "Description: Role based in Canada. ");
  return { ...email, messageId, receivedAt, textBody: remoteEligibility === undefined ? body : `Remote eligibility: ${remoteEligibility}\n${body}` };
}

describe("persisted remote eligibility source binding", () => {
  test.each([
    ["Canada", "Canada; security clearance required"],
    [undefined, "Canada"],
    ["Canada", undefined]
  ])("changed remote eligibility %s -> %s requires renewed approval", async (before, after) => {
    const { directory, store, transport } = setup();
    const first = ingestLinkedInEmail(store, observation(before, "first", "2026-11-10T10:00:00Z"), { fixture: true });
    await drainLinkedInAlerts({ store, transport });
    const lead = store.getLead(first.leadIds[0])!;
    expect(lead.locationDecision).toBe("accepted");
    const version = postingVersion(lead);
    store.work.decideEligibility({ leadId: lead.leadId, postingVersion: version, eligibility: "eligible", reason: "Synthetic operator reviewed requirements." });
    const [work] = await processLinkedInWork({ store, transport, privateDir: directory, evidence, candidate });
    const prepared = fs.readFileSync(work.preparedPath!);
    const handoff = fs.readFileSync(work.codexHandoffPath!);
    const journal = fs.readFileSync(path.join(directory, "discord.json"));
    ingestLinkedInEmail(store, observation(after, "second", "2026-11-10T11:00:00Z"), { fixture: true });
    const restarted = new JobStore(store.dbPath);
    const refreshed = restarted.getLead(lead.leadId)!;
    expect(refreshed.locationDecision).toBe("accepted");
    expect(refreshed.normalizedDescription).toBe(lead.normalizedDescription);
    expect(postingVersion(refreshed)).not.toBe(version);
    expect(refreshed).toHaveProperty("remoteEligibility", after);
    expect(restarted.work.decision(lead.leadId, postingVersion(refreshed))).toBeUndefined();
    const queued = queueLinkedInWork(restarted, transport.target);
    expect(queued).toHaveLength(2);
    expect(queued.find(row => row.workId !== work.workId)).toMatchObject({ eligibility: "needs_review", status: "needs_review" });
    await processLinkedInWork({ store: restarted, transport, privateDir: directory, evidence, candidate });
    expect(fs.readFileSync(work.preparedPath!)).toEqual(prepared);
    expect(fs.readFileSync(work.codexHandoffPath!)).toEqual(handoff);
    expect(fs.readFileSync(path.join(directory, "discord.json"))).toEqual(journal);
    expect(() => planCodexResumeDispatch({ store: restarted, privateDir: directory, workId: work.workId })).toThrow(/posting changed/i);
    await expect(attachLinkedInResume({ store: restarted, transport, workId: work.workId, approvedSha256: "a".repeat(64), portfolioRoot: directory })).rejects.toThrow(/posting changed/i);
  });

  test("upgrades a pre-field database without losing rows or operator evidence", () => {
    const { store } = setup();
    const first = ingestLinkedInEmail(store, observation("Canada", "first", "2026-11-10T10:00:00Z"), { fixture: true });
    const leadId = first.leadIds[0];
    store.updateLeadReview({ leadId, status: "approved_for_manual_apply", note: "Synthetic operator decision before schema upgrade." });
    const legacy = new Database(store.dbPath);
    const columns = legacy.pragma("table_info(job_leads)") as { name: string }[];
    if (columns.some(column => column.name === "remote_eligibility_raw")) legacy.exec("ALTER TABLE job_leads DROP COLUMN remote_eligibility_raw");
    legacy.close();
    const before = store.getLead(leadId)!;
    const review = store.listReviewEvents(leadId);
    const messages = store.linkedin.listMessages();
    const upgraded = new JobStore(store.dbPath);
    expect(upgraded.getLead(leadId)).toEqual(before);
    expect(upgraded.listReviewEvents(leadId)).toEqual(review);
    expect(upgraded.linkedin.listMessages()).toEqual(messages);
    ingestLinkedInEmail(upgraded, observation("Canada; security clearance required", "second", "2026-11-10T11:00:00Z"), { fixture: true });
    const saved = new JobStore(store.dbPath).getLead(leadId)!;
    expect(saved).toHaveProperty("remoteEligibility", "Canada; security clearance required");
    expect(saved.reviewStatus).toBe("approved_for_manual_apply");
    expect(upgraded.listReviewEvents(leadId)).toEqual(review);
  });

  test("legacy ingestion preserves the newest supplied requirement text across reload", () => {
    const { store } = setup();
    const [first] = parseEmailFixture(observation("Canada", "first", "2026-11-10T10:00:00Z"), "synthetic.json");
    const { touchedLeadIds: [leadId] } = ingestParsedLeads(store, [first]);
    ingestParsedLeads(store, [{ ...first, sourceMessageId: "second", remoteEligibility: "Canada; security clearance required" }]);
    expect(new JobStore(store.dbPath).getLead(leadId)).toHaveProperty("remoteEligibility", "Canada; security clearance required");
    ingestParsedLeads(store, [{ ...first, sourceMessageId: "third", remoteEligibility: undefined }]);
    expect(new JobStore(store.dbPath).getLead(leadId)).toHaveProperty("remoteEligibility", "Canada; security clearance required");
  });
});
