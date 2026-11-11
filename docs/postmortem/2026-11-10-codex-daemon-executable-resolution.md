# Codex unavailable during pipeline creation

The authorized Codex-only validation run failed before executing a pipeline step because its daemon could not resolve a runnable Codex binary. The runtime owner has now repaired executable discovery and the worker verified the changed readiness. Preserve the failed run and recovered branch, then retry the complete pipeline on the committed recovery record; executable resolution alone does not prove model authentication or validation success.

## Symptom and impact

- Run `01M73P1774CSFHN4KG1A1HCW8B` submitted clean head `30004699dd4d6310ab794c2a409b5eaf3c3c048b` with accepted intent, a separate verification plan and `--no-publish-intent`.
- The drive exited1: `no runnable agent found for configured agent codex (looked for: codex)`. The run has zero pipeline steps and no findings, push, PR or CI result. No pipeline agent or authentication request was started; this is executable availability, not an observed Codex authentication failure.
- The caller's doctor exited0 and reported `gate validation codex is runnable`; the shell resolves Codex in its fnm-managed Node installation. Native `agent: codex` and absent review-role overrides were independently verified. No provider fallback was selected.
- Shared daemon status remained running. Firstmate subsequently verified the root cause: the actual daemon PATH contained the user's local binary directory but omitted the fnm installation directory. Bare Codex lookup was null even though the existing launcher worked by absolute path under that same environment. The worker did not inspect or change shared process state.

## Diagnosis and safety boundary

The read-only memory query `no runnable agent found configured agent codex daemon PATH doctor` returned unrelated rendered-command, notification and optional-source-path findings; none established an applicable daemon remedy. No prior workaround was applied. Pinned no-mistakes v1.84.0 source establishes that doctor resolves executables in its caller environment, while a new run constructs its configured agent in the daemon. The differing observed results therefore require owner-controlled runtime diagnosis.

Do not restart/update the shared daemon, install a replacement binary, change global/account settings, guess unsupported configuration keys or switch harnesses from this task. Do not launch Claude or repeat the failed run with unchanged readiness.

## Recovery and current status

The terminal result returned the exact action `no-mistakes axi sync --recover`. It completed successfully: `custody_returned`, `changed:false`, original submitted head intact and clean. No history rewrite or pipeline fix was performed. The focused failure record and matching plan update are a documentation follow-up; the next validation must use the resulting latest committed head.

Private evidence is under task storage `codex-validation-2026-11-10/`: `drive-01.stdout`, `drive-01.stderr`, `drive-01.result.json`, `launch-01.json`, `verification-plan.md` and `codex-availability-incident.md`. Intent and candidate content are not copied into this report. Prior156-test/manual artifact evidence remains valid for the unchanged implementation, but it is not a test result from this failed pipeline.

## Owner resolution and verification

Firstmate inbox019 records one additive machine-local repair: the previously absent local-bin `codex` symlink now points to the existing installed public launcher. No file was replaced. Under the unchanged recorded daemon PATH, bare `codex --version` now exits0 with `codex-cli 0.167.0`. There was no daemon restart/update, PATH mutation, credential/account change, model call or tracked configuration change. The private owner proof is `codex-validation-2026-11-10/daemon-codex-path-proof.json`.

The worker independently verified the symlink target, then executed only `codex --version` under that exact recorded PATH; it also exited0 with the same version. Explicit native Codex selection and absent review-role overrides remain intact. Evidence is `worker-path-recheck.json`. This resolves executable discovery only; pipeline agent/model/authentication and all validation/publication results still require the new run. Firstmate explicitly authorized retry after the focused incident/plan commit; all steps, `--no-publish-intent` and yolo off remain required.

Postmortem learning registration at the tracked linux-config source remains outside this task's write scope; retain the updated targeted check/hash for the supervising owner. No additional independent review gate or unchanged-code full-suite rerun is introduced before the pipeline.
