import { confirmSyntheticDescriptions } from "./helpers/manual-description.js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { JobStore } from "../src/db/store.js";
import { drainLinkedInAlerts, ingestLinkedInEmail } from "../src/core/linkedin-route.js";
import { attachLinkedInResume, postingVersion, processLinkedInWork, queueLinkedInWork, type JobWorkRecord } from "../src/core/job-workflow.js";
import { scoreJobFit } from "../src/core/fit-scoring.js";
import * as resumeModule from "../src/core/job-resume.js";
import { createDiscordLinkedInTransport, type LinkedInTransport } from "../src/discord/linkedin-transport.js";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const channelId = "222222222222222222";
const candidate = { name: "Synthetic Candidate", email: "synthetic@example.test" };
const evidence = [{ id: "approved-synthetic", claim: "Built **Python** validation fixtures.", skills: ["python"], source: "synthetic://approved/commit", approved: true }];
type Change = "eligibility" | "rejected" | "duplicate" | "posting" | "location";
const changes: Change[] = ["eligibility", "rejected", "duplicate", "posting", "location"];

async function setup(count = 1) {
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-admission-"));
  roots.push(privateDir);
  const store = new JobStore(path.join(privateDir, "jobs.sqlite"));
  let root = 333333333333333330n;
  const transport: LinkedInTransport = {
    target: `discord:${channelId}`,
    async sendAlert() { return String(root++); },
    async findAlert() { return undefined; },
    async createThread({ messageId }) { return String(BigInt(messageId) + 100n); },
    async findThread() { return undefined; },
    async sendThreadMessage() { return "original-fit-receipt"; },
    async findThreadMessage() { return undefined; },
    async sendAttachment() { return { messageId: "original-pdf-receipt", attachmentId: "original-file" }; }
  };
  ingestLinkedInEmail(store, {
    messageId: "synthetic-admission-batch", source: "linkedin", receivedAt: "2026-11-10T12:00:00Z",
    from: "jobs-noreply@linkedin.com", subject: "Synthetic jobs",
    textBody: Array.from({ length: count }, (_, index) => [
      `Title: Support Engineer ${index}`, `Company: Example ${index}`, "Location: Remote - Canada",
      "Work model: Remote", "Remote eligibility: Canada", "Seniority: Entry", "Skills: Python",
      `View Job: https://www.linkedin.com/jobs/view/${123456780 + index}`,
      "Description: Maintain synthetic Python validation services."
    ].join("\n")).join("\n---\n")
  }, { fixture: true });
  await drainLinkedInAlerts({ store, transport });
    confirmSyntheticDescriptions(store);
  for (const lead of store.listLeads()) {
    store.work.decideEligibility({ leadId: lead.leadId, postingVersion: postingVersion(lead), eligibility: "eligible", reason: "Synthetic requirements reviewed." });
  }
  const work = queueLinkedInWork(store, transport.target);
  return { store, transport, privateDir, work };
}

function changeAdmission(store: JobStore, work: JobWorkRecord, change: Change) {
  if (change === "eligibility") {
    store.work.decideEligibility({ leadId: work.leadId, postingVersion: work.postingVersion, eligibility: "needs_review", reason: "Synthetic concurrent revocation." });
  } else if (change === "posting") {
    const lead = store.getLead(work.leadId)!;
    store.saveLead({ ...lead, normalizedDescription: lead.normalizedDescription + " Additional clearance required." });
  } else if (change === "location") {
    store.saveLead({ ...store.getLead(work.leadId)!, locationDecision: "rejected" });
  } else {
    store.updateLeadReview({ leadId: work.leadId, status: change, note: "Synthetic concurrent operator hold." });
  }
  queueLinkedInWork(store, work.target);
}

function seedUncertainFit(store: JobStore, work: JobWorkRecord) {
  const lead = store.getLead(work.leadId)!;
  work.fit = scoreJobFit({ job: lead, postingVersion: work.postingVersion, evidence });
  work.inputHash = resumeModule.prepareJobResume({ jobId: work.leadId, postingVersion: work.postingVersion, threadId: work.threadId!, candidate, target: { title: lead.title, company: lead.company }, evidence }).inputHash;
  work.fitDelivery = {
    key: crypto.createHash("sha256").update(`fit|${work.workId}|${work.fit.evidenceVersion}`).digest("hex").slice(0, 24),
    status: "uncertain", attempts: 1, reconcileRequired: true
  };
  store.work.save(work);
}

