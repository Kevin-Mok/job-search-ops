# Signed-out LinkedIn public capture

Capture Toronto software-engineer postings or locally supplied job IDs into the existing private job database, review completeness and eligibility, then prepare a CMU résumé and its thread handoff. Enable the new source explicitly, keep the same database across runs, and leave delivery disabled until separately authorized. This route has no browser, login, mailbox client, cookies, proxies or Indeed requests.

## Source controls and storage

`linkedin_public` is separate from the `linkedin` browser and `indeed` sources. It starts killed, disabled and with zero budget. The latter two sources retain immutable zero budgets even if their kills are cleared. The persisted global kill applies to all three. `JD_CAPTURE_DISABLED=1` or a `KILL` file in the working directory also stops public capture. Kill checks occur before each request and every second while pacing. In-flight requests finish or time out; no new request follows a kill.

Use one authoritative private SQLite database for the source; never choose a fresh database or run ID to escape a cooldown or interrupted owner. Enabling/configuring never clears kills, cooldown, request counts, receipts or owner state. Each run ID binds its mode, IDs, user agent and limits. Reopening it preserves discovered IDs, visited IDs, completed captures, request budget and prior network/block stop. A different run still shares the persisted timing/cooldown. Only one capture owner is admitted. A process crash leaves ownership held for explicit operator review; there is no automatic stale-owner reclaim or worker recovery command.

The transport uses Node22 direct HTTPS with a fixed honest configurable user agent and fixed headers. It has no cookie jar **from creation** and never stores/replays even server-issued anonymous cookies; no browser/profile access, cookie import/export, auth, netrc, environment proxies, TLS impersonation, identity rotation, CAPTCHA handling, actions or retry path. It does not import JobSpy or patch process-wide functions. Redirects are explicit gated requests, limited to the same posting identity or exact search endpoint. Every search/detail/redirect/error consumes the same cap (1–25 requests). The stricter MVP redirect-chain stop is retained: at most eleven attempts per fetch, then persistent cooldown. Encoded authentication URL paths and login/checkpoint forms also stop the run; a404 never excuses challenge/auth content. Starts are at least 15 seconds apart; the implementation also waits 15 seconds after the prior response ends, a deliberately stronger limit. Request starts, statuses and URLs persist privately. Source budgets may lower the run cap.

429, 999, every other HTTP error except 404, challenge/auth walls or unsafe redirects stop the entire run, preserving completed captures and recording a persistent cooldown. Network errors stop that run without retry. 404 is visited/skipped. There is no timed cooldown expiry. **Only Kevin may run `linkedin-public-cooldown-clear --operator Kevin --reason ...` after reviewing the real block.** This is a local operator attestation/audit record, not an authenticated identity service; protect access to the database/CLI. Workers never invoke this on real state. Synthetic tests simulate Kevin explicitly; no real cooldown is cleared during this task.

Private captures, descriptions, original metadata/date evidence and PDFs belong under ignored `data/` or an approved external private directory. The new capture CLI requires `--db`; paths inside the checkout must be under `data/`. JSON stdout contains safe aggregates, never bodies or candidate inputs. Progress and elapsed time go to stderr; `--plain` removes decorative glyphs. Existing explicit inspection commands can reveal private job data: do not publish their output.

## Capture commands

Build with the locked Node22/pnpm dependencies first. All examples use private ignored paths and require no sudo. `--dry-run` makes zero HTTP requests and works while the source is held:

```sh
node dist/src/cli.js linkedin-public-capture --db data/public/jobs.sqlite --mode search --run-id toronto-preview --dry-run
node dist/src/cli.js linkedin-public-capture --db data/public/jobs.sqlite --mode urls --run-id local-preview --dry-run 123456789
```

The following are live capture capability, **not a request to run another live session**. Real source enable and kill clear require the already approved bounded session or a later explicit operator decision:

```sh
node dist/src/cli.js linkedin-public-configure --db data/public/jobs.sqlite --enabled true --budget 25
node dist/src/cli.js source-gate --db data/public/jobs.sqlite --source global --killed false
node dist/src/cli.js source-gate --db data/public/jobs.sqlite --source linkedin_public --killed false
node dist/src/cli.js linkedin-public-capture --db data/public/jobs.sqlite --mode search --run-id toronto-session --limit 10 --max-requests 25
```

Search is fixed to `software engineer`, `Toronto, Ontario, Canada`, last24h, one discovery page and at most10 unique details. URL mode accepts 1–10 deduplicated numeric IDs, public HTTPS posting URLs (including slugged IDs), or `currentJobId` search links; it canonicalizes them to numeric job-view URLs. Supply positional inputs or `--input PRIVATE_ID_FILE` with one ID/URL per line and optional blank/comment lines. Already-local alert inputs only: no Gmail connection is made. Unsupported site, proxy, cookie and credential flags are rejected.

`datePosted` uses actual JobPosting JSON-LD / time `datetime` metadata or supported `N minutes/hours/days/weeks ago` text. Relative conversion records the raw text and reference capture timestamp; metadata also records its raw value. Unknown/invalid/future metadata stays unknown, with null date unless a valid relative value exists. Capture time alone never supplies a posting date. Work model remains unknown unless explicitly stated in the body; existing location/authorization policy may hold a real Toronto result.

## Description, résumé and delivery admission

Recognized public layout enters PR1's immutable description ledger with `provenance: linkedin_public` and **no operator confirmation claim**. Body identity, byte cutoff, layout, truncation, challenge, login and expiration holds remain authoritative. Public capture additionally retains the MVP400-character conservative minimum. Current classifier acceptance and current posting fingerprint are required; replay cannot promote historical holds or overwrite later captures. Manual corrections keep `local_manual_paste` provenance and do not gain the public PDF exception.

