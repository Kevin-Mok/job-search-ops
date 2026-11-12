# Indeed Browser Automation ExecPlan

Historical implementation record, superseded by the [PR1 source boundaries](../docs/linkedin-workflow.md#local-full-description-review-pr1). The goals and verification below describe the earlier implementation, not current operating instructions.

## Goal

Replace the current direct HTTP Indeed fetch path with an OpenClaw browser-driven session that uses a persistent browser profile, browser-managed cookies/storage, and rendered DOM extraction while preserving the canonical SQLite ingest and Discord delivery flow.

## Assumptions

1. OpenClaw 2026.3.11 browser support is available at runtime, even though the local gateway is not currently running in this Codex session.
2. The browser path must be fully automated only: no manual profile warm-up, no human CAPTCHA solve, and no separate Playwright dependency.
3. If the browser path still cannot produce usable Indeed HTML, the sync should fail clearly and retry on the next scheduled run rather than pretending success.

## Plan

- [x] Add mockable browser-session tests for command sequencing, challenge retry, and close behavior.
- [x] Introduce an OpenClaw browser session wrapper with persistent profile defaults and rendered DOM extraction.
- [x] Switch the sync service to use browser-backed search/detail fetch methods and keep detail-page failures non-fatal.
- [x] Extend alert config defaults and docs for browser profile and timeout settings.
- [x] Verify with `pnpm test`, `pnpm build`, and a live browser-path smoke run if the gateway is available.

## Review

- The `sync-indeed` path now uses `src/core/openclaw-browser.ts` as the default acquisition layer instead of raw `fetch()`.
- OpenClaw browser commands are available locally for profiles, cookies, storage, `open`, `navigate`, `wait`, `evaluate`, and `close`.
- Verification completed on March 13, 2026 with `pnpm test` and `pnpm build`, including the new `tests/openclaw-browser.test.ts` coverage.
- Follow-up investigation on March 13, 2026 found that this Codex environment currently reports the isolated gateway as unreachable (`openclaw status --json` shows `gateway.reachable=false` with `connect EPERM 127.0.0.1:19001`).
- The browser runner now preflights `openclaw status --json`, strips non-JSON log prefixes from the status output, and fails fast with a clear gateway/browser-state error before any `open`, `navigate`, or `wait --load` browser command can hang.
- Verification for the fail-fast fix is covered by `tests/openclaw-browser.test.ts`, `tests/indeed-sync.test.ts`, and a post-fix `pnpm build`; a full live Indeed fetch still depends on a healthy local OpenClaw gateway/browser runtime.
