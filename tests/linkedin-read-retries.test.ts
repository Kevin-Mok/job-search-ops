import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { JobStore } from "../src/db/store.js";
import { drainLinkedInAlerts, ingestLinkedInEmail } from "../src/core/linkedin-route.js";
import { attachLinkedInResume, postingVersion, processLinkedInWork, queueLinkedInWork, type JobWorkRecord } from "../src/core/job-workflow.js";
import * as resumeModule from "../src/core/job-resume.js";
import { createDiscordLinkedInTransport, type LinkedInTransport } from "../src/discord/linkedin-transport.js";

type Stage = "thread" | "fit" | "pdf";
type Fault = "network" | "500" | "503" | "json" | "403";
const stages: Stage[] = ["thread", "fit", "pdf"];
const transientFaults: Fault[] = ["network", "500", "503", "json"];
const roots: string[] = [];
const channelId = "222222222222222222";
const rootId = "333333333333333333";
const threadId = "444444444444444444";
const enrichmentId = "555555555555555555";
const botId = "777777777777777777";
const candidate = { name: "Synthetic Candidate", email: "synthetic@example.test" };
const evidence = [{ id: "approved-synthetic", claim: "Built **Python** validation fixtures.", skills: ["python"], source: "synthetic://approved/commit", approved: true }];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function faultResponse(fault: Fault): Response {
  if (fault === "network") throw new Error("Synthetic connection failure");
  if (fault === "json") return new Response("not readable JSON", { status: 200 });
  return Response.json({ message: "Synthetic unavailable response" }, { status: Number(fault) });
}

