# Job Ops smoke tests

Use the local synthetic demo to check replay, per-job review threads, private resume pages and exact fixture attachments. Keep all output together, inspect the rendered pages, and repeat intake after restart before attempting any separately authorized live test.

## PR1 full descriptions and source controls

- Action: Use the built CLI `description-template` for an existing held canonical job and inspect the local JSON; attempt capture before confirmation. Paste synthetic missing/truncated/login/challenge/expired/unknown content, confirm, and capture each.
  Expected: Identity/source URL are prefilled; no overwrite. Unconfirmed capture refuses. Holds are partial/needs_login/blocked/expired/layout_unknown with actionable reasons; explicit confirmation cannot override detected walls, truncation, cutoff or unknown layout. Newlines between login/challenge words and HTML elements between those words retain their holds. No resume output.
- Action: Reopen a local synthetic database containing a historical classifier decision; inspect description history and prefill, then explicitly recapture a corrected complete description. Repeat with a historically accepted body that the current classifier holds.
  Expected: Historical versions and their decisions/provenance remain readable and unchanged. Previously held versions never become accepted automatically; historically accepted versions must also pass current classification and posting freshness. Explicit recapture creates a new version without rewriting history.
- Action: Run `scripts/job-description-demo.mjs` prepare with a fresh private output directory and pinned read-only renderer assets; inspect exact PNG. Run verify with explicit visual approval, then state in a fresh process.
  Expected: A confirmed complete immutable version feeds fit and a readable one-page synthetic PDF. Fixture attachment preserves its exact hash. A second version creates distinct work; historical replay cannot restore old current state. Stale planning/attachment fail; later partial capture holds all preparation. History, previous prepared bytes/PDFs and receipts are preserved.
- Action: Inspect source-gate, clear global and Indeed kills, inspect again after restart, then invoke sync-indeed with a valid existing alert config. Exercise direct adapter and injected search/detail/browser/credential spies in the source-gate regression.
  Expected: Kills persist/reload; LinkedIn/Indeed budgets remain zero and counters remain zero. Sync refuses before fetcher construction/browser launch/login/request. Restore local kills to true after the test.
- Action: Attempt real-transport attachment for historical queued synthetic work, and invoke real transport directly with synthetic bytes, using failing network spies. Exercise local fixture synthetic attachment/replay separately.
  Expected: Real workflow refuses before loading resume bytes; real transport makes zero requests. Fixture keeps exact local bytes and receipt. No live Discord/Gmail/model calls, real descriptions/PDF uploads, source adapter or account activity.

## LinkedIn intake and recovery

- Action: Build with `pnpm build`, then run `node scripts/linkedin-demo.mjs --output-dir data/linkedin-demo --phase intake` twice in separate processes.
  Expected: Four canonical jobs; three delivered fixture threads, one location hold; second intake reports replayed true and identical lead/thread IDs. No account connection or network send.
- Action: Run `node dist/src/cli.js linkedin-state --db data/linkedin-demo/demo.sqlite` after restarting the process.
  Expected: Message/version, delivery attempts/receipts and queued needs_review/ineligible work remain visible. SQLite is authoritative.
- Action: Exercise a rate-limit or lost-response fixture through the focused route tests, then inspect persisted state before retry.
  Expected: Retry time is honored; uncertainty survives readback throttling. No second POST is attempted without conclusive readback. Corrected location holds can resume; explicit rejection stops pending sends, expired-send recovery and thread creation after asynchronous readback while preserving known receipts.
- Action: Reject a job while its initial root/thread readback awaits, then explicitly reapprove it and drain the same target after restart. Repeat with a definite thread retry and an uncertain thread attempt; compare against real root/thread permission blocks across a queued operator hold.
  Expected: Local denials become recoverable holds. The same root is reused without another alert POST; retry timing survives and uncertain threads require matching readback. Genuine transport blocks remain terminal across rejection/reapproval, while returned receipts stay preserved.
- Action: Exercise network, server and unreadable-JSON GET failures during initial thread lookup and fit preflight (real PDF transport is disabled), then repeat after the recorded retry time. Contrast with an uncertain POST followed by a failed history read and with a permission block.
  Expected: GET failures before a new write retry without inventing uncertainty or resending known receipts. Existing POST uncertainty survives failed readback and requires matching receipts; permission blocks stay terminal.
- Action: Use two fixture processes against the same private journal, exercising alert, thread, fit and attachment writes through `tests/linkedin-transport.test.ts`, then reopen the journal. Repeat an attachment key with different bytes.
  Expected: Every successful receipt remains readable after restart, original journal entries survive, and repeating an attachment preserves its first bytes. The adjacent private SQLite file serializes mutations without changing the journal format.
