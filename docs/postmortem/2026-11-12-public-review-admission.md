# Public ingestion and pre-send admission review

This report tracks the review regressions for skill boundaries and resumable initial delivery. Reproduce them with synthetic captures and mocked transports, correct the shared boundaries, then run focused checks only.

- Findings: JavaScript also declares Java because ingestion uses substring matching; a kill during thread lookup becomes an uncertain write even though authorization prevented the POST.
- Invariants: complete skill names only across search/URL/replay and scoring; definite pre-write denials remain resumable across store, authorization and both initial transport actions, while genuine uncertain writes retain readback.
- Lookup: `public admission uncertain Discord JavaScript skill` returned general Discord adapter/fixture guidance, without a remedy specific to these defects. Code tracing confirms the two local shared-boundary defects.
- Lookup tooling incident: documented `search --compact` exited 2 (unsupported argument); repeated without that option successfully. Existing review-memory-cli incident describes the same incompatibility. No external memory/config writes were attempted.
- Status: verified by focused offline regressions; no product network requests. Approved legacy blobs, real cooldown and spent live exception remain untouched.
- External canonical learning registration is deferred to the outer owner: the workspace boundary prohibits writes to `/home/kevin/linux-config/dot_agents/skills/postmortem-memory/`.
- Defining RED: 15 failed / 2 passed in the 17-case offline review regression file. Failures showed JavaScript plus Java, embedded-name matches, uncertain pre-send state and unclassified callback/store refusals; interrupted-POST controls already retained uncertainty.
- Root cause/resolution: substring extraction replaced with complete-name matching and literal dot escaping at ingestion; initial admission failures classified as retry before transport mutation, using the existing route's retry/reconciliation handling. Ordinary POST/journal paths and genuine uncertain responses remain unchanged.
- Retrace: alert receipt survives thread admission denial; same-key retry after re-enable/backoff can create the absent thread. Successful callbacks reach unchanged writes; interrupted writes still reconcile and missing receipts cannot resend. No alias/parameter/helper was made unreachable.

- Final focused GREEN: 129 passed across 6 files, exit 0, zero skips; all 17 new review regressions pass. Logs: ignored `data/review-red.log` and `data/review-green.log`. Runtime was available Node18; Node22/full build/tests/lint/privacy admission remain outer-pipeline checks.
- Approved route/demo/runbook show no worktree diff against starting HEAD. No commit, push, merge, real state mutation or pipeline control was performed. External canonical registration remains outstanding with the outer owner.
