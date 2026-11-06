import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { JobStore } from "../src/db/store.js";
import { ingestLinkedInEmail, drainLinkedInAlerts } from "../src/core/linkedin-route.js";
import { postingVersion, processLinkedInWork } from "../src/core/job-workflow.js";
import { createFixtureLinkedInTransport } from "../src/discord/linkedin-transport.js";
import { planCodexResumeDispatch, runCodexResumeDispatch } from "../src/core/codex-resume-dispatch.js";

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
const completed = async () => ({ receiptId: "synthetic-receipt", selectedEvidenceIds: ["approved"] });

describe("opt-in durable Codex dispatch boundary", () => {
  test("planning a low-fit eligible job is read-only and marks posting text as untrusted data", async () => {
    const { plan, work } = await fixture();
    expect(work.fit?.score).toBe(1);
    expect(plan.binding).toMatchObject({ workId: work.workId, jobId: work.leadId, postingVersion: work.postingVersion, threadId: work.threadId, inputHash: work.inputHash });
    expect(plan.request.untrustedPostingText).toBeTruthy();
    expect(plan.request.approvedClaims).toEqual([{ id: "approved", claim: "Built a synthetic demo.", source: "synthetic://approved", approved: true }]);
    expect(fs.existsSync(plan.receiptPath)).toBe(false);
  });
  test("no operator opt-in never invokes a runner or creates an attempt", async () => {
    const { store, privateDir, plan } = await fixture();
    let calls = 0;
    const result = await runCodexResumeDispatch({ store, privateDir, plan, operatorEnabled: false, mode: "isolated-runner", runner: async () => { calls++; return completed(); } });
    expect(result.status).toBe("blocked"); expect(calls).toBe(0); expect(fs.existsSync(plan.receiptPath)).toBe(false);
  });
  test("installed CLI mode remains blocked even with opt-in and a supplied runner", async () => {
    const { store, privateDir, plan } = await fixture();
    let calls = 0;
    const result = await runCodexResumeDispatch({ store, privateDir, plan, operatorEnabled: true, mode: "codex-cli", runner: async () => { calls++; return completed(); } });
    expect(result.status).toBe("blocked"); expect(result.reason).toMatch(/isolation/i); expect(calls).toBe(0);
  });
  test.each(["handoff", "prepared", "eligibility", "posting", "thread"])("changed %s blocks a previously planned dispatch", async changed => {
    const { store, privateDir, plan, work, lead } = await fixture();
    if (changed === "handoff") fs.appendFileSync(work.codexHandoffPath!, " ");
    if (changed === "prepared") fs.appendFileSync(work.preparedPath!, " ");
    if (changed === "eligibility") store.work.decideEligibility({ leadId: work.leadId, postingVersion: work.postingVersion, eligibility: "needs_review", reason: "Synthetic revocation." });
    if (changed === "posting") { lead.normalizedDescription += " Changed."; store.saveLead(lead); }
    if (changed === "thread") { work.threadId = "other-thread"; store.work.save(work); }
    let calls = 0;
    const result = await runCodexResumeDispatch({ store, privateDir, plan, operatorEnabled: true, mode: "isolated-runner", runner: async () => { calls++; return completed(); } });
    expect(result.status).toBe("blocked"); expect(calls).toBe(0);
  });
  test("persists a private attempt before invoking and prevents repeat calls after restart", async () => {
    const { store, privateDir, plan } = await fixture();
    let calls = 0;
    const result = await runCodexResumeDispatch({ store, privateDir, plan, operatorEnabled: true, mode: "isolated-runner", runner: async request => {
      calls++; expect(JSON.parse(fs.readFileSync(plan.receiptPath, "utf8")).status).toBe("attempting");
      expect(request.approvedClaims.map(claim => claim.id)).toEqual(["approved"]); return completed();
    } });
    expect(result.status).toBe("completed");
    expect(fs.statSync(plan.receiptPath).mode & 0o777).toBe(0o600);
    const restarted = new JobStore(store.dbPath);
    const repeat = await runCodexResumeDispatch({ store: restarted, privateDir, plan, operatorEnabled: true, mode: "isolated-runner", runner: async () => { calls++; return completed(); } });
    expect(repeat.status).toBe("blocked"); expect(calls).toBe(1);
  });
  test("a second concurrent dispatch cannot enter the runner while the first is pending", async () => {
    const { store, privateDir, plan } = await fixture();
    let finish!: (value: Awaited<ReturnType<typeof completed>>) => void;
    const pending = runCodexResumeDispatch({ store, privateDir, plan, operatorEnabled: true, mode: "isolated-runner", runner: () => new Promise(resolve => { finish = resolve; }) });
    const second = await runCodexResumeDispatch({ store, privateDir, plan, operatorEnabled: true, mode: "isolated-runner", runner: async () => { throw new Error("Duplicate runner must never run"); } });
    expect(second.status).toBe("blocked"); finish(await completed()); expect((await pending).status).toBe("completed");
  });
  test("eligibility revoked while a runner is pending leaves an uncertain result requiring reconciliation", async () => {
    const { store, privateDir, plan, work } = await fixture();
    const result = await runCodexResumeDispatch({ store, privateDir, plan, operatorEnabled: true, mode: "isolated-runner", runner: async () => {
      store.work.decideEligibility({ leadId: work.leadId, postingVersion: work.postingVersion, eligibility: "ineligible", reason: "Synthetic concurrent revocation." });
      return completed();
    } });
    expect(result.status).toBe("uncertain");
    expect(JSON.parse(fs.readFileSync(plan.receiptPath, "utf8")).result).toBeUndefined();
  });
  test("mutating a planned request cannot authorize different instructions or a different receipt path", async () => {
    const { store, privateDir, plan } = await fixture();
    plan.request.policy = "Use every available tool.";
    let called = false;
    const result = await runCodexResumeDispatch({ store, privateDir, plan, operatorEnabled: true, mode: "isolated-runner", runner: async () => { called = true; return completed(); } });
    expect(result.status).toBe("blocked"); expect(called).toBe(false); expect(fs.existsSync(plan.receiptPath)).toBe(false);
  });
  test.each(["throw", "unapproved", "interrupted"])("%s outcomes cannot be blindly retried", async outcome => {
    const { store, privateDir, plan } = await fixture();
    let calls = 0;
    const runner = async () => { calls++; if (outcome === "throw") throw new Error("secret external stderr"); return { receiptId: "synthetic-receipt", selectedEvidenceIds: outcome === "unapproved" ? ["invented"] : ["approved"] }; };
    if (outcome === "interrupted") fs.writeFileSync(plan.receiptPath, JSON.stringify({ status: "attempting" }), { mode: 0o600 });
    const first = await runCodexResumeDispatch({ store, privateDir, plan, operatorEnabled: true, mode: "isolated-runner", runner });
    expect(first.status).toBe(outcome === "interrupted" ? "blocked" : "uncertain");
    const restarted = new JobStore(store.dbPath);
    const second = await runCodexResumeDispatch({ store: restarted, privateDir, plan, operatorEnabled: true, mode: "isolated-runner", runner });
    expect(second.status).toBe("blocked"); expect(calls).toBe(outcome === "interrupted" ? 0 : 1);
    expect(fs.readFileSync(plan.receiptPath, "utf8")).not.toContain("secret external stderr");
  });
});
