# Public-source suite integration failure

The first full renderer-enabled suite exposed an outdated synthetic demo expectation and a timeout in the new PDF test. Preserve the failures, preserve the demo's approved source-state contract, and give the renderer test the same bounded runtime allowance as existing renderer tests before repeating focused and full verification.

## Symptom and impact

2026-11-12, first full `pnpm run test:ci`: 897 passed, 2 failed, zero skips. `tests/job-description-cli.test.ts` failed because `scripts/job-description-demo.mjs` expected exactly two source entries; the new default-disabled public entry is an intentional public-state addition. The new public PDF integration test exceeded Vitest's default 5000ms while other Chrome/build tests ran. No live source/account calls, private input loss or publication occurred.

## Evidence and lookup

Private full log: firstmate task data `full-tests.log`. The assertion diff shows the extra `linkedin_public` entry with killed=true/enabled=false/budget=0. Focused new tests had passed 37/37 including actual CMU rendering. Lookup query `Vitest timeout renderer 5000ms build beforeAll hook concurrency`: no directly applicable remedy; returned sandbox/runtime cases do not match this Node22 unrestricted checkout. Existing repository renderer tests use explicit larger bounded timeouts; inspect those rather than changing global timeout or weakening geometry assertions.

## Current status and next steps

Focused compatibility correction verified: original CLI demo plus public delivery/CLI cases passed 7/7. Full-suite follow-up pending after the remaining defining edge cases. Supervisor inbox001 identified that the demo and existing LinkedIn route are privacy hash-bound. Restore their exact approved base bytes; preserve the legacy `source-gate` metadata contract while new public-state/configure interfaces expose the new source. Add public default assertions only to new behavioral tests. Give only the new renderer case an explicit bounded timeout consistent with sibling renderer tests. Rerun both failing cases and then the full renderer-enabled suite/build. No pipeline is active.

## Learning ownership

Canonical external ledger/guidance updates under `/home/kevin/linux-config/dot_agents/skills/postmortem-memory/` are outside this worker's exact authorized write paths. Firstmate must register the final report hash/alias and finding or no-new-learning decision there. No installed/global copies or linux-config commits are changed by this worker. Targeted read-only check remains required after final report update.

## Second default-timeout boundary and worker stop

The next full run (`full-tests-release.log`) completed 904 tests with three CLI cases skipped by one failed suite hook: the new `tests/linkedin-public-cli.test.ts` build `beforeAll` exceeded its default10000ms. This is a second default-timeout obstacle under full parallel Chrome/build load, at a different boundary from the now-fixed PDF case. The original compatibility demo and PDF case passed in this run. An earlier full run (`full-tests-final.log`) independently passed905/905 in36files with zero skips; it predates the persisted-data/storage additions and later stricter-MVP defining tests, so it is not final acceptance.

Per worker brief rule5, stop and report the repeated obstacle to firstmate rather than continuing retries. Proposed bounded remedy: apply the sibling CLI test's explicit build-hook allowance to this new hook (retaining the build assertion and all cases); then complete pending defining RED cases, focused GREEN and a fresh full suite/build. No hook remedy has been applied after this second timeout. No pipeline, live capture, account call, commit or push has started.


## Resolution and verification

Supervisor inbox002 authorized a bounded60s timeout only for the new CLI build hook, with a checked60s subprocess. Original hash-bound demo/route/runbook remain byte-identical to cd980393; the legacy metadata response stays compatible and the new public-state/configure APIs expose the new controls. No assertions, geometry gates, CI renderer requirements or global bounds were weakened.

Fresh focused verification:52/52 across5files. Fresh final renderer-enabled `pnpm run test:ci`:912/912 across36files, zero skipped,29.83s. Fresh `pnpm build`:exit0. Separate-process synthetic capture/prepare/attach/verify replay retained2threads,2fit notes,2exact matching PDFs with no resend. The timeout correction is verified in code under full parallel load; no hosted CI claim is made. External canonical learning registration remains with firstmate at the exact path above. The separate allowed live source attempt stopped safely at its challenge classifier; it is not a timeout fix or real capture acceptance claim.
