# Job Ops smoke tests

Use the local synthetic demo to check replay, per-job review threads, private resume pages and exact fixture attachments. Keep all output together, inspect the rendered pages, and repeat intake after restart before attempting any separately authorized live test.

## LinkedIn intake and recovery

- Action: Build with `pnpm build`, then run `node scripts/linkedin-demo.mjs --output-dir data/linkedin-demo --phase intake` twice in separate processes.
  Expected: Four canonical jobs; three delivered fixture threads, one location hold; second intake reports replayed true and identical lead/thread IDs. No account connection or network send.
- Action: Run `node dist/src/cli.js linkedin-state --db data/linkedin-demo/demo.sqlite` after restarting the process.
  Expected: Message/version, delivery attempts/receipts and queued needs_review/ineligible work remain visible. SQLite is authoritative.
- Action: Exercise a rate-limit or lost-response fixture through the focused route tests, then inspect persisted state before retry.
  Expected: Retry time is honored; uncertainty survives readback throttling. No second POST is attempted without conclusive readback. Corrected location holds can resume; explicit rejection stops pending sends.

## Captured connections and operator provenance

- Action: Run `node scripts/linkedin-demo.mjs --output-dir data/linkedin-connections --phase connections` and inspect its JSON result and private plan paths.
  Expected: Four captured synthetic Gmail jobs, authorized original-thread review, two eligible prepared jobs, immutable private Codex plans marked blocked_cli_isolation_unverified, zero model calls and zero production sends.
- Action: Replay an invalid capture-context digest and then a corrected trusted context using the connection CLI regression.
  Expected: A durable held source version appears, then resolves on successful verified parsing. Unsupported layouts remain visible with reasons.
- Action: Attempt a review from an unknown user/thread or applied status without manual confirmation; repeat an already handled interaction after restart.
  Expected: Denial before writes. Approved actions include durable actor/root/thread provenance; audit failure rolls back canonical state. JSON flags do not establish live authentication.
- Action: Run the separate-process replay case in `tests/discord-review-actions.test.ts` against its shared SQLite fixture.
  Expected: One accepted approve-plus-note interaction, two audit rows, the later duplicate denied as replayed_interaction, and the first decision unchanged. Local context-free operator notes can still repeat.

## Fit, resume and exact attachment

- Action: Run `node scripts/linkedin-demo.mjs --output-dir data/linkedin-demo --phase prepare --portfolio-root /absolute/path/to/portfolio-site` and inspect both returned PNG paths.
  Expected: Two synthetic eligible drafts, each one-page Letter with readable local CMU/bold text and the right target. No clipping, overlap or missing approved claims. A separate location-unknown job remains needs_review; the rejected location remains ineligible. Sparse synthetic content does not prove real candidate quality.
- Action: After inspecting the exact pages, run the demo with `--phase attach --approve-visual --portfolio-root /absolute/path/to/portfolio-site`, then repeat intake and prepare.
  Expected: Exact PDF hashes are associated with attachment receipts in each original fixture thread. Repeated work preserves two completed artifacts and does not create another alert/thread/attachment. Neither application submission nor automatic applied status occurs.
- Action: Run the environment-enabled workflow tests documented in [the runbook](linkedin-workflow.md), including tampered PDF and eligibility revocation during validation.
  Expected: Invalid bytes produce a durable blocked error and no upload. Revoked eligibility/current posting mismatch prevents attachment. Real render tests must run, not skip.
- Action: Start a fresh demo output directory with both `--candidate /absolute/private/candidate.json --evidence /absolute/private/approved-evidence.json`, then prepare, inspect every exact PNG and attach with the same directory. Use an approved canonical profile as described in [the runbook](linkedin-workflow.md#canonical-profile-and-approval-boundary).
  Expected: Complete contact/experience/projects/skills/education structure, original entry attribution, explicit Application target header, exact approved bullets and unchanged CMU layout gates. Held summaries/SRC-only statements never appear. Both eligible cases receive their own draft even at fit1. Fixture receipts bind the exact inspected bytes to their original threads; no live sends or job-flow model calls.
- Action: Repeat connections/intake/prepare/attach in separate processes, then compare state/receipts/hashes. Try supplying one input flag or a changed pair against the same run; exercise prepared-metadata tamper cases in the workflow regression.
  Expected: Stable job/thread/PDF/attachment IDs with no duplicate sends. Missing/changed pairs cannot overwrite snapshots. Modified prepared claims/profile/hash/required text or changed portfolio source hashes block attachment before upload. Revised private inputs require a fresh run.

## Live acceptance gate

- Action: Review the runbook's explicit private text-channel and authenticated-email prerequisites before selecting any real destination.
  Expected: No production destination is inferred. Live Gmail/parser/Discord acceptance is marked unverified until separately authorized credentials and destination are supplied; no fixture result is presented as live evidence.

## Delivery validation

- Action: Have the configuration owner confirm explicit native Codex selection and absent/Codex-only review-role overrides, then inspect `no-mistakes doctor` and current branch custody before starting an authorized run.
  Expected: `gate validation codex is runnable`; executable resolution alone proves no authentication/model readiness. No auto/mixed harness fallback or Claude login. Shared configuration changes remain owner-controlled.
- Action: Start the complete no-mistakes pipeline from the clean committed head with accepted intent, a separate verification plan and `--no-publish-intent`; retain yolo off, all steps and no `--yes`.
  Expected: All validation/publication steps remain enabled, private intent omitted from the public PR body, ask-user findings escalated verbatim to Firstmate, and exact final head/ready PR/CI outcome reported. Never merge or treat fixture proof as live acceptance.
