# Job description PR1 implementation plan

This change holds alert snippets until an operator captures a complete local description, binds work to immutable accepted versions, disables LinkedIn/Indeed automation and prevents real Discord PDF uploads. Gmail-history work remains parked on its prior branch.

## Scope and decisions

- Reuse JobStore SQLite, versioned work, approved evidence and the existing one-page renderer.
- Add description ledger/current pointer bound to canonical job and its current posting fingerprint. Manual JSON template prefills identity/source URL; explicit full-description confirmation cannot override detected incomplete or blocked content. Every capture is immutable, including holds. Replay is idempotent.
- Include description identity in downstream work version; posting changes invalidate captures. Legacy records have no accepted description and stay held. Preparation, attachment and Codex planning recheck persisted acceptance. Legacy draft packets become holds rather than generating candidate claims from alerts.
- Persist global/per-source kills in task DB; default killed, immutable LinkedIn/Indeed automated budget zero. Check sync before fetcher creation and direct adapter before any browser or credentials activity.
- Real Discord transport always refuses attachment before requests; fixture transport retains local synthetic byte coverage. No real sends, account access, ATS adapter, broker, requirement-map redesign, source matching or PR2+.
- Morning review: paste flow/source defaults; later employer URLs/ATS tenants. Full design remains with Kevin. Superseded live LinkedIn/Indeed redirect must never execute.

## Steps

- [x] Define RED behavioral tests: classifier synthetic fixtures, immutable captures/replay/restart/stale binding, workflow holds, source kill persistence/zero browser and fetch calls, real upload refusal.
- [x] Implement description store/classifier/manual CLI and canonical downstream admission; update synthetic callers to capture explicitly.
- [x] Implement persisted source gate and real attachment refusal at transport boundary.
- [x] Actual CLI synthetic capture -> holds -> accepted -> fit/PDF -> second version/replay/restart/invalidation. Inspect actual PNG, save receipts/logs/hashes privately.
- [x] Focused and full renderer-enabled tests/build; README/runbook/smoke and local ignored NIGHT_NOTE/task brief; README gate.
- [ ] Unchanged privacy admission, focused commit, handoff to firstmate for no-mistakes.

## Verification and delivery

Initial HEAD equals origin/main 13aae6f4ccd3bc009be675ecef050097813db22f; initial worktree clean. Branch fm/job-description-pr1-20261111. Proof: /home/kevin/coding/firstmate/data/job-description-pr1-20261111. No merge/default push. First done hands implementation commit to firstmate; pipeline starts only on supervisor instruction. Pipeline must use Codex/gpt-6.1-sol/medium for every child, yolooff, and escalate every ask-user finding verbatim. Installed 1.84 run model/effort flags are Pi-only. Supervisor inbox002 permits existing effective native selection plus actual child/process/log evidence; no configuration mutation or Pi substitution. No pipeline launch before firstmate receives implementation head.

## Risks and review

Conservative classifiers may hold valid prose; operator confirmation never overrides known markers. HTML fixtures classify only; there is no fetcher. Previously persisted work and outputs remain historical and cannot bypass current admission. Rollback code without deleting private ledgers; do not resurrect old upload or automation behavior. No live acceptance is claimed.

### R1 review correction

- [x] Reproduce substring false positives in a separate email-free behavioral test file: `Design intuitive interfaces` returned `needs_login`; `download more datasets` returned `partial`, across both sources and both text/HTML formats.
- [x] Bound login and truncation prose markers at the shared classifier so capture and persisted-record rechecks use the same correction. Structural authentication indicators, challenge detection, confirmation, provenance and source gates remain unchanged. R2 optional quote input remains unchanged by author decision.
- [x] Locked dependencies installed with `pnpm install --frozen-lockfile`; `pnpm exec node --version` reported v22.15.0. Intentional RED: 10 failed, 108 passed, including two confirmation checks blocked by the false positive. Focused GREEN: `pnpm exec node node_modules/vitest/vitest.mjs run tests/job-description-markers.test.ts` exited 0 with 118 passed. Genuine login, challenge, expiration and truncation holds remain covered. Full tests/lint, publication and CI belong to the outer executor and were not run in this review phase.

### R3/R4 review correction

- [x] Preserve immutable historical status/reason/provenance on reads; move current classification enforcement to acceptance, alongside stored acceptance and posting freshness. Current/history/lead reads, prefill and explicit recapture remain usable when classifier decisions change; no previously held version is silently promoted.
- [x] Match login/challenge prose against normalized visible text, retaining word boundaries and raw password/authwall/URL/CAPTCHA/Cloudflare checks. No source-gate, quote-input, upload, privacy policy or approved fixture edits.
- [x] Separate behavioral regressions reproduce both defects: intentional RED exited 1 with 45 failed and 24 passed. After both fixes and caller tracing, `pnpm exec node node_modules/vitest/vitest.mjs run tests/job-description-history.test.ts tests/job-description-normalization.test.ts tests/job-description-markers.test.ts` exited 0 with 187 passed across three files. Coverage includes persisted historical false positives, reopen/history/lead reads/prefill/recapture, immutable serialized records, stale and current acceptance holds, split text/HTML markers, raw structural markers and ordinary prose. Smoke instructions updated. No full suite/lint or other pipeline phase run.

