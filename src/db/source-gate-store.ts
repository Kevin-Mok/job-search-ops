import fs from 'node:fs';
import type Database from 'better-sqlite3';
export const ZERO_BUDGET_SOURCES = ['linkedin', 'indeed'] as const;
export function assertSourceBudget(source: string): void {
  throw new Error(`Automated ${source} requests disabled: budget = 0. Alerts are leads only; use local manual paste.`);
}
export class SourceGateStore {
  constructor(private readonly db: Database.Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS job_source_controls (source TEXT PRIMARY KEY, killed INTEGER NOT NULL CHECK(killed IN (0,1)));
      INSERT OR IGNORE INTO job_source_controls VALUES ('global', 1), ('linkedin', 1), ('indeed', 1), ('linkedin_public', 1);
      CREATE TABLE IF NOT EXISTS linkedin_public_control (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0, budget INTEGER NOT NULL DEFAULT 0, last_start REAL, last_completed REAL, cooldown TEXT, owner TEXT);
      INSERT OR IGNORE INTO linkedin_public_control(id) VALUES (1);
      CREATE TABLE IF NOT EXISTS linkedin_public_runs (run_id TEXT PRIMARY KEY, max_requests INTEGER NOT NULL, posting_limit INTEGER NOT NULL, requests INTEGER NOT NULL DEFAULT 0, plan TEXT NOT NULL, discovery TEXT, visited TEXT NOT NULL DEFAULT '[]', stopped TEXT);
      CREATE TABLE IF NOT EXISTS linkedin_public_captures (run_id TEXT NOT NULL, job_id TEXT NOT NULL, record_json TEXT NOT NULL, PRIMARY KEY(run_id, job_id));
      CREATE TABLE IF NOT EXISTS linkedin_public_requests (run_id TEXT NOT NULL, ordinal INTEGER NOT NULL, url TEXT NOT NULL, started_at REAL NOT NULL, status INTEGER, completed_at REAL, PRIMARY KEY(run_id,ordinal));
      CREATE TABLE IF NOT EXISTS linkedin_public_clear_log (cleared_at TEXT NOT NULL, operator TEXT NOT NULL, reason TEXT NOT NULL, previous_block TEXT NOT NULL);`);
  }
  state() {
    const killed = (source: string) => {
      const row = this.db.prepare('SELECT killed FROM job_source_controls WHERE source = ?').get(source) as { killed: number } | undefined;
      if (!row || ![0, 1].includes(row.killed)) throw new Error('Missing/invalid persisted source control; automation held.');
      return row.killed === 1;
    };
    return { globalKilled: killed('global'), sources: { linkedin: { killed: killed('linkedin'), budget: 0 }, indeed: { killed: killed('indeed'), budget: 0 }, linkedin_public: { killed: killed('linkedin_public'), ...this.publicControl() } } };
  }
  publicControl(): { enabled: boolean; budget: number; lastStart: number | null; lastCompleted: number | null; cooldown: string | null; owner: string | null } {
    const row = this.db.prepare('SELECT * FROM linkedin_public_control WHERE id=1').get() as {enabled:number; budget:number; last_start:number|null; last_completed:number|null; cooldown:string|null; owner:string|null} | undefined;
    if (!row || ![0,1].includes(row.enabled) || !Number.isInteger(row.budget) || row.budget < 0 || row.budget > 25 || (row.last_start !== null && !Number.isFinite(row.last_start)) || (row.last_completed !== null && !Number.isFinite(row.last_completed)) || (row.cooldown !== null && typeof row.cooldown !== 'string') || (row.owner !== null && typeof row.owner !== 'string')) throw new Error('Invalid persisted public source control; automation held.');
    return { enabled: row.enabled === 1, budget: row.budget, lastStart: row.last_start, lastCompleted:row.last_completed, cooldown: row.cooldown, owner: row.owner };
  }
  configurePublic(input: { enabled: boolean; budget: number }): void {
    if (typeof input.enabled !== 'boolean' || !Number.isInteger(input.budget) || input.budget < 0 || input.budget > 25) throw new Error('Public enable requires explicit boolean and budget 0–25.');
    this.db.prepare('UPDATE linkedin_public_control SET enabled=?, budget=? WHERE id=1').run(Number(input.enabled), input.budget);
  }
  assertPublic(owner?: string): void {
    if (process.env.JD_CAPTURE_DISABLED === '1' || fs.existsSync('KILL')) throw new Error('MVP emergency kill is active.');
    const state = this.state();
    const control = state.sources.linkedin_public;
    if (control.cooldown) throw new Error('LinkedIn public cooldown: only Kevin can explicitly clear the recorded block.');
    if (state.globalKilled || control.killed) throw new Error('Persisted global/public source kill is active.');
    if (!control.enabled || control.budget === 0) throw new Error('LinkedIn public disabled; explicit enable and nonzero budget required.');
    if (owner !== undefined && control.owner !== owner) throw new Error('Public capture owner changed; stop.');
  }
  acquirePublic(runId: string, owner: string, maxRequests: number, limit: number, plan: string): void {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(runId) || !Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 25 || !Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('Invalid run ID/limits: requests 1–25, postings 1–10.');
    this.db.transaction(() => {
      this.assertPublic();
      if (this.publicControl().owner) throw new Error('Public capture busy; active or interrupted owner requires operator review.');
      const previous = this.db.prepare('SELECT max_requests, posting_limit, plan FROM linkedin_public_runs WHERE run_id=?').get(runId) as {max_requests:number;posting_limit:number;plan:string}|undefined;
      if (previous && (previous.max_requests !== maxRequests || previous.posting_limit !== limit || previous.plan !== plan)) throw new Error('Run plan/limits changed; existing request ledger cannot be reset.');
      this.db.prepare('INSERT OR IGNORE INTO linkedin_public_runs(run_id,max_requests,posting_limit,plan) VALUES(?,?,?,?)').run(runId,maxRequests,limit,plan);
      this.db.prepare('UPDATE linkedin_public_control SET owner=? WHERE id=1').run(owner);
    }).immediate();
  }
  releasePublic(owner: string): void { this.db.prepare('UPDATE linkedin_public_control SET owner=NULL WHERE id=1 AND owner=?').run(owner); }
  publicRunProgress(runId: string): { discovery: string[] | null; visited: string[]; stopped: string | null } {
    const row = this.db.prepare('SELECT discovery,visited,stopped FROM linkedin_public_runs WHERE run_id=?').get(runId) as {discovery:string|null;visited:string;stopped:string|null};
    const ids = (raw: string): string[] => { const value:unknown = JSON.parse(raw); if (!Array.isArray(value) || value.length>10 || value.some(id=>typeof id!=='string'||!/^\d{1,30}$/.test(id))) throw new Error('Invalid persisted public discovery; hold.'); return value; };
    return {discovery:row.discovery===null?null:ids(row.discovery),visited:ids(row.visited),stopped:row.stopped};
  }
  savePublicDiscovery(runId: string, ids: string[]): void { this.db.prepare('UPDATE linkedin_public_runs SET discovery=? WHERE run_id=? AND discovery IS NULL').run(JSON.stringify(ids),runId); }
  visitPublic(runId: string, id: string): void { const previous=this.publicRunProgress(runId).visited;this.db.prepare('UPDATE linkedin_public_runs SET visited=? WHERE run_id=?').run(JSON.stringify([...new Set([...previous,id])]),runId); }
  stopPublicRun(runId: string, reason: string): void { this.db.prepare('UPDATE linkedin_public_runs SET stopped=? WHERE run_id=?').run(reason,runId); }
  publicRequests(runId: string): number {
    const row = this.db.prepare('SELECT requests FROM linkedin_public_runs WHERE run_id=?').get(runId) as {requests:number}|undefined;
    if (!row || !Number.isInteger(row.requests) || row.requests < 0 || row.requests > 25) throw new Error('Invalid public run ledger; hold.');
    return row.requests;
  }
  reservePublicRequest(runId: string, owner: string, now: number, url: string): boolean {
    return this.db.transaction(() => {
      this.assertPublic(owner);
      const row = this.db.prepare('SELECT requests,max_requests FROM linkedin_public_runs WHERE run_id=?').get(runId) as {requests:number;max_requests:number};
      if (row.requests >= Math.min(row.max_requests,this.publicControl().budget)) return false;
      const last = Math.max(this.publicControl().lastStart ?? -Infinity,this.publicControl().lastCompleted ?? -Infinity);
      if (!Number.isFinite(now) || (last !== null && now - last < 15000)) throw new Error('Persisted request start pacing violation.');
      this.db.prepare('UPDATE linkedin_public_runs SET requests=requests+1 WHERE run_id=?').run(runId);
      this.db.prepare('UPDATE linkedin_public_control SET last_start=? WHERE id=1').run(now);
      this.db.prepare('INSERT INTO linkedin_public_requests(run_id,ordinal,url,started_at) VALUES(?,?,?,?)').run(runId,row.requests+1,url,now);
      return true;
    }).immediate();
  }
  completePublicRequest(runId: string, status: number, now: number): void {
    this.db.transaction(() => {
      this.db.prepare('UPDATE linkedin_public_requests SET status=?,completed_at=? WHERE run_id=? AND ordinal=?').run(status,now,runId,this.publicRequests(runId));
      this.db.prepare('UPDATE linkedin_public_control SET last_completed=? WHERE id=1').run(now);
    }).immediate();
  }
  publicRequestLog(runId: string): { url: string; startedAt: number; status: number | null }[] {
    return (this.db.prepare('SELECT url, started_at AS startedAt, status FROM linkedin_public_requests WHERE run_id=? ORDER BY ordinal').all(runId)) as {url:string;startedAt:number;status:number|null}[];
  }
  blockPublic(reason: string): void { this.db.prepare('UPDATE linkedin_public_control SET cooldown=COALESCE(cooldown,?) WHERE id=1').run(reason); }
  clearPublicCooldown(input: { operator: string; reason: string }): void {
    // Local operator attestation, not authentication: workers must never invoke this on real state.
    if (input.operator !== 'Kevin' || !input.reason?.trim()) throw new Error('Only Kevin may explicitly clear the public cooldown with a reason.');
    this.db.transaction(() => {
      const previous = this.publicControl().cooldown;
      if (previous) this.db.prepare('INSERT INTO linkedin_public_clear_log VALUES(?,?,?,?)').run(new Date().toISOString(),input.operator,input.reason,previous);
      this.db.prepare('UPDATE linkedin_public_control SET cooldown=NULL WHERE id=1').run();
    }).immediate();
  }
  publicCaptures(runId: string): unknown[] {
    return (this.db.prepare('SELECT record_json FROM linkedin_public_captures WHERE run_id=? ORDER BY rowid').all(runId) as {record_json:string}[]).map(row=>JSON.parse(row.record_json) as unknown);
  }
  savePublicCapture(runId: string, jobId: string, record: unknown): void {
    this.db.prepare('INSERT OR IGNORE INTO linkedin_public_captures VALUES(?,?,?)').run(runId,jobId,JSON.stringify(record));
  }
  setKill(source: string, killed: boolean): void {
    if (!['global', ...ZERO_BUDGET_SOURCES, 'linkedin_public'].includes(source) || typeof killed !== 'boolean') throw new Error('Source kill requires global/linkedin/indeed/linkedin_public and an explicit boolean.');
    this.db.prepare('UPDATE job_source_controls SET killed = ? WHERE source = ?').run(Number(killed), source);
  }
  assertAutomated(source: string): void {
    const state = this.state();
    if (state.globalKilled) throw new Error('Automated sources disabled by persisted global kill.');
    if (source === 'linkedin' || source === 'indeed') {
      if (state.sources[source].killed) throw new Error(`Automated ${source} requests disabled by persisted source kill; budget = 0.`);
    }
    if (source === 'linkedin_public') { this.assertPublic(); return; }
    return assertSourceBudget(source);
  }
}