async function setup(stage: Stage) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "linkedin-read-retries-"));
  roots.push(privateDir);
  const store = new JobStore(path.join(privateDir, "jobs.sqlite"));
  const baseline: LinkedInTransport = {
    target: `discord:${channelId}`,
    async sendAlert() { return rootId; }, async findAlert() { return undefined; },
    async createThread() { return threadId; }, async findThread() { return undefined; },
    async sendThreadMessage() { return "original-fit-receipt"; }
  };
  const { leadIds: [leadId] } = ingestLinkedInEmail(store, {
    messageId: "synthetic-read-retry", source: "linkedin", receivedAt: "2026-11-10T11:00:00Z",
    from: "jobs-noreply@linkedin.com", subject: "Synthetic job",
    textBody: "Title: Support Engineer\nCompany: Example Employer\nLocation: Remote - Canada\nWork model: Remote\nRemote eligibility: Canada\nSeniority: Entry\nSkills: Python\nView Job: https://www.linkedin.com/jobs/view/123456789\nDescription: Maintain synthetic Python services."
  }, { fixture: true });
  if (stage !== "thread") await drainLinkedInAlerts({ store, transport: baseline });
  const lead = store.getLead(leadId)!;
  store.work.decideEligibility({ leadId, postingVersion: postingVersion(lead), eligibility: "eligible", reason: "Synthetic requirements reviewed." });
  let [work] = queueLinkedInWork(store, baseline.target);
  if (stage === "pdf") [work] = await processLinkedInWork({ store, transport: baseline, privateDir, candidate, evidence });
  const artifact: resumeModule.ValidatedResumeArtifact = {
    jobId: leadId, postingVersion: work.postingVersion, threadId, sha256: "a".repeat(64), bindingHash: "synthetic-pdf-binding",
    bytes: Buffer.from("Synthetic approved PDF bytes"), pdfPath: path.join(privateDir, "test.pdf"), previewPath: path.join(privateDir, "test.png"),
    validatedAt: new Date().toISOString(), visualReview: "pending", renderer: "external-portfolio-artifact"
  };
  if (stage === "pdf") {
    const { bytes: _bytes, ...metadata } = artifact;
    work.artifact = metadata;
    store.work.save(work);
    vi.spyOn(resumeModule, "validateJobResumeArtifact").mockResolvedValue(artifact);
  }
  const state: { getFault?: Fault; postFault?: Fault; gets: number; rootPosts: number; threadPosts: number; enrichmentPosts: number; threadCreated: boolean; records: unknown[] } = {
    gets: 0, rootPosts: 0, threadPosts: 0, enrichmentPosts: 0, threadCreated: stage !== "thread", records: []
  };
  const transport = createDiscordLinkedInTransport({ token: "synthetic-token", channelId, fetcher: async (url, init) => {
    const parsed = new URL(String(url));
    if (init?.method === "GET") {
      state.gets++;
      if (state.getFault) return faultResponse(state.getFault);
      if (parsed.pathname === "/api/v10/users/@me") return Response.json({ id: botId });
      if (parsed.searchParams.has("limit")) return Response.json(state.records);
      if (stage === "thread" && !state.threadCreated) return new Response(null, { status: 404 });
      return Response.json({ id: threadId, parent_id: channelId, type: 11 });
    }
    if (parsed.pathname.endsWith("/threads")) {
      state.threadPosts++;
      state.threadCreated = true;
      return Response.json({ id: threadId, parent_id: channelId, type: 11 });
    }
    const rootPost = parsed.pathname === `/api/v10/channels/${channelId}/messages`;
    if (rootPost) state.rootPosts++;
    else state.enrichmentPosts++;
    const body = init!.body instanceof FormData ? JSON.parse(String(init!.body.get("payload_json"))) : JSON.parse(String(init!.body));
    const receipt = {
      id: rootPost ? rootId : enrichmentId, channel_id: rootPost ? channelId : threadId,
      content: body.content, author: { id: botId },
      ...(stage === "pdf" && !rootPost ? { attachments: [{ id: "666666666666666666", filename: body.attachments[0].filename, size: artifact.bytes.length }] } : {})
    };
    state.records = [receipt];
    if (state.postFault) return faultResponse(state.postFault);
    return Response.json(receipt);
  } });
  const run = async () => {
    const reopened = new JobStore(store.dbPath);
    if (stage === "thread") await drainLinkedInAlerts({ store: reopened, transport });
    else if (stage === "fit") await processLinkedInWork({ store: reopened, transport, privateDir, candidate, evidence });
    else await attachLinkedInResume({ store: reopened, transport, workId: work.workId, approvedSha256: artifact.sha256, portfolioRoot: privateDir }).catch(() => undefined);
  };
  const delivery = () => stage === "thread" ? new JobStore(store.dbPath).linkedin.listDeliveries()[0] : new JobStore(store.dbPath).work.get(work.workId)![stage === "fit" ? "fitDelivery" : "attachmentDelivery"]!;
  const inputs = () => {
    const current = store.work.get(work.workId)!;
    return {
      inputHash: current.inputHash,
      prepared: current.preparedPath ? fs.readFileSync(current.preparedPath) : undefined,
      handoff: current.codexHandoffPath ? fs.readFileSync(current.codexHandoffPath) : undefined,
      artifact: current.artifact,
      ...(stage === "pdf" ? { fitReceipt: current.fitDelivery } : {})
    };
  };
  return { store, work, stage, transport, state, run, delivery, inputs };
}

function advancePastRetry(record: { retryAt?: string }) {
  expect(record.retryAt).toBeTruthy();
  vi.setSystemTime(new Date(Date.parse(record.retryAt!) + 1));
}

