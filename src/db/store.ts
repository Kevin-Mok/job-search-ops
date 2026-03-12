import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import Database from "better-sqlite3";

import type { JobLeadRecord, ReviewEventRecord, ReviewStatus } from "../core/types.js";
import { REVIEW_STATUSES } from "../core/types.js";

type SqlRow = Record<string, unknown>;

function ensureDirectory(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function encodeJson(value: unknown): string {
  return JSON.stringify(value);
}

function decodeJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

function toLeadRecord(row: SqlRow): JobLeadRecord {
  return {
    leadId: String(row.lead_id),
    duplicateKey: String(row.duplicate_key),
    source: String(row.source) as JobLeadRecord["source"],
    sourceMessageId: String(row.source_message_id),
    sourceItemKey: String(row.source_item_key),
    sourceFixture: String(row.source_fixture),
    title: String(row.title),
    company: String(row.company),
    locationRaw: String(row.location_raw),
    workModel: String(row.work_model) as JobLeadRecord["workModel"],
    officeLocationRaw: row.office_location_raw ? String(row.office_location_raw) : undefined,
    seniority: String(row.seniority) as JobLeadRecord["seniority"],
    employmentType: row.employment_type ? String(row.employment_type) : undefined,
    compensationText: row.compensation_text ? String(row.compensation_text) : undefined,
    compensationMin: row.compensation_min === null ? undefined : Number(row.compensation_min),
    compensationMax: row.compensation_max === null ? undefined : Number(row.compensation_max),
    compensationCurrency: row.compensation_currency ? String(row.compensation_currency) : undefined,
    skills: decodeJson<string[]>(row.skills_json),
    canonicalUrl: String(row.canonical_url),
    normalizedDescription: String(row.normalized_description),
    riskFlags: decodeJson<string[]>(row.risk_flags_json),
    locationDecision: String(row.location_decision) as JobLeadRecord["locationDecision"],
    locationConfidence: Number(row.location_confidence),
    distanceKm: row.distance_km === null ? undefined : Number(row.distance_km),
    canadaEligibleRemote: Number(row.canada_eligible_remote) === 1,
    officeLatitude: row.office_latitude === null ? undefined : Number(row.office_latitude),
    officeLongitude: row.office_longitude === null ? undefined : Number(row.office_longitude),
    jobFamily: String(row.job_family) as JobLeadRecord["jobFamily"],
    score: Number(row.score),
    shortlistReason: String(row.shortlist_reason),
    reviewStatus: String(row.review_status) as JobLeadRecord["reviewStatus"],
    resumeMatch: decodeJson<JobLeadRecord["resumeMatch"]>(row.resume_match_json),
    draftPacket: decodeJson<JobLeadRecord["draftPacket"]>(row.draft_packet_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export class JobStore {
  private readonly db: Database.Database;

  constructor(public readonly dbPath: string) {
    ensureDirectory(dbPath);
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS job_leads (
        lead_id TEXT PRIMARY KEY,
        duplicate_key TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        source_message_id TEXT NOT NULL,
        source_item_key TEXT NOT NULL,
        source_fixture TEXT NOT NULL,
        title TEXT NOT NULL,
        company TEXT NOT NULL,
        location_raw TEXT NOT NULL,
        work_model TEXT NOT NULL,
        office_location_raw TEXT,
        seniority TEXT NOT NULL,
        employment_type TEXT,
        compensation_text TEXT,
        compensation_min REAL,
        compensation_max REAL,
        compensation_currency TEXT,
        skills_json TEXT NOT NULL,
        canonical_url TEXT NOT NULL,
        normalized_description TEXT NOT NULL,
        risk_flags_json TEXT NOT NULL,
        location_decision TEXT NOT NULL,
        location_confidence REAL NOT NULL,
        distance_km REAL,
        canada_eligible_remote INTEGER NOT NULL,
        office_latitude REAL,
        office_longitude REAL,
        job_family TEXT NOT NULL,
        score REAL NOT NULL,
        shortlist_reason TEXT NOT NULL,
        review_status TEXT NOT NULL,
        resume_match_json TEXT NOT NULL,
        draft_packet_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS ingest_events (
        event_id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL,
        source TEXT NOT NULL,
        message_id TEXT NOT NULL,
        source_item_key TEXT NOT NULL,
        source_fixture TEXT NOT NULL,
        ingested_at TEXT NOT NULL,
        raw_payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS review_events (
        event_id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
  }

  findLeadByDuplicateKey(duplicateKey: string): JobLeadRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM job_leads WHERE duplicate_key = ?")
      .get(duplicateKey) as SqlRow | undefined;

    return row ? toLeadRecord(row) : undefined;
  }

  getLead(leadId: string): JobLeadRecord | undefined {
    const row = this.db.prepare("SELECT * FROM job_leads WHERE lead_id = ?").get(leadId) as SqlRow | undefined;
    return row ? toLeadRecord(row) : undefined;
  }

  listLeads(): JobLeadRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM job_leads ORDER BY score DESC, company ASC, title ASC")
      .all() as SqlRow[];
    return rows.map((row) => toLeadRecord(row));
  }

  saveLead(lead: JobLeadRecord): void {
    if (!REVIEW_STATUSES.includes(lead.reviewStatus)) {
      throw new Error(`Invalid review status: ${lead.reviewStatus}`);
    }

    this.db
      .prepare(`
        INSERT INTO job_leads (
          lead_id,
          duplicate_key,
          source,
          source_message_id,
          source_item_key,
          source_fixture,
          title,
          company,
          location_raw,
          work_model,
          office_location_raw,
          seniority,
          employment_type,
          compensation_text,
          compensation_min,
          compensation_max,
          compensation_currency,
          skills_json,
          canonical_url,
          normalized_description,
          risk_flags_json,
          location_decision,
          location_confidence,
          distance_km,
          canada_eligible_remote,
          office_latitude,
          office_longitude,
          job_family,
          score,
          shortlist_reason,
          review_status,
          resume_match_json,
          draft_packet_json,
          created_at,
          updated_at
        ) VALUES (
          @leadId,
          @duplicateKey,
          @source,
          @sourceMessageId,
          @sourceItemKey,
          @sourceFixture,
          @title,
          @company,
          @locationRaw,
          @workModel,
          @officeLocationRaw,
          @seniority,
          @employmentType,
          @compensationText,
          @compensationMin,
          @compensationMax,
          @compensationCurrency,
          @skillsJson,
          @canonicalUrl,
          @normalizedDescription,
          @riskFlagsJson,
          @locationDecision,
          @locationConfidence,
          @distanceKm,
          @canadaEligibleRemote,
          @officeLatitude,
          @officeLongitude,
          @jobFamily,
          @score,
          @shortlistReason,
          @reviewStatus,
          @resumeMatchJson,
          @draftPacketJson,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(lead_id) DO UPDATE SET
          duplicate_key = excluded.duplicate_key,
          source = excluded.source,
          source_message_id = excluded.source_message_id,
          source_item_key = excluded.source_item_key,
          source_fixture = excluded.source_fixture,
          title = excluded.title,
          company = excluded.company,
          location_raw = excluded.location_raw,
          work_model = excluded.work_model,
          office_location_raw = excluded.office_location_raw,
          seniority = excluded.seniority,
          employment_type = excluded.employment_type,
          compensation_text = excluded.compensation_text,
          compensation_min = excluded.compensation_min,
          compensation_max = excluded.compensation_max,
          compensation_currency = excluded.compensation_currency,
          skills_json = excluded.skills_json,
          canonical_url = excluded.canonical_url,
          normalized_description = excluded.normalized_description,
          risk_flags_json = excluded.risk_flags_json,
          location_decision = excluded.location_decision,
          location_confidence = excluded.location_confidence,
          distance_km = excluded.distance_km,
          canada_eligible_remote = excluded.canada_eligible_remote,
          office_latitude = excluded.office_latitude,
          office_longitude = excluded.office_longitude,
          job_family = excluded.job_family,
          score = excluded.score,
          shortlist_reason = excluded.shortlist_reason,
          review_status = excluded.review_status,
          resume_match_json = excluded.resume_match_json,
          draft_packet_json = excluded.draft_packet_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `)
      .run({
        ...lead,
        skillsJson: encodeJson(lead.skills),
        riskFlagsJson: encodeJson(lead.riskFlags),
        resumeMatchJson: encodeJson(lead.resumeMatch),
        draftPacketJson: encodeJson(lead.draftPacket),
        canadaEligibleRemote: lead.canadaEligibleRemote ? 1 : 0
      });
  }

  recordIngestEvent(event: {
    eventId: string;
    leadId: string;
    source: string;
    messageId: string;
    sourceItemKey: string;
    sourceFixture: string;
    ingestedAt: string;
    rawPayload: unknown;
  }): void {
    this.db
      .prepare(`
        INSERT INTO ingest_events (
          event_id,
          lead_id,
          source,
          message_id,
          source_item_key,
          source_fixture,
          ingested_at,
          raw_payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        event.eventId,
        event.leadId,
        event.source,
        event.messageId,
        event.sourceItemKey,
        event.sourceFixture,
        event.ingestedAt,
        encodeJson(event.rawPayload)
      );
  }

  listReviewEvents(leadId?: string): ReviewEventRecord[] {
    const query = leadId
      ? this.db.prepare("SELECT * FROM review_events WHERE lead_id = ? ORDER BY created_at ASC")
      : this.db.prepare("SELECT * FROM review_events ORDER BY created_at ASC");
    const rows = (leadId ? query.all(leadId) : query.all()) as SqlRow[];

    return rows.map((row) => ({
      eventId: String(row.event_id),
      leadId: String(row.lead_id),
      action: String(row.action),
      payload: decodeJson<Record<string, unknown>>(row.payload_json),
      createdAt: String(row.created_at)
    }));
  }

  appendReviewEvent(leadId: string, action: string, payload: Record<string, unknown>): void {
    this.db
      .prepare(`
        INSERT INTO review_events (event_id, lead_id, action, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(crypto.randomUUID(), leadId, action, encodeJson(payload), new Date().toISOString());
  }

  updateLeadReview(params: {
    leadId: string;
    status?: ReviewStatus;
    note?: string;
    resumeVariantId?: string;
    draftPacketJson?: string;
    resumeMatchJson?: string;
  }): JobLeadRecord {
    const lead = this.getLead(params.leadId);
    if (!lead) {
      throw new Error(`Lead not found: ${params.leadId}`);
    }

    const updated: JobLeadRecord = {
      ...lead,
      reviewStatus: params.status ?? lead.reviewStatus,
      draftPacket: params.draftPacketJson ? decodeJson(params.draftPacketJson) : lead.draftPacket,
      resumeMatch: params.resumeMatchJson ? decodeJson(params.resumeMatchJson) : lead.resumeMatch,
      updatedAt: new Date().toISOString()
    };

    this.saveLead(updated);

    if (params.status) {
      this.appendReviewEvent(lead.leadId, "status_changed", { status: params.status });
    }

    if (params.note) {
      this.appendReviewEvent(lead.leadId, "note", { note: params.note });
    }

    if (params.resumeVariantId) {
      this.appendReviewEvent(lead.leadId, "resume_changed", { resumeVariantId: params.resumeVariantId });
    }

    return updated;
  }
}
