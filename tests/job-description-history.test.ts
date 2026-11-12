import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, test } from 'vitest';
import { JobStore } from '../src/db/store.js';
import { ingestLinkedInEmail } from '../src/core/linkedin-route.js';
import type { DescriptionStatus } from '../src/core/job-description.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const body = 'Responsibilities: Build reliable services and review changes with the engineering team. Requirements: Experience with TypeScript and SQL, testing and collaborative development.';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'description-history-'));
  roots.push(root);
  const store = new JobStore(path.join(root, 'jobs.sqlite'));
  const email = JSON.parse(fs.readFileSync('fixtures/email/linkedin-alert-2026-03-12.json', 'utf8'));
  const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split('\n---\n')[0] }, { fixture: true });
  return { store, id: leadIds[0] };
}

function seedHistorical(store: JobStore, id: string, text: string, status: DescriptionStatus) {
  const content = { ...store.descriptions.template(id), body: text, fullDescriptionConfirmed: true, status, reason: 'Historical classifier decision.', provenance: 'local_manual_paste' as const };
  const versionId = crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');
  const record = { ...content, versionId };
  const db = new Database(store.dbPath);
  db.prepare('INSERT INTO job_description_versions VALUES (?, ?, ?)').run(versionId, id, JSON.stringify(record));
  db.prepare('INSERT INTO job_description_current VALUES (?, ?)').run(id, versionId);
  db.close();
  return record;
}

test.each([
  ['Design intuitive interfaces', 'needs_login'],
  ['download more datasets', 'partial'],
] as const)('historical false positive %s stays readable and held until explicit recapture', (phrase, status) => {
  const { store, id } = setup();
  const old = seedHistorical(store, id, `${body} ${phrase}.`, status);
  const reopened = new JobStore(store.dbPath);
  expect(reopened.descriptions.current(id)).toEqual(old);
  expect(reopened.descriptions.history(id)).toEqual([old]);
  expect(reopened.getLead(id)?.descriptionVersion).toBe(old.versionId);
  expect(reopened.listLeads().find(lead => lead.leadId === id)?.descriptionVersion).toBe(old.versionId);
  expect(() => reopened.descriptions.accepted(id)).toThrow(new RegExp(status));
  const template = reopened.descriptions.template(id);
  expect(template.fullDescriptionConfirmed).toBe(false);
  const replacement = reopened.descriptions.capture({ ...template, body: old.body, fullDescriptionConfirmed: true });
  expect(replacement.status).toBe('complete_operator_confirmed');
  expect(replacement.versionId).not.toBe(old.versionId);
  const restarted = new JobStore(store.dbPath);
  expect(restarted.descriptions.history(id)).toEqual([old, replacement]);
  expect(restarted.descriptions.accepted(id)).toEqual(replacement);
  const db = new Database(store.dbPath);
  expect(db.prepare('SELECT record_json FROM job_description_versions WHERE version_id = ?').get(old.versionId)).toEqual({ record_json: JSON.stringify(old) });
  expect(() => db.prepare('UPDATE job_description_versions SET record_json = ? WHERE version_id = ?').run('{}', old.versionId)).toThrow(/Immutable/);
  db.close();
  restarted.saveLead({ ...restarted.getLead(id)!, title: 'Changed synthetic role' });
  expect(() => restarted.descriptions.accepted(id)).toThrow(/stale/);
});

test.each([
  ['Sign\nin to view this job', 'needs_login'],
  ['Verify that you are\nhuman', 'blocked'],
  ['Show more', 'partial'],
] as const)('historically accepted %s remains readable but current acceptance rejects it', (marker, status) => {
  const { store, id } = setup();
  const old = seedHistorical(store, id, `${body} ${marker}`, 'complete_operator_confirmed');
  const reopened = new JobStore(store.dbPath);
  expect(reopened.descriptions.history(id)).toEqual([old]);
  expect(reopened.descriptions.current(id)).toEqual(old);
  expect(() => reopened.descriptions.accepted(id)).toThrow(new RegExp(status));
  const held = reopened.descriptions.capture({ ...reopened.descriptions.template(id), body: old.body, fullDescriptionConfirmed: true });
  expect(held.status).toBe(status);
  expect(() => reopened.descriptions.accepted(id)).toThrow(new RegExp(status));
  const accepted = reopened.descriptions.capture({ ...reopened.descriptions.template(id), body, fullDescriptionConfirmed: true });
  expect(reopened.descriptions.accepted(id)).toEqual(accepted);
  expect(reopened.descriptions.history(id)).toEqual([old, held, accepted]);
});
