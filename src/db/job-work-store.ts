import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { JobWorkRecord, JobEligibility } from "../core/job-workflow.js";

export class JobWorkStore {
  constructor(private readonly db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS job_work (
        work_id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, posting_version TEXT NOT NULL,
        target TEXT NOT NULL, record_json TEXT NOT NULL,
        UNIQUE(lead_id, posting_version, target)
      );
      CREATE TABLE IF NOT EXISTS job_eligibility_decisions (
        lead_id TEXT NOT NULL, posting_version TEXT NOT NULL, eligibility TEXT NOT NULL,
        reason TEXT NOT NULL, decided_at TEXT NOT NULL,
        PRIMARY KEY(lead_id, posting_version)
      );
    `);
  }
  decideEligibility(params: { leadId: string; postingVersion: string; eligibility: JobEligibility; reason: string }): void {
    if (!["eligible", "ineligible", "needs_review"].includes(params.eligibility) || !params.reason.trim()) throw new Error("Eligibility requires a valid explicit decision and review reason.");
    this.db.prepare(`INSERT INTO job_eligibility_decisions VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(lead_id, posting_version) DO UPDATE SET eligibility = excluded.eligibility, reason = excluded.reason, decided_at = excluded.decided_at`)
      .run(params.leadId, params.postingVersion, params.eligibility, params.reason, new Date().toISOString());
  }
  decision(leadId: string, version: string): { eligibility: JobEligibility; reason: string } | undefined {
    return this.db.prepare("SELECT eligibility, reason FROM job_eligibility_decisions WHERE lead_id = ? AND posting_version = ?")
      .get(leadId, version) as { eligibility: JobEligibility; reason: string } | undefined;
  }
  ensure(row: Omit<JobWorkRecord, "workId">): JobWorkRecord {
    const workId = crypto.createHash("sha256").update(`${row.target}|${row.leadId}|${row.postingVersion}`).digest("hex");
    this.db.prepare("INSERT OR IGNORE INTO job_work VALUES (?, ?, ?, ?, ?)")
      .run(workId, row.leadId, row.postingVersion, row.target, JSON.stringify({ ...row, workId }));
    return this.get(workId)!;
  }
  get(workId: string): JobWorkRecord | undefined {
    const row = this.db.prepare("SELECT record_json FROM job_work WHERE work_id = ?").get(workId) as { record_json: string } | undefined;
    if (!row) return undefined;
    const value = JSON.parse(row.record_json) as JobWorkRecord;
    if (value.schemaVersion !== 1 || value.workId !== workId || !value.leadId || !value.postingVersion) throw new Error("Unsupported job-work record; preserve the database and inspect its schema version.");
    return value;
  }
  list(): JobWorkRecord[] {
    const rows = this.db.prepare("SELECT work_id FROM job_work ORDER BY lead_id, posting_version, target").all() as { work_id: string }[];
    return rows.map(row => this.get(row.work_id)!);
  }
  save(row: JobWorkRecord): void {
    this.db.prepare("UPDATE job_work SET record_json = ? WHERE work_id = ?").run(JSON.stringify(row), row.workId);
  }
  claim(workId: string): JobWorkRecord | undefined {
    return this.db.transaction(() => {
      const row = this.get(workId);
      if (!row || (row.leaseUntil && Date.parse(row.leaseUntil) > Date.now())) return;
      row.leaseUntil = new Date(Date.now() + 5 * 60_000).toISOString();
      this.save(row);
      return row;
    })();
  }
}