Source enable does not grant eligibility, approve evidence, fabricate a profile or approve a PDF. Continue using existing `linkedin-eligibility`, `linkedin-work` and `linkedin-attach` with approved evidence/profile, accepted location policy and explicit hard-requirements/work-authorization review. CMU one-page, text/font/geometry, prepared input, exact SHA-256, current version and visual-approval checks remain unchanged. Approved claims are selected from existing evidence; no production model call is part of this proof.

The new `linkedinPublicPdfDelivery` config flag defaults **false**, as in `config/linkedin-public.example.json`. Pass an explicit private `--config` file with that boolean true on `linkedin-deliver`, `linkedin-work` and `linkedin-attach` for this public flow. With it off, even initial public thread delivery is held. With it on, accepted public work rechecks kills/cooldown before sending; the existing primitives deliver one posting/thread with summary, URL, fit explanation/gaps and the exact matching PDF after visual approval. The real transport additionally checks a current accepted public-description/work/thread/PDF authorization and exact byte hash. Other description provenances and default real transports still refuse real PDF uploads. No other destination/transport permission changes.

For this task **all Discord and Gmail behavior is mocked/local only**. The production upload capability is implemented behind the flag but not live exercised. Real account permission/destination/M3/M5/privacy decisions stay with Kevin. The only approved live product experiment is ONE signed-out capture session across at most10 postings total, after offline gates pass; a block ends it without retry or fallback. See the plan for actual results rather than the standalone MVP's captain-reported10/10.

## Reproducible offline proof

`scripts/linkedin-public-demo.mjs` operates only on saved synthetic HTML, the representative synthetic profile/evidence and the fixture transport. A fresh directory is marked synthetic; existing unmarked directories are refused. No live request is possible through its injected transport.

After `pnpm build` and the documented pinned renderer setup, run capture then prepare with a fresh private demo directory. Inspect the exact returned PNGs, then use attach with `--approve-visual`. Verify receipts; repeating capture/prepare/attach preserves the two original threads and matching PDF receipts. Example phases:

```sh
node scripts/linkedin-public-demo.mjs --dir data/public-synthetic-demo --phase capture
node scripts/linkedin-public-demo.mjs --dir data/public-synthetic-demo --phase prepare --portfolio-root /absolute/pinned/renderer
node scripts/linkedin-public-demo.mjs --dir data/public-synthetic-demo --phase attach --portfolio-root /absolute/pinned/renderer --approve-visual
node scripts/linkedin-public-demo.mjs --dir data/public-synthetic-demo --phase verify
```

Run the focused `tests/linkedin-public*.test.ts` cases and the full renderer-enabled `pnpm run test:ci`; defaults make no product network calls. Tests cover source budgets, kills, pacing/cap/redirect/receipts, no-cookie direct HTTPS, cooldown/operator attestation, both modes/date provenance, completeness holds, restart/discovery/ownership, fit/CMU geometry, exact mock attachment association and default/invalid opt-ins. CI requires the existing pinned renderer setup rather than silently skipping geometry.

Rollback: disable public config/source and set the global/public kills. Preserve the database, cooldown, description versions, prepared files and delivery receipts. Do not delete state to retry; no request or send is automatically authorized by rollback.


## Observed live boundary, 2026-11-12

The single allowed capture session is **spent**. It discovered10 IDs, made2 HTTP200 requests (search plus one detail), and recorded15.589s between request starts. The shared challenge classifier stopped the detail response; completed captures=0, complete descriptions=0 and known posting dates=0. The private request ledger and cooldown survive process reopen. No cooldown clear, source config toggle, retry, alternative identity, browser, cookie, proxy or fallback followed. There is no independent provider-block diagnosis: HTTP200 plus a classifier marker is the actual evidence, and the raw blocked page was not retained for diagnosis.

This task must make no further LinkedIn requests during implementation, review, tests or CI. Use saved private receipts and synthetic HTML only. Do not choose a fresh database/run/session to continue. Do not weaken the classifier or clear real state to manufacture live coverage. A later real capture is Kevin's separate owner decision.

Final offline verification passed923tests across36files, zero skips, with a fresh TypeScript build. The synthetic executable proof retains2threads/2fit notes/2matching CMU PDFs across separate-process replay. Both one-page Letter previews were inspected; bottom whitespace55.465pt, with no visible clipping. These synthetic pages do not establish real candidate quality. Approved real profile/evidence was not supplied, no real résumé was generated, and real description/date/resume acceptance remains unverified. Discord/Gmail product calls remain0; M3/M5/privacy decisions remain with Kevin.


## Public classification context correction

A subsequent synthetic counterfactual showed the initial public guard could mistake non-rendered script/style/meta/comment keywords for visible challenge text. Source-specific normalization now excludes only those non-rendered elements before public visible-text/body classification. Raw extracted description markup remains private provenance; PR1's classifier itself, layout/truncation checks, actual password/login/form/URL/status stops and structural challenge widgets remain in force. JSON-LD date fields are still parsed as metadata, never challenge text. Historical held versions retain their status and need an explicit new capture rather than automatic promotion.

This is a proven synthetic defect and code correction, **not the diagnosed cause of the real200 response**: no saved response body identifies that trigger. The live ledger/cooldown was not changed and no live attempt followed the correction. Final regression evidence is recorded in the implementation plan.