function artifactFor(work: JobWorkRecord, privateDir: string): resumeModule.ValidatedResumeArtifact {
  return {
    jobId: work.leadId, postingVersion: work.postingVersion, threadId: work.threadId!, sha256: "a".repeat(64), bindingHash: "synthetic-bound-pdf",
    bytes: Buffer.from("Synthetic approved PDF bytes"), pdfPath: path.join(privateDir, "test.pdf"), previewPath: path.join(privateDir, "test.png"),
    validatedAt: "2026-11-10T12:01:00Z", visualReview: "pending", renderer: "external-portfolio-artifact"
  };
}

async function deliverySetup(stage: "fit" | "pdf") {
  const session = await setup();
  let work = session.work[0];
  if (stage === "pdf") [work] = await processLinkedInWork({ ...session, candidate, evidence });
  const artifact = artifactFor(work, session.privateDir);
  if (stage === "pdf") {
    const { bytes: _bytes, ...metadata } = artifact;
    work.artifact = metadata;
    session.store.work.save(work);
    vi.spyOn(resumeModule, "validateJobResumeArtifact").mockResolvedValue(artifact);
  }
  return { ...session, work, artifact };
}

describe("current admission across enrichment awaits", () => {
  const denialCases = (["fit"] as ("fit" | "pdf")[]).flatMap(stage => (["absent", "retry"] as const).map(prior => ({ stage, prior })));
  test.each(denialCases)("$stage pre-POST denial preserves $prior delivery and ordinary reapproval resumes once", async ({ stage, prior }) => {
    const { store, transport: originalTransport, privateDir, work, artifact } = await deliverySetup(stage);
    const field = stage === "fit" ? "fitDelivery" : "attachmentDelivery";
    if (prior === "retry") {
      if (stage === "fit") seedUncertainFit(store, work);
      const key = stage === "fit" ? work.fitDelivery!.key : crypto.createHash("sha256").update(`pdf|${work.workId}|${artifact.sha256}`).digest("hex").slice(0, 24);
      work[field] = { key, status: "retry", attempts: 3, retryAt: new Date(0).toISOString(), reconcileRequired: false, lastError: "Prior definite rate limit." };
      store.work.save(work);
    }
    const previous = new JobStore(store.dbPath).work.get(work.workId)![field];
    const fitReceipt = stage === "pdf" ? store.work.get(work.workId)!.fitDelivery : undefined;
    const prepared = work.preparedPath ? fs.readFileSync(work.preparedPath) : undefined;
    const handoff = work.codexHandoffPath ? fs.readFileSync(work.codexHandoffPath) : undefined;
    let lookups = 0;
    let posts = 0;
    const transport = createDiscordLinkedInTransport({ token: "synthetic-token", channelId, fetcher: async (_url, init) => {
      if (init?.method === "GET") {
        lookups++;
        if (lookups === 1) changeAdmission(new JobStore(store.dbPath), work, "eligibility");
        return Response.json({ id: work.threadId, parent_id: channelId, type: 11 });
      }
      posts++;
      if (stage === "pdf") {
        const body = JSON.parse(String((init!.body as FormData).get("payload_json")));
        return Response.json({ id: "555555555555555555", channel_id: work.threadId, attachments: [{ id: "666666666666666666", filename: body.attachments[0].filename, size: artifact.bytes.length }] });
      }
      return Response.json({ id: "555555555555555555", channel_id: work.threadId });
    } });
    const run = async () => {
      if (stage === "fit") await processLinkedInWork({ store, transport, privateDir, candidate, evidence });
      else await attachLinkedInResume({ store, transport, workId: work.workId, approvedSha256: artifact.sha256, portfolioRoot: privateDir }).catch(() => undefined);
    };
    await run();
    const denied = new JobStore(store.dbPath).work.get(work.workId)!;
    expect(posts).toBe(0);
    expect(lookups).toBe(1);
    expect(denied.eligibility).toBe("needs_review");
    expect(denied[field]).toEqual(previous);
    if (stage === "pdf") {
      expect(denied.fitDelivery).toEqual(fitReceipt);
      expect(denied.artifact).toEqual(work.artifact);
      expect(fs.readFileSync(work.preparedPath!)).toEqual(prepared);
      expect(fs.readFileSync(work.codexHandoffPath!)).toEqual(handoff);
    } else expect(denied.preparedPath).toBeUndefined();
    store.work.decideEligibility({ leadId: work.leadId, postingVersion: work.postingVersion, eligibility: "eligible", reason: "Synthetic explicit reapproval." });
    queueLinkedInWork(store, originalTransport.target);
    await run();
    const resumed = new JobStore(store.dbPath).work.get(work.workId)!;
    expect(resumed[field]).toMatchObject({ status: "delivered", attempts: (previous?.attempts ?? 0) + 1, messageId: "555555555555555555", reconcileRequired: false });
    expect(resumed.status).toBe(stage === "fit" ? "prepared" : "delivered");
    expect(lookups).toBe(2);
    expect(posts).toBe(1);
    await run();
    expect(posts).toBe(1);
    expect(new JobStore(store.dbPath).work.get(work.workId)![field]).toEqual(resumed[field]);
  });

  test.each(["fit"] as ("fit" | "pdf")[])("real %s HTTP403 remains terminal after eligibility toggles", async stage => {
    const { store, transport: originalTransport, privateDir, work, artifact } = await deliverySetup(stage);
    const field = stage === "fit" ? "fitDelivery" : "attachmentDelivery";
    let posts = 0;
    const transport = createDiscordLinkedInTransport({ token: "synthetic-token", channelId, fetcher: async (_url, init) => {
      if (init?.method === "GET") return Response.json({ id: work.threadId, parent_id: channelId, type: 11 });
      posts++;
      return Response.json({ message: "Synthetic permission denial" }, { status: 403 });
    } });
    const run = async () => {
      if (stage === "fit") await processLinkedInWork({ store, transport, privateDir, candidate, evidence });
      else await attachLinkedInResume({ store, transport, workId: work.workId, approvedSha256: artifact.sha256, portfolioRoot: privateDir }).catch(() => undefined);
    };
    await run();
    const blocked = new JobStore(store.dbPath).work.get(work.workId)![field];
    expect(blocked).toMatchObject({ status: "blocked", attempts: 1, reconcileRequired: false });
    expect(blocked?.lastError).toContain("403");
    changeAdmission(store, work, "eligibility");
    store.work.decideEligibility({ leadId: work.leadId, postingVersion: work.postingVersion, eligibility: "eligible", reason: "Synthetic explicit reapproval." });
    queueLinkedInWork(store, originalTransport.target);
    await run();
    expect(posts).toBe(1);
    expect(new JobStore(store.dbPath).work.get(work.workId)![field]).toEqual(blocked);
  });

  test.each(changes)("a queued job changed by %s during another job's delivery is not enriched", async change => {
    const { store, transport, privateDir, work: [first, second] } = await setup(2);
    const sends: string[] = [];
    transport.sendThreadMessage = async ({ threadId }) => {
      sends.push(threadId);
      if (threadId === first.threadId) changeAdmission(new JobStore(store.dbPath), second, change);
      return "first-fit-receipt";
    };
    await processLinkedInWork({ store, transport, privateDir, candidate, evidence });
    expect(sends).toEqual([first.threadId]);
    const persisted = new JobStore(store.dbPath).work.get(second.workId)!;
    expect(persisted.preparedPath).toBeUndefined();
    expect(persisted.fitDelivery).toBeUndefined();
    expect(fs.existsSync(path.join(privateDir, second.workId, "prepared-resume.json"))).toBe(false);
    expect(store.work.get(first.workId)?.fitDelivery).toMatchObject({ status: "delivered", messageId: "first-fit-receipt" });
  });

  test.each(changes.flatMap(change => (["send", "readback"] as const).map(stage => ({ change, stage }))))("$change during fit $stage preserves its receipt and stops preparation", async ({ change, stage }) => {
    const { store, transport, privateDir, work: [work] } = await setup();
    let sends = 0;
    if (stage === "readback") seedUncertainFit(store, work);
    transport.sendThreadMessage = async () => {
      sends++;
      changeAdmission(new JobStore(store.dbPath), work, change);
      return "known-fit-receipt";
    };
    transport.findThreadMessage = async () => {
      changeAdmission(new JobStore(store.dbPath), work, change);
      return { messageId: "known-fit-receipt" };
    };
    await processLinkedInWork({ store, transport, privateDir, candidate, evidence });
    const persisted = new JobStore(store.dbPath).work.get(work.workId)!;
    expect(persisted.fitDelivery).toMatchObject({ status: "delivered", messageId: "known-fit-receipt" });
    expect(persisted.preparedPath).toBeUndefined();
    expect(persisted.codexHandoffPath).toBeUndefined();
    expect(fs.existsSync(path.join(privateDir, work.workId, "prepared-resume.json"))).toBe(false);
    expect(sends).toBe(stage === "send" ? 1 : 0);
  });

  test("revocation during uncertain fit readback retains previous prepared inputs and PDF barrier", async () => {
    const { store, transport, privateDir, work: [queued] } = await setup();
    transport.sendThreadMessage = async () => { throw new Error("Synthetic remote fit receipt lost"); };
    await processLinkedInWork({ store, transport, privateDir, candidate, evidence });
    const preparedWork = store.work.get(queued.workId)!;
    const prepared = fs.readFileSync(preparedWork.preparedPath!);
    const handoff = fs.readFileSync(preparedWork.codexHandoffPath!);
    preparedWork.attachmentDelivery = { key: "existing-pdf-key", status: "uncertain", attempts: 1, reconcileRequired: true };
    store.work.save(preparedWork);
    transport.findThreadMessage = async () => {
      changeAdmission(new JobStore(store.dbPath), preparedWork, "eligibility");
      return undefined;
    };
    await processLinkedInWork({ store, transport, privateDir, candidate, evidence });
    const blocked = new JobStore(store.dbPath).work.get(queued.workId)!;
    expect(blocked.status).toBe("blocked");
    expect(blocked.eligibility).toBe("needs_review");
    expect(blocked.inputHash).toBe(preparedWork.inputHash);
    expect(blocked.fitDelivery).toMatchObject({ key: preparedWork.fitDelivery!.key, status: "uncertain", reconcileRequired: true });
    expect(blocked.attachmentDelivery).toEqual(preparedWork.attachmentDelivery);
    expect(fs.readFileSync(preparedWork.preparedPath!)).toEqual(prepared);
    expect(fs.readFileSync(preparedWork.codexHandoffPath!)).toEqual(handoff);
  });

  test("revocation while rendering retains prepared inputs without publishing the returned artifact", async () => {
    const { store, transport, privateDir, work: [queued] } = await setup();
    let prepared: Buffer | undefined;
    let handoff: Buffer | undefined;
    vi.spyOn(resumeModule, "renderPreparedJobResume").mockImplementation(async () => {
      const current = store.work.get(queued.workId)!;
      prepared = fs.readFileSync(current.preparedPath!);
      handoff = fs.readFileSync(current.codexHandoffPath!);
      changeAdmission(new JobStore(store.dbPath), current, "eligibility");
      return artifactFor(current, privateDir);
    });
    await processLinkedInWork({ store, transport, privateDir, candidate, evidence, portfolioRoot: privateDir });
    const blocked = new JobStore(store.dbPath).work.get(queued.workId)!;
    expect(blocked.status).toBe("blocked");
    expect(blocked.eligibility).toBe("needs_review");
    expect(blocked.artifact).toBeUndefined();
    expect(blocked.fitDelivery).toMatchObject({ status: "delivered", messageId: "original-fit-receipt" });
    expect(prepared).toBeDefined();
    expect(handoff).toBeDefined();
    expect(fs.readFileSync(blocked.preparedPath!)).toEqual(prepared);
    expect(fs.readFileSync(blocked.codexHandoffPath!)).toEqual(handoff);
  });

  test.each(["send", "readback"] as const)("revocation during PDF %s preserves the completed receipt without a later repeat POST", async stage => {
    const { store, transport, privateDir } = await setup();
    const [work] = await processLinkedInWork({ store, transport, privateDir, candidate, evidence });
    const prepared = fs.readFileSync(work.preparedPath!);
    const handoff = fs.readFileSync(work.codexHandoffPath!);
    const artifact = artifactFor(work, privateDir);
    const { bytes: _bytes, ...metadata } = artifact;
    work.artifact = metadata;
    if (stage === "readback") {
      work.attachmentDelivery = {
        key: crypto.createHash("sha256").update(`pdf|${work.workId}|${artifact.sha256}`).digest("hex").slice(0, 24),
        status: "uncertain", attempts: 1, reconcileRequired: true
      };
    }
    store.work.save(work);
    vi.spyOn(resumeModule, "validateJobResumeArtifact").mockResolvedValue(artifact);
    const receipt = { messageId: "known-pdf-receipt", attachmentId: "known-pdf-file" };
    let posts = 0;
    transport.sendAttachment = async () => {
      posts++;
      changeAdmission(new JobStore(store.dbPath), work, "eligibility");
      return receipt;
    };
    transport.findThreadMessage = async () => {
      changeAdmission(new JobStore(store.dbPath), work, "eligibility");
      return receipt;
    };
    const attach = () => attachLinkedInResume({ store, transport, workId: work.workId, approvedSha256: artifact.sha256, portfolioRoot: privateDir }).catch(() => undefined);
    await attach();
    const blocked = new JobStore(store.dbPath).work.get(work.workId)!;
    expect(blocked.status).toBe("blocked");
    expect(blocked.eligibility).toBe("needs_review");
    expect(blocked.attachmentDelivery).toMatchObject({ status: "delivered", reconcileRequired: false, ...receipt });
    expect(blocked.fitDelivery).toEqual(work.fitDelivery);
    expect(blocked.artifact).toEqual(metadata);
    expect(blocked.inputHash).toBe(work.inputHash);
    expect(fs.readFileSync(work.preparedPath!)).toEqual(prepared);
    expect(fs.readFileSync(work.codexHandoffPath!)).toEqual(handoff);
    await attach();
    expect(new JobStore(store.dbPath).work.get(work.workId)?.attachmentDelivery).toEqual(blocked.attachmentDelivery);
    expect(posts).toBe(stage === "send" ? 1 : 0);
  });

  const transportCases = (["fit", "pdf"] as const).flatMap(stage => [...changes, "unchanged" as const].map(change => ({ stage, change })));
  test.each(transportCases)("$stage POST rechecks $change after the real transport's thread lookup", async ({ stage, change }) => {
    const { store, transport: initialTransport, privateDir, work: [queued] } = await setup();
    let work = queued;
    let artifact: resumeModule.ValidatedResumeArtifact | undefined;
    let prepared: Buffer | undefined;
    let handoff: Buffer | undefined;
    if (stage === "pdf") {
      [work] = await processLinkedInWork({ store, transport: initialTransport, privateDir, candidate, evidence });
      prepared = fs.readFileSync(work.preparedPath!);
      handoff = fs.readFileSync(work.codexHandoffPath!);
      artifact = artifactFor(work, privateDir);
      const { bytes: _bytes, ...metadata } = artifact;
      work.artifact = metadata;
      store.work.save(work);
      vi.spyOn(resumeModule, "validateJobResumeArtifact").mockResolvedValue(artifact);
    }
    let lookups = 0;
    let posts = 0;
    const transport = createDiscordLinkedInTransport({ token: "synthetic-token", channelId, fetcher: async (_url, init) => {
      if (init?.method === "GET") {
        lookups++;
        if (change !== "unchanged") changeAdmission(new JobStore(store.dbPath), work, change);
        return Response.json({ id: work.threadId, parent_id: channelId, type: 11 });
      }
      posts++;
      if (stage === "pdf") {
        const body = JSON.parse(String((init!.body as FormData).get("payload_json")));
        return Response.json({ id: "555555555555555555", channel_id: work.threadId, attachments: [{ id: "666666666666666666", filename: body.attachments[0].filename, size: artifact!.bytes.length }] });
      }
      return Response.json({ id: "555555555555555555", channel_id: work.threadId });
    } });
    if (stage === "fit") await processLinkedInWork({ store, transport, privateDir, candidate, evidence });
    else await attachLinkedInResume({ store, transport, workId: work.workId, approvedSha256: artifact!.sha256, portfolioRoot: privateDir }).catch(() => undefined);
    if (stage === "pdf") {
      expect(lookups).toBe(0);
      expect(posts).toBe(0);
      expect(resumeModule.validateJobResumeArtifact).not.toHaveBeenCalled();
      const held = new JobStore(store.dbPath).work.get(work.workId)!;
      expect(held.lastError).toMatch(/uploads are disabled/);
      expect(held.attachmentDelivery).toBeUndefined();
      expect(fs.readFileSync(work.preparedPath!)).toEqual(prepared);
      expect(fs.readFileSync(work.codexHandoffPath!)).toEqual(handoff);
      return;
    }
    expect(lookups).toBe(1);
    expect(posts).toBe(change === "unchanged" ? 1 : 0);
    const persisted = new JobStore(store.dbPath).work.get(work.workId)!;
    if (stage === "fit") {
      if (change === "unchanged") expect(persisted.status).toBe("prepared");
      else expect(persisted.preparedPath).toBeUndefined();
    } else {
      expect(persisted.fitDelivery).toEqual(work.fitDelivery);
      expect(persisted.artifact).toEqual(work.artifact);
      expect(fs.readFileSync(work.preparedPath!)).toEqual(prepared);
      expect(fs.readFileSync(work.codexHandoffPath!)).toEqual(handoff);
      if (change === "unchanged") expect(persisted.attachmentDelivery).toMatchObject({ status: "delivered", messageId: "555555555555555555", attachmentId: "666666666666666666" });
    }
  });
});
