import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { JobStore } from "../src/db/store.js";
import { ingestLinkedInEmail, drainLinkedInAlerts } from "../src/core/linkedin-route.js";
import { postingVersion, processLinkedInWork } from "../src/core/job-workflow.js";
import { createFixtureLinkedInTransport } from "../src/discord/linkedin-transport.js";
import { planCodexResumeDispatch } from "../src/core/codex-resume-dispatch.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
async function fixture() {
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-dispatch-")); roots.push(privateDir);
  const store = new JobStore(path.join(privateDir, "jobs.sqlite"));
  const transport = createFixtureLinkedInTransport(path.join(privateDir, "discord.json"));
  const email = JSON.parse(fs.readFileSync("fixtures/email/linkedin-alert-2026-03-12.json", "utf8"));
  const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[0] }, { fixture: true });
  await drainLinkedInAlerts({ store, transport });
  const lead = store.getLead(leadIds[0])!;
  store.work.decideEligibility({ leadId: lead.leadId, postingVersion: postingVersion(lead), eligibility: "eligible", reason: "Synthetic operator reviewed hard requirements." });
  const [work] = await processLinkedInWork({ store, transport, privateDir, candidate: { name: "Synthetic Candidate", email: "synthetic@example.test" }, evidence: [{ id: "approved", claim: "Built a synthetic demo.", source: "synthetic://approved", skills: [], approved: true }] });
  return { store, privateDir, work, lead, plan: planCodexResumeDispatch({ store, privateDir, workId: work.workId }) };
}

describe("read-only Codex planning boundary", () => {
  test("replanning after restart is deterministic and preserves work, decisions and private inputs", async () => {
    const { store, privateDir, work, lead, plan } = await fixture();
    const before = store.work.get(work.workId);
    const decision = store.work.decision(work.leadId, work.postingVersion);
    const directory = path.dirname(work.preparedPath!);
    const files = fs.readdirSync(directory).sort();
    const prepared = fs.readFileSync(work.preparedPath!);
    const handoff = fs.readFileSync(work.codexHandoffPath!);
    const restarted = new JobStore(store.dbPath);
    expect(planCodexResumeDispatch({ store: restarted, privateDir, workId: work.workId })).toEqual(plan);
    expect(restarted.work.get(work.workId)).toEqual(before);
    expect(restarted.work.decision(work.leadId, work.postingVersion)).toEqual(decision);
    expect(restarted.getLead(lead.leadId)).toEqual(lead);
    expect(fs.readdirSync(directory).sort()).toEqual(files);
    expect(fs.readFileSync(work.preparedPath!)).toEqual(prepared);
    expect(fs.readFileSync(work.codexHandoffPath!)).toEqual(handoff);
    expect(plan.execution).toBe("blocked_cli_isolation_unverified");
  });

  test("planning leaves a historical private receipt untouched", async () => {
    const { store, privateDir, work, plan } = await fixture();
    const historical = Buffer.from(JSON.stringify({ status: "attempting", receiptId: "synthetic-historical" }));
    fs.writeFileSync(plan.receiptPath, historical, { mode: 0o600 });
    expect(planCodexResumeDispatch({ store, privateDir, workId: work.workId })).toEqual(plan);
    expect(fs.readFileSync(plan.receiptPath)).toEqual(historical);
  });

  test.each(["handoff", "prepared"] as const)("changed %s bytes produce a newly bound read-only plan", async field => {
    const { store, privateDir, work, plan } = await fixture();
    fs.appendFileSync(field === "handoff" ? work.codexHandoffPath! : work.preparedPath!, " ");
    const next = planCodexResumeDispatch({ store, privateDir, workId: work.workId });
    expect(next.dispatchId).not.toBe(plan.dispatchId);
    expect(next.binding[field === "handoff" ? "handoffSha256" : "preparedSha256"]).not.toBe(plan.binding[field === "handoff" ? "handoffSha256" : "preparedSha256"]);
    expect(next.binding.inputHash).toBe(plan.binding.inputHash);
    expect(next.request.approvedClaims).toEqual(plan.request.approvedClaims);
    expect(next.execution).toBe("blocked_cli_isolation_unverified");
    expect(fs.existsSync(plan.receiptPath)).toBe(false);
  });

  test.each(["handoff", "prepared", "eligibility", "posting", "thread"] as const)("changed %s facts deny stale planning", async changed => {
    const { store, privateDir, work, lead, plan } = await fixture();
    if (changed === "handoff") {
      const handoff = JSON.parse(fs.readFileSync(work.codexHandoffPath!, "utf8"));
      handoff.title = "Different synthetic target";
      fs.writeFileSync(work.codexHandoffPath!, JSON.stringify(handoff));
    }
    if (changed === "prepared") {
      const prepared = JSON.parse(fs.readFileSync(work.preparedPath!, "utf8"));
      prepared.candidate.email = "changed@example.test";
      fs.writeFileSync(work.preparedPath!, JSON.stringify(prepared));
    }
    if (changed === "eligibility") store.work.decideEligibility({ leadId: work.leadId, postingVersion: work.postingVersion, eligibility: "needs_review", reason: "Synthetic revocation." });
    if (changed === "posting") store.saveLead({ ...lead, normalizedDescription: lead.normalizedDescription + " Changed requirements." });
    if (changed === "thread") { work.threadId = "other-thread"; store.work.save(work); }
    expect(() => planCodexResumeDispatch({ store, privateDir, workId: work.workId })).toThrow(/handoff|hash|eligibility|posting|binding/i);
    expect(fs.existsSync(plan.receiptPath)).toBe(false);
  });

  test("planning a low-fit eligible job is read-only and marks posting text as untrusted data", async () => {
    const { plan, work } = await fixture();
    expect(work.fit?.score).toBe(1);
    expect(plan.binding).toMatchObject({ workId: work.workId, jobId: work.leadId, postingVersion: work.postingVersion, threadId: work.threadId, inputHash: work.inputHash });
    expect(plan.request.untrustedPostingText).toBeTruthy();
    expect(plan.request.approvedClaims).toEqual([{ id: "approved", claim: "Built a synthetic demo.", source: "synthetic://approved", approved: true }]);
    expect(fs.existsSync(plan.receiptPath)).toBe(false);
  });
});
