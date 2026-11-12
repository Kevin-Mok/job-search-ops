import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import { JobStore } from '../src/db/store.js';
import { ingestLinkedInEmail, drainLinkedInAlerts } from '../src/core/linkedin-route.js';
import { processLinkedInWork, postingVersion } from '../src/core/job-workflow.js';
import { createDiscordLinkedInTransport, createFixtureLinkedInTransport } from '../src/discord/linkedin-transport.js';
import { syncIndeedAlert } from '../src/core/indeed-sync.js';
import { createOpenClawIndeedPageFetcher } from '../src/core/openclaw-browser.js';
import { classifyDescription } from '../src/core/job-description.js';

const email = JSON.parse(fs.readFileSync('fixtures/email/linkedin-alert-2026-03-12.json', 'utf8'));
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'description-'));
  const store = new JobStore(path.join(dir, 'jobs.sqlite'));
  const { leadIds } = ingestLinkedInEmail(store, { ...email, textBody: email.textBody.split('\n---\n')[0] }, { fixture: true });
  return { dir, store, lead: store.getLead(leadIds[0])! };
}
const body = 'About the role\nDevelop and maintain synthetic validation systems with the engineering team.\nResponsibilities\nImplement tests and review changes.\nRequirements\nExperience with TypeScript and SQL.\nBenefits\nFlexible schedule.\nHow to apply\nSubmit a resume to the employer.';

test.each(['linkedin', 'indeed'] as const)('%s classifier consumes synthetic HTML only', source => {
  for (const [name, status] of Object.entries({ normal: 'complete', expanded: 'complete', truncated: 'partial', login: 'needs_login', challenge: 'blocked', expired: 'expired', changed: 'layout_unknown' })) {
    const html = fs.readFileSync(`fixtures/descriptions/${source}-${name}.html`, 'utf8');
    expect(classifyDescription({ text: html, format: 'html', source }).status).toBe(status);
  }
  expect(classifyDescription({ text: body, format: 'text', source, operatorConfirmed: true, byteCutoff: true }).status).toBe('partial');
  expect(classifyDescription({ text: 'Job snippet with all the fields', format: 'text', source }).status).toBe('partial');
});

test('held canonical prefill, explicit confirmation, immutable replay/restart/history and stale posting', () => {
  const { store, lead } = setup();
  const template = store.descriptions.template(lead.leadId);
  expect(template).toMatchObject({ leadId: lead.leadId, title: lead.title, company: lead.company, location: lead.locationRaw, sourceURL: lead.canonicalUrl, fullDescriptionConfirmed: false });
  expect(() => store.descriptions.capture({ ...template, body })).toThrow(/confirm/i);
  const first = store.descriptions.capture({ ...template, body, fullDescriptionConfirmed: true });
  expect(first.status).toBe('complete_operator_confirmed');
  expect(store.descriptions.capture({ ...template, body, fullDescriptionConfirmed: true })).toEqual(first);
  const restarted = new JobStore(store.dbPath);
  expect(restarted.descriptions.history(lead.leadId)).toEqual([first]);
  expect(restarted.descriptions.accepted(lead.leadId).versionId).toBe(first.versionId);
  const held = restarted.descriptions.capture({ ...template, body: body + '\nShow more', fullDescriptionConfirmed: true });
  expect(held.status).toBe('partial');
  expect(() => restarted.descriptions.accepted(lead.leadId)).toThrow(/partial/i);
  const second = restarted.descriptions.capture({ ...template, capturedAt: '2026-11-12T03:00:01.000Z', body: body + '\nAn additional complete responsibility.', fullDescriptionConfirmed: true });
  expect(second.versionId).not.toBe(first.versionId);
  expect(restarted.descriptions.history(lead.leadId)[0]).toEqual(first);
  restarted.saveLead({ ...lead, title: 'Changed title' });
  expect(() => restarted.descriptions.accepted(lead.leadId)).toThrow(/changed|stale/i);
  expect(() => restarted.descriptions.capture({ ...template, body, fullDescriptionConfirmed: true })).toThrow(/changed|identity/i);
});

test('legacy approved work holds without outputs, accepted work binds exact description and later partial invalidates it', async () => {
  const { dir, store, lead } = setup();
  const transport = createFixtureLinkedInTransport(path.join(dir, 'journal.json'));
  await drainLinkedInAlerts({ store, transport });
  const approve = () => store.work.decideEligibility({ leadId: lead.leadId, postingVersion: postingVersion(store.getLead(lead.leadId)!), eligibility: 'eligible', reason: 'Synthetic operator review' });
  approve();
  const params = { store, transport, privateDir: path.join(dir, 'private'), candidate: { name: 'Synthetic Candidate', email: 'synthetic@example.test' }, evidence: [{ id: 'synthetic', approved: true, claim: 'Built synthetic validation systems.', skills: ['typescript'], source: 'synthetic://approved' }] };
  const [held] = await processLinkedInWork(params);
  expect(held.status).toBe('blocked');
  expect(held.preparedPath).toBeUndefined();
  expect(held.lastError).toMatch(/description/i);
  const template = store.descriptions.template(lead.leadId);
  const accepted = store.descriptions.capture({ ...template, body, fullDescriptionConfirmed: true });
  approve();
  const ready = (await processLinkedInWork(params)).find(row => row.descriptionVersion === accepted.versionId)!;
  expect(ready.status).toBe('prepared');
  expect(JSON.parse(fs.readFileSync(ready.codexHandoffPath!, 'utf8')).untrustedPostingText).toBe(body);
  store.descriptions.capture({ ...template, body: 'Sign in to view this job', fullDescriptionConfirmed: true });
  const current = await processLinkedInWork(params);
  expect(current.find(row => row.workId === ready.workId)?.status).toBe('blocked');
});

