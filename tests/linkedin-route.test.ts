import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { JobStore } from "../src/db/store.js";
import { ingestLinkedInEmail, drainLinkedInAlerts } from "../src/core/linkedin-route.js";
import { DiscordRouteError, type LinkedInTransport } from "../src/discord/linkedin-transport.js";

const email = JSON.parse(fs.readFileSync("fixtures/email/linkedin-alert-2026-03-12.json", "utf8"));
function setup() {
  const db = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "linkedin-route-")), "jobs.sqlite");
  return { db, store: new JobStore(db) };
}
function transport() {
  const messages = new Map<string, string>();
  const threads = new Map<string, string>();
  const calls: string[] = [];
  const adapter: LinkedInTransport = {
    target: "fixture:linkedin-review",
    async findAlert(key) { return messages.get(key); },
    async sendAlert({ key, content }) { calls.push(content); const id = `message-${messages.size}`; messages.set(key, id); return id; },
    async findThread(messageId) { return threads.get(messageId); },
    async createThread({ messageId }) { const id = `thread-${messageId}`; threads.set(messageId, id); return id; }
  };
  return { adapter, messages, threads, calls };
}

describe("LinkedIn email to Discord", () => {
  test.each([false, true])("rejected expired send preserves saved root=%s and uncertainty without another write", async savedRoot => {
    const { db, store } = setup();
    const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[0] }, { fixture: true });
    const remote = transport();
    const now = new Date("2026-11-10T12:00:00Z");
    store.linkedin.queue(remote.adapter.target, leadIds[0], false, now.toISOString());
    const attempted = store.linkedin.claim(remote.adapter.target, leadIds[0], now)!;
    attempted.reconcileRequired = true;
    const root = await remote.adapter.sendAlert({ key: attempted.key, title: "Synthetic", content: "Synthetic alert" });
    if (savedRoot) attempted.messageId = root;
    store.linkedin.save(attempted);
    store.updateLeadReview({ leadId: leadIds[0], status: "rejected", note: "Synthetic rejection after remote root success." });
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter, now: new Date(now.getTime() + 61_000) });
    const held = store.linkedin.listDeliveries()[0];
    expect(held.status).toBe("held");
    expect(held.reconcileRequired).toBe(true);
    expect(held.messageId).toBe(attempted.messageId);
    expect(held.attempts).toBe(attempted.attempts);
    expect(remote.messages.size).toBe(1);
    expect(remote.threads.size).toBe(0);
  });

  test.each(["sendAlert", "findAlert", "findThread"] as const)("rejection while awaiting %s prevents thread creation and retains root receipt", async stage => {
    const { db, store } = setup();
    const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[0] }, { fixture: true });
    const remote = transport();
    if (stage === "findAlert") {
      store.linkedin.queue(remote.adapter.target, leadIds[0], false, new Date().toISOString());
      const delivery = store.linkedin.listDeliveries()[0];
      delivery.status = "uncertain";
      delivery.reconcileRequired = true;
      store.linkedin.save(delivery);
      await remote.adapter.sendAlert({ key: delivery.key, content: "Synthetic root", title: "Synthetic" });
    }
    const original = remote.adapter[stage];
    if (stage === "sendAlert") remote.adapter.sendAlert = async payload => {
      const result = await (original as typeof remote.adapter.sendAlert)(payload);
      store.updateLeadReview({ leadId: leadIds[0], status: "rejected", note: "Synthetic concurrent rejection." });
      return result;
    };
    else remote.adapter[stage] = async key => {
      const result = await (original as typeof remote.adapter.findAlert)(key);
      store.updateLeadReview({ leadId: leadIds[0], status: "rejected", note: "Synthetic concurrent rejection." });
      return result;
    };
    await drainLinkedInAlerts({ store, transport: remote.adapter });
    expect(remote.messages.size).toBe(1);
    expect(remote.threads.size).toBe(0);
    expect(store.linkedin.listDeliveries()[0]).toMatchObject({ messageId: "message-0", status: "held", reconcileRequired: false });
    if (stage === "sendAlert") remote.adapter.sendAlert = original as typeof remote.adapter.sendAlert;
    else remote.adapter[stage] = original as typeof remote.adapter.findAlert;
    store.updateLeadReview({ leadId: leadIds[0], status: "approved_for_manual_apply", note: "Synthetic explicit reapproval." });
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter });
    const delivered = new JobStore(db).linkedin.listDeliveries()[0];
    expect(delivered).toMatchObject({ messageId: "message-0", threadId: "thread-message-0", status: "delivered", reconcileRequired: false });
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter });
    expect(store.linkedin.listDeliveries()[0]).toEqual(delivered);
    expect(remote.messages.size).toBe(1);
    expect(remote.threads.size).toBe(1);
    expect(remote.calls).toHaveLength(1);
  });

  test("rejection during an earlier delivery prevents a later queued alert write", async () => {
    const { store } = setup();
    ingestLinkedInEmail(store, email, { fixture: true });
    const remote = transport();
    const send = remote.adapter.sendAlert;
    remote.adapter.sendAlert = async payload => {
      const current = store.linkedin.listDeliveries().find(row => row.key === payload.key)!;
      for (const lead of store.listLeads().filter(row => row.leadId !== current.leadId)) {
        store.updateLeadReview({ leadId: lead.leadId, status: "rejected", note: "Synthetic concurrent batch rejection." });
      }
      return send(payload);
    };
    await drainLinkedInAlerts({ store, transport: remote.adapter });
    expect(remote.messages.size).toBe(1);
    expect(remote.threads.size).toBe(1);
    remote.adapter.sendAlert = send;
    for (const lead of store.listLeads()) store.updateLeadReview({ leadId: lead.leadId, status: "approved_for_manual_apply", note: "Synthetic batch reapproval." });
    await drainLinkedInAlerts({ store: new JobStore(store.dbPath), transport: remote.adapter });
    expect(remote.messages.size).toBe(3);
    expect(remote.threads.size).toBe(3);
    expect(remote.calls).toHaveLength(3);
  });

  test.each(["root", "thread"] as const)("real %s permission block stays terminal across a queued operator hold and reapproval", async stage => {
    const { db, store } = setup();
    const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[0] }, { fixture: true });
    const remote = transport();
    let writes = 0;
    if (stage === "root") remote.adapter.sendAlert = async () => { writes++; throw new DiscordRouteError("Synthetic HTTP403", "blocked"); };
    else remote.adapter.createThread = async () => { writes++; throw new DiscordRouteError("Synthetic HTTP403", "blocked"); };
    await drainLinkedInAlerts({ store, transport: remote.adapter });
    const blocked = store.linkedin.listDeliveries()[0];
    expect(blocked.status).toBe("blocked");
    store.updateLeadReview({ leadId: leadIds[0], status: "rejected", note: "Synthetic temporary operator hold." });
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter });
    expect(store.linkedin.listDeliveries()[0]).toEqual(blocked);
    store.updateLeadReview({ leadId: leadIds[0], status: "approved_for_manual_apply", note: "Synthetic explicit reapproval." });
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter });
    expect(store.linkedin.listDeliveries()[0]).toEqual(blocked);
    expect(writes).toBe(1);
    expect(remote.messages.size).toBe(stage === "root" ? 0 : 1);
    expect(remote.threads.size).toBe(0);
  });

  test("temporary thread admission denial retains retry timing and resumes the successful root", async () => {
    const { db, store } = setup();
    const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[0] }, { fixture: true });
    const remote = transport();
    const create = remote.adapter.createThread;
    const find = remote.adapter.findThread;
    const now = new Date("2026-11-10T12:00:00Z");
    remote.adapter.createThread = async () => { throw new DiscordRouteError("Synthetic rate limit", "retry", 2_000); };
    await drainLinkedInAlerts({ store, transport: remote.adapter, now });
    const retry = store.linkedin.listDeliveries()[0];
    remote.adapter.createThread = create;
    remote.adapter.findThread = async messageId => {
      const found = await find(messageId);
      store.updateLeadReview({ leadId: leadIds[0], status: "rejected", note: "Synthetic rejection during retry readback." });
      return found;
    };
    const afterBackoff = new Date(now.getTime() + 3_000);
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter, now: afterBackoff });
    const held = store.linkedin.listDeliveries()[0];
    expect(held).toMatchObject({ status: "held", messageId: retry.messageId, key: retry.key, retryAt: retry.retryAt, reconcileRequired: false, attempts: retry.attempts + 1 });
    expect(store.linkedin.targetRetryAt(remote.adapter.target)).toBe(retry.retryAt);
    remote.adapter.findThread = find;
    store.updateLeadReview({ leadId: leadIds[0], status: "approved_for_manual_apply", note: "Synthetic explicit reapproval." });
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter, now: afterBackoff });
    expect(store.linkedin.listDeliveries()[0]).toMatchObject({ status: "delivered", messageId: retry.messageId, threadId: "thread-message-0" });
    expect(remote.calls).toHaveLength(1);
    expect(remote.threads.size).toBe(1);
  });

  test("operator holds and reapproval preserve an uncertain thread attempt until matching readback", async () => {
    const { db, store } = setup();
    const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[0] }, { fixture: true });
    const remote = transport();
    const create = remote.adapter.createThread;
    let threadWrites = 0;
    remote.adapter.createThread = async payload => { threadWrites++; await create(payload); throw new Error("Synthetic lost thread receipt"); };
    await drainLinkedInAlerts({ store, transport: remote.adapter });
    const attempted = store.linkedin.listDeliveries()[0];
    expect(attempted).toMatchObject({ status: "uncertain", messageId: "message-0", reconcileRequired: true });
    store.updateLeadReview({ leadId: leadIds[0], status: "rejected", note: "Synthetic operator hold." });
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter });
    expect(store.linkedin.listDeliveries()[0]).toMatchObject({ status: "held", messageId: attempted.messageId, attempts: attempted.attempts, reconcileRequired: true });
    store.updateLeadReview({ leadId: leadIds[0], status: "approved_for_manual_apply", note: "Synthetic explicit reapproval." });
    const find = remote.adapter.findThread;
    remote.adapter.findThread = async () => undefined;
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter });
    expect(store.linkedin.listDeliveries()[0]).toMatchObject({ status: "uncertain", messageId: attempted.messageId, reconcileRequired: true });
    expect(threadWrites).toBe(1);
    remote.adapter.findThread = find;
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter });
    expect(store.linkedin.listDeliveries()[0]).toMatchObject({ status: "delivered", messageId: attempted.messageId, threadId: "thread-message-0", reconcileRequired: false });
    expect(threadWrites).toBe(1);
    expect(remote.calls).toHaveLength(1);
  });

  test("multi-job replay and process restart preserve canonical identities and one thread per reviewable job", async () => {
    const { db, store } = setup();
    const first = ingestLinkedInEmail(store, email, { fixture: true });
    expect(first.leadIds).toHaveLength(4);
    expect(ingestLinkedInEmail(store, email, { fixture: true }).replayed).toBe(true);
    const remote = transport();
    await drainLinkedInAlerts({ store, transport: remote.adapter });
    const restarted = new JobStore(db);
    expect(ingestLinkedInEmail(restarted, email, { fixture: true }).leadIds).toEqual(first.leadIds);
    const before = restarted.linkedin.listDeliveries();
    expect(before.filter(row => row.status === "delivered")).toHaveLength(3);
    expect(before.filter(row => row.status === "held")).toHaveLength(1);
    await drainLinkedInAlerts({ store: restarted, transport: remote.adapter });
    expect(remote.messages.size).toBe(3);
    expect(remote.threads.size).toBe(3);
    expect(restarted.linkedin.listDeliveries()).toEqual(before);
    expect(remote.calls.join("\n")).toContain("Customer Support Specialist");
    expect(remote.calls.join("\n")).toContain("needs_review");
  });

  test("same title/company with different posting IDs remains two jobs; changed versions preserve job and thread", async () => {
    const { store } = setup();
    const one = { ...email, textBody: email.textBody.split("\n---\n")[0] };
    const first = ingestLinkedInEmail(store, one, { fixture: true });
    const other = { ...one, messageId: "different-posting", textBody: one.textBody.replace("maple-python-duplicate", "maple-python-second") };
    const second = ingestLinkedInEmail(store, other, { fixture: true });
    expect(second.leadIds[0]).not.toBe(first.leadIds[0]);
    const changed = ingestLinkedInEmail(store, { ...one, textBody: one.textBody + " Updated description." }, { fixture: true });
    expect(changed.leadIds).toEqual(first.leadIds);
    expect(store.linkedin.listMessages()).toHaveLength(3);
    expect(store.listLeads()).toHaveLength(2);
  });

  test("rejects untrusted sender and unverified handoff before writes", () => {
    const { store } = setup();
    expect(() => ingestLinkedInEmail(store, { ...email, from: "attacker@linkedin.com.evil.test" }, { fixture: true })).toThrow(/sender/i);
    expect(() => ingestLinkedInEmail(store, email, {})).toThrow(/verified/i);
    expect(store.listLeads()).toHaveLength(0);
    expect(store.linkedin.listMessages()).toHaveLength(0);
  });

  test("definite rate limits persist retry time and resume after restart without recreating alerts", async () => {
    const { db, store } = setup();
    ingestLinkedInEmail(store, email, { fixture: true });
    const remote = transport();
    const original = remote.adapter.createThread;
    let fail = true;
    remote.adapter.createThread = async (p) => {
      if (fail) { fail = false; throw new DiscordRouteError("Discord rate limited", "retry", 2000); }
      return original(p);
    };
    const now = new Date("2026-11-06T23:00:00Z");
    await drainLinkedInAlerts({ store, transport: remote.adapter, now });
    expect(store.linkedin.listDeliveries().some(row => row.status === "retry")).toBe(true);
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter, now: new Date(now.getTime() + 1000) });
    expect(remote.messages.size).toBe(1);
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter, now: new Date(now.getTime() + 3000) });
    expect(remote.messages.size).toBe(3);
    expect(remote.threads.size).toBe(3);
    expect(store.linkedin.listDeliveries().filter(row => row.status === "delivered")).toHaveLength(3);
  });

  test("ambiguous remote success is reconciled; missing evidence stays uncertain instead of resending", async () => {
    const { db, store } = setup();
    const one = { ...email, textBody: email.textBody.split("\n---\n")[0] };
    ingestLinkedInEmail(store, one, { fixture: true });
    const remote = transport();
    const send = remote.adapter.sendAlert;
    remote.adapter.sendAlert = async (p) => { await send(p); throw new Error("connection lost after remote success"); };
    await drainLinkedInAlerts({ store, transport: remote.adapter });
    expect(store.linkedin.listDeliveries()[0].status).toBe("uncertain");
    remote.adapter.findAlert = async () => undefined;
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter });
    expect(remote.messages.size).toBe(1);
    expect(store.linkedin.listDeliveries()[0].status).toBe("uncertain");
    remote.adapter.findAlert = async key => remote.messages.get(key);
    await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter });
    expect(remote.messages.size).toBe(1);
    expect(store.linkedin.listDeliveries()[0].status).toBe("delivered");
  });

  test("current admission releases a corrected location hold and respects an operator rejection before retry", async () => {
    const { store } = setup();
    const support = { ...email, messageId: "support-held", textBody: email.textBody.split("\n---\n")[2], receivedAt: "2026-11-05T22:00:00Z" };
    ingestLinkedInEmail(store, { ...support, textBody: support.textBody.replace("Remote eligibility: Canada", "Remote eligibility: United States only") }, { fixture: true });
    const remote = transport();
    await drainLinkedInAlerts({ store, transport: remote.adapter });
    expect(store.linkedin.listDeliveries()[0].status).toBe("held");
    ingestLinkedInEmail(store, { ...support, messageId: "support-corrected", receivedAt: "2026-11-06T22:00:00Z" }, { fixture: true });
    await drainLinkedInAlerts({ store, transport: remote.adapter });
    expect(remote.messages.size).toBe(1);

    const another = setup().store;
    const { leadIds } = ingestLinkedInEmail(another, support, { fixture: true });
    let sends = 0;
    remote.adapter.sendAlert = async () => { sends += 1; throw new DiscordRouteError("Throttled", "retry", 1000); };
    const now = new Date("2026-11-06T22:00:00Z");
    await drainLinkedInAlerts({ store: another, transport: remote.adapter, now });
    another.updateLeadReview({ leadId: leadIds[0], status: "rejected", note: "Synthetic operator rejection." });
    await drainLinkedInAlerts({ store: another, transport: remote.adapter, now: new Date(now.getTime() + 2000) });
    expect(sends).toBe(1);
    expect(another.linkedin.listDeliveries()[0].status).toBe("held");
  });

  test("retry_after starts when a slow rate-limit response arrives", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T22:00:00Z"));
    try {
      const { store } = setup();
      ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[0] }, { fixture: true });
      const remote = transport();
      remote.adapter.sendAlert = async () => {
        vi.setSystemTime(new Date(Date.now() + 30_000));
        throw new DiscordRouteError("Slow 429 response", "retry", 2000);
      };
      await drainLinkedInAlerts({ store, transport: remote.adapter });
      expect(store.linkedin.listDeliveries()[0].retryAt).toBe(new Date(Date.now() + 2000).toISOString());
    } finally { vi.useRealTimers(); }
  });

  test("reconciliation rate limit never turns an uncertain alert into a new POST", async () => {
    const { store } = setup();
    ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[0] }, { fixture: true });
    const remote = transport();
    const send = remote.adapter.sendAlert;
    remote.adapter.sendAlert = async payload => { await send(payload); throw new Error("reply lost"); };
    const now = new Date("2026-11-06T22:00:00Z");
    await drainLinkedInAlerts({ store, transport: remote.adapter, now });
    remote.adapter.findAlert = async () => { throw new DiscordRouteError("Readback rate limited", "retry", 1000); };
    await drainLinkedInAlerts({ store, transport: remote.adapter, now });
    remote.adapter.findAlert = async () => undefined;
    await drainLinkedInAlerts({ store, transport: remote.adapter, now: new Date(now.getTime() + 2000) });
    expect(remote.calls).toHaveLength(1);
    expect(store.linkedin.listDeliveries()[0].status).toBe("uncertain");
  });

  test("actual low-fit input still gets initial delivery without changing its review status in a test", async () => {
    const { store } = setup();
    const lowFit = { ...email, messageId: "low-fit", textBody: "Title: Principal Florist\nCompany: Example Flowers\nLocation: Remote - Canada\nWork model: Remote\nRemote eligibility: Canada\nSeniority: Principal\nSkills: Flower Design\nView Job: https://www.linkedin.com/jobs/view/123456789\nDescription: Synthetic posting for an unrelated skill family." };
    const { leadIds } = ingestLinkedInEmail(store, lowFit, { fixture: true });
    expect(store.getLead(leadIds[0])?.score).toBeLessThan(45);
    const remote = transport();
    await drainLinkedInAlerts({ store, transport: remote.adapter });
    expect(remote.messages.size).toBe(1);
    expect(remote.threads.size).toBe(1);
  });

  test("older out-of-order email preserves its source observation without reverting the current posting", () => {
    const { store } = setup();
    const one = { ...email, textBody: email.textBody.split("\n---\n")[0] };
    const newer = { ...one, messageId: "newer", receivedAt: "2026-11-06T22:00:00Z", textBody: one.textBody + " Newer source requirements." };
    const { leadIds } = ingestLinkedInEmail(store, newer, { fixture: true });
    const before = store.getLead(leadIds[0])!;
    ingestLinkedInEmail(store, { ...one, messageId: "older", receivedAt: "2026-11-05T22:00:00Z" }, { fixture: true });
    expect(store.getLead(leadIds[0])?.normalizedDescription).toBe(before.normalizedDescription);
    expect(store.linkedin.listMessages()).toHaveLength(2);
  });

  test("slow batches use a fresh per-item lease and concurrent drain cannot claim the active send", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T22:00:00Z"));
    try {
      const { db, store } = setup();
      ingestLinkedInEmail(store, email, { fixture: true });
      const remote = transport();
      const send = remote.adapter.sendAlert;
      let sends = 0;
      let concurrent = false;
      let concurrentActiveAttempts = 0;
      remote.adapter.sendAlert = async payload => {
        sends += 1;
        if (sends === 1) vi.setSystemTime(new Date(Date.now() + 90_000));
        if (sends === 2 && !concurrent) {
          concurrent = true;
          await drainLinkedInAlerts({ store: new JobStore(db), transport: remote.adapter });
          concurrentActiveAttempts = store.linkedin.listDeliveries().find(row => row.key === payload.key)?.attempts ?? 0;
        }
        return send(payload);
      };
      await drainLinkedInAlerts({ store, transport: remote.adapter });
      expect(sends).toBe(3);
      expect(concurrentActiveAttempts).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  test("accepted low-fit leads are announced without a score cutoff and manual outcomes stay manual", async () => {
    const { store } = setup();
    const { leadIds } = ingestLinkedInEmail(store, email, { fixture: true });
    const lead = store.getLead(leadIds[0])!;
    store.saveLead({ ...lead, score: 1, reviewStatus: "new" });
    const remote = transport();
    await drainLinkedInAlerts({ store, transport: remote.adapter });
    expect(remote.calls.some(content => content.includes(lead.leadId))).toBe(true);
    expect(store.getLead(lead.leadId)?.reviewStatus).toBe("new");
    store.updateLeadReview({ leadId: lead.leadId, status: "applied_manually" });
    await drainLinkedInAlerts({ store, transport: remote.adapter });
    expect(remote.messages.size).toBe(3);
  });
});
