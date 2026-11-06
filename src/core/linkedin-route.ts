import crypto from "node:crypto";
import { parseEmailFixture } from "./parsing.js";
import { ingestParsedLeads } from "./pipeline.js";
import type { EmailFixture, JobLeadRecord } from "./types.js";
import type { JobStore } from "../db/store.js";
import { DiscordRouteError, type LinkedInTransport } from "../discord/linkedin-transport.js";

function validateEmail(input: unknown): EmailFixture {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("LinkedIn email must be a normalized JSON object.");
  const data = input as Record<string, unknown>;
  for (const key of ["messageId", "receivedAt", "from", "subject", "textBody"]) {
    if (typeof data[key] !== "string" || !String(data[key]).trim()) throw new Error(`LinkedIn email requires ${key}.`);
  }
  if (data.source !== "linkedin") throw new Error("LinkedIn intake requires source linkedin.");
  const sender = String(data.from).trim().toLowerCase();
  if (!["jobs-noreply@linkedin.com", "jobalerts-noreply@linkedin.com"].includes(sender)) throw new Error("LinkedIn sender is not allowlisted; hold for review.");
  if (!Number.isFinite(Date.parse(String(data.receivedAt)))) throw new Error("LinkedIn email receivedAt must be a valid timestamp.");
  if (Buffer.byteLength(String(data.textBody)) > 200_000 || String(data.messageId).length > 512) throw new Error("LinkedIn email exceeds the intake limits.");
  return { messageId: String(data.messageId), source: "linkedin", receivedAt: String(data.receivedAt), from: sender, subject: String(data.subject), textBody: String(data.textBody).replaceAll("\r\n", "\n") };
}

export function ingestLinkedInEmail(store: JobStore, input: unknown, trust: { fixture?: boolean; verifiedHandoff?: boolean }) {
  if (!trust.fixture && !trust.verifiedHandoff) throw new Error("An explicit verified sender handoff is required; raw email headers are not authentication.");
  const email = validateEmail(input);
  const parsed = parseEmailFixture(email, "linkedin-handoff.json").map(lead => {
    const url = new URL(lead.canonicalUrl);
    if (url.protocol !== "https:" || !["linkedin.com", "www.linkedin.com"].includes(url.hostname) || url.username || url.password || url.port || !/^\/jobs\/view\/[^/]+\/?$/.test(url.pathname)) {
      throw new Error("LinkedIn job URL must be an HTTPS linkedin.com/jobs/view posting URL.");
    }
    url.hostname = "www.linkedin.com";
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/$/, "");
    // LinkedIn links may use a title slug before the stable numeric posting ID.
    const id = url.pathname.match(/(?:\/|[\-])(\d+)$/)?.[1];
    if (id) url.pathname = `/jobs/view/${id}`;
    return { ...lead, canonicalUrl: url.toString() };
  });
  if (!parsed.length) throw new Error("LinkedIn email has no normalized jobs; raw MIME/HTML requires a parser handoff.");
  const version = crypto.createHash("sha256").update(JSON.stringify(email)).digest("hex");
  return store.linkedin.ingest({ messageId: email.messageId, version, receivedAt: email.receivedAt, payload: email },
    () => parsed.flatMap(lead => {
      const latest = store.linkedin.latestPosting(lead.canonicalUrl);
      if (latest && Date.parse(latest.receivedAt) > Date.parse(email.receivedAt)) return [latest.leadId];
      const leadIds = ingestParsedLeads(store, [lead], true).touchedLeadIds;
      store.linkedin.observePosting(lead.canonicalUrl, email.receivedAt, leadIds[0]);
      return leadIds;
    }));
}