test('persisted source kills and zero automated Indeed/LinkedIn requests including sync and direct adapter', async () => {
  const { store } = setup();
  expect(store.sources.state()).toMatchObject({ globalKilled: true, sources: { linkedin: { killed: true, budget: 0 }, indeed: { killed: true, budget: 0 } } });
  store.sources.setKill('global', false);
  store.sources.setKill('indeed', false);
  expect(new JobStore(store.dbPath).sources.state().globalKilled).toBe(false);
  const request = vi.fn(async () => { throw new Error('must never request'); });
  for (const source of ['linkedin', 'indeed']) expect(() => store.sources.assertAutomated(source)).toThrow(/budget.*0|disabled/i);
  const alert = { id: 'synthetic', enabled: true, label: 'synthetic', searchUrl: 'https://ca.indeed.com/jobs?q=synthetic', discordTarget: 'fixture:test', maxPages: 1 };
  await expect(syncIndeedAlert({ store, alert, pageFetcher: { fetchSearchPage: request, fetchDetailPage: request, close: request } })).rejects.toThrow(/budget.*0|disabled/i);
  expect(() => createOpenClawIndeedPageFetcher({ alert, runCommand: request, loadAuthCredentials: request })).toThrow(/budget.*0|disabled/i);
  expect(request).not.toHaveBeenCalled();
});

test('real attachment boundary refuses arbitrary bytes before any transport request', async () => {
  const request = vi.fn(async () => { throw new Error('must never request'); });
  const transport = createDiscordLinkedInTransport({ token: 'synthetic-token', channelId: '123456789012345678', fetcher: request });
  await expect(transport.sendAttachment!({ threadId: '123456789012345679', key: 'synthetic', filename: 'synthetic.pdf', bytes: Buffer.from('%PDF synthetic'), sha256: 'a'.repeat(64) })).rejects.toThrow(/disabled|local/i);
  expect(request).not.toHaveBeenCalled();
});

test('encoded truncation, cutoff HTML and surrounding page text cannot establish a complete body', () => {
  const complete = '<html><section id="jobDescriptionText"><h2>Responsibilities</h2><p>Build synthetic services and review changes with the engineering team.</p><h2>Requirements</h2><p>Experience with TypeScript and SQL.</p></section></html>';
  expect(classifyDescription({ text: complete.replace('</section>', '&#x2026;</section>'), format: 'html', source: 'indeed' }).status).toBe('partial');
  expect(classifyDescription({ text: complete.replace('</html>', ''), format: 'html', source: 'indeed' }).status).toBe('partial');
  const empty = '<html><nav>' + 'Synthetic navigation text. '.repeat(20) + '</nav><section id="jobDescriptionText"><h2>Responsibilities</h2><h2>Requirements</h2></section></html>';
  expect(classifyDescription({ text: empty, format: 'html', source: 'indeed' }).status).not.toBe('complete');
});

test('manual capture validates supported identity, timestamps and exact requirement quotes', () => {
  const { store, lead } = setup();
  const input = { ...store.descriptions.template(lead.leadId), body, fullDescriptionConfirmed: true };
  for (const change of [{ title: '' }, { company: 'Other employer' }, { location: 'Other location' }, { source: 'other' }, { sourceURL: 'http://example.test/job' }, { requirements: ['Not present in body'] }, { capturedAt: 'tomorrow' }, { capturedAt: new Date(Date.now() + 120_000).toISOString() }]) {
    expect(() => store.descriptions.capture({ ...input, ...change })).toThrow(/identity|field|Invalid|changed/);
  }
  expect(() => store.descriptions.capture(null as never)).toThrow(/input.*object/i);
  expect(store.descriptions.history(lead.leadId)).toEqual([]);
});

test('real transport refusal does not even read attachment payload bytes', async () => {
  let reads = 0;
  const transport = createDiscordLinkedInTransport({ token: 'synthetic-token', channelId: '123456789012345678', fetcher: async () => { throw new Error('must never request'); } });
  const payload = { threadId: '123456789012345679', key: 'synthetic', filename: 'synthetic.pdf', sha256: 'a'.repeat(64), get bytes(): Buffer { reads++; throw new Error('must not read resume bytes'); } };
  await expect(transport.sendAttachment!(payload)).rejects.toThrow(/disabled/);
  expect(reads).toBe(0);
});
