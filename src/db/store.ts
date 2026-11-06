import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

import Database from "better-sqlite3";
import { LinkedInStore } from "./linkedin-store.js";
import { JobWorkStore } from "./job-work-store.js";

import type {
  DiscordDeliveryRecord,
  JobLeadRecord,
  ReviewEventRecord,
  ReviewStatus,
  SyncRunRecord,
  SyncRunStatus,
  XNewsDeliveryRecord,
  XNewsPostRecord,
  XNewsSyncRunRecord,
  XNewsTrackedAccountRecord
} from "../core/types.js";
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

function toSyncRunRecord(row: SqlRow): SyncRunRecord {
  return {
    runId: String(row.run_id),
    alertId: String(row.alert_id),
    searchUrl: String(row.search_url),
    status: String(row.status) as SyncRunStatus,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    pagesFetched: Number(row.pages_fetched),
    cardsSeen: Number(row.cards_seen),
    cardsFilteredBeforeDetail: Number(row.cards_filtered_before_detail),
    detailPagesFetched: Number(row.detail_pages_fetched),
    parsedLeads: Number(row.parsed_leads),
    leadsCreated: Number(row.leads_created),
    leadsUpdated: Number(row.leads_updated),
    duplicatesMerged: Number(row.duplicates_merged),
    deliveriesAttempted: Number(row.deliveries_attempted),
    deliveriesSucceeded: Number(row.deliveries_succeeded),
    deliveriesFailed: Number(row.deliveries_failed),
    errorMessage: row.error_message ? String(row.error_message) : undefined
  };
}

function toDiscordDeliveryRecord(row: SqlRow): DiscordDeliveryRecord {
  return {
    deliveryId: String(row.delivery_id),
    alertId: String(row.alert_id),
    target: String(row.target),
    leadId: String(row.lead_id),
    reviewStatus: String(row.review_status) as DiscordDeliveryRecord["reviewStatus"],
    syncRunId: String(row.sync_run_id),
    deliveredAt: String(row.delivered_at),
    externalMessageId: row.external_message_id ? String(row.external_message_id) : undefined
  };
}

function toXNewsTrackedAccountRecord(row: SqlRow): XNewsTrackedAccountRecord {
  return {
    accountId: String(row.account_id),
    listId: String(row.list_id),
    handle: String(row.handle),
    displayName: String(row.display_name),
    profileUrl: String(row.profile_url),
    bio: row.bio ? String(row.bio) : undefined,
    verified: Number(row.verified) === 1,
    source: String(row.source) as XNewsTrackedAccountRecord["source"],
    discoveryScore: row.discovery_score === null ? undefined : Number(row.discovery_score),
    topicIds: decodeJson<string[]>(row.topic_ids_json),
    authorQualityScore: Number(row.author_quality_score),
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    lastFetchedAt: row.last_fetched_at ? String(row.last_fetched_at) : undefined
  };
}

function toXNewsPostRecord(row: SqlRow): XNewsPostRecord {
  return {
    postId: String(row.post_id),
    listId: String(row.list_id),
    authorHandle: String(row.author_handle),
    authorDisplayName: String(row.author_display_name),
    authorProfileUrl: String(row.author_profile_url),
    postUrl: String(row.post_url),
    postedAt: String(row.posted_at),
    text: String(row.text),
    normalizedText: String(row.normalized_text),
    quoteHandles: decodeJson<string[]>(row.quote_handles_json),
    replyHandles: decodeJson<string[]>(row.reply_handles_json),
    mentionHandles: decodeJson<string[]>(row.mention_handles_json),
    likeCount: Number(row.like_count),
    repostCount: Number(row.repost_count),
    replyCount: Number(row.reply_count),
    viewCount: row.view_count === null ? undefined : Number(row.view_count),
    matchedTopicIds: decodeJson<string[]>(row.matched_topic_ids_json),
    topicRelevanceScore: Number(row.topic_relevance_score),
    authorQualityScore: Number(row.author_quality_score),
    engagementScore: Number(row.engagement_score),
    freshnessScore: Number(row.freshness_score),
    score: Number(row.score),
    ingestedAt: String(row.ingested_at),
    updatedAt: String(row.updated_at)
  };
}