function initialAlert(lead: JobLeadRecord, key: string): string {
  return [
    "📨 LinkedIn job alert — manual review",
    `${lead.title.slice(0, 180)} @ ${lead.company.slice(0, 180)}`,
    `Lead ID: ${lead.leadId}`,
    `Status: ${lead.reviewStatus}`,
    `Location: ${lead.locationRaw.slice(0, 200)} | ${lead.workModel}`,
    `Location gate: ${lead.locationDecision}; work authorization requires manual confirmation.`,
    `URL: ${lead.canonicalUrl}`,
    "Application submission is manual. Fit and resume updates follow eligibility and evidence review.",
    `job-ops-key:${key}`
  ].join("\n");
}

export async function drainLinkedInAlerts(params: { store: JobStore; transport: LinkedInTransport; now?: Date }) {
  const { store, transport } = params;
  const clock = () => params.now ?? new Date();
  const now = clock();
  const timestamp = now.toISOString();
  for (const leadId of new Set(store.linkedin.listMessages().flatMap(message => message.leadIds))) {
    const lead = store.getLead(leadId);
    if (lead) store.linkedin.queue(transport.target, leadId, lead.locationDecision === "rejected" || lead.reviewStatus === "rejected" || lead.reviewStatus === "duplicate", timestamp);
  }
  const backoff = store.linkedin.targetRetryAt(transport.target);
  if (backoff && Date.parse(backoff) > now.getTime()) return { target: transport.target, retryAt: backoff, deliveries: store.linkedin.listDeliveries(transport.target) };
  for (const pending of store.linkedin.listDeliveries(transport.target)) {
    const attemptTime = clock();
    const delivery = store.linkedin.claim(transport.target, pending.leadId, attemptTime);
    if (!delivery) continue;
    const lead = store.getLead(delivery.leadId);
    if (!lead) throw new Error("Canonical LinkedIn job is missing; restore SQLite state before delivery.");
    let postAttempted = false;
    try {
      const reconcile = delivery.reconcileRequired === true;
      if (!delivery.messageId) {
        if (reconcile) {
          delivery.messageId = await transport.findAlert(delivery.key);
          if (!delivery.messageId) throw new DiscordRouteError("Alert outcome remains uncertain; matching bot receipt not found in bounded history. Operator review required.", "uncertain");
        } else {
          postAttempted = true;
          delivery.reconcileRequired = true;
          store.linkedin.save(delivery);
          delivery.messageId = await transport.sendAlert({ key: delivery.key, content: initialAlert(lead, delivery.key), title: `${lead.company} - ${lead.title}` });
        }
        delivery.reconcileRequired = false;
        store.linkedin.save(delivery);
      }
      if (!delivery.threadId) {
        delivery.threadId = await transport.findThread(delivery.messageId);
        if (!delivery.threadId && reconcile && pending.messageId) throw new DiscordRouteError("Thread outcome remains uncertain; operator review required.", "uncertain");
        if (!delivery.threadId) {
          postAttempted = true;
          delivery.reconcileRequired = true;
          store.linkedin.save(delivery);
          delivery.threadId = await transport.createThread({ messageId: delivery.messageId, title: `${lead.company} - ${lead.title}` });
        }
      }
      delivery.status = "delivered";
      delivery.reconcileRequired = false;
      delivery.lastError = undefined;
      delivery.retryAt = undefined;
    } catch (error) {
      const known = error instanceof DiscordRouteError ? error : new DiscordRouteError("Discord operation interrupted; reconcile before retry.", "uncertain");
      delivery.status = known.certainty;
      if (postAttempted && known.certainty !== "uncertain") delivery.reconcileRequired = false;
      delivery.lastError = known.message;
      if (known.certainty === "retry") {
        delivery.retryAt = new Date(clock().getTime() + (known.retryAfterMs ?? 60_000)).toISOString();
        store.linkedin.deferTarget(transport.target, delivery.retryAt);
      }
    }
    delivery.updatedAt = clock().toISOString();
    delivery.leaseUntil = undefined;
    store.linkedin.save(delivery);
    if (delivery.status === "retry") break;
  }
  return { target: transport.target, deliveries: store.linkedin.listDeliveries(transport.target) };
}
