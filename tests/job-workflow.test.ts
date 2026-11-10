import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { JobStore } from "../src/db/store.js";
import { ingestLinkedInEmail, drainLinkedInAlerts } from "../src/core/linkedin-route.js";
import { attachLinkedInResume, processLinkedInWork, queueLinkedInWork, postingVersion } from "../src/core/job-workflow.js";
import { createFixtureLinkedInTransport, DiscordRouteError } from "../src/discord/linkedin-transport.js";
import * as resumeModule from "../src/core/job-resume.js";
import type { LinkedInTransport } from "../src/discord/linkedin-transport.js";
import type { JobLeadRecord } from "../src/core/types.js";
import { planCodexResumeDispatch } from "../src/core/codex-resume-dispatch.js";

const email = JSON.parse(fs.readFileSync("fixtures/email/linkedin-alert-2026-03-12.json", "utf8"));
const evidence = [{ id: "approved-synthetic", claim: "Built a documented synthetic ticketing demo.", skills: ["ticketing"], source: "synthetic://approved/commit", approved: true }];
const candidate = { name: "Synthetic Candidate", email: "synthetic@example.test" };
function setup() {
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-workflow-"));
  const store = new JobStore(path.join(privateDir, "jobs.sqlite"));
  const calls: string[] = [];
  const transport: LinkedInTransport = {
    target: "fixture:workflow",
    async sendAlert({ key }) { calls.push("initial"); return `message-${key}`; },
    async findAlert() { return undefined; },
    async createThread({ messageId }) { return `thread-${messageId}`; },
    async findThread() { return undefined; },
    async sendThreadMessage({ threadId }) { calls.push(`fit:${threadId}`); return "fit-receipt"; },
    async findThreadMessage() { return undefined; },
    async sendAttachment() { throw new Error("Unapproved PDF must never be attached"); }
  };
  return { store, privateDir, calls, transport };
}