function toXNewsSyncRunRecord(row: SqlRow): XNewsSyncRunRecord {
  return {
    runId: String(row.run_id),
    listId: String(row.list_id),
    status: String(row.status) as SyncRunStatus,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    seedAccountsSeen: Number(row.seed_accounts_seen),
    trackedAccountsCrawled: Number(row.tracked_accounts_crawled),
    postsSeen: Number(row.posts_seen),
    postsStored: Number(row.posts_stored),
    accountsAdded: Number(row.accounts_added),
    deliveriesAttempted: Number(row.deliveries_attempted),
    deliveriesSucceeded: Number(row.deliveries_succeeded),
    deliveriesFailed: Number(row.deliveries_failed),
    errorMessage: row.error_message ? String(row.error_message) : undefined
  };
}

function toXNewsDeliveryRecord(row: SqlRow): XNewsDeliveryRecord {
  return {
    deliveryId: String(row.delivery_id),
    listId: String(row.list_id),
    target: String(row.target),
    postId: String(row.post_id),
    syncRunId: String(row.sync_run_id),
    deliveredAt: String(row.delivered_at),
    externalMessageId: row.external_message_id ? String(row.external_message_id) : undefined
  };
}

export class JobStore {
  private readonly db: Database.Database;
  readonly linkedin: LinkedInStore;
  readonly work: JobWorkStore;

