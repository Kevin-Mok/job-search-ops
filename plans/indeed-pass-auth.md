# Indeed Pass Auth ExecPlan

## Goal

Add persistent Indeed login for the browser-backed sync by reusing the OpenClaw browser profile and reading machine-local credentials from `pass` when Indeed redirects the run to sign-in.

## Assumptions

1. The Indeed account on this machine is password-only and does not require MFA or email-code verification.
2. Credentials must stay off repo-tracked config and out of logs; only `pass` entry names may appear in config.
3. This workspace already relies on an OpenClaw browser profile per alert, so reusing that profile is the primary persistence mechanism and `pass` is the recovery path for expired sessions.

## Plan

- [x] Add normalized Indeed auth config and `pass` credential helpers, plus a CLI command to store username/password in `pass`.
- [x] Restore and extend the browser runtime source module so the Indeed fetcher can detect login pages, run automated sign-in, and keep the current sync path unchanged.
- [x] Cover the new auth flow with unit tests and browser-runner tests, then update the user-facing setup docs.

## Review

- Added `src/core/indeed-auth.ts` for `pass` entry normalization, credential loading, and secure credential storage.
- Added `indeed-auth-set` to `src/cli.ts` and `package.json` so the alert can be bootstrapped with a TTY password prompt and machine-local `pass` entries.
- Restored `src/core/openclaw-browser.ts` in source, extended it with Indeed login-page detection, pass-backed login automation, credential redaction, and the shared X browser fetcher export needed by the current tree.
- Updated `config/indeed-alerts.example.json`, `README.md`, and `docs/openclaw-setup.md` to document `auth.mode: "pass"` and the bootstrap command.
- Verified with `pnpm test`, `pnpm build`, and a live `pnpm sync:indeed` smoke run. The live run now fails cleanly on missing `pass` entries instead of hanging or silently returning empty results.
