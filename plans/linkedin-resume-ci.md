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

## Review correction: audited duplicate holds

- Invariant: an audited duplicate hold survives posting refresh and blocks alert, enrichment and dispatch admission until the operator changes the review status.
- Inspection: only posting-identity refresh omitted duplicate preservation; enrichment, attachment, alert root/thread and read-only dispatch already deny both rejected and duplicate statuses. Preserve those checks and all renderer/CI gates.
- Defining RED: focused refresh/dispatch run exited1, with duplicate becoming shortlisted and prepared dispatch unexpectedly succeeding after refresh; rejection controls and other18 tests passed.
- Correction: preserve the current rejected/duplicate status only when a matching status_changed audit event exists. No changes to eligibility hashing, automatic scoring or legacy ingestion.
- Coverage: unchanged and changed posting refresh, preserved audit events and prior eligibility decision, held initial alert, ineligible queued enrichment, prepared dispatch before/after refresh and explicit reapproval recovery.
- Postmortem lookup: query `duplicate operator hold posting refresh` returned tangential retry/provenance findings; none explains this status-preservation omission. The installed helper rejected `--compact`; supported search succeeded after help inspection. Canonical external ledger writes remain owner-controlled under this worktree boundary.
- Final focused verification: `pnpm exec vitest run tests/linkedin-refresh.test.ts tests/codex-resume-dispatch.test.ts tests/linkedin-route.test.ts tests/job-workflow-admission.test.ts` passed79/79 tests in4 files, exit0 (3.90s), under Node22.15.0 after frozen local dependency installation. Retraced refresh callers and existing admission checks; no unreachable helpers or branches introduced. Full suite, lint, renderer/hosted CI, commits and publication remain for later pipeline phases.

## Review correction: CI pipeline failure propagation

- Invariant: asset setup, test and build producer failures must fail their steps through `tee`, preserving diagnostic logs and unconditional failure artifacts.
- Root cause: all three logging pipelines inherited GitHub's unspecified Linux shell (`bash -e`), which lacks pipefail. The shared job default is the smallest correction; no per-step wrappers or duplicated handling.
- Source: [GitHub shell semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepsshell) defines explicit `bash` as `bash --noprofile --norc -eo pipefail {0}`.
- Reproducer before correction: parsed workflow step commands executed with a synthetic pnpm producer exiting23; all three steps incorrectly exited0 through real `tee`, retaining their diagnostic logs and reaching the following command. Success controls exited0.
- Correction: job-level `defaults.run.shell: bash`, covering every run step with no step-level shell overrides. Renderer assertions, frozen/native setup, build/test commands and upload `if: always()`/14-day retention remain intact.
- Retrace: a failing producer now supplies the pipeline's nonzero status, stopping subsequent commands in that step; ordinary successful producers still finish normally. GitHub skips later default-success steps after failure and still attempts the unconditional artifact upload. No aliases, helpers or branches added.
- Final focused verification: parsed the final workflow YAML, resolved the Bash job default with no step overrides, and executed all three actual logging step scripts using GitHub's documented Bash argv and a synthetic pnpm producer. For each step, producer exit23 propagated as step exit23, retained the exact diagnostic log and prevented the following command; producer exit0 preserved the log and reached the following command. All six cases passed, verifier exit0. Upload semantics remain `always()` with14-day retention. Temporary probe files stayed inside the worktree and were cleaned. No full-suite, lint, hosted workflow, commit or publication phases were run by this reviewer.

## CI correction: runner path initialization

- Invariant: workflow expressions must use contexts available at their evaluation point. Both job-level `runner.temp` expressions violated this; shared consumers are asset setup, all three diagnostic logs, mandatory test preflight and unconditional artifact upload.
- Hosted RED evidence: run43086506427 at0810752 failed before jobs started. Its annotation identifies both path expressions as `Unrecognized named-value: 'runner'` (lines26–27). [Incident and verification](../docs/postmortem/2026-11-11-ci-runner-context.md).
- Correction: remove the invalid job-level env block; initialize the same two variables from `$RUNNER_TEMP` through `$GITHUB_ENV` in the first run step. Keep paths, logging, Bash pipefail, renderer gates and upload settings unchanged.
- Retrace: initialization now executes after runner allocation; subsequent steps receive the exported variables, asset setup creates the proof directory, test/build pipelines write there and artifact upload resolves the same directory. A producer failure still stops its step while preserving diagnostics. No aliases, branches or helpers became unreachable.
- Fresh local verification: YAML-normalized configuration plus execution of the actual initialization and three logging scripts under explicit Bash; both exported paths match, including spaces; all six producer success/failure controls pass and retain logs; upload remains `always()` with14-day retention. Verifier and `git diff --check` exit0. Probe files cleaned.
- Remaining: hosted acceptance belongs to the outer executor. No commit, push, rerun or other pipeline phase performed. No full product suite/build needed for this path-initialization correction; earlier product results above are previous-run evidence. External canonical learning updates are blocked by the explicit worktree boundary.
- Targeted postmortem-memory check exited1 as expected: the new report hash `9a6baf046ec5b0649cc9b9fa792ecc304c57c4a3638ff2126df9df8ce75a644d` is not registered in the external canonical ledger. Registration and applicable workflow-context guidance under `/home/kevin/linux-config/dot_agents/skills/postmortem-memory/` remain owner work; no outside-worktree writes attempted.