  constructor(public readonly dbPath: string) {
    ensureDirectory(dbPath);
    this.db = new Database(dbPath);
    this.initialize();
    this.linkedin = new LinkedInStore(this.db);
    this.work = new JobWorkStore(this.db);
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

      CREATE TABLE IF NOT EXISTS sync_runs (
        run_id TEXT PRIMARY KEY,
        alert_id TEXT NOT NULL,
        search_url TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        pages_fetched INTEGER NOT NULL DEFAULT 0,
        cards_seen INTEGER NOT NULL DEFAULT 0,
        cards_filtered_before_detail INTEGER NOT NULL DEFAULT 0,
        detail_pages_fetched INTEGER NOT NULL DEFAULT 0,
        parsed_leads INTEGER NOT NULL DEFAULT 0,
        leads_created INTEGER NOT NULL DEFAULT 0,
        leads_updated INTEGER NOT NULL DEFAULT 0,
        duplicates_merged INTEGER NOT NULL DEFAULT 0,
        deliveries_attempted INTEGER NOT NULL DEFAULT 0,
        deliveries_succeeded INTEGER NOT NULL DEFAULT 0,
        deliveries_failed INTEGER NOT NULL DEFAULT 0,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS discord_deliveries (
        delivery_id TEXT PRIMARY KEY,
        alert_id TEXT NOT NULL,
        target TEXT NOT NULL,
        lead_id TEXT NOT NULL,
        review_status TEXT NOT NULL,
        sync_run_id TEXT NOT NULL,
        delivered_at TEXT NOT NULL,
        external_message_id TEXT,
        UNIQUE(target, lead_id)
      );

      CREATE TABLE IF NOT EXISTS x_news_tracked_accounts (
        account_id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL,
        handle TEXT NOT NULL,
        display_name TEXT NOT NULL,
        profile_url TEXT NOT NULL,
        bio TEXT,
        verified INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL,
        discovery_score REAL,
        topic_ids_json TEXT NOT NULL,
        author_quality_score REAL NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_fetched_at TEXT,
        UNIQUE(list_id, handle)
      );

      CREATE TABLE IF NOT EXISTS x_news_posts (
        post_id TEXT NOT NULL,
        list_id TEXT NOT NULL,
        author_handle TEXT NOT NULL,
        author_display_name TEXT NOT NULL,
        author_profile_url TEXT NOT NULL,
        post_url TEXT NOT NULL,
        posted_at TEXT NOT NULL,
        text TEXT NOT NULL,
        normalized_text TEXT NOT NULL,
        quote_handles_json TEXT NOT NULL,
        reply_handles_json TEXT NOT NULL,
        mention_handles_json TEXT NOT NULL,
        like_count INTEGER NOT NULL DEFAULT 0,
        repost_count INTEGER NOT NULL DEFAULT 0,
        reply_count INTEGER NOT NULL DEFAULT 0,
        view_count INTEGER,
        matched_topic_ids_json TEXT NOT NULL,
        topic_relevance_score REAL NOT NULL,
        author_quality_score REAL NOT NULL,
        engagement_score REAL NOT NULL,
        freshness_score REAL NOT NULL,
        score REAL NOT NULL,
        ingested_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (list_id, post_id)
      );

      CREATE TABLE IF NOT EXISTS x_news_sync_runs (
        run_id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        seed_accounts_seen INTEGER NOT NULL DEFAULT 0,
        tracked_accounts_crawled INTEGER NOT NULL DEFAULT 0,
        posts_seen INTEGER NOT NULL DEFAULT 0,
        posts_stored INTEGER NOT NULL DEFAULT 0,
        accounts_added INTEGER NOT NULL DEFAULT 0,
        deliveries_attempted INTEGER NOT NULL DEFAULT 0,
        deliveries_succeeded INTEGER NOT NULL DEFAULT 0,
        deliveries_failed INTEGER NOT NULL DEFAULT 0,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS x_news_discord_deliveries (
        delivery_id TEXT PRIMARY KEY,
        list_id TEXT NOT NULL,
        target TEXT NOT NULL,
        post_id TEXT NOT NULL,
        sync_run_id TEXT NOT NULL,
        delivered_at TEXT NOT NULL,
        external_message_id TEXT,
        UNIQUE(target, post_id)
      );
    `);
  }

  findLeadByCanonicalUrl(url: string): JobLeadRecord | undefined {
    const row = this.db.prepare("SELECT * FROM job_leads WHERE canonical_url = ? ORDER BY created_at LIMIT 1").get(url) as SqlRow | undefined;
    return row ? toLeadRecord(row) : undefined;
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

  startSyncRun(params: { runId?: string; alertId: string; searchUrl: string; startedAt?: string }): SyncRunRecord {
    const runId = params.runId ?? crypto.randomUUID();
    const startedAt = params.startedAt ?? new Date().toISOString();

    this.db
      .prepare(`
        INSERT INTO sync_runs (
          run_id,
          alert_id,
          search_url,
          status,
          started_at,
          pages_fetched,
          cards_seen,
          cards_filtered_before_detail,
          detail_pages_fetched,
          parsed_leads,
          leads_created,
          leads_updated,
          duplicates_merged,
          deliveries_attempted,
          deliveries_succeeded,
          deliveries_failed
        ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
      `)
      .run(runId, params.alertId, params.searchUrl, "running", startedAt);

    return this.getSyncRun(runId)!;
  }

  getSyncRun(runId: string): SyncRunRecord | undefined {
    const row = this.db.prepare("SELECT * FROM sync_runs WHERE run_id = ?").get(runId) as SqlRow | undefined;
    return row ? toSyncRunRecord(row) : undefined;
  }

  listSyncRuns(): SyncRunRecord[] {
    const rows = this.db.prepare("SELECT * FROM sync_runs ORDER BY started_at DESC").all() as SqlRow[];
    return rows.map((row) => toSyncRunRecord(row));
  }

  finishSyncRun(params: {
    runId: string;
    status: SyncRunStatus;
    completedAt?: string;
    pagesFetched: number;
    cardsSeen: number;
    cardsFilteredBeforeDetail: number;
    detailPagesFetched: number;
    parsedLeads: number;
    leadsCreated: number;
    leadsUpdated: number;
    duplicatesMerged: number;
    deliveriesAttempted: number;
    deliveriesSucceeded: number;
    deliveriesFailed: number;
    errorMessage?: string;
  }): SyncRunRecord {
    this.db
      .prepare(`
        UPDATE sync_runs
        SET status = @status,
            completed_at = @completedAt,
            pages_fetched = @pagesFetched,
            cards_seen = @cardsSeen,
            cards_filtered_before_detail = @cardsFilteredBeforeDetail,
            detail_pages_fetched = @detailPagesFetched,
            parsed_leads = @parsedLeads,
            leads_created = @leadsCreated,
            leads_updated = @leadsUpdated,
            duplicates_merged = @duplicatesMerged,
            deliveries_attempted = @deliveriesAttempted,
            deliveries_succeeded = @deliveriesSucceeded,
            deliveries_failed = @deliveriesFailed,
            error_message = @errorMessage
        WHERE run_id = @runId
      `)
      .run({
        ...params,
        completedAt: params.completedAt ?? new Date().toISOString(),
        errorMessage: params.errorMessage ?? null
      });

    const run = this.getSyncRun(params.runId);
    if (!run) {
      throw new Error(`Sync run not found: ${params.runId}`);
    }
    return run;
  }

  listDiscordDeliveries(target?: string): DiscordDeliveryRecord[] {
    const query = target
      ? this.db.prepare("SELECT * FROM discord_deliveries WHERE target = ? ORDER BY delivered_at ASC")
      : this.db.prepare("SELECT * FROM discord_deliveries ORDER BY delivered_at ASC");
    const rows = (target ? query.all(target) : query.all()) as SqlRow[];
    return rows.map((row) => toDiscordDeliveryRecord(row));
  }

  hasDiscordDelivery(target: string, leadId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM discord_deliveries WHERE target = ? AND lead_id = ? LIMIT 1")
      .get(target, leadId) as SqlRow | undefined;
    return row !== undefined;
  }

  recordDiscordDelivery(params: {
    deliveryId?: string;
    alertId: string;
    target: string;
    leadId: string;
    reviewStatus: ReviewStatus;
    syncRunId: string;
    deliveredAt?: string;
    externalMessageId?: string;
  }): DiscordDeliveryRecord {
    const deliveryId = params.deliveryId ?? crypto.randomUUID();
    const deliveredAt = params.deliveredAt ?? new Date().toISOString();

    this.db
      .prepare(`
        INSERT OR IGNORE INTO discord_deliveries (
          delivery_id,
          alert_id,
          target,
          lead_id,
          review_status,
          sync_run_id,
          delivered_at,
          external_message_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        deliveryId,
        params.alertId,
        params.target,
        params.leadId,
        params.reviewStatus,
        params.syncRunId,
        deliveredAt,
        params.externalMessageId ?? null
      );

    const row = this.db
      .prepare("SELECT * FROM discord_deliveries WHERE target = ? AND lead_id = ?")
      .get(params.target, params.leadId) as SqlRow | undefined;
    if (!row) {
      throw new Error(`Discord delivery not found after insert: ${params.target} ${params.leadId}`);
    }
    return toDiscordDeliveryRecord(row);
  }

  getXNewsTrackedAccount(listId: string, handle: string): XNewsTrackedAccountRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM x_news_tracked_accounts WHERE list_id = ? AND handle = ?")
      .get(listId, handle.toLowerCase()) as SqlRow | undefined;
    return row ? toXNewsTrackedAccountRecord(row) : undefined;
  }

  listXNewsTrackedAccounts(listId: string, limit?: number): XNewsTrackedAccountRecord[] {
    const suffix = typeof limit === "number" ? ` LIMIT ${Math.max(1, Math.floor(limit))}` : "";
    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM x_news_tracked_accounts
          WHERE list_id = ?
          ORDER BY
            CASE source
              WHEN 'seed_following' THEN 0
              WHEN 'bootstrap' THEN 1
              ELSE 2
            END ASC,
            author_quality_score DESC,
            COALESCE(last_fetched_at, '') ASC,
            handle ASC
          ${suffix}
        `
      )
      .all(listId) as SqlRow[];
    return rows.map((row) => toXNewsTrackedAccountRecord(row));
  }

  countXNewsTrackedAccounts(listId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM x_news_tracked_accounts WHERE list_id = ?")
      .get(listId) as SqlRow;
    return Number(row.count);
  }

  upsertXNewsTrackedAccount(account: XNewsTrackedAccountRecord): XNewsTrackedAccountRecord {
    this.db
      .prepare(
        `
          INSERT INTO x_news_tracked_accounts (
            account_id,
            list_id,
            handle,
            display_name,
            profile_url,
            bio,
            verified,
            source,
            discovery_score,
            topic_ids_json,
            author_quality_score,
            first_seen_at,
            last_seen_at,
            last_fetched_at
          ) VALUES (
            @accountId,
            @listId,
            @handle,
            @displayName,
            @profileUrl,
            @bio,
            @verified,
            @source,
            @discoveryScore,
            @topicIdsJson,
            @authorQualityScore,
            @firstSeenAt,
            @lastSeenAt,
            @lastFetchedAt
          )
          ON CONFLICT(account_id) DO UPDATE SET
            display_name = excluded.display_name,
            profile_url = excluded.profile_url,
            bio = excluded.bio,
            verified = excluded.verified,
            source = excluded.source,
            discovery_score = excluded.discovery_score,
            topic_ids_json = excluded.topic_ids_json,
            author_quality_score = excluded.author_quality_score,
            last_seen_at = excluded.last_seen_at,
            last_fetched_at = excluded.last_fetched_at
        `
      )
      .run({
        ...account,
        handle: account.handle.toLowerCase(),
        verified: account.verified ? 1 : 0,
        discoveryScore: account.discoveryScore ?? null,
        topicIdsJson: encodeJson(account.topicIds),
        lastFetchedAt: account.lastFetchedAt ?? null,
        bio: account.bio ?? null
      });

    return this.getXNewsTrackedAccount(account.listId, account.handle)!;
  }

  getXNewsPost(listId: string, postId: string): XNewsPostRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM x_news_posts WHERE list_id = ? AND post_id = ?")
      .get(listId, postId) as SqlRow | undefined;
    return row ? toXNewsPostRecord(row) : undefined;
  }

  listXNewsPosts(params: {
    listId: string;
    since?: string;
    topicId?: string;
    limit?: number;
  }): XNewsPostRecord[] {
    const clauses = ["list_id = ?"];
    const args: unknown[] = [params.listId];

    if (params.since) {
      clauses.push("posted_at >= ?");
      args.push(params.since);
    }

    const suffix =
      typeof params.limit === "number" && !params.topicId ? ` LIMIT ${Math.max(1, Math.floor(params.limit))}` : "";
    const rows = this.db
      .prepare(
        `
          SELECT *
          FROM x_news_posts
          WHERE ${clauses.join(" AND ")}
          ORDER BY score DESC, posted_at DESC
          ${suffix}
        `
      )
      .all(...args) as SqlRow[];
    const posts = rows.map((row) => toXNewsPostRecord(row));
    const topicId = params.topicId;
    const filtered = topicId ? posts.filter((post) => post.matchedTopicIds.includes(topicId)) : posts;
    return typeof params.limit === "number" ? filtered.slice(0, Math.max(1, Math.floor(params.limit))) : filtered;
  }

  saveXNewsPost(post: XNewsPostRecord): XNewsPostRecord {
    this.db
      .prepare(
        `
          INSERT INTO x_news_posts (
            post_id,
            list_id,
            author_handle,
            author_display_name,
            author_profile_url,
            post_url,
            posted_at,
            text,
            normalized_text,
            quote_handles_json,
            reply_handles_json,
            mention_handles_json,
            like_count,
            repost_count,
            reply_count,
            view_count,
            matched_topic_ids_json,
            topic_relevance_score,
            author_quality_score,
            engagement_score,
            freshness_score,
            score,
            ingested_at,
            updated_at
          ) VALUES (
            @postId,
            @listId,
            @authorHandle,
            @authorDisplayName,
            @authorProfileUrl,
            @postUrl,
            @postedAt,
            @text,
            @normalizedText,
            @quoteHandlesJson,
            @replyHandlesJson,
            @mentionHandlesJson,
            @likeCount,
            @repostCount,
            @replyCount,
            @viewCount,
            @matchedTopicIdsJson,
            @topicRelevanceScore,
            @authorQualityScore,
            @engagementScore,
            @freshnessScore,
            @score,
            @ingestedAt,
            @updatedAt
          )
          ON CONFLICT(list_id, post_id) DO UPDATE SET
            author_handle = excluded.author_handle,
            author_display_name = excluded.author_display_name,
            author_profile_url = excluded.author_profile_url,
            post_url = excluded.post_url,
            posted_at = excluded.posted_at,
            text = excluded.text,
            normalized_text = excluded.normalized_text,
            quote_handles_json = excluded.quote_handles_json,
            reply_handles_json = excluded.reply_handles_json,
            mention_handles_json = excluded.mention_handles_json,
            like_count = excluded.like_count,
            repost_count = excluded.repost_count,
            reply_count = excluded.reply_count,
            view_count = excluded.view_count,
            matched_topic_ids_json = excluded.matched_topic_ids_json,
            topic_relevance_score = excluded.topic_relevance_score,
            author_quality_score = excluded.author_quality_score,
            engagement_score = excluded.engagement_score,
            freshness_score = excluded.freshness_score,
            score = excluded.score,
            ingested_at = excluded.ingested_at,
            updated_at = excluded.updated_at
        `
      )
      .run({
        ...post,
        quoteHandlesJson: encodeJson(post.quoteHandles),
        replyHandlesJson: encodeJson(post.replyHandles),
        mentionHandlesJson: encodeJson(post.mentionHandles),
        matchedTopicIdsJson: encodeJson(post.matchedTopicIds),
        viewCount: post.viewCount ?? null
      });

    return this.getXNewsPost(post.listId, post.postId)!;
  }

  startXNewsSyncRun(params: { runId?: string; listId: string; startedAt?: string }): XNewsSyncRunRecord {
    const runId = params.runId ?? crypto.randomUUID();
    const startedAt = params.startedAt ?? new Date().toISOString();

    this.db
      .prepare(
        `
          INSERT INTO x_news_sync_runs (
            run_id,
            list_id,
            status,
            started_at,
            seed_accounts_seen,
            tracked_accounts_crawled,
            posts_seen,
            posts_stored,
            accounts_added,
            deliveries_attempted,
            deliveries_succeeded,
            deliveries_failed
          ) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0)
        `
      )
      .run(runId, params.listId, "running", startedAt);

    return this.getXNewsSyncRun(runId)!;
  }

  getXNewsSyncRun(runId: string): XNewsSyncRunRecord | undefined {
    const row = this.db.prepare("SELECT * FROM x_news_sync_runs WHERE run_id = ?").get(runId) as SqlRow | undefined;
    return row ? toXNewsSyncRunRecord(row) : undefined;
  }

  finishXNewsSyncRun(params: {
    runId: string;
    status: SyncRunStatus;
    completedAt?: string;
    seedAccountsSeen: number;
    trackedAccountsCrawled: number;
    postsSeen: number;
    postsStored: number;
    accountsAdded: number;
    deliveriesAttempted: number;
    deliveriesSucceeded: number;
    deliveriesFailed: number;
    errorMessage?: string;
  }): XNewsSyncRunRecord {
    this.db
      .prepare(
        `
          UPDATE x_news_sync_runs
          SET status = @status,
              completed_at = @completedAt,
              seed_accounts_seen = @seedAccountsSeen,
              tracked_accounts_crawled = @trackedAccountsCrawled,
              posts_seen = @postsSeen,
              posts_stored = @postsStored,
              accounts_added = @accountsAdded,
              deliveries_attempted = @deliveriesAttempted,
              deliveries_succeeded = @deliveriesSucceeded,
              deliveries_failed = @deliveriesFailed,
              error_message = @errorMessage
          WHERE run_id = @runId
        `
      )
      .run({
        ...params,
        completedAt: params.completedAt ?? new Date().toISOString(),
        errorMessage: params.errorMessage ?? null
      });

    const run = this.getXNewsSyncRun(params.runId);
    if (!run) {
      throw new Error(`X news sync run not found: ${params.runId}`);
    }
    return run;
  }

  hasXNewsDelivery(target: string, postId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM x_news_discord_deliveries WHERE target = ? AND post_id = ? LIMIT 1")
      .get(target, postId) as SqlRow | undefined;
    return row !== undefined;
  }

  recordXNewsDelivery(params: {
    deliveryId?: string;
    listId: string;
    target: string;
    postId: string;
    syncRunId: string;
    deliveredAt?: string;
    externalMessageId?: string;
  }): XNewsDeliveryRecord {
    const deliveryId = params.deliveryId ?? crypto.randomUUID();
    const deliveredAt = params.deliveredAt ?? new Date().toISOString();

    this.db
      .prepare(
        `
          INSERT OR IGNORE INTO x_news_discord_deliveries (
            delivery_id,
            list_id,
            target,
            post_id,
            sync_run_id,
            delivered_at,
            external_message_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        deliveryId,
        params.listId,
        params.target,
        params.postId,
        params.syncRunId,
        deliveredAt,
        params.externalMessageId ?? null
      );

    const row = this.db
      .prepare("SELECT * FROM x_news_discord_deliveries WHERE target = ? AND post_id = ?")
      .get(params.target, params.postId) as SqlRow | undefined;
    if (!row) {
      throw new Error(`X news delivery not found after insert: ${params.target} ${params.postId}`);
    }
    return toXNewsDeliveryRecord(row);
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