- Action: Select a manual resume with `set-resume`, then ingest a newer observation of the same posting, including one with changed requirements. Repeat after explicit rejected and duplicate decisions through `JobStore.updateLeadReview`, with prior eligibility approval and queued work; attempt alert drain, enrichment and prepared dispatch.
  Expected: The chosen resume survives source refresh; the derived packet uses the current target and final operator state. Audited rejection and duplicate holds survive unchanged and changed posting refreshes and prevent alerts, enrichment and prepared dispatch until explicit operator reapproval.

## Captured connections and operator provenance

- Action: Run `node scripts/linkedin-demo.mjs --output-dir data/linkedin-connections --phase connections` and inspect its JSON result and private plan paths.
  Expected: Four captured synthetic Gmail jobs, authorized original-thread review, two eligible prepared jobs, immutable private Codex plans marked blocked_cli_isolation_unverified, zero model calls and zero production sends.
- Action: Repeat planning after restart, then change prepared/handoff bytes or current eligibility/posting/thread facts using synthetic fixtures.
  Expected: Unchanged planning preserves its hashes and approved inputs without writing execution receipts; changed bytes produce a new plan binding, and stale semantic facts deny planning. Historical private receipt files remain untouched. There is no callable execution runner.
- Action: Replay an invalid capture-context digest and then a corrected trusted context using the connection CLI regression.
  Expected: A durable held source version appears, then resolves on successful verified parsing. Unsupported layouts remain visible with reasons.
- Action: Attempt a review from an unknown user/thread or applied status without manual confirmation; repeat an already handled interaction after restart.
  Expected: Denial before writes. Approved actions include durable actor/root/thread provenance; audit failure rolls back canonical state. JSON flags do not establish live authentication.
- Action: Run the separate-process replay case in `tests/discord-review-actions.test.ts` against its shared SQLite fixture.
  Expected: One accepted approve-plus-note interaction, two audit rows, the later duplicate denied as replayed_interaction, and the first decision unchanged. Local context-free operator notes can still repeat.

## Fit, resume and exact attachment

- Action: Run `node scripts/linkedin-demo.mjs --output-dir data/linkedin-demo --phase prepare --portfolio-root /absolute/path/to/portfolio-site` and inspect both returned PNG paths.
  Expected: Two synthetic eligible drafts, each one-page Letter with readable local CMU/bold text and the right target. No clipping, overlap or missing approved claims. A separate location-unknown job remains needs_review; the rejected location remains ineligible. Sparse synthetic content does not prove real candidate quality.
- Action: In a fresh output directory, run intake with both `--candidate fixtures/resume/representative-candidate.json --evidence fixtures/resume/representative-evidence.json`, then prepare with the read-only portfolio root. Inspect each exact returned PNG before attachment. Run the environment-enabled `tests/resume-layout.test.ts` control for both target titles and a long wrapping target.
  Expected: Two synthetic full-profile pages with twelve unchanged bullets, local regular/bold CMU, canonical 32.25–579.75pt horizontal text bounds, readable section/bullet spacing, no clipping and one-page Letter. The matched-content control agrees within 0.3pt per word box; long text wraps without page stretching. The deliberately sparse demo and held real statements are separate content limits. Existing run bytes/approvals are not reused for the corrected rendering.
- Action: After inspecting the exact pages, run the demo with `--phase attach --approve-visual --portfolio-root /absolute/path/to/portfolio-site`, then repeat intake and prepare.
  Expected: Exact PDF hashes are associated with attachment receipts in each original fixture thread. Repeated work preserves two completed artifacts and does not create another alert/thread/attachment. Neither application submission nor automatic applied status occurs.
- Action: Run the environment-enabled workflow tests documented in [the runbook](linkedin-workflow.md), including tampered PDF and eligibility revocation during validation.
  Expected: Invalid bytes produce a durable blocked error and no upload. Revoked eligibility/current posting mismatch prevents attachment. Real render tests must run, not skip.
