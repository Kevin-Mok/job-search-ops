# CI runner context validation failure

GitHub rejected the workflow before starting jobs. Initialize runner-local paths in a run step so asset setup, test/build logging and artifact upload can share them.

- Symptom: run 43086506427 failed immediately at head 081075252719bc21d193568fcf0e4e2ce7cedafd; jobs and check runs were empty.
- Evidence: the run page annotation reports `(Line: 26, Col: 31): Unrecognized named-value: 'runner'` and the same error at line 27, column 33, both for `runner.temp`.
- Impact: no tests, renderer checks or build executed on the hosted runner.
- Lookup: postmortem-memory query `GitHub Actions workflow no jobs startup failure` returned unrelated runtime/adapter findings; none applies to workflow expression scope. GitHub's annotation identifies the actual cause.
- Cause: job-level `env` is evaluated without the runner context, so both path expressions were invalid.
- Resolution: remove the invalid job-level env block and initialize both variables through `$GITHUB_ENV` using `$RUNNER_TEMP` in the first step. All later consumers retain their existing names and paths. Bash pipefail, required renderer tests and unconditional artifact upload remain unchanged.
- Verification: parsed the final workflow YAML and executed its actual initialization script with GitHub's explicit Bash arguments and an isolated runner directory containing spaces. Both exported `$GITHUB_ENV` records matched their intended paths. Executed each actual logging script with a synthetic producer exiting 0 and 23: all six cases retained the diagnostic log, propagated the expected status and continued only on success. The normalized upload configuration still uses the exported proof directory, `always()` and 14-day retention. Temporary files were cleaned; `git diff --check` passed.
- Status: local path export and consumer behavior verified; hosted workflow acceptance remains unverified and belongs to the outer executor. No full product suite or build was run for this workflow-only correction. Do not waive CI.
- Follow-up: canonical learning ledger/guidance updates outside this worktree are prohibited by this phase's workspace boundary and remain owner-controlled at `/home/kevin/linux-config/dot_agents/skills/postmortem-memory/`.
