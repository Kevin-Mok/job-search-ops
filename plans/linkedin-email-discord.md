# LinkedIn job workflow plan

Complete the saved-email → fixture Discord → fit → canonical resume/PDF → manual-review route offline. Preserve real candidate inputs and artifacts privately, reuse the portfolio layout read-only, and leave live services and publication behind their existing gates.

## Current Codex-only validation — 2026-11-10

Firstmate inbox015/016 supersede all historical requests below to restore Claude authentication or wait for Claude readiness. The explicit user correction is Codex only. Preserve implementation commit `4a5c2ef331f581a24e745aaa3eb66088cac13562`; no history rewrite, direct push or merge.

- [x] Verify clean isolated branch and `user_owned` custody after the terminal historical run.
- [x] Inspect installed no-mistakes v1.84.0 schema/trust rules: no native per-run agent flag; feature-branch `agent` is ignored without trusted default-branch opt-in; review-role overrides are global-only. Do not guess flags, use Pi model flags as a substitute or write an ineffective branch config.
- [x] Firstmate changed only private machine configuration from `agent: auto` to `agent: codex`, preserving every other setting with no review-role overrides. Worker independently verified selection and doctor exit0: `gate validation codex is runnable`. New runs read global config afresh; no daemon restart/update or account pin change. This is untracked private config, so no tracked-config refresh was introduced.
- [x] Correct current README/runbook/continuation guidance in this focused documentation milestone; preserve historical failure evidence. Supported Codex unavailability/authentication errors must be reported specifically; never launch another harness or request Claude credentials.
- [x] Commit documentation follow-up on top, then start the authorized fresh no-mistakes run with accepted user intent and separate verification plan. Committed `30004699dd4d6310ab794c2a409b5eaf3c3c048b`; run `01M73P1774CSFHN4KG1A1HCW8B` started with `--no-publish-intent` and all default steps.
- [ ] Drive every intent/rebase/review/test/document/lint/push/PR/CI step with yolo off, no `--yes` or skips. Pipeline owns fixes/publication; escalate every ask-user finding to Firstmate verbatim. Stop at CI-ready, verify the forge PR is ready, report exact final head/URL/checks and never merge.

Prepared commit subject: `docs: require Codex-only delivery validation`. This changes delivery guidance only; the verified job-flow code/artifacts are unchanged. Fresh evidence is config/doctor/custody inspection and documentation diff checks; the prior156-test result remains prior-turn evidence until pipeline Test reruns it. README gate: `update_in_same_change`, keeping the public delivery policy consistent with this runbook. Private verification plan retains the environment-enabled full tests/build and existing manual image/hash/thread/replay proof without including personal claim text. Use supported `--no-publish-intent` (inbox017) to keep private sprint context out of the public PR body while retaining full validation intent; this skips no step. Firstmate explicitly authorizes launching after this local commit; no additional permission gate is needed.