describe("durable per-job workflow", () => {
  const postingChanges: Partial<JobLeadRecord>[] = [
    { seniority: "senior" }, { employmentType: "Contract" }, { officeLocationRaw: "Different office" },
    { compensationText: "Updated compensation" }, { compensationMin: 49_000 },
    { compensationMax: 58_000 }, { compensationCurrency: "CAD" }
  ];
  test.each(postingChanges)("changed persisted posting fact %j invalidates approval and prepared work", async change => {
    const { store, transport, privateDir, calls } = setup();
    const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[2] }, { fixture: true });
    await drainLinkedInAlerts({ store, transport });
    const lead = store.getLead(leadIds[0])!;
    store.work.decideEligibility({ leadId: lead.leadId, postingVersion: postingVersion(lead), eligibility: "eligible", reason: "Synthetic requirements reviewed." });
    const [original] = await processLinkedInWork({ store, transport, privateDir, evidence, candidate });
    const prepared = fs.readFileSync(original.preparedPath!);
    store.saveLead({ ...lead, ...change });
    const before = calls.length;
    const result = await processLinkedInWork({ store: new JobStore(store.dbPath), transport, privateDir, evidence, candidate });
    expect(result).toHaveLength(2);
    expect(result.find(row => row.workId !== original.workId)).toMatchObject({ eligibility: "needs_review", status: "needs_review" });
    expect(calls).toHaveLength(before);
    expect(fs.readFileSync(original.preparedPath!)).toEqual(prepared);
    expect(() => planCodexResumeDispatch({ store, privateDir, workId: original.workId })).toThrow(/posting changed/i);
    await expect(attachLinkedInResume({ store, transport, workId: original.workId, approvedSha256: "a".repeat(64), portfolioRoot: privateDir })).rejects.toThrow(/posting changed/i);
  });

  test.each(["seniority", "employmentType"])("newer email changing only %s requires renewed eligibility", async field => {
    const { store, transport, privateDir } = setup();
    const one = { ...email, textBody: email.textBody.split("\n---\n")[2] };
    const { leadIds } = ingestLinkedInEmail(store, one, { fixture: true });
    await drainLinkedInAlerts({ store, transport });
    const lead = store.getLead(leadIds[0])!;
    store.work.decideEligibility({ leadId: lead.leadId, postingVersion: postingVersion(lead), eligibility: "eligible", reason: "Synthetic initial review." });
    const [original] = await processLinkedInWork({ store, transport, privateDir, evidence, candidate });
    const textBody = field === "seniority" ? one.textBody.replace("Mid-level", "Senior") : one.textBody.replace("Full-time", "Contract");
    ingestLinkedInEmail(store, { ...one, messageId: `updated-${field}`, receivedAt: "2026-11-10T12:00:00Z", textBody }, { fixture: true });
    expect(store.getLead(lead.leadId)?.normalizedDescription).toBe(lead.normalizedDescription);
    const work = queueLinkedInWork(store, transport.target);
    expect(work).toHaveLength(2);
    expect(work.find(row => row.workId !== original.workId)?.eligibility).toBe("needs_review");
  });

  test.each(["fit", "attachment"] as const)("changed evidence preserves uncertain %s delivery and immutable prepared inputs", async stage => {
    const { store, transport, privateDir } = setup();
    const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[0] }, { fixture: true });
    await drainLinkedInAlerts({ store, transport });
    const lead = store.getLead(leadIds[0])!;
    store.work.decideEligibility({ leadId: lead.leadId, postingVersion: postingVersion(lead), eligibility: "eligible", reason: "Synthetic initial review." });
    let sends = 0;
    if (stage === "fit") transport.sendThreadMessage = async () => { sends++; throw new Error("Remote fit succeeded; receipt lost"); };
    const [work] = await processLinkedInWork({ store, transport, privateDir, evidence, candidate });
    const prepared = fs.readFileSync(work.preparedPath!);
    const handoff = fs.readFileSync(work.codexHandoffPath!);
    const artifact = { jobId: lead.leadId, postingVersion: work.postingVersion, threadId: work.threadId!, sha256: "a".repeat(64), bindingHash: "bound", bytes: Buffer.from("synthetic test bytes"), pdfPath: path.join(privateDir, "test.pdf"), previewPath: path.join(privateDir, "test.png"), validatedAt: new Date().toISOString(), visualReview: "pending" as const, renderer: "external-portfolio-artifact" as const };
    const { bytes: _bytes, ...metadata } = artifact;
    work.artifact = metadata;
    store.work.save(work);
    const validator = vi.spyOn(resumeModule, "validateJobResumeArtifact").mockResolvedValue(artifact);
    try {
      if (stage === "attachment") {
        transport.sendAttachment = async () => { sends++; throw new Error("Remote upload succeeded; receipt lost"); };
        await attachLinkedInResume({ store, transport, workId: work.workId, approvedSha256: artifact.sha256, portfolioRoot: privateDir });
      }
      const original = store.work.get(work.workId)!;
      expect(original[stage === "fit" ? "fitDelivery" : "attachmentDelivery"]).toMatchObject({ status: "uncertain", reconcileRequired: true });
      for (const inputs of [
        { evidence: [{ ...evidence[0], claim: "Updated approved contribution." }], candidate },
        { evidence, candidate: { ...candidate, email: "updated@example.test" } }
      ]) {
        const [blocked] = await processLinkedInWork({ store: new JobStore(store.dbPath), transport, privateDir, ...inputs });
        expect(blocked.status).toBe("blocked");
        expect(blocked.lastError).toMatch(/changed/i);
        expect(blocked.fit).toEqual(original.fit);
        expect(blocked.fitDelivery).toEqual(original.fitDelivery);
        expect(blocked.attachmentDelivery).toEqual(original.attachmentDelivery);
        expect(blocked.artifact).toEqual(original.artifact);
        expect(blocked.visualApproval).toEqual(original.visualApproval);
        expect(blocked.inputHash).toEqual(original.inputHash);
        expect(fs.readFileSync(work.preparedPath!)).toEqual(prepared);
        expect(fs.readFileSync(work.codexHandoffPath!)).toEqual(handoff);
      }
      expect(sends).toBe(1);
      transport.findThreadMessage = async () => ({ messageId: "recovered-receipt", ...(stage === "attachment" ? { attachmentId: "recovered-file" } : {}) });
      const [restored] = await processLinkedInWork({ store, transport, privateDir, evidence, candidate });
      expect(restored.status).toBe("awaiting_visual_review");
      expect(() => planCodexResumeDispatch({ store, privateDir, workId: work.workId })).not.toThrow();
      if (stage === "attachment") {
        const recovered = await attachLinkedInResume({ store, transport, workId: work.workId, approvedSha256: artifact.sha256, portfolioRoot: privateDir });
        expect(recovered.attachmentDelivery).toMatchObject({ status: "delivered", messageId: "recovered-receipt", attachmentId: "recovered-file" });
      } else expect(store.work.get(work.workId)?.fitDelivery).toMatchObject({ status: "delivered", messageId: "recovered-receipt" });
      expect(sends).toBe(1);
    } finally { validator.mockRestore(); }
  });

  test("candidate binding is durable before a fit attempt even without a prepared file", async () => {
    const { store, transport, privateDir } = setup();
    const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[0] }, { fixture: true });
    await drainLinkedInAlerts({ store, transport });
    const lead = store.getLead(leadIds[0])!;
    store.work.decideEligibility({ leadId: lead.leadId, postingVersion: postingVersion(lead), eligibility: "eligible", reason: "Synthetic requirements reviewed." });
    let attemptBinding: string | undefined;
    transport.sendThreadMessage = async () => {
      attemptBinding = store.work.list()[0].inputHash;
      throw new Error("Remote fit succeeded; receipt lost");
    };
    const [work] = await processLinkedInWork({ store, transport, privateDir, evidence, candidate });
    expect(attemptBinding).toBe(work.inputHash);
    work.preparedPath = undefined;
    work.codexHandoffPath = undefined;
    store.work.save(work);
    const [blocked] = await processLinkedInWork({ store, transport, privateDir, evidence, candidate: { ...candidate, email: "changed@example.test" } });
    expect(blocked.status).toBe("blocked");
    expect(blocked.fitDelivery).toEqual(work.fitDelivery);
    expect(blocked.preparedPath).toBeUndefined();
  });

  test("every low-score eligible job gets prepared work after initial delivery, with no score or support cutoff", async () => {
    const { store, transport, calls, privateDir } = setup();
    const { leadIds } = ingestLinkedInEmail(store, email, { fixture: true });
    await drainLinkedInAlerts({ store, transport });
    const leads = leadIds.map(id => store.getLead(id)!).filter(lead => lead.locationDecision === "accepted");
    expect(leads).toHaveLength(2);
    for (const lead of leads) store.work.decideEligibility({ leadId: lead.leadId, postingVersion: postingVersion(lead), eligibility: "eligible", reason: "Synthetic fixture operator confirmed all hard requirements." });
    const result = await processLinkedInWork({ store, transport, privateDir, evidence, candidate });
    for (const lead of leads) {
      const work = result.find(work => work.leadId === lead.leadId)!;
      expect(work.eligibility).toBe("eligible");
      expect(work.preparedPath).toBeTruthy();
      expect(fs.existsSync(work.preparedPath!)).toBe(true);
      expect(work.status).toBe("prepared");
      expect(work.codexStatus).toBe("awaiting_authorized_dispatch");
      expect(fs.existsSync(work.codexHandoffPath!)).toBe(true);
      expect(work.fit?.score).toBeGreaterThanOrEqual(1);
    }
    expect(result.find(work => work.leadId === leads[0].leadId)?.fit?.score).toBe(1);
    expect(calls.slice(0, 3)).toEqual(["initial", "initial", "initial"]);
    expect(calls.some(call => call.startsWith("fit:thread-message-"))).toBe(true);
    const restarted = new JobStore(store.dbPath);
    const before = calls.length;
    await processLinkedInWork({ store: restarted, transport, privateDir, evidence, candidate });
    expect(calls).toHaveLength(before);
  });

  test("canonical private profile reaches durable prepared work and declares its tailoring mode", async () => {
    const { store, transport, privateDir } = setup();
    const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[0] }, { fixture: true });
    await drainLinkedInAlerts({ store, transport });
    const lead = store.getLead(leadIds[0])!;
    store.work.decideEligibility({ leadId: lead.leadId, postingVersion: postingVersion(lead), eligibility: "eligible", reason: "Synthetic operator approval." });
    const fullCandidate = { ...candidate, profile: {
      version: 1 as const, baseline: { variantId: "web-dev" as const, sources: [{ path: "lib/resume-data.ts", sha256: "0".repeat(64) }] },
      contact: { phone: "555-0100", linkedin: "linkedin.com/in/synthetic", github: "github.com/synthetic" },
      sectionTitles: { experience: "Experience", projects: "Projects", skills: "Skills", education: "Education" },
      experience: [{ company: "Example Employer", title: "Support Developer", date: "2024 - 2025", languages: ["TypeScript"], evidenceIds: ["approved-synthetic"] }],
      projects: [{ name: "Example Project", date: "2026", languages: ["TypeScript"], evidenceIds: [] }], skills: ["TypeScript"],
      education: [{ institution: "Example University", degree: "Computer Science", gpa: "Honours", date: "2020 - 2024" }]
    } };
    const [work] = await processLinkedInWork({ store, transport, privateDir, evidence, candidate: fullCandidate });
    const prepared = JSON.parse(fs.readFileSync(work.preparedPath!, "utf8"));
    expect(prepared.candidate.profile.experience[0].company).toBe("Example Employer");
    expect(prepared.candidate.profile.education[0].institution).toBe("Example University");
    expect(work.tailoringMode).toBe("canonical-profile-approved-evidence");
    expect(new JobStore(store.dbPath).work.get(work.workId)?.inputHash).toBe(prepared.inputHash);
    const [replayed] = await processLinkedInWork({ store: new JobStore(store.dbPath), transport, privateDir, evidence, candidate: fullCandidate });
    expect(replayed.inputHash).toBe(work.inputHash);
    const changedCandidate = { ...fullCandidate, profile: { ...fullCandidate.profile, skills: ["TypeScript", "SQL"] } };
    const [changed] = await processLinkedInWork({ store, transport, privateDir, evidence, candidate: changedCandidate });
    expect(changed.status).toBe("blocked");
    expect(changed.lastError).toMatch(/candidate|profile/i);
    expect(JSON.parse(fs.readFileSync(work.preparedPath!, "utf8"))).toEqual(prepared);
  });

  test("unknown eligibility remains visible; changed posting requires a new explicit decision and work version", async () => {
    const { store, transport } = setup();
    const first = { ...email, textBody: email.textBody.split("\n---\n")[0] };
    const { leadIds } = ingestLinkedInEmail(store, first, { fixture: true });
    await drainLinkedInAlerts({ store, transport });
    const lead = store.getLead(leadIds[0])!;
    queueLinkedInWork(store, transport.target);
    expect(store.work.list()[0]).toMatchObject({ eligibility: "needs_review", status: "needs_review" });
    store.work.decideEligibility({ leadId: lead.leadId, postingVersion: postingVersion(lead), eligibility: "eligible", reason: "Synthetic operator review." });
    queueLinkedInWork(store, transport.target);
    expect(store.work.list()[0].eligibility).toBe("eligible");
    ingestLinkedInEmail(store, { ...first, textBody: first.textBody + " Changed requirements." }, { fixture: true });
    queueLinkedInWork(store, transport.target);
    expect(store.work.list()).toHaveLength(2);
    expect(store.work.list().filter(work => work.eligibility === "needs_review")).toHaveLength(1);
  });
  test("uncertain fit readback rate limits retain reconciliation state across work retries", async () => {
    const { store, transport, privateDir } = setup();
    const one = { ...email, textBody: email.textBody.split("\n---\n")[0] };
    const { leadIds } = ingestLinkedInEmail(store, one, { fixture: true });
    await drainLinkedInAlerts({ store, transport });
    const lead = store.getLead(leadIds[0])!;
    store.work.decideEligibility({ leadId: lead.leadId, postingVersion: postingVersion(lead), eligibility: "eligible", reason: "Synthetic operator review." });
    let posts = 0;
    transport.sendThreadMessage = async () => { posts += 1; throw new Error("remote receipt lost"); };
    await processLinkedInWork({ store, transport, privateDir, evidence, candidate });
    transport.findThreadMessage = async () => { throw new DiscordRouteError("Readback throttled", "retry", 1); };
    await processLinkedInWork({ store, transport, privateDir, evidence, candidate });
    // Explicit fixture clock/backoff release, never a production retry bypass.
    store.linkedin.deferTarget(transport.target, new Date(0).toISOString());
    const work = store.work.list()[0];
    work.fitDelivery!.retryAt = new Date(0).toISOString(); store.work.save(work);
    transport.findThreadMessage = async () => undefined;
    await processLinkedInWork({ store, transport, privateDir, evidence, candidate });
    expect(posts).toBe(1);
    expect(store.work.list()[0].fitDelivery?.status).toBe("uncertain");
  });

  test("eligibility revoked during async validation prevents attachment", async () => {
    const { store, transport, privateDir } = setup();
    const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[0] }, { fixture: true });
    await drainLinkedInAlerts({ store, transport });
    const lead = store.getLead(leadIds[0])!;
    const version = postingVersion(lead);
    store.work.decideEligibility({ leadId: lead.leadId, postingVersion: version, eligibility: "eligible", reason: "Synthetic initial review." });
    await processLinkedInWork({ store, transport, privateDir, evidence, candidate });
    const work = store.work.list()[0];
    const artifact = { jobId: lead.leadId, postingVersion: version, threadId: work.threadId!, sha256: "a".repeat(64), bindingHash: "bound", bytes: Buffer.from("synthetic test bytes"), pdfPath: path.join(privateDir, "test.pdf"), previewPath: path.join(privateDir, "test.png"), validatedAt: new Date().toISOString(), visualReview: "pending" as const, renderer: "external-portfolio-artifact" as const };
    const { bytes: _bytes, ...metadata } = artifact; work.artifact = metadata; store.work.save(work);
    const validator = vi.spyOn(resumeModule, "validateJobResumeArtifact").mockImplementation(async () => {
      store.work.decideEligibility({ leadId: lead.leadId, postingVersion: version, eligibility: "needs_review", reason: "Synthetic concurrent revocation." });
      return artifact;
    });
    let uploads = 0;
    transport.sendAttachment = async () => { uploads += 1; return { messageId: "must-not-send", attachmentId: "must-not-send" }; };
    try {
      const result = await attachLinkedInResume({ store, transport, workId: work.workId, approvedSha256: artifact.sha256, portfolioRoot: privateDir });
      expect(result.attachmentDelivery?.status).toBe("blocked");
      expect(uploads).toBe(0);
    } finally { validator.mockRestore(); }
  });

  test.runIf(Boolean(process.env.JOB_OPS_PORTFOLIO_ROOT))("runs intake through exact PDF attachment in the same thread and preserves manual-only outcomes", async () => {
    const { store, privateDir } = setup();
    const transport = createFixtureLinkedInTransport(path.join(privateDir, "discord.json"));
    const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split("\n---\n")[0] }, { fixture: true });
    await drainLinkedInAlerts({ store, transport });
    const lead = store.getLead(leadIds[0])!;
    store.work.decideEligibility({ leadId: lead.leadId, postingVersion: postingVersion(lead), eligibility: "eligible", reason: "Synthetic operator confirmed all hard requirements." });
    const [work] = await processLinkedInWork({ store, transport, privateDir, evidence, candidate, portfolioRoot: process.env.JOB_OPS_PORTFOLIO_ROOT });
    expect(work.status).toBe("awaiting_visual_review");
    expect(work.artifact?.visualReview).toBe("pending");
    const exactBytes = fs.readFileSync(work.artifact!.pdfPath);
    const preparedBytes = fs.readFileSync(work.preparedPath!);
    const journalBefore = fs.readFileSync(path.join(privateDir, "discord.json"));
    for (const mutation of ["claim", "candidate", "requiredText"] as const) {
      const changed = JSON.parse(preparedBytes.toString());
      if (mutation === "claim") changed.claims[0].claim = "Unapproved changed contribution.";
      if (mutation === "candidate") changed.candidate.email = "changed@example.test";
      if (mutation === "requiredText") changed.requiredText = [];
      fs.writeFileSync(work.preparedPath!, JSON.stringify(changed));
      await expect(attachLinkedInResume({ store, transport, workId: work.workId, approvedSha256: work.artifact!.sha256, portfolioRoot: process.env.JOB_OPS_PORTFOLIO_ROOT! })).rejects.toThrow(/prepared|hash|required text/i);
      expect(store.work.get(work.workId)?.status).toBe("blocked");
      expect(fs.readFileSync(path.join(privateDir, "discord.json"))).toEqual(journalBefore);
    }
    fs.writeFileSync(work.preparedPath!, preparedBytes);
    fs.writeFileSync(work.artifact!.pdfPath, "invalid PDF");
    await expect(attachLinkedInResume({ store, transport, workId: work.workId, approvedSha256: work.artifact!.sha256, portfolioRoot: process.env.JOB_OPS_PORTFOLIO_ROOT! })).rejects.toThrow(/hash/i);
    expect(store.work.get(work.workId)?.status).toBe("blocked");
    expect(store.work.get(work.workId)?.lastError).toMatch(/hash/i);
    fs.writeFileSync(work.artifact!.pdfPath, exactBytes);
    const attached = await attachLinkedInResume({ store, transport, workId: work.workId, approvedSha256: work.artifact!.sha256, portfolioRoot: process.env.JOB_OPS_PORTFOLIO_ROOT! });
    expect(attached.status).toBe("delivered");
    expect(attached.attachmentDelivery?.attachmentId).toBeTruthy();
    const journal = JSON.parse(fs.readFileSync(path.join(privateDir, "discord.json"), "utf8"));
    const entries = Object.values(journal.entries) as { threadId: string; sha256?: string; filename?: string }[];
    expect(entries.every(entry => entry.threadId === work.threadId)).toBe(true);
    const uploaded = entries.find(entry => entry.sha256)!;
    expect(uploaded.sha256).toBe(work.artifact!.sha256);
    expect(fs.readFileSync(path.join(privateDir, `fixture-${attached.attachmentDelivery!.key}-${uploaded.filename}`))).toEqual(exactBytes);
    expect(store.getLead(lead.leadId)?.reviewStatus).not.toBe("applied_manually");
    store.updateLeadReview({ leadId: lead.leadId, status: "applied_manually", note: "Synthetic manual submission." });
    expect(new JobStore(store.dbPath).getLead(lead.leadId)?.reviewStatus).toBe("applied_manually");
  }, 60_000);

});
