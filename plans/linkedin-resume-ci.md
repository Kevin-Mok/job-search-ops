# LinkedIn resume CI

Add a minimal hosted test/build gate and offline synthetic posting layout proofs. Reuse the existing production renderer and canonical Letter assets, then validate locally and hand a cohesive commit to Firstmate before native publication.

## Scope and assumptions

- Own workflow, portable setup, synthetic fixtures/tests and matching docs only; base `fm/linkedin-resume-layout`, ship `fm/linkedin-resume-ci`.
- Initial isolated checkout clean. No `.agent/PLANS.md` exists. Worker session metadata confirms Codex/gpt-6.1-sol/medium; Node launcher is v22.15.0. No delegation.
- No private profiles, live postings/models, portfolio writes/builds, old pipeline/branch edits, direct pushes, merges, skips or waivers.
- Recruiter sync is manual-only. Canonical external learning ledger writes remain Firstmate-owned.

## Acceptance and steps

- [x] Inspect previous plan, renderer/tests/fixtures, operating docs, lessons and standards; verify isolation/branch/runtime.
- [x] Establish anonymous immutable public portfolio asset source and provenance/license boundary.
- [x] Observe defining RED, add deterministic two-role selection/coverage and canonical geometry/negative checks; render inspectable artifacts.
- [x] Add pull-request/push full frozen-install test/build workflow with Node22, Chrome, Poppler, mandatory assets, bounded permissions/time/concurrency and failure artifacts.
- [x] Run fresh environment-enabled full suite/build/focused negatives/diff checks, inspect exact PNGs, record hashes and evidence privately.
- [x] Update operating docs and smoke checks; prepare cohesive implementation/plan milestone `ci: verify synthetic resume layouts and full suite`; commit and clean-inventory evidence recorded privately after commit.
- [ ] After Firstmate trigger only, drive full Codex no-mistakes against layout base and report actual hosted checks/ready PR; no merge.

## Evidence and risks

Existing layout test compares canonical CSS same-content word boxes with 0.3pt tolerance, fixed horizontal bounds and overflow rejection; it currently skips without portfolio env. Hosted setup now validates pinned public assets/tools and requires the environment before collection. Sixteen anonymous pinned downloads matched their hashes; source is public without a declared repository license, so no upstream files are vendored. Command discovery incident: [report](../docs/postmortem/2026-11-11-ci-setup-cli-discovery.md). Full logs/hashes/previews belong under the authorized task-private directory; hosted artifacts must contain synthetic proof only.

## Verified implementation milestone

- Fresh final `CI=true JOB_OPS_PORTFOLIO_ROOT=<pinned-public-assets> JOB_OPS_LAYOUT_PROOF_DIR=<private>/verified-proof pnpm run test:ci`: **282/282 tests,26 files,0 skipped**, exit0 (17.27s). Fresh `pnpm build`: exit0. `git diff --check`: exit0. Focused layout/setup5/5 also passed. In-memory Node22.15.0 / SQLite3.49.2 query passed. Logs, exact commands and hashes: authorized task-private `evidence.md`, `verified-tests.log`, `verified-build.log`, `hashes.json`.
- RED preflight contract failed at missing implementation (exit1); first missing-Vitest attempt is explicitly excluded. Frozen install and sixteen anonymous asset downloads passed with pinned hashes. Missing directory/changed bytes/existing destination negatives pass. CI-without-assets deliberately fails before tests; no renderer skip can establish hosted acceptance.
- Two frozen postings use eleven selected approved claims each, stable metadata and explicit partial/gap mapping, including required degree versus advantageous open source. Python leads its API evidence and excludes navigation; support excludes browser checks. Long control retains twelve and wraps. No candidate facts invented or new tailoring model introduced.
- Canonical every-word geometry matches within0.3pt, bounds32.25–579.75pt; bottom whitespace87.71506pt for both normal samples,40.465062pt for long. Missing-inset PDF is rejected, existing combined long-entry overflow remains rejected. Links and embedded regular/bold CMU verified through actual PDF tools. All34 selected native discs in production/canonical rasters have at least43 dark pixels at144dpi.
- Inspected all exact final-proof PNGs; newest verified-proof PNG hashes match those visually reviewed bytes. Suspected missing Python markers were an image-view artifact: full production/canonical PNGs are byte-identical, with eleven populated marker regions. Added bounded Poppler-PGM marker assertions without production renderer changes or new dependencies. [Investigation and raster buffer correction](../docs/postmortem/2026-11-11-synthetic-resume-markers.md). First raster subprocess exceeded Node’s default1MB buffer; captured ENOBUFS proved cause, bounded4MB correction passed focused/full checks.
- README/runbook/smoke checks updated. Recruiter-sync remains manual-only. No daemon/config refresh, live accounts/postings/models, private profiles, upstream portfolio generation/writes, direct push or old-run edits.
- Self-review: production renderer untouched; smallest support is one pinned read-only downloader/preflight and existing Vitest/Poppler tests. No file exceeds3MB. Reproducible fresh destination only; rollback this focused implementation through owner-controlled revert, retaining all historical proof and receipts.
- Remaining: actual hosted run/PR proof is **not yet available**. Firstmate triggers the full native pipeline only after clean local commit; worker will drive all nine gates/publication against `fm/linkedin-resume-layout` with `--no-publish-intent`, no yes/skips/waivers and no merge. Session is sol/medium, while observed machine default is sol/xhigh; Firstmate must establish supported medium pins for pipeline phases before launch. Canonical postmortem ledger registration/check findings remain Firstmate-owned due outside-write limits; helper currently identifies the new report hashes/aliases.

- Pipeline scope investigation at installedv1.84 source confirms Codex model/effort are global-only; repo profile test explicitly ignores agent_config and per-run flags are Pi-only. No task-owned config added. Private `validation-model-boundary.md` provides exact source lines and supported owner alternatives (typed no-mistakes global Codex sol/medium profile, preserving raw-flag precedence and review roles); do not launch until Firstmate resolves it.
