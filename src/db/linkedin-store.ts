import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { LinkedInDeliveryRecord, LinkedInMessageRecord, LinkedInIntakeHold } from "../core/types.js";

export class LinkedInStore {
  constructor(private readonly db: Database.Database, private readonly admitted: (leadId: string) => boolean = () => true) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS linkedin_intake_holds (
        message_id TEXT NOT NULL, version TEXT NOT NULL, record_json TEXT NOT NULL,
        PRIMARY KEY(message_id, version)
      );
      CREATE TABLE IF NOT EXISTS linkedin_posting_observations (
        posting_url TEXT PRIMARY KEY, received_at TEXT NOT NULL, lead_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS linkedin_messages (
        message_id TEXT NOT NULL, version TEXT NOT NULL, received_at TEXT NOT NULL,
        lead_ids_json TEXT NOT NULL, payload_json TEXT NOT NULL,
        PRIMARY KEY(message_id, version)
      );
      CREATE TABLE IF NOT EXISTS linkedin_deliveries (
        target TEXT NOT NULL, lead_id TEXT NOT NULL, record_json TEXT NOT NULL,
        PRIMARY KEY(target, lead_id)
      );
      CREATE TABLE IF NOT EXISTS linkedin_target_backoff (
        target TEXT PRIMARY KEY, retry_at TEXT NOT NULL
      );
    `);
  }

  ingest(params: { messageId: string; version: string; receivedAt: string; payload: unknown }, ingest: () => string[]) {
    return this.db.transaction(() => {
      const row = this.db.prepare("SELECT lead_ids_json FROM linkedin_messages WHERE message_id = ? AND version = ?")
        .get(params.messageId, params.version) as { lead_ids_json: string } | undefined;
      if (row) return { replayed: true, leadIds: JSON.parse(row.lead_ids_json) as string[] };
      const leadIds = [...new Set(ingest())];
      this.db.prepare("INSERT INTO linkedin_messages VALUES (?, ?, ?, ?, ?)")
        .run(params.messageId, params.version, params.receivedAt, JSON.stringify(leadIds), JSON.stringify(params.payload));
      return { replayed: false, leadIds };
    })();
  }

  holdIntake(params: Omit<LinkedInIntakeHold, "status" | "updatedAt">): void {
    const row: LinkedInIntakeHold = { ...params, status: "held", updatedAt: new Date().toISOString() };
    this.db.prepare("INSERT INTO linkedin_intake_holds VALUES (?, ?, ?) ON CONFLICT(message_id, version) DO UPDATE SET record_json = excluded.record_json")
      .run(row.messageId, row.version, JSON.stringify(row));
  }

  resolveIntake(messageId: string, version: string): void {
    const row = this.listIntakeHolds().find(entry => entry.messageId === messageId && entry.version === version);
    if (row) { row.status = "resolved"; row.updatedAt = new Date().toISOString(); this.db.prepare("UPDATE linkedin_intake_holds SET record_json = ? WHERE message_id = ? AND version = ?").run(JSON.stringify(row), messageId, version); }
  }

  listIntakeHolds(): LinkedInIntakeHold[] {
    return (this.db.prepare("SELECT record_json FROM linkedin_intake_holds ORDER BY message_id, version").all() as { record_json: string }[])
      .map(row => JSON.parse(row.record_json) as LinkedInIntakeHold);
  }

  latestPosting(url: string): { receivedAt: string; leadId: string } | undefined {
    const row = this.db.prepare("SELECT received_at, lead_id FROM linkedin_posting_observations WHERE posting_url = ?").get(url) as { received_at: string; lead_id: string } | undefined;
    return row ? { receivedAt: row.received_at, leadId: row.lead_id } : undefined;
  }

  observePosting(url: string, receivedAt: string, leadId: string): void {
    this.db.prepare("INSERT INTO linkedin_posting_observations VALUES (?, ?, ?) ON CONFLICT(posting_url) DO UPDATE SET received_at = excluded.received_at, lead_id = excluded.lead_id")
      .run(url, receivedAt, leadId);
  }

  listMessages(): LinkedInMessageRecord[] {
    const rows = this.db.prepare("SELECT message_id, version, received_at, lead_ids_json FROM linkedin_messages ORDER BY message_id, version")
      .all() as { message_id: string; version: string; received_at: string; lead_ids_json: string }[];
    return rows.map(row => ({ messageId: row.message_id, version: row.version, receivedAt: row.received_at, leadIds: JSON.parse(row.lead_ids_json) as string[] }));
  }

  queue(target: string, leadId: string, held: boolean, now: string): void {
    held = held || !this.admitted(leadId);
    const key = crypto.createHash("sha256").update(`${target}|${leadId}`).digest("hex").slice(0, 24);
    const row: LinkedInDeliveryRecord = {
      target, leadId, key, status: held ? "held" : "pending", attempts: 0, updatedAt: now,
      ...(held ? { lastError: "Existing location policy rejected this posting; held for operator review." } : {})
    };
    this.db.transaction(() => {
      this.db.prepare("INSERT OR IGNORE INTO linkedin_deliveries VALUES (?, ?, ?)").run(target, leadId, JSON.stringify(row));
      const current = this.listDeliveries(target).find(entry => entry.leadId === leadId)!;
      if (["delivered", "blocked"].includes(current.status) || (current.status === "sending" && current.leaseUntil && Date.parse(current.leaseUntil) > Date.parse(now))) return;
      if (held && current.status !== "held") {
        if (current.status === "sending") current.reconcileRequired = true;
        current.status = "held";
        current.lastError = "Current location policy or explicit operator decision holds this posting.";
        current.updatedAt = now;
        this.save(current);
      } else if (!held && current.status === "held") {
        current.status = current.reconcileRequired ? "uncertain" : "pending";
        current.lastError = undefined;
        current.updatedAt = now;
        this.save(current);
      }
    })();
  }

  listDeliveries(target?: string): LinkedInDeliveryRecord[] {
    const rows = (target
      ? this.db.prepare("SELECT record_json FROM linkedin_deliveries WHERE target = ? ORDER BY lead_id").all(target)
      : this.db.prepare("SELECT record_json FROM linkedin_deliveries ORDER BY target, lead_id").all()) as { record_json: string }[];
    return rows.map(row => {
      const value = JSON.parse(row.record_json) as LinkedInDeliveryRecord;
      if (!value || typeof value !== "object" || !["pending", "sending", "retry", "uncertain", "delivered", "held", "blocked"].includes(value.status)
        || typeof value.target !== "string" || typeof value.leadId !== "string" || typeof value.key !== "string"
        || !Number.isSafeInteger(value.attempts) || value.attempts < 0 || !Number.isFinite(Date.parse(value.updatedAt))
        || [value.retryAt, value.leaseUntil].some(date => date !== undefined && !Number.isFinite(Date.parse(date)))) {
        throw new Error("Unsupported LinkedIn delivery record; preserve SQLite and inspect its schema before retry.");
      }
      return value;
    });
  }

  save(row: LinkedInDeliveryRecord): void {
    this.db.prepare("UPDATE linkedin_deliveries SET record_json = ? WHERE target = ? AND lead_id = ?")
      .run(JSON.stringify(row), row.target, row.leadId);
  }

  claim(target: string, leadId: string, now: Date): LinkedInDeliveryRecord | undefined {
    return this.db.transaction(() => {
      const row = this.listDeliveries(target).find(entry => entry.leadId === leadId);
      if (!row || ["delivered", "held", "blocked"].includes(row.status) || !this.admitted(leadId)) return;
      if (row.retryAt && Date.parse(row.retryAt) > now.getTime()) return;
      if (row.status === "sending" && row.leaseUntil && Date.parse(row.leaseUntil) > now.getTime()) return;
      const prior = row.status;
      row.status = "sending";
      row.attempts += 1;
      row.updatedAt = now.toISOString();
      row.leaseUntil = new Date(now.getTime() + 60_000).toISOString();
      // A crashed sender must read remote state before another external write.
      if (prior === "sending" || prior === "uncertain") row.reconcileRequired = true;
      this.save(row);
      return row;
    })();
  }

  deferTarget(target: string, retryAt: string): void {
    this.db.prepare("INSERT INTO linkedin_target_backoff VALUES (?, ?) ON CONFLICT(target) DO UPDATE SET retry_at = excluded.retry_at")
      .run(target, retryAt);
  }

  targetRetryAt(target: string): string | undefined {
    return (this.db.prepare("SELECT retry_at FROM linkedin_target_backoff WHERE target = ?").get(target) as { retry_at: string } | undefined)?.retry_at;
  }
}
