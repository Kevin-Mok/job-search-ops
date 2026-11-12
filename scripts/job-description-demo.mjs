#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { 'output-dir': { type: 'string' }, 'portfolio-root': { type: 'string' }, phase: { type: 'string' }, 'approve-visual': { type: 'boolean' }, plain: { type: 'boolean' } } });
const badge = values.plain ? '' : '🧪 ';
try {
  if (!values['output-dir'] || !['prepare', 'verify', 'state'].includes(values.phase)) throw new Error('Pass --output-dir PRIVATE_DIR and --phase prepare|verify|state.');
  const dir = path.resolve(values['output-dir']);
  const marker = path.join(dir, 'description-demo.json');
  if (fs.existsSync(dir) && fs.readdirSync(dir).length && !fs.existsSync(marker)) throw new Error('Choose an empty output directory; existing non-demo files are preserved.');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const write = (name, value) => { const file = path.join(dir, name); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); return file; };
  if (!fs.existsSync(marker)) write('description-demo.json', { version: 1, synthetic: true });
  const db = path.join(dir, 'jobs.sqlite');
  const transport = ['--transport', 'fixture', '--journal', path.join(dir, 'discord.json')];
  const cli = (command, args = [], expected = 0) => {
    process.stderr.write(`${badge}${command}\n`);
    const result = spawnSync(process.execPath, ['dist/src/cli.js', command, '--db', db, ...(values.plain ? ['--plain'] : []), ...args], { encoding: 'utf8', timeout: 90_000, stdio: ['ignore', 'pipe', 'inherit'] });
    if (result.stderr) process.stderr.write(result.stderr);
    fs.appendFileSync(path.join(dir, 'cli-receipts.jsonl'), JSON.stringify({ command, args, expected, status: result.status, stdout: result.stdout, stderr: result.stderr }) + '\n', { mode: 0o600 });
    assert.equal(result.status, expected, `${command}: ${result.stderr}`);
    return result.stdout.trim() ? JSON.parse(result.stdout) : undefined;
  };
  const evidence = write('synthetic-evidence.json', [{ id: 'synthetic-approved', approved: true, claim: 'Built **Python** validation fixtures.', skills: ['python'], source: 'synthetic://approved/commit' }]);
  const candidate = write('synthetic-candidate.json', { name: 'Synthetic Candidate', email: 'synthetic@example.test' });
  const workArgs = [...transport, '--candidate', candidate, '--evidence', evidence, '--private-dir', path.join(dir, 'private')];
  const approve = id => cli('linkedin-eligibility', ['--lead-id', id, '--status', 'eligible', '--note', 'Synthetic operator reviewed all hard requirements.']);
  const body = 'About the role\nMaintain synthetic Python validation services with the engineering team.\nResponsibilities\nWrite tests, review changes and document behavior.\nRequirements\nExperience with Python and TypeScript is required.\nBenefits\nFlexible hours.\nHow to apply\nApply through the employer portal.';
  if (values.phase === 'state') {
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'prepared-proof.json'), 'utf8'));
    process.stdout.write(JSON.stringify(cli('description-state', ['--lead-id', saved.leadId]), null, 2) + '\n');
  } else if (values.phase === 'prepare') {
    if (!values['portfolio-root']) throw new Error('--portfolio-root must name the pinned read-only renderer assets.');
    if (fs.existsSync(path.join(dir, 'prepared-proof.json'))) throw new Error('Prepare already completed; inspect its PNG and continue with verify, or choose a fresh directory.');
    const email = JSON.parse(fs.readFileSync('fixtures/email/linkedin-alert-2026-03-12.json', 'utf8'));
    email.textBody = email.textBody.split('\n---\n')[0];
    const intake = cli('linkedin-intake', [...transport, '--fixture', '--email-file', write('synthetic-email.json', email)]);
    const leadId = intake.intake.leadIds[0];
    assert.deepEqual(cli('source-gate').sources, { linkedin: { killed: true, budget: 0 }, indeed: { killed: true, budget: 0 } });
    cli('source-gate', ['--source', 'global', '--killed', 'false']);
    cli('source-gate', ['--source', 'indeed', '--killed', 'false']);
    assert.equal(cli('source-gate').sources.indeed.budget, 0);
    cli('sync-indeed', ['--config', path.resolve('config/indeed-alerts.example.json'), '--alert-id', 'call-centre-canada-remote'], 1);
    cli('source-gate', ['--source', 'global', '--killed', 'true']);
    cli('source-gate', ['--source', 'indeed', '--killed', 'true']);
    const templatePath = path.join(dir, 'paste-review.json');
    cli('description-template', ['--lead-id', leadId, '--output', templatePath]);
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    cli('description-capture', ['--input', templatePath], 1);
    for (const [text, expected] of [['Snippet…', 'partial'], ['Sign in to view this job', 'needs_login'], ['Verify you are human CAPTCHA', 'blocked'], ['This job has expired', 'expired'], ['Unknown layout body', 'layout_unknown'], [body, 'partial']]) {
      write('paste-review.json', { ...template, body: text, fullDescriptionConfirmed: true, byteCutoff: text === body });
      assert.equal(cli('description-capture', ['--input', templatePath]).status, expected);
      approve(leadId);
      const currentVersion = cli('description-state', ['--lead-id', leadId]).currentVersion;
      const current = cli('linkedin-work', workArgs).find(row => row.descriptionVersion === currentVersion);
      assert.equal(current.status, 'blocked');
      assert.equal(current.preparedPath, undefined);
    }
    write('paste-review.json', { ...template, body, fullDescriptionConfirmed: true });
    const accepted = cli('description-capture', ['--input', templatePath]);
    assert.equal(accepted.status, 'complete_operator_confirmed');
    approve(leadId);
    const work = cli('linkedin-work', [...workArgs, '--render', '--portfolio-root', path.resolve(values['portfolio-root'])]).find(row => row.descriptionVersion === accepted.versionId);
    assert.equal(work.status, 'awaiting_visual_review');
    const proof = { leadId, workId: work.workId, descriptionVersion: accepted.versionId, sha256: work.artifact.sha256, previewPath: work.artifact.previewPath, pdfPath: work.artifact.pdfPath, status: work.status, fit: work.fit.score };
    write('prepared-proof.json', proof);
    process.stdout.write(JSON.stringify(proof, null, 2) + '\n');
  } else {
    if (!values['approve-visual'] || !values['portfolio-root']) throw new Error('Inspect prepared-proof.json previewPath first; then pass --approve-visual and --portfolio-root.');
    if (fs.existsSync(path.join(dir, 'verified-proof.json'))) {
      process.stdout.write(fs.readFileSync(path.join(dir, 'verified-proof.json'), 'utf8'));
      process.exit(0);
    }
    const proof = JSON.parse(fs.readFileSync(path.join(dir, 'prepared-proof.json'), 'utf8'));
    const pdfHash = crypto.createHash('sha256').update(fs.readFileSync(proof.pdfPath)).digest('hex');
    assert.equal(pdfHash, proof.sha256);
    const attached = cli('linkedin-attach', [...transport, '--work-id', proof.workId, '--sha256', proof.sha256, '--approve-visual', '--portfolio-root', path.resolve(values['portfolio-root'])]);
    assert.equal(attached.status, 'delivered');
    const firstHistory = cli('description-state', ['--lead-id', proof.leadId]).versions;
    const firstInput = JSON.parse(fs.readFileSync(path.join(dir, 'paste-review.json'), 'utf8'));
    const secondPath = write('second-paste.json', { ...firstInput, body: body + '\nAdditional responsibility: review synthetic regression reports.' });
    const second = cli('description-capture', ['--input', secondPath]);
    assert.notEqual(second.versionId, proof.descriptionVersion);
    approve(proof.leadId);
    const nextWork = cli('linkedin-work', workArgs).find(row => row.descriptionVersion === second.versionId);
    assert.equal(nextWork.status, 'prepared');
    const before = fs.readFileSync(nextWork.preparedPath);
    cli('codex-resume-plan', ['--work-id', proof.workId, '--private-dir', path.join(dir, 'private')], 1);
    cli('linkedin-attach', [...transport, '--work-id', proof.workId, '--sha256', proof.sha256, '--approve-visual', '--portfolio-root', path.resolve(values['portfolio-root'])], 1);
    cli('description-capture', ['--input', path.join(dir, 'paste-review.json')]);
    assert.equal(cli('description-state', ['--lead-id', proof.leadId]).currentVersion, second.versionId);
    const partialPath = write('partial-paste.json', { ...firstInput, body: body + '\nLoad more' });
    const partial = cli('description-capture', ['--input', partialPath]);
    assert.equal(partial.status, 'partial');
    approve(proof.leadId);
    const held = cli('linkedin-work', workArgs).find(row => row.descriptionVersion === partial.versionId);
    assert.equal(held.status, 'blocked');
    assert.equal(held.preparedPath, undefined);
    cli('codex-resume-plan', ['--work-id', nextWork.workId, '--private-dir', path.join(dir, 'private')], 1);
    const history = cli('description-state', ['--lead-id', proof.leadId]);
    assert.deepEqual(history.versions.slice(0, firstHistory.length), firstHistory);
    assert.deepEqual(fs.readFileSync(nextWork.preparedPath), before);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(proof.pdfPath)).digest('hex'), proof.sha256);
    const result = { productionSends: 0, modelCalls: 0, historyPreserved: true, staleWorkDenied: true, partialHeld: true, fixtureAttachment: attached.status, sha256: proof.sha256, currentVersion: history.currentVersion, versions: history.versions.length };
    write('verified-proof.json', result);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  }
} catch (error) {
  process.stderr.write(`${values.plain ? '' : '❌ '}${error.message}\n`);
  process.exitCode = 1;
}
