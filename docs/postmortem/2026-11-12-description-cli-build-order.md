# Description CLI test missing build

The renderer-enabled CLI test must build the CLI before running the synthetic demo. This report tracks the CI failure and its focused correction.

- Symptom: both supplied CI runs failed in `tests/job-description-cli.test.ts` with `MODULE_NOT_FOUND` for `dist/src/cli.js`; 461 other tests passed.
- Impact: the full-paste/PDF/history proof could not start. All four reported checks reflect this same failure.
- Lookup: postmortem-memory query `MODULE_NOT_FOUND dist cli build CI` returned generated-backend packaging advice; it is analogous but not a remedy here. The supplied logs and CI ordering show the build runs after the suite. The sibling demo test already builds in `beforeAll`.
- Root cause: the description demo test depends on compiled output without establishing that prerequisite; a parallel sibling's build cannot guarantee availability.
- Resolution: build and assert success at the start of the renderer-enabled test, using the sibling test's existing build invocation. All demo commands and phases then consume fresh compiled output; the renderer-disabled path remains skipped as before.
- Verification: intentional focused RED reproduced the missing `dist/src/cli.js` failure (1 failed, 1 passed) after pinned renderer assets passed their check. With Node v22.15.0, renderer-enabled `pnpm exec node node_modules/vitest/vitest.mjs run tests/job-description-cli.test.ts` then passed both tests, including the build assertion. `pnpm run test:ci` passed all 462 tests in 31 files with zero skips using worktree-local pinned assets and proof output. `git diff --check` passed. Hosted rerun remains with the outer executor.
- Learning check: the read-only canonical helper reports this report as new/unregistered (exit 1), as expected without authorization to write its external ledger. Registration remains outstanding; no installed copies were changed.
- Follow-up: canonical ledger updates under `/home/kevin/linux-config/dot_agents/skills/postmortem-memory/` are outside the authorized worktree and remain owner-controlled. No privacy, fixture, source-gate or product behavior changes are required.
