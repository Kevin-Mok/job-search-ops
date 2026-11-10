# Codex unavailable during pipeline creation

The authorized Codex-only validation run failed before executing a pipeline step because its daemon could not resolve a runnable Codex binary. Preserve the committed implementation and failure evidence, recover branch custody through the supported command, and have the shared runtime owner establish executable availability before retrying.

## Symptom and impact

- Run `01M73P1774CSFHN4KG1A1HCW8B` submitted clean head `30004699dd4d6310ab794c2a409b5eaf3c3c048b` with accepted intent, a separate verification plan and `--no-publish-intent`.
- The drive exited1: `no runnable agent found for configured agent codex (looked for: codex)`. The run has zero pipeline steps and no findings, push, PR or CI result. No pipeline agent or authentication request was started; this is executable availability, not an observed Codex authentication failure.
- The caller's doctor exited0 and reported `gate validation codex is runnable`; the shell resolves Codex in its fnm-managed Node installation. Native `agent: codex` and absent review-role overrides were independently verified. No provider fallback was selected.
- Shared daemon status remained running. Caller-versus-daemon executable resolution is the working hypothesis; the daemon's environment has not been inspected and its exact PATH/root cause is unverified.

## Diagnosis and safety boundary

The read-only memory query `no runnable agent found configured agent codex daemon PATH doctor` returned unrelated rendered-command, notification and optional-source-path findings; none established an applicable daemon remedy. No prior workaround was applied. Pinned no-mistakes v1.84.0 source establishes that doctor resolves executables in its caller environment, while a new run constructs its configured agent in the daemon. The differing observed results therefore require owner-controlled runtime diagnosis.

Do not restart/update the shared daemon, install a replacement binary, change global/account settings, guess unsupported configuration keys or switch harnesses from this task. Do not launch Claude or repeat the failed run with unchanged readiness.

## Recovery and current status

The terminal result returned the exact action `no-mistakes axi sync --recover`. It completed successfully: `custody_returned`, `changed:false`, original submitted head intact and clean. No history rewrite or pipeline fix was performed. The focused failure record and matching plan update are a documentation follow-up; the next validation must use the resulting latest committed head.

Private evidence is under task storage `codex-validation-2026-11-10/`: `drive-01.stdout`, `drive-01.stderr`, `drive-01.result.json`, `launch-01.json`, `verification-plan.md` and `codex-availability-incident.md`. Intent and candidate content are not copied into this report. Prior156-test/manual artifact evidence remains valid for the unchanged implementation, but it is not a test result from this failed pipeline.

Firstmate owns the supported Codex availability repair and an observable readiness change before a new run. Every validation/publication step and yolo-off policy remain required. No fix or live activation is claimed. Postmortem learning registration at the tracked linux-config source remains outside this task's write scope; retain the targeted check/hash for the supervising owner.
