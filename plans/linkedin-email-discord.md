# LinkedIn email to Discord sprint

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

The no-mistakes reviewer failure is external OAuth401, with terminal failed run and user_owned branch; no retry is attempted before credentials change. The second commit includes the living validation/concurrent-integration incident records and this plan. Publication, PR and CI remain blocked; no direct push or merge is performed. Firstmate owns external authentication restoration and the next fresh validation of the final HEAD.
