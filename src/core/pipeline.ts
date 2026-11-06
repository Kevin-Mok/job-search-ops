import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import { generateDraftPacket } from "./drafting.js";
import { parseEmailFixture, parseFixtureSource } from "./parsing.js";
import { collectRiskFlags, evaluateLocationPolicy, inferJobFamily, scoreLead, updateReviewStatusForDuplicate } from "./policy.js";
import { chooseResumeVariant } from "./routing.js";
import type {
  EmailFixture,
  IngestEventRecord,
  IngestSummary,
  JobLeadRecord,
  ParsedLeadInput,
  ReviewStatus
} from "./types.js";
import { JobStore } from "../db/store.js";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeLocationKey(lead: ParsedLeadInput): string {
  return (lead.officeLocationRaw ?? lead.locationRaw).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildDuplicateKey(lead: ParsedLeadInput): string {
  return [
    slugify(lead.company),
    slugify(lead.title),
    slugify(normalizeLocationKey(lead)),
    lead.workModel
  ].join("|");
}

function buildLeadId(lead: ParsedLeadInput): string {
  return `${slugify(lead.company)}-${slugify(lead.title)}`;
}

function makeNow(): string {
  return new Date().toISOString();
}

function mergeRiskFlags(existing: string[], incoming: string[]): string[] {
  return [...new Set([...existing, ...incoming])].sort();
}

function chooseBetterStatus(existing: ReviewStatus, incoming: ReviewStatus): ReviewStatus {
  return updateReviewStatusForDuplicate(existing, incoming);
}

function hydrateLeadRecord(lead: ParsedLeadInput, postingIdentity = false): JobLeadRecord {
  const duplicateKey = postingIdentity ? `posting|${lead.canonicalUrl}` : buildDuplicateKey(lead);
  const leadId = postingIdentity
    ? `${buildLeadId(lead)}-${crypto.createHash("sha256").update(duplicateKey).digest("hex").slice(0, 12)}`
    : buildLeadId(lead);
  const location = evaluateLocationPolicy(lead);
  const jobFamily = inferJobFamily(lead);
  const riskFlags = collectRiskFlags(lead);
  const resumeMatch = chooseResumeVariant(lead, jobFamily);
  const scoring = scoreLead({
    lead,
    jobFamily,
    location,
    riskFlags,
    resumeFitScore: resumeMatch.fitScore
  });
  let reviewStatus = postingIdentity && location.decision !== "rejected" && scoring.reviewStatus === "rejected"
    ? "needs_review" as const : scoring.reviewStatus;
  let shortlistReason = scoring.shortlistReason;

  if (
    reviewStatus === "shortlisted" &&
    (riskFlags.includes("staffing_spam") || resumeMatch.missingRequirements.length > 0)
  ) {
    reviewStatus = "needs_review";
    shortlistReason = `${shortlistReason}; Manual review required for staffing or requirement-gap risk`;
  }
  const timestamp = makeNow();

  const seedRecord = {
    leadId,
    duplicateKey,
    source: lead.source,
    sourceMessageId: lead.sourceMessageId,
    sourceItemKey: lead.sourceItemKey,
    sourceFixture: lead.sourceFixture,
    title: lead.title,
    company: lead.company,
    locationRaw: lead.locationRaw,
    workModel: lead.workModel,
    officeLocationRaw: lead.officeLocationRaw,
    seniority: lead.seniority,
    employmentType: lead.employmentType,
    compensationText: lead.compensationText,
    compensationMin: lead.compensationMin,
    compensationMax: lead.compensationMax,
    compensationCurrency: lead.compensationCurrency,
    skills: lead.skills,
    canonicalUrl: lead.canonicalUrl,
    normalizedDescription: lead.normalizedDescription,
    riskFlags,
    locationDecision: location.decision,
    locationConfidence: location.locationConfidence,
    distanceKm: location.distanceKm,
    canadaEligibleRemote: location.canadaEligibleRemote,
    officeLatitude: location.officeLatitude,
    officeLongitude: location.officeLongitude,
    jobFamily,
    score: scoring.score,
    shortlistReason,
    reviewStatus,
    resumeMatch,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return {
    ...seedRecord,
    draftPacket: generateDraftPacket(seedRecord, resumeMatch)
  };
}

function mergeLead(existing: JobLeadRecord, incoming: JobLeadRecord): JobLeadRecord {
  const mergedRiskFlags = mergeRiskFlags(existing.riskFlags, incoming.riskFlags);
  const betterResume = incoming.resumeMatch.fitScore > existing.resumeMatch.fitScore ? incoming.resumeMatch : existing.resumeMatch;
  const reviewStatus = chooseBetterStatus(existing.reviewStatus, incoming.reviewStatus);
  const locationDecision: JobLeadRecord["locationDecision"] =
    existing.locationDecision === "accepted" || incoming.locationDecision === "accepted"
      ? "accepted"
      : existing.locationDecision === "needs_review" || incoming.locationDecision === "needs_review"
        ? "needs_review"
        : "rejected";

  const mergedSeed = {
    ...existing,
    source: existing.source,
    sourceMessageId: incoming.sourceMessageId,
    sourceItemKey: incoming.sourceItemKey,
    sourceFixture: incoming.sourceFixture,
    officeLocationRaw: existing.officeLocationRaw ?? incoming.officeLocationRaw,
    compensationText: existing.compensationText ?? incoming.compensationText,
    compensationMin: existing.compensationMin ?? incoming.compensationMin,
    compensationMax: existing.compensationMax ?? incoming.compensationMax,
    compensationCurrency: existing.compensationCurrency ?? incoming.compensationCurrency,
    skills: [...new Set([...existing.skills, ...incoming.skills])].sort(),
    canonicalUrl: existing.canonicalUrl || incoming.canonicalUrl,
    normalizedDescription:
      incoming.normalizedDescription.length > existing.normalizedDescription.length
        ? incoming.normalizedDescription
        : existing.normalizedDescription,
    riskFlags: mergedRiskFlags,
    locationDecision,
    locationConfidence: Math.max(existing.locationConfidence, incoming.locationConfidence),
    distanceKm: existing.distanceKm ?? incoming.distanceKm,
    canadaEligibleRemote: existing.canadaEligibleRemote || incoming.canadaEligibleRemote,
    officeLatitude: existing.officeLatitude ?? incoming.officeLatitude,
    officeLongitude: existing.officeLongitude ?? incoming.officeLongitude,
    jobFamily: existing.jobFamily === "unknown" ? incoming.jobFamily : existing.jobFamily,
    score: Math.max(existing.score, incoming.score),
    shortlistReason:
      incoming.score > existing.score ? incoming.shortlistReason : existing.shortlistReason,
    reviewStatus,
    resumeMatch: betterResume,
    updatedAt: makeNow()
  };

  return {
    ...mergedSeed,
    draftPacket: generateDraftPacket(mergedSeed, betterResume)
  };
}

export function loadEmailFixtures(fixturesDir: string): { fixture: EmailFixture; fixturePath: string }[] {
  return fs
    .readdirSync(fixturesDir)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => {
      const fixturePath = path.join(fixturesDir, entry);
      const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Record<string, string>;

      return {
        fixture: {
          messageId: raw.messageId,
          source: parseFixtureSource(raw.source),
          receivedAt: raw.receivedAt,
          from: raw.from,
          subject: raw.subject,
          textBody: raw.textBody
        },
        fixturePath
      };
    });
}

function buildIngestEvent(lead: ParsedLeadInput, record: JobLeadRecord): IngestEventRecord {
  return {
    eventId: crypto.randomUUID(),
    leadId: record.leadId,
    source: lead.source,
    messageId: lead.sourceMessageId,
    sourceItemKey: lead.sourceItemKey,
    sourceFixture: lead.sourceFixture,
    ingestedAt: makeNow(),
    rawPayload: lead
  };
}

export function ingestParsedLeads(store: JobStore, parsedLeads: ParsedLeadInput[], postingIdentity = false): IngestSummary {
  let created = 0;
  let updated = 0;
  let duplicatesMerged = 0;
  const touchedLeadIds: string[] = [];

  for (const parsed of parsedLeads) {
    const incoming = hydrateLeadRecord(parsed, postingIdentity);
    const existing = (postingIdentity ? store.findLeadByCanonicalUrl(incoming.canonicalUrl) : undefined)
      ?? store.findLeadByDuplicateKey(incoming.duplicateKey);
    const finalRecord = existing
      ? postingIdentity
        ? {
            ...incoming,
            leadId: existing.leadId,
            duplicateKey: existing.duplicateKey,
            createdAt: existing.createdAt,
            reviewStatus: ["approved_for_manual_apply", "applied_manually"].includes(existing.reviewStatus)
              || (existing.reviewStatus === "rejected" && store.listReviewEvents(existing.leadId).some(event => event.action === "status_changed" && event.payload.status === "rejected"))
              ? existing.reviewStatus : incoming.reviewStatus
          }
        : mergeLead(existing, incoming)
      : incoming;

    if (existing) {
      duplicatesMerged += 1;
      updated += 1;
    } else {
      created += 1;
    }

    store.saveLead(finalRecord);
    store.recordIngestEvent(buildIngestEvent(parsed, finalRecord));
    touchedLeadIds.push(finalRecord.leadId);
  }

  return {
    fixturesProcessed: 0,
    leadCandidates: parsedLeads.length,
    created,
    updated,
    duplicatesMerged,
    touchedLeadIds,
    leads: store.listLeads()
  };
}

export function ingestFixtures(store: JobStore, fixturesDir: string): IngestSummary {
  const fixtures = loadEmailFixtures(fixturesDir);
  const parsedLeads = fixtures.flatMap(({ fixture, fixturePath }) => parseEmailFixture(fixture, fixturePath));
  const summary = ingestParsedLeads(store, parsedLeads);

  return {
    ...summary,
    fixturesProcessed: fixtures.length
  };
}