Selection evidence: pinned [repo trust rules](https://github.com/kunchenguid/no-mistakes/blob/v1.84.0/docs/src/content/docs/reference/repo-config.md), [global review roles](https://github.com/kunchenguid/no-mistakes/blob/v1.84.0/docs/src/content/docs/reference/global-config.md), and [fresh new-run config loading](https://github.com/kunchenguid/no-mistakes/blob/4822244e763fd4c3d7f48be6433f92df10bb5b33/internal/daemon/manager.go#L1267-L1286). No global writes were performed by this worker. If a future tracked configuration change requires cross-repo refresh, Firstmate owns that operation.

The actual fresh run failed before any step: no runnable agent found for configured agent codex (looked for: codex). This is a Codex executable-availability blocker despite caller doctor success; no agent/authentication request, validation, push, PR or CI occurred. Daemon status is running. Exact returned `axi sync --recover` completed with `custody_returned`, `changed:false` and clean submitted head. See [the living incident](../docs/postmortem/2026-11-10-codex-daemon-executable-resolution.md). Firstmate owns supported runtime diagnosis; no shared daemon/global change or unchanged-readiness retry by this worker. Prepared evidence commit subject: `docs: record Codex validation availability blocker`; include this matching plan. No further independent review gate is introduced (inbox018); no-mistakes alone owns remaining review/fix/publication. README gate is `pass_no_change` for this failure-record follow-up; fresh diff checks are the appropriate local verification.

Runtime recovery (inbox019): Firstmate confirmed the daemon PATH omitted the fnm installation and bare Codex lookup failed. Owner added only the absent local-bin symlink to the existing public launcher. Under the unchanged recorded daemon PATH, both owner and worker `codex --version` checks exit0 (`codex-cli 0.167.0`). No restart/update, credentials, model call, tracked config or worker global edit; no refresh requirement. Branch remains clean at recovered `44b2be3` before this documentation update, native Codex-only selection retained. Prepared commit: `docs: record Codex runtime availability recovery`, incident and plan together. Fresh diff checks and README `pass_no_change` apply; previous TypeScript results are historical until pipeline Test reruns. Firstmate authorizes a new full run on this final committed head with existing accepted intent/verification plan and `--no-publish-intent`; no additional reviewer pass, skips, `--yes`, direct push or merge. Executable readiness is resolved; actual pipeline agent execution/authentication remains to be observed.

## Current accepted continuation — 2026-11-10

Authority: the accepted private `offline-implementation-plan-2026-11-10.md` and Firstmate inbox013 explicitly resume only this task. All November6 deadlines, quota readings and the old task hold are superseded; no new sprint clock is created. ChartClutch and Firstmate helper work stay stopped. No live connections/sends, job-flow model calls, applications, LinkedIn scraping, global auth/daemon repair, portfolio writes or merge.

Fresh setup: isolated existing OpenClaw worktree, clean `fm/job-search-1h-sprint` at `aa2a035101441d9fc41961f3642ba52cb9b161e3`. Supported no-mistakes status confirms `user_owned`; the old run remains terminal failed at reviewer OAuth401. The historical132-test result remains historical; this continuation's final fresh result is156/156, zero skipped. That old provider-authentication requirement is withdrawn by the Codex-only section above; Firstmate has authorized a fresh Codex run. Runtime Sol/xhigh metadata was observed; current effective Fast routing is not exposed/verified and no settings were changed by this worker.

Atomic implementation and ownership:

- [x] Read updated brief/accepted plan and saved progress/checks; verify isolation, initial status, branch/HEAD and custody.
- [x] Map the complete read-only portfolio web-dev baseline to the explicitly approved contribution bank; prepare paired real private candidate/profile/evidence inputs with source hashes and approval provenance. SRC-only statements do not acquire bank approval IDs; unknown/unapproved claims remain holds.
- [x] Renderer worker: defining canonical-profile tests RED first, then full canonical sections/metadata and approved bullet routing using unchanged CMU/CSS/layout gates. Keep old simple-candidate compatibility and exact job/version/thread/hash binding.
- [x] Replay worker: reproduce the suspected Discord interaction race through separate processes. Correct only if reproduced; admission and audit/state must share the existing SQLite transaction. Preserve independent work and report evidence if disproved.
- [x] Coordinator: add paired optional `--candidate`/`--evidence` demo inputs, retain synthetic defaults, propagate validated canonical profiles through existing workflow/prepared/handoff paths. No new provider/framework.
- [x] Focused checks, full tests with real PDF rendering, TypeScript build; inspect exact generated real-candidate PNGs before approving fixture attachments, then restart/replay and compare receipts/hashes. Record all failures/skips; zero live workflow sends/model calls.
- [x] Update README/runbook/smoke checks and continuation prompt; include private usage/rollback and current offline/live boundaries. Prepare a local implementation milestone with the matching plan/docs; no direct push or merge.
- [x] After local commit, refresh private report/progress/checks with exact final HEAD and clean status; hand committed work to Firstmate before any fresh no-mistakes run. Completed at `4a5c2ef`; current Codex validation is separately authorized above.

Review focus: complete profile section/content retention, canonical metadata provenance versus explicitly approved bank bullets, no accidental SRC approval, paired-input rejection before writes, immutable private source/profile hashes, exact final PDF text/font/layout/visual checks, same-thread restart delivery, and independently reproduced cross-process interaction admission. Preserve prior source observations/receipts and all unrelated work. Rollback is to stop invoking the new profile inputs and use preserved synthetic/legacy inputs; do not delete private artifacts or rewrite history.

### November10 verified implementation milestone

Prepared commit subject: `feat: preserve canonical resumes in job workflow`. This milestone includes its plan, usage/rollback, smoke checklist and Cursor continuation prompt. Successful local commit/clean status and resulting hash are recorded in the private handoff after commit; publication is still open.

- Approved private inputs preserve full canonical contact/entry/skills/education metadata and source provenance. Exact approved bank bullets remain in their original entries; summary/SRC-only statements remain private holds. Simple candidates retain their old renderer. The profile participates in the existing input hash; source hashes are checked on render and attachment. This is complete structure with approved content, not approval of held text or model rewriting.
- Paired demo inputs validate before writes and remain fingerprint-bound across phases. General pending workflow rejects changed candidate/profile snapshots. Rendering/attachment share schema/hash/derived-text validation; modified prepared claims/candidate/requiredText block before upload. The final canonical target line explicitly says Application target.
- Separate-process race RED: the same interaction produced four audit rows and the second decision overwrote the first. Minimum transaction correction uses SQLite immediate admission with state/audit writes: GREEN preserves the first decision and two rows, returns replayed_interaction to the duplicate, and retains audit rollback/context-free repeat behavior. No schema extension.
- Final automated commands from this worktree: `env JOB_OPS_PORTFOLIO_ROOT=/home/kevin/coding/portfolio-site pnpm test` —20 files,156 tests passed, zero skipped; `pnpm build`, `node --check scripts/linkedin-demo.mjs`, `git diff --check` —exit0. Actual Chrome/Poppler/CMU PDF checks ran. Private logs are `offline-2026-11-10/final-{full-tests,build,demo-syntax,diff-check}.log`.
- Actual CLI proof in private `offline-2026-11-10/final-real-profile-demo`: captured Gmail fixture →4 canonical jobs/3 original threads →2 fit1 eligible full-profile PDFs,1 needs_review,1 ineligible. Both exact final PNGs were inspected before fixture attachment. Final-restart proof compares all5 phases in separate processes, stable job/version/thread/PDF/attachment identities, unchanged journal, exact copied attachment bytes and no applied status. Source candidate/evidence files remain unchanged. Zero production sends and job-flow model calls.
- Review corrections have assertion RED→GREEN evidence for target wording, prepared-input tampering and changed candidate snapshots. Read-only independent review verified input metadata/approval/source hashes and the preserved four-versus-two replay databases; final artifact/commit review is recorded privately. Preliminary pre-label PDFs remain preserved and were never attached.
- README gate: `update_in_same_change`, resolved by truthful optional-profile/private-pair usage, unchanged synthetic defaults, cross-process replay behavior and explicit offline/live limits. No tracked configuration changed; no refresh-config or global service mutation.
- Unexpected setup/input/proof assumptions are recorded in [the living incident](../docs/postmortem/2026-11-10-offline-verification-command-boundaries.md). The initial normalized intake after captured Gmail was a new source message, correctly not a replay; canonical identities stayed stable. Corrected proof repeats both observed sources. Global incident-learning registration remains outside this task's write scope.

Rollback: omit the optional profile and use preserved legacy/synthetic inputs; stop new commands if needed. Retain DB, journal, provenance, exact PDFs and uncertainty records together; do not delete receipts or rewrite delivered history. Next owner: Firstmate confirms reviewer readiness and authorizes no-mistakes for the new committed HEAD. Live Gmail/history/signature consumer, private live Discord acceptance, richer fit, held-claim approval and isolated Codex execution remain separate bounded work. Applications remain manual.

The following sections retain historical November6 milestones and are not current deadlines or claims of a rerun.

## Historical November6 sprint (superseded scope clocks)

Implement and verify a local LinkedIn alert handoff through canonical SQLite ingestion into one durable Discord alert and thread per posting. Start with synthetic normalized email fixtures, then gate real sends on an explicitly authorized private destination. Gmail watch/history and raw HTML/MIME parsing remain separate work.

## Scope and decisions

- Sprint: confirmed 2026-11-06 22:32:29Z; scope freeze 23:05:00Z; deadline 23:15:00Z (Firstmate steer 002 supersedes original deadline). Ultra/Fast verified by current session metadata, loaded configuration and supervisor confirmation.
- Existing isolated worktree, initially clean; branch `fm/job-search-1h-sprint`. No edits to primary checkout, portfolio, shared infrastructure or Firstmate code. Project is unregistered; required delivery defaults are no-mistakes/off. Gate doctor is healthy; AXI recognizes this repository.
- Both immutable research reports and synthesis manifest were inspected/hash-checked. Grok's POC findings were README-only; GPT had no local attachments. Neither establishes live integration. Reuse SQLite, parser and ingest pipeline; do not adopt IMAP, JobSpy, RenderCV or an additional framework.
- Actual source: `parsing.ts:parseEmailFixture` parses normalized text blocks; `pipeline.ts:ingestParsedLeads` persists canonical leads but legacy identity is title/company/location. `store.ts` holds leads/events and successful Indeed deliveries. `review-plan.ts` only projects local review data. `indeed-sync.ts:sendDiscordViaOpenClaw` sends feed text without stable thread/reconciliation or explicit mention controls. Gmail config is scaffold, with no local consumer/history cursor. `openclaw-browser.ts` is unrelated to this email route; X stays separate.
- Extend only this route with conservative posting-URL identity, transactional message/version intake and a durable delivery ledger. Preserve legacy fixture/Indeed behavior. Never suppress initial delivery based on fit score or support-role category. Keep location eligibility and unknown holds visible.
- New Discord REST transport uses built-in fetch because the existing CLI seam cannot express required mention safety and receipt reconciliation. Official Discord message/channel/rate-limit docs checked 2026-11-06. No network sends during this sprint.
- Separate root-message and thread stages, persist attempts before external calls, recover uncertain success through readback, and hold ambiguity rather than blindly resending. Honor 429 retry timing. Stable identity must survive restart and operator status changes.
- Email is untrusted input. Exact sender allowlist and explicit trusted-handoff metadata required; no interpretation of email instructions. Fixture mode cannot use a real destination. This is not proof of sender authentication or live Gmail ingestion.
- Scope revised by Firstmate steer 002: continue into evidence-backed fit, durable every-eligible-job tailoring/PDF work, same-thread attachment and manual-review outcome. New discovery providers remain deferred. Scoring and exact PDF modules have bounded independent ownership; root owns shared schema and integration. No validation run is active.

## Atomic implementation

- [x] Define route behavior tests and observe intentional RED.
- [x] Add small SQLite route ledger module and URL-aware canonical ingestion, preserving existing callers.
- [x] Implement validated LinkedIn handoff, durable retry/reconciliation, fixture journal and mention-safe Discord adapter.
- [x] Expose intake, drain/retry and status CLI commands; no live side effect by default.
- [x] Verify replay/restart, multi-job messages, low-score/support and unknown-location visibility, independent-posting identity, retries, uncertain sends and stable thread receipts.
- [x] Update README, smoke tests and runbook, include rollback and live gates; run full test suite/build and review final diff.
- [x] Commit matching implementation and plan; report commit to Firstmate, start no-mistakes immediately after commit under Firstmate steer007. Never push directly or merge.

## Verification and review

- Defining missing-seam RED logs: `red.log`, `transport-red.log`, `workflow-red.log`, plus independent module RED logs. Added assertion-level review REDs for actual low-fit intake, stale observations, expired batch leases, uncertain readback throttling, corrected holds and slow-response retry timing, then observed GREEN.
- First implementation commit verification command: `env JOB_OPS_PORTFOLIO_ROOT=/home/kevin/coding/portfolio-site pnpm test` — 13 files, **70/70 passed, zero skipped**, including actual Chrome/CMU rendering, invalid PDF/hash failure, exact-byte fixture attachment and manual-only outcomes.
- `pnpm build` passed; `node --check scripts/linkedin-demo.mjs` passed; `git diff --check` passed. No lint script is configured.
- Actual CLI demo: intake4 jobs →3 stable fixture threads/1 location hold; explicit synthetic approval2 jobs →fit explanations and two CMU PDFs; exact PNGs inspected; both hashes attached in their same original fixture threads. Separate-process replay returned replayed=true, with stable root/thread/artifact receipts. No live sends/accounts/applications.
- Independent reviewer originally found uncertainty/backoff, stale observation, low-score admission, lease-clock, send-time eligibility and held-state transition defects. Defining regressions now pass; follow-up review reports4 verified,0 incorrect,1 unresolved (live operation). See private `checks.md` and logs.
- README gate outcome: update_in_same_change. Added repo-grounded stack rationale before setup and accurate new CLI/demo, trust, rendering and live-gate docs. README commands/flags checked against implemented CLI help and executed demo. Existing unrelated operating paths retained.
- No tracked configuration was changed; no refresh-config, account connection, gateway/daemon change or production service mutation was performed.
- SQLite dependency ABI mismatch was resolved by task-local rebuild; living postmortem is committed with the work. Cross-repo postmortem-memory registration remains outside authorized writes; helper check reports new/unregistered source. This warning does not invalidate the verified route.
- All proof logs, candidate inputs, SQLite files, PDFs, PNGs and fixture receipts remain in authorized private task storage. Committed examples are synthetic.

## Rollback and next sprint

Stop invoking the new commands and use existing replay/Indeed commands. Schema changes are additive, existing records remain intact; preserve/back up the database before any operator rollback. No automatic destructive migration or background schedule is installed.

Next bounded sprint: authorized private mailbox/Discord destination, trustworthy Gmail sender verification plus history recovery and actual LinkedIn email samples, then independent fit and every-eligible-job tailoring with the existing exact-artifact portfolio PDF gates. No applications are submitted automatically.

## Revised full-workflow tasks

- [x] Evidence-backed 1–10 fit module, independent of eligibility.
- [x] Durable tailoring work for every eligible lead, including low scores; unknown authorization holds are visible.
- [x] Exact job/version/hash PDF validation and same-thread attachment receipts; invalid or missing artifacts remain blocked.
- [x] Manual-only application review/outcomes and complete reset/week handoff by 23:10Z.

## Delivery milestone

Prepared commit subject: `feat: connect LinkedIn job review workflow`. Implementation and its plan/runbook/smoke checks ship together. The local commit is the Firstmate implementation handoff; at this commit milestone no-mistakes has not run or published a PR. Firstmate steer007 explicitly authorizes starting the next gate immediately after this commit. The repository remains unregistered in this home; no-mistakes/off defaults were preserved and doctor/AXI are healthy.

## Remaining acceptance and next owner

- Live Gmail/watch/history, actual HTML/MIME parsing and authenticated sender boundary: **open**. Current input is a normalized trusted handoff/fixture.
- Real Discord destination/private account acceptance: **open**. No destination/credentials were selected in this sprint.
- Autonomous Codex invocation: **open**. Each eligible job has a private `codex-handoff.json` and explicit `awaiting_authorized_dispatch`; no production invocation is wired.
- Full canonical portfolio resume template/content parity and real candidate review: **open**. The renderer is an approved-claim extractive draft adapter; no baseline was weakened and no canonical variant overwritten.
- Posting reopened/closed lifecycle, deep requirement-weighted rubric and richer permitted discovery: **deferred**. Out-of-order email protection is verified, but equal timestamp conflict handling and provider vacancy freshness need stronger evidence.
- Cross-repo incident learning registration: **pending outside this task's write scope** at `/home/kevin/linux-config/dot_agents/skills/postmortem-memory/`.

Continuation prompt: [continue-linkedin-job-workflow.md](../prompts/continue-linkedin-job-workflow.md). Next atomic implementation is trustworthy alert parsing/history replay with a failing real-sample fixture; live acceptance stays separate. Preserve the exact private DB/journal/artifact directory when resuming. Commands, outcomes, rollback and manual image check are in [the runbook](../docs/linkedin-workflow.md) and [smoke tests](../docs/smoke-tests.md).

## Final connection sprint (Firstmate steer008/009)

At23:00Z the first no-mistakes run01M6SHA7X63DYBMVDWANCF6561 failed at review: Claude OAuth401 invalid token. Daemon healthy, no findings, no push/PR, branch custody user_owned. No blind retry or global account/daemon repair is authorized.

New explicit scope: bounded native Sol/xhigh workers connect captured Gmail intake, authenticated Discord review handoff and safe Codex dispatch planning before23:10Z; hard stop23:15Z. They own only their module/test pairs; root owns shared store/CLI/docs. Each verifies own model/effort metadata and configuredFast; native spawning cannot explicitly select or independently prove the inherited effective service tier, so that uncertainty is disclosed. No ChartClutch project work or pool administration.

- [x] Gmail message/MIME capture parser with digest-bound separate trusted authentication context and conservative held result.
- [x] Same-thread Discord review actions with explicit authenticated user/channel/thread bindings and durable operator provenance.
- [x] Immutable opt-in Codex dispatch plan/receipt; real execution blocked unless tool-capability isolation can be established.
- [x] Root CLI integration, focused/full tests, concise module handoffs and matching final commit before cutoff.

## Connection milestone and final verification

Second commit subject: `feat: connect captured job workflow handoffs`. Sol/xhigh workers completed Gmail capture parser9 tests, Discord review35 tests and safe Codex planning15 tests. Each verified own model/effort and configuredFast; actual inherited serving tier is unavailable and not claimed. Root integrated all three into actual CLI commands, durable intake holds and atomic review-context transactions. New executable CLI defining RED→GREEN connects captured Gmail→same-thread review→prepared work→private blocked execution plan.

Fresh consolidated verification: `env JOB_OPS_PORTFOLIO_ROOT=/home/kevin/coding/portfolio-site pnpm test` passed **132/132 across18 files, zero skipped**; `pnpm build` passed. The demo wrapper subsequently added the connections phase; `node --check scripts/linkedin-demo.mjs` and actual `--phase connections` invocation passed, with4 jobs, bound operator review,2 private plans,0 model calls/production sends. Previous exact PDF/PNG/hash/thread receipts remain retained. No TypeScript implementation changed after this full run.

Gmail parser trust remains an external local-verifier assertion, not a live account or DKIM verifier. Discord review trust remains authenticated caller metadata; live socket/signature consumer and cross-process replay serialization need follow-up. Actual Codex CLI is unconditionally blocked because installed help did not establish adequate tool-capability isolation; only planning is reachable through CLI. Full canonical resume parity remains open.

Historical delivery state at the second commit: the configured reviewer returned OAuth401, run terminal failed, branch user_owned, no push/PR/CI. The living validation/concurrent-integration incident records remain intact. The current Codex-only section supersedes the former authentication-restoration requirement and governs the authorized fresh validation of the final HEAD.
