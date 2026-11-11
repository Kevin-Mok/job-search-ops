#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';

const { values } = parseArgs({ options: { root: { type: 'string' }, setup: { type: 'boolean' }, check: { type: 'boolean' }, plain: { type: 'boolean' } } });
values.root ??= process.env.JOB_OPS_PORTFOLIO_ROOT;
const label = (emoji, text) => `${values.plain ? '' : `${emoji} `}${text}`;
const manifest = JSON.parse(await fs.readFile(new URL('../fixtures/resume/portfolio-assets.json', import.meta.url), 'utf8'));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
try {
  if (!values.root || Boolean(values.setup) === Boolean(values.check)) throw new Error('Pass --root PATH and exactly one of --setup or --check.');
  const root = path.resolve(values.root);
  let index = 0;
  for (const [relative, expected] of Object.entries(manifest.files)) {
    const file = path.join(root, relative);
    if (values.setup) {
      // Fresh-only destination: never replace an existing portfolio or baseline.
      if (index === 0) {
        try { await fs.mkdir(root, { recursive: false }); }
        catch (error) {
          if (error.code === 'EEXIST') throw new Error('Asset setup requires a new directory; the existing destination is preserved. Use --check to verify it.');
          throw error;
        }
      }
      console.error(label('📥', `Renderer asset ${++index}/${Object.keys(manifest.files).length}: ${relative}`));
      const response = await fetch(`https://raw.githubusercontent.com/Kevin-Mok/nextjs-portfolio-showcase/${manifest.commit}/${relative}`, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Public pinned asset unavailable (${response.status}): ${relative}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (digest(bytes) !== expected) throw new Error(`Pinned renderer asset hash mismatch: ${relative}`);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o444 });
    }
    let bytes;
    try { bytes = await fs.readFile(file); }
    catch { throw new Error(`Missing pinned renderer asset: ${relative}. Run pnpm exec node scripts/resume-ci-assets.mjs --setup --root NEW_DIRECTORY.`); }
    if (digest(bytes) !== expected) throw new Error(`Pinned renderer asset hash mismatch: ${relative}`);
  }
  if (values.check) {
    if (Number(process.versions.node.split('.')[0]) !== 22) throw new Error('CI renderer requires Node 22; use pnpm exec node with the Node22 launcher.');
    for (const tool of ['google-chrome', 'pdfinfo', 'pdffonts', 'pdftotext', 'pdftoppm']) {
      const probe = spawnSync(tool, [tool === 'google-chrome' ? '--version' : '-v'], { encoding: 'utf8', timeout: 10_000 });
      if (probe.error || probe.status !== 0) throw new Error(`Missing renderer dependency: ${tool}. Install Google Chrome stable and poppler-utils.`);
    }
  }
  console.log(label('✅', `Pinned renderer assets ${values.setup ? 'downloaded' : 'verified'}: ${manifest.commit}`));
} catch (error) {
  console.error(label('❌', error.message));
  process.exitCode = 1;
}
