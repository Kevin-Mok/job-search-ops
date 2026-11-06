# Continue the LinkedIn job workflow

Resume from the committed implementation plan and private sprint handoff, verify the checkout and evidence, then take the next bounded acceptance gate. Keep real accounts, candidate evidence and artifacts private; do not infer permission for live sends or applications.

Read `plans/linkedin-email-discord.md`, `docs/linkedin-workflow.md`, `docs/smoke-tests.md`, and the authorized task's `progress.md`, `report.md`, and `checks.md`. Verify branch, HEAD, dirty files and any active no-mistakes custody before editing. Preserve unrelated work and the primary checkout.

The implemented path is normalized LinkedIn JSON → canonical SQLite → initial thread → explicit versioned eligibility → evidence-backed 1–10 fit → every-eligible-job prepared evidence/Codex handoff → private extractive CMU draft/PDF → hash-bound visual approval and same-thread attachment → manual operator outcome. Fit is never a cutoff. Existing source versions, uncertain sends, retry timing and receipts must survive restart.

Do not call this a live Gmail integration or autonomous Codex tailoring. Inspect the actual source and current test output. The next intake slice is a trustworthy Gmail/PubSub history consumer and real LinkedIn alert parser with sender verification, using private sanitized samples and fixture tests first. A live transport test requires a separately authorized private text channel and credentials; never infer either or expose token values. LinkedIn website automation, account connection and auto-apply remain out of scope.

For resume work, preserve the portfolio checkout, unchanged local CMU fonts/CSS, calibration and existing PDF gates. The current sparse approved-claim adapter is plumbing proof, not full canonical resume parity. Full-template adaptation and authorized Codex execution must have defining tests and explicit durable blocked/queued states. Never invent candidate facts or project authorship.

Run `env JOB_OPS_PORTFOLIO_ROOT=/home/kevin/coding/portfolio-site pnpm test` and `pnpm build` from this task checkout before making new completion claims. Add the next failing behavior test, implement one atomic slice, update the matching plan/docs/smoke check and commit it. Let no-mistakes own publication when Firstmate instructs it; never answer ask-user findings, push directly or merge.