## Current verification and milestone

- Defining RED logs: red.log (missing new module), red-cli.log (missing executable proof), red-edge-classifier.log (hex-encoded ellipsis classified complete). The latter received entity decoding/document-cutoff/container-body checks; 7 focused cases now pass.
- Fresh final renderer-enabled `pnpm test`: 28 files, 275 tests passed, zero skips; strict `pnpm build` passed. Logs are full-tests.log/final-build.log in the private proof directory. No renderer layout or approved candidate claim changes.
- Separate-process actual CLI proof: six hold types, confirmed complete version, fit4, one-page local synthetic PDF and exact fixture attachment; 9 retained description versions, restart/history/replay and stale/partial denial. prepared-proof.json/verified-proof.json and CLI JSONL receipts are private. Exact PNG inspected: readable synthetic name/target/claim, no clipping or overlap; sparse fixture does not establish full real-profile acceptance. PDF SHA-256 b0a63dca0bf4867f4b4e6884e6e8603709ce4113f9bcc327f4dd553c534de077.
- Real REST transport and workflow refuse all PDF attachments; failing request/browser/credential spies remain zero. Old automated Indeed/login tests were replaced with mandatory refusal expectations; parser and unrelated X tests retained. Fit/retry/fixture attachment regressions remain covered.
- README gate passed after in-scope hook/usage/stale automation repairs. Local NIGHT_NOTE.md is explicitly ignored; public decisions live in this plan/runbook. No real inputs/profiles/PDFs or parked work in this change.
- Publication privacy gate remains required on the exact staged tree, unchanged policy. Gate receipts/comparison live privately; a refusal is a publication hold and cannot be bypassed. No commit/push/PR/CI claim until actual receipts exist.
- Typecheck incident: docs/postmortem/2026-11-12-description-gate-typecheck.md. Canonical external ledger registration is outstanding because the worker may write only this worktree/exact task material; supervisor must register its final reviewed hash/alias under /home/kevin/linux-config/dot_agents/skills/postmortem-memory. Existing reference is analogous but exact remedy differs.

Atomic handoff: preserve the exact candidate, admit privacy, commit `feat: gate job work on confirmed full descriptions`, then firstmate triggers no-mistakes with all captain exclusions and verified Codex Sol medium children. Cursor continuation prompt: Read this plan/current brief and private receipts; preserve parked work and privacy refusal, do not start PR2 or a pipeline without supervisor instruction, verify current source/HEAD before any edits. Remaining manual checks: morning approval of paste flow/source defaults, later employer URLs/ATS tenants; no live acceptance is claimed.

Publication checkpoint: unchanged privacy scanner refused implementation candidate tree d546d25f0f5592852094f68c064197a16235f257 with 23 credential/email findings. Resolved delivered baseline tree ddf81aa20729a7345ff7e389ce52d7083d497eb1 has 22 findings. Private exact file/category/value comparison shows two introduced occurrences of an existing synthetic fixture email, one removed occurrence; no introduced real input identified. This is evidence for review, never a waiver. No scanner/policy edits, sanitation, commit, push, PR or pipeline. Final candidate will also include this checkpoint/operational incident and retain the exact refusal privately. Privacy admission requires firstmate/owner decision. Canonical learning check reports new/unregistered alias; both incident registrations remain outstanding outside worker write scope.

Supervisor inbox004/005 follow-up: explicit private requirements-runtime-evidence.md now maps every requirement to executable tests/CLI/artifact evidence and limits. Two final test-first boundary corrections: null capture input gets an actionable local-object error; the real REST attachment refusal no longer destructures even a byte getter. Direct CLI regressions demonstrate old persisted draft/prepared-looking records cannot bypass completeness via draft-packet, work, Codex planning or attachment; actual real-workflow validator call count is zero. Fresh final build0 and renderer-enabled 275/28/0-skip suite0 after those changes. No independent local PR1 work remains. Publication remains deferred to the existing morning owner; no duplicate question or unchanged scanner retry. The last scanned immutable tree5a5dafb0fd5a47796dec7638797017b137b40ffc and its patch remain preserved; latest follow-up tree/patch is a separate snapshot, unadmitted/uncommitted. No pipeline/PR/CI outcome exists.

### Documentation and lint phase

- [x] Replace stale Indeed setup, login, recovery and scheduling instructions with pointers to the review runbook; mark earlier Indeed plans as historical. Correct foundation/architecture, TODO and workspace claims about legacy drafts and source intake.
- [x] Clarify immutable historical decisions versus current acceptance in the owner runbook, and distinguish fixture PDF attachment from the disabled real upload path. Preserve optional quote input and approved fixture/test bytes.
- [x] Static checks: Node v22.15.0; TypeScript `tsc --noEmit -p tsconfig.json`, `node --check` for both changed demo scripts, relative-link checks for changed Markdown and `git diff --check` all exited 0. No dedicated linter or formatter is configured. No tests, behavioral validation, configuration refresh, commit, push, PR or CI phase was run here.
