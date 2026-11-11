# Resume layout replay proof status assertion

Correct a task-private verification helper's expected attachment state, then repeat the offline replay proof without changing application code or prior receipts.

## Symptom and impact

The layout follow-up's replay helper completed synthetic attachment and two separate-process replays, then failed its final assertion because it expected the invented status `manual_review`. The actual CLI correctly returned `delivered`. This was a proof-harness error; no production send, input change or lost receipt occurred. Private artifacts remain outside Git.

## Evidence and root cause

`JobWorkRecord.status` and `attachJobResume` in `src/core/job-workflow.ts` use `delivered` for a completed fixture attachment. Manual application review is a product boundary, not that state token. The helper assumed a state name without checking the actual interface. Its preceding exact-hash, binding and journal assertions passed. Memory lookup for resume/PDF geometry found no applicable remedy; the correction is grounded in the current typed status contract and CLI result.

## Resolution and verification

Corrected only the task-private helper to expect `delivered` and retained its original script. The corrected run exited0 for both synthetic and immutable approved-input cases: each attached two exact inspected PDF hashes, preserved artifact/thread/attachment bindings across separate processes, and retained identical fixture-journal bytes on the second full replay. Exact logs and manifests remain in the authorized task-private output namespace. No product state migration or renderer change was needed.

## Follow-up and ownership

Firstmate owns cross-repository incident registration for this dispatched lane. The worker's outside-write grant excludes the canonical postmortem-memory repository; reviewed hash/alias registration and its canonical helper check are handed to Firstmate, rather than written to an installed skill copy. Do not treat that outstanding bookkeeping as product failure. The local lesson is to read exported state types before asserting a CLI status token.
