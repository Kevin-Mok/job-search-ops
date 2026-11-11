# SQLite native module ABI mismatch during sprint

The local fixture integration test could not open SQLite after a frozen dependency install reused a native binary built for a different Node version. Rebuild only the isolated worktree dependency and rerun the same tests before making route behavior claims.

- Symptom: better-sqlite3 binary reports NODE_MODULE_VERSION 131; current Node requires 127.
- Impact: six new route tests failed at database construction, before route assertions; three HTTP transport tests passed.
- Evidence: first focused run 2026-11-06 22:37Z; pnpm frozen install reused cached packages. This is an unexpected environment failure, separate from intentional missing-module RED tests.
- Lookup: searched tracked postmortem knowledge for better-sqlite3 / NODE_MODULE_VERSION / ABI before remediation. Lookup returned general runtime-version/package guidance, not an exact native-ABI finding. Diagnostic ABI values prove an environment mismatch; no repository logic change is justified by this error.
- Status: resolved locally. `pnpm rebuild better-sqlite3` rebuilt the isolated native dependency for current Node; fresh focused route/transport run passed 9/9 tests and `pnpm build` passed. Full regression remains pending. Shared daemon, primary checkout and other runtime processes remain unchanged.
- Learning update boundary: this task may write only its isolated OpenClaw worktree and exact task paths. Updating /home/kevin/linux-config/dot_agents/skills/postmortem-memory/ is outside that authorization; no installed copy will be modified. Record helper check and outstanding cross-repo learning at handoff.

- Targeted learning check: read-only helper `check --postmortem` returned exit 1 (`new` report) because the tracked cross-repo ledger has not been updated. Outstanding path: `/home/kevin/linux-config/dot_agents/skills/postmortem-memory/sources.json` and applicable runtime guidance. No write attempted outside the authorized task scope; supervisor can register the final reviewed report hash after delivery.