- Action: Start a fresh demo output directory with both `--candidate /absolute/private/candidate.json --evidence /absolute/private/approved-evidence.json`, then prepare, inspect every exact PNG and attach with the same directory. Use an approved canonical profile as described in [the runbook](linkedin-workflow.md#canonical-profile-and-approval-boundary).
  Expected: Complete contact/experience/projects/skills/education structure, original entry attribution, explicit Application target header, exact approved bullets and unchanged CMU layout gates. Held summaries/SRC-only statements never appear. Both eligible cases receive their own draft even at fit1. Fixture receipts bind the exact inspected bytes to their original threads; no live sends or job-flow model calls.
- Action: Repeat connections/intake/prepare/attach in separate processes, then compare state/receipts/hashes. Try supplying one input flag or a changed pair against the same run; exercise prepared-metadata tamper cases in the workflow regression.
  Expected: Stable job/thread/PDF/attachment IDs with no duplicate sends. Missing/changed pairs cannot overwrite snapshots. Changed evidence/candidate inputs cannot replace prepared work or uncertain fit/PDF delivery records; restoring original inputs allows receipt readback. Modified prepared claims/profile/hash/required text or changed portfolio source hashes block attachment before upload. Revised private inputs require a fresh run.
- Action: Ingest a newer alert changing only seniority, employment type, office location, compensation or `Remote eligibility` text, including a change from `Canada` to `Canada; security clearance required`, then reopen SQLite and attempt to use the prior prepared work ID.
  Expected: A new posting version awaits eligibility review. Prior prepared files and receipts remain historical; stale Codex planning and PDF attachment are denied.
- Action: Open an existing database created before raw remote-eligibility storage, then ingest a new observation with that field.
  Expected: The nullable column is added without changing existing candidate, audit or delivery records; missing historical text stays unknown and new exact parsed text survives restart. Location classification remains unchanged.
- Action: Use the admission regressions to revoke a queued job while another delivery awaits, change admission during fit send/readback or rendering, and revoke admission during the real transport's thread lookup before fit POST; separately attempt a real PDF upload.
  Expected: No enrichment for the revoked queued job, no subsequent prepared file or artifact publication after revocation, and zero new POSTs after failed current admission. Any receipt already returned and all existing prepared inputs remain preserved.
- Action: Revoke eligibility during thread lookup before a fit POST (real PDF uploads always refuse), inspect the prior absent/definite-retry record, then explicitly restore eligibility for the unchanged posting and repeat the same command. Contrast with an actual transport HTTP403 and an uncertain remote attempt.
  Expected: Local pre-POST denial preserves the prior record exactly and resumes once after reapproval. HTTP403 remains terminal; uncertainty still requires readback. Prepared inputs, existing receipts and completed deliveries are unchanged; issued remote requests are not promised cancellation.
- Action: Prepare and render a synthetic canonical profile using both LinkedIn/GitHub contact fields with scheme-less labels and HTTPS URLs; repeat with explicit HTTP, FTP or other non-HTTPS schemes.
  Expected: Valid labels retain their display text and resolve to HTTPS targets, including uppercase HTTPS schemes. Explicit non-HTTPS schemes are rejected before emitting a broken resume contact link.

## Live acceptance gate

- Action: Review the runbook's explicit private text-channel and authenticated-email prerequisites before selecting any real destination.
  Expected: No production destination is inferred. Live Gmail/parser/Discord acceptance is marked unverified until separately authorized credentials and destination are supplied; no fixture result is presented as live evidence.

## Portable CI and posting layout

- Action: With Node22, pnpm9.15.4, Chrome and Poppler installed, fetch assets using `pnpm exec node scripts/resume-ci-assets.mjs --setup --root /absolute/new/renderer-assets`, then repeat `--check --root /absolute/new/renderer-assets`. Try `--check` on an empty directory and `--setup` on the existing asset directory.
  Expected: The immutable sixteen-file manifest verifies; missing bytes fail with setup instructions and an existing directory is never replaced. No portfolio generation/calibration or account access.
- Action: Run `env JOB_OPS_PORTFOLIO_ROOT=/absolute/new/renderer-assets JOB_OPS_LAYOUT_PROOF_DIR=/absolute/new/synthetic-proof pnpm run test:ci` and inspect the exact `support/`, `python/` and `long/` PNGs plus coverage/geometry JSON. Compare the changed supported bullet selection and Python-first ordering against the frozen fact bank.
  Expected: Zero renderer skips; each page is Letter, embedded regular/bold CMU, all selected approved text/links intact, readable canonical heading/bullet rhythm with no clipping/overlap. Normal samples have eleven bullets and explicit external coverage gaps; long target wraps with twelve. Every selected bullet has visible disc pixels, and every word matches independent canonical context within0.3pt and fill remains35–100.5pt. Missing-inset negative is rejected; combined long-entry overflow remains rejected, without compressing text.
- Action: On the new prerequisite pull request, open the actual `CI / Node 22 tests and build` run and download `synthetic-resume-proof-<head>`; inspect its exact PDF/PNG previews and diagnostics, including on an intentionally failing test branch when needed.
  Expected: The final pushed head has a real successful full-suite/build conclusion and synthetic artifacts. Asset setup, test and build failures propagate through `tee` under the explicit Bash job default; available diagnostic logs remain uploaded even when a step fails. No private journal/profile upload, live posting fetch or model call. Local tests alone are not hosted acceptance.

## Delivery validation

- Action: Have the configuration owner confirm explicit native Codex selection and absent/Codex-only review-role overrides, then inspect `no-mistakes doctor` and current branch custody before starting an authorized run.
  Expected: `gate validation codex is runnable`; executable resolution alone proves no authentication/model readiness. No auto/mixed harness fallback or Claude login. Shared configuration changes remain owner-controlled.
- Action: Start the complete no-mistakes pipeline from the clean committed head with accepted intent, a separate verification plan and `--no-publish-intent`; retain yolo off, all steps and no `--yes`.
  Expected: All validation/publication steps remain enabled, private intent omitted from the public PR body, ask-user findings escalated verbatim to Firstmate, and exact final head/ready PR/CI outcome reported. Never merge or treat fixture proof as live acceptance.
