# Review source lookup assumption

Use the repository's observed producer paths when tracing persisted posting fields. A missing guessed path is a lookup error, not evidence of a product defect.

- Symptom: a worker's bounded read-only `rg` lookup included nonexistent `src/core/indeed-parser.ts` and exited2 after returning matches from the other named files.
- Impact: no project, private input, runtime state or source file changed. Defining behavioral regressions remain separate from this lookup error.
- Lookup and applicability: `tasks/lessons.md` already requires checking actual public interfaces before integration assumptions; the prior review patch-context incident likewise requires inspecting current source before remedy. Those inspection lessons apply; native ABI and patch remedies do not.
- Root cause: assuming the producer filename instead of using the repository map. The observed producer is `src/core/indeed.ts`, which already propagates parsed remote eligibility.
- Resolution and evidence: the worker identified the actual producer from existing matches without retrying the failed command. No remedial source change or repeated lookup is required.
- Status: lookup issue resolved. Final focused verification passed as recorded below.
- Follow-up: canonical postmortem-memory registration under `/home/kevin/linux-config/dot_agents/skills/postmortem-memory/` remains outside the authorized worktree write boundary; installed copies were not changed.

## Optional-field fixture policy assumption

- Symptom: the first focused verification exited1 with79 passing tests,2 failures and1 existing render skip. Both failures were in the new remote-eligibility addition/removal cases: absent remote text produced no prepared work, and removing it changed the location decision to rejected. Complete output is ignored `data/review-source-admission/green.log`.
- Impact: the new persistence/change case and admission regressions passed; no live service, candidate input or returned receipt was affected. The new tests incorrectly assumed that optional remote requirements could be omitted without affecting the existing remote-location policy.
- Lookup: the same producer/consumer boundary lesson above applies to the fixture's policy contract. Inspect `evaluateLocationPolicy` before changing tests or source; classification changes are expressly outside scope.
- Root cause: `evaluateLocationPolicy` uses the raw eligibility field or, when absent, the description; it does not infer Canada authorization from `locationRaw`. The fixture description said Canadian customers, which does not satisfy the existing Canada substring rule.
- Resolution: keep the primary remote Canada-to-clearance case, and include explicit Canada location evidence in the synthetic description shared by all observations. This makes raw-field addition/removal independent of classification while preserving identical description and accepted classification before/after. Add an initial accepted-location assertion before accessing prepared files. No production classification change was made.
- Verification: after correcting only the fixture inputs and retracing the same paths, the identical focused seven-file command exited0:81 tests passed,1 existing optional PDF-render skip, all seven files passed. The demo setup build succeeded. Complete output is ignored `data/review-source-admission/green-final.log`; the initial failed run remains preserved.
- Status: fixture assumption resolved without changing classification policy or weakening the expected version/approval/receipt contracts. Full environment rendering and other validation gates remain with the outer executor.