describe("retryable Discord reads preserve write certainty", () => {
  test.each(stages.flatMap(stage => transientFaults.map(fault => ({ stage, fault }))))("$stage preflight $fault retries without inventing write uncertainty", async ({ stage, fault }) => {
    const s = await setup(stage);
    s.state.getFault = fault;
    await s.run();
    const retry = s.delivery();
    expect(retry).toMatchObject({ status: "retry", reconcileRequired: false });
    expect(s.store.linkedin.targetRetryAt(s.transport.target)).toBe(retry.retryAt);
    if (stage === "thread") expect(retry).toMatchObject({ messageId: rootId, attempts: 1 });
    else expect(s.store.linkedin.listDeliveries()[0]).toMatchObject({ messageId: rootId, threadId });
    const inputs = s.inputs();
    const gets = s.state.gets;
    const posts = { root: s.state.rootPosts, thread: s.state.threadPosts, enrichment: s.state.enrichmentPosts };
    s.state.getFault = undefined;
    await s.run();
    expect(s.state.gets).toBe(gets);
    expect({ root: s.state.rootPosts, thread: s.state.threadPosts, enrichment: s.state.enrichmentPosts }).toEqual(posts);
    expect(s.delivery()).toEqual(retry);
    advancePastRetry(retry);
    await s.run();
    const delivered = s.delivery();
    expect(delivered).toMatchObject({ status: "delivered", reconcileRequired: false });
    expect(s.state.rootPosts).toBe(stage === "thread" ? 1 : 0);
    expect(s.state.threadPosts).toBe(stage === "thread" ? 1 : 0);
    expect(s.state.enrichmentPosts).toBe(stage === "thread" ? 0 : 1);
    expect(s.inputs()).toEqual(inputs);
    await s.run();
    expect(s.delivery()).toEqual(delivered);
    expect(s.state.enrichmentPosts).toBe(stage === "thread" ? 0 : 1);
    expect(s.state.threadPosts).toBe(stage === "thread" ? 1 : 0);
  });

  test.each(stages)("$stage GET403 remains blocked with its known receipts preserved", async stage => {
    const s = await setup(stage);
    s.state.getFault = "403";
    await s.run();
    const blocked = s.delivery();
    expect(blocked).toMatchObject({ status: "blocked", reconcileRequired: false });
    expect(blocked.lastError).toContain("403");
    const inputs = s.inputs();
    const gets = s.state.gets;
    s.state.getFault = undefined;
    vi.setSystemTime(new Date(Date.now() + 120_000));
    await s.run();
    expect(s.delivery()).toEqual(blocked);
    expect(s.state.gets).toBe(gets);
    expect(s.inputs()).toEqual(inputs);
    expect(s.state.rootPosts).toBe(stage === "thread" ? 1 : 0);
    expect(s.state.threadPosts).toBe(0);
    expect(s.state.enrichmentPosts).toBe(0);
  });

  const writeFaults: Fault[] = ["network", "503", "json"];
  test.each(stages.flatMap(stage => writeFaults.map(fault => ({ stage, fault }))))("$stage POST $fault stays uncertain through a transient reconciliation read and never duplicates the write", async ({ stage, fault }) => {
    const s = await setup(stage);
    s.state.postFault = fault;
    await s.run();
    const uncertain = s.delivery();
    expect(uncertain).toMatchObject({ status: "uncertain", reconcileRequired: true });
    const inputs = s.inputs();
    const attempts = uncertain.attempts;
    s.state.postFault = undefined;
    s.state.getFault = "network";
    await s.run();
    const retry = s.delivery();
    expect(retry).toMatchObject({ status: "retry", reconcileRequired: true, key: uncertain.key, attempts: attempts + 1 });
    expect(s.inputs()).toEqual(inputs);
    expect(s.store.linkedin.targetRetryAt(s.transport.target)).toBe(retry.retryAt);
    s.state.getFault = undefined;
    advancePastRetry(retry);
    await s.run();
    const reconciled = s.delivery();
    expect(reconciled).toMatchObject({ status: "delivered", reconcileRequired: false, messageId: stage === "thread" ? rootId : enrichmentId });
    expect(s.state.rootPosts).toBe(stage === "thread" ? 1 : 0);
    expect(s.state.threadPosts).toBe(stage === "thread" ? 1 : 0);
    expect(s.state.enrichmentPosts).toBe(stage === "thread" ? 0 : 1);
    expect(s.inputs()).toEqual(inputs);
    await s.run();
    expect(s.delivery()).toEqual(reconciled);
    expect(s.state.rootPosts).toBe(stage === "thread" ? 1 : 0);
    expect(s.state.enrichmentPosts).toBe(stage === "thread" ? 0 : 1);
  });
});
