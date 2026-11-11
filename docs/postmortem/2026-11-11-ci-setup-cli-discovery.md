# CI setup command discovery

Use installed help before selecting command options while preparing portable CI. This records setup-only failures; no pipeline or remote state was modified.

- Symptom: `no-mistakes config --help` returned unknown command (exit 1); `gh-axi repo view ... --json ...` returned unsupported flag.
- Impact: read-only discovery delayed; no product behavior affected.
- Evidence: installed no-mistakes 1.84.0 top-level help exposes no config command; gh-axi uses its own typed interface rather than gh flags.
- Lookup: postmortem-memory query `unknown command no-mistakes config`; CLI option-ownership guidance is relevant in principle, but no exact prior remedy applies.
- Cause: assumed upstream/version-independent CLI surface.
- Resolution: consult installed `--help`, then use supported read-only commands. No upgrades or daemon operations.
- Verification: top-level help and gh-axi help exit 0; subsequent command outcomes remain in task-private proof.
- Follow-up: canonical ledger registration belongs to Firstmate; this worker cannot write outside authorized task paths. No new product lesson beyond installed-interface discovery.

- Additional setup evidence: the initial test invocation had no installed Vitest (exit254), so it was explicitly excluded from RED proof. Frozen dependency installation exited0; the rerun observed the intended missing-module assertion RED (exit1). The focused negative PDF first threw the existing array assertion for changed text reading order rather than the expected custom diagnostic; the parity helper now reports an explicit text/wrapping mismatch as well as coordinate/clipping mismatches. Its negative rejection and focused suite passed afterward. These are harness/setup assertion issues, not renderer regressions.
