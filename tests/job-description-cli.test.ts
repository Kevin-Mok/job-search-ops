import { JobStore } from '../src/db/store.js';
import { ingestLinkedInEmail, drainLinkedInAlerts } from '../src/core/linkedin-route.js';
import { queueLinkedInWork, postingVersion } from '../src/core/job-workflow.js';
import { createFixtureLinkedInTransport } from '../src/discord/linkedin-transport.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, test } from 'vitest';

test.runIf(Boolean(process.env.JOB_OPS_PORTFOLIO_ROOT))('actual CLI full-paste/PDF/history/restart/invalidation proof', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'description-cli-'));
  const run = (phase: string) => {
    const result = spawnSync(process.execPath, ['scripts/job-description-demo.mjs', '--output-dir', dir, '--portfolio-root', process.env.JOB_OPS_PORTFOLIO_ROOT!, '--phase', phase, ...(phase === 'verify' ? ['--approve-visual'] : [])], { encoding: 'utf8', timeout: 60_000 });
    expect(result.status, result.stderr + result.stdout).toBe(0);
    return JSON.parse(result.stdout);
  };
  const prepared = run('prepare');
  expect(prepared.status).toBe('awaiting_visual_review');
  expect(fs.existsSync(prepared.previewPath)).toBe(true);
  const verified = run('verify');
  expect(verified).toMatchObject({ productionSends: 0, modelCalls: 0, historyPreserved: true, staleWorkDenied: true, partialHeld: true, fixtureAttachment: 'delivered' });
}, 120_000);


test('legacy persisted fields and direct CLI work/plan/attachment cannot bypass missing completeness', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'description-legacy-cli-'));
  const store = new JobStore(path.join(dir, 'jobs.sqlite'));
  const journal = path.join(dir, 'journal.json');
  const transport = createFixtureLinkedInTransport(journal);
  const email = JSON.parse(fs.readFileSync('fixtures/email/linkedin-alert-2026-03-12.json', 'utf8'));
  const { leadIds: [leadId] } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split('\n---\n')[0] }, { fixture: true });
  await drainLinkedInAlerts({ store, transport });
  const lead = store.getLead(leadId)!;
  store.saveLead({ ...lead, draftPacket: { ...lead.draftPacket, tailoredSummary: 'Old synthetic stale statement.', coverLetterDraft: 'Old synthetic unapproved claim.' } });
  store.work.decideEligibility({ leadId, postingVersion: postingVersion(lead), eligibility: 'eligible', reason: 'Historical synthetic review' });
  const [work] = queueLinkedInWork(store, transport.target);
  work.status = 'prepared';
  work.preparedPath = path.join(dir, 'must-not-read-prepared.json');
  work.codexHandoffPath = path.join(dir, 'must-not-read-handoff.json');
  work.codexStatus = 'awaiting_authorized_dispatch';
  store.work.save(work);
  const cli = (command: string, args: string[] = []) => spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', command, '--db', store.dbPath, ...args], { encoding: 'utf8', timeout: 30_000 });
  for (const [command, args] of [
    ['draft-packet', ['--lead-id', leadId]],
    ['codex-resume-plan', ['--work-id', work.workId, '--private-dir', dir]],
    ['linkedin-attach', ['--work-id', work.workId, '--sha256', 'a'.repeat(64), '--approve-visual', '--portfolio-root', dir, '--transport', 'fixture', '--journal', journal]]
  ] as [string, string[]][]) {
    const result = cli(command, args);
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toMatch(/description/i);
    expect(result.stdout).toBe('');
  }
  const result = cli('linkedin-work', ['--transport', 'fixture', '--journal', journal, '--private-dir', dir]);
  expect(result.status, result.stderr).toBe(0);
  const held = JSON.parse(result.stdout)[0];
  expect(held.status).toBe('blocked');
  expect(held.lastError).toMatch(/description/i);
  expect(fs.existsSync(work.preparedPath)).toBe(false);
  const shown = cli('show-lead', ['--lead-id', leadId]);
  expect(shown.status, shown.stderr).toBe(0);
  expect(JSON.parse(shown.stdout).draftPacket).toMatchObject({ tailoredSummary: '', coverLetterDraft: '', screenerAnswerDrafts: [] });
});
