import crypto from 'node:crypto';
import { publicDescriptionText, publicRenderedMarkup, type PublicPosting } from '../core/linkedin-public.js';
import type Database from 'better-sqlite3';
import type { JobLeadRecord } from '../core/types.js';
import { postingVersion } from '../core/job-workflow.js';
import { classifyDescription, type DescriptionDecision } from '../core/job-description.js';

export interface ManualDescriptionInput {
  leadId: string; title: string; company: string; location: string; source: string; sourceURL: string;
  postingFingerprint: string; capturedAt: string; body: string; requirements: string[];
  fullDescriptionConfirmed: boolean; byteCutoff: boolean;
}
export interface DescriptionVersion extends ManualDescriptionInput, DescriptionDecision { versionId: string; provenance: 'local_manual_paste' | 'linkedin_public'; sourceHtml?: string; datePosted?: string | null; dateProvenance?: PublicPosting['dateProvenance'] }
const fingerprint = (lead: JobLeadRecord) => postingVersion({ ...lead, descriptionVersion: undefined });
export class JobDescriptionStore {
  constructor(private readonly db: Database.Database, private readonly lead: (id: string) => JobLeadRecord | undefined) {
    db.exec(`CREATE TABLE IF NOT EXISTS job_description_versions (version_id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, record_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS job_description_current (lead_id TEXT PRIMARY KEY, version_id TEXT NOT NULL);
      CREATE TRIGGER IF NOT EXISTS job_description_no_update BEFORE UPDATE ON job_description_versions BEGIN SELECT RAISE(ABORT, 'Immutable description version'); END;
      CREATE TRIGGER IF NOT EXISTS job_description_no_delete BEFORE DELETE ON job_description_versions BEGIN SELECT RAISE(ABORT, 'Immutable description version'); END;`);
  }
  current(id: string): DescriptionVersion | undefined {
    const row = this.db.prepare('SELECT v.record_json FROM job_description_current c JOIN job_description_versions v USING(version_id) WHERE c.lead_id = ?').get(id) as {record_json: string} | undefined;
    return row ? this.decode(row.record_json) : undefined;
  }
  private decode(json: string): DescriptionVersion {
    const row = JSON.parse(json) as DescriptionVersion;
    const { versionId, ...content } = row;
    if (crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex') !== versionId || !['local_manual_paste', 'linkedin_public'].includes(row.provenance)) throw new Error('Corrupt description provenance; preserve the database and recapture locally.');
    return row;
  }
  template(id: string): ManualDescriptionInput {
    const lead = this.lead(id);
    if (!lead) throw new Error('Manual capture requires an existing held canonical job.');
    return { leadId: id, title: lead.title, company: lead.company, location: lead.locationRaw, source: lead.source, sourceURL: lead.canonicalUrl, postingFingerprint: fingerprint(lead), capturedAt: new Date().toISOString(), body: '', requirements: [], fullDescriptionConfirmed: false, byteCutoff: false };
  }
  capture(input: ManualDescriptionInput): DescriptionVersion {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Description input must be a local JSON object.');
    return this.db.transaction(() => {
      const lead = this.lead(input.leadId);
      if (!lead) throw new Error('Manual capture requires an existing held canonical job.');
      if (input.fullDescriptionConfirmed !== true) throw new Error('Explicit full-description confirmation is required.');
      for (const key of ['title', 'company', 'location', 'source', 'sourceURL', 'postingFingerprint'] as const) {
        if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 4000) throw new Error(`Invalid supported identity field: ${key}.`);
        const expected = this.template(lead.leadId)[key];
        if (input[key] !== expected) throw new Error(`Job identity changed: ${key}; obtain a fresh prefilled template.`);
      }
      if (typeof input.body !== 'string' || !Array.isArray(input.requirements) || input.requirements.length > 200 || input.requirements.some(v => typeof v !== 'string' || !v.trim() || v.length > 2000 || !input.body.includes(v)) || typeof input.byteCutoff !== 'boolean' || typeof input.capturedAt !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(input.capturedAt) || !Number.isFinite(Date.parse(input.capturedAt)) || Date.parse(input.capturedAt) > Date.now() + 60_000) throw new Error('Invalid body/requirements/captured-at/cutoff fields; requirements must be exact body quotes and capture time cannot be future.');
      const url = new URL(input.sourceURL);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Source URL must be public HTTPS provenance.');
      const decision = classifyDescription({ text: input.body, format: 'text', source: input.source, operatorConfirmed: true, byteCutoff: input.byteCutoff });
      // Construct explicitly: untrusted input cannot overwrite persisted decisions or provenance.
      const content = { leadId: lead.leadId, title: input.title, company: input.company, location: input.location, source: input.source, sourceURL: input.sourceURL, postingFingerprint: input.postingFingerprint, capturedAt: input.capturedAt, body: input.body, requirements: input.requirements, fullDescriptionConfirmed: true, byteCutoff: input.byteCutoff, ...decision, provenance: 'local_manual_paste' as const };
      const versionId = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
      const record = { ...content, versionId };
      this.db.prepare('INSERT OR IGNORE INTO job_description_versions VALUES (?, ?, ?)').run(versionId, lead.leadId, JSON.stringify(record));
      const existing = this.db.prepare('SELECT version_id FROM job_description_current WHERE lead_id = ?').get(lead.leadId) as {version_id: string} | undefined;
      // Replaying historical content must never move the current pointer backwards.
      const latest = this.history(lead.leadId).at(-1);
      if (!existing || latest?.versionId === versionId) this.db.prepare('INSERT INTO job_description_current VALUES (?, ?) ON CONFLICT(lead_id) DO UPDATE SET version_id=excluded.version_id').run(lead.leadId, versionId);
      return record;
    })();
  }
  capturePublic(leadId: string, input: PublicPosting): DescriptionVersion {
    return this.db.transaction(() => {
      const template = this.template(leadId);
      if (input.source !== 'linkedin_public' || input.url !== template.sourceURL || input.title !== template.title && input.title !== '' || input.company !== template.company && input.company !== '' || input.location !== template.location && input.location !== '' || typeof input.descriptionHtml !== 'string' || typeof input.description !== 'string' || input.description.length > 128*1024 || publicDescriptionText(input.descriptionHtml) !== input.description || !Number.isFinite(Date.parse(input.capturedAt)) || Date.parse(input.capturedAt) > Date.now()+60_000) throw new Error('Public description identity/provenance mismatch.');
      const decision = classifyDescription({ text: publicRenderedMarkup(input.descriptionHtml), format: 'html', source: 'linkedin', byteCutoff: input.byteCutoff });
      // Public capture never claims an operator confirmed it. More conservative parser holds win.
      const content = { ...template, capturedAt: input.capturedAt, body: input.description, requirements: [], fullDescriptionConfirmed: false, byteCutoff: input.byteCutoff,
        ...(decision.status === 'complete' && !['complete','complete_operator_confirmed'].includes(input.completeness.status) ? input.completeness : decision), provenance: 'linkedin_public' as const,
        sourceHtml: input.descriptionHtml, datePosted: input.datePosted, dateProvenance: input.dateProvenance };
      const versionId = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
      const record = { ...content, versionId };
      this.db.prepare('INSERT OR IGNORE INTO job_description_versions VALUES (?, ?, ?)').run(versionId,leadId,JSON.stringify(record));
      const latest = this.history(leadId).at(-1);
      if (latest?.versionId === versionId) this.db.prepare('INSERT INTO job_description_current VALUES (?, ?) ON CONFLICT(lead_id) DO UPDATE SET version_id=excluded.version_id').run(leadId,versionId);
      return record;
    })();
  }
  history(id: string): DescriptionVersion[] {
    const rows = this.db.prepare('SELECT record_json FROM job_description_versions WHERE lead_id = ? ORDER BY rowid').all(id) as { record_json: string }[];
    return rows.map(row => this.decode(row.record_json));
  }
  accepted(id: string): DescriptionVersion {
    const row = this.current(id);
    const lead = this.lead(id);
    if (!row) throw new Error('Description held: alert text is lead/snippet only. Capture and confirm a full local description.');
    if (!lead || row.postingFingerprint !== fingerprint(lead)) throw new Error('Description stale: posting changed; recapture the current full description.');
    if (!['complete', 'complete_operator_confirmed'].includes(row.status)) throw new Error(`Description held: ${row.status}. ${row.reason}`);
    const decision = classifyDescription({ text: row.provenance === 'linkedin_public' ? publicRenderedMarkup(row.sourceHtml ?? '') : row.body, format: row.provenance === 'linkedin_public' ? 'html' : 'text', source: row.source, operatorConfirmed: row.fullDescriptionConfirmed, byteCutoff: row.byteCutoff });
    if (!['complete', 'complete_operator_confirmed'].includes(decision.status)) throw new Error(`Description held: ${decision.status}. ${decision.reason}`);
    return row;
  }
}
