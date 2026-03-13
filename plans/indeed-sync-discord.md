# Indeed Sync Discord ExecPlan

## Goal

Implement a live Indeed alert sync path that polls configured search URLs, reuses the canonical SQLite ingest pipeline, and sends newly prospective leads into Discord on a repeatable schedule without making Discord the source of truth.

## Assumptions

1. The live Indeed URL may return Cloudflare interstitials, so blocked-page detection is part of the supported behavior rather than an edge case.
2. Alert-specific Discord targets will be configured locally in an untracked runtime config derived from the checked-in example.
3. The OpenClaw gateway and Discord channel integration are available at runtime, but the repo must remain testable without them through injected fetch and delivery seams.

## Plan

- [x] Add fixture coverage for Indeed SERP parsing, blocked-page detection, and sync idempotence.
- [x] Extract a shared parsed-lead ingest path so fixture replay and live sync use the same canonical upsert flow.
- [x] Implement Indeed alert config loading, SERP/detail fetching, HTML parsing, and first-pass filtering.
- [x] Implement sync-run audit state plus Discord delivery suppression/retry semantics in SQLite.
- [x] Add the CLI command, package script, and OpenClaw skill for manual and scheduled sync execution.
- [x] Update docs and example config for the Indeed alert workflow and cron-based continual delivery.

## Review

- Live fetch validation on March 13, 2026 returned an Indeed Cloudflare interstitial for both the provided search URL and the `viewjob` URL.
- That means the implementation must surface blocked runs clearly instead of silently producing empty results.
- Verification completed on March 13, 2026 with `pnpm test` and `pnpm build`, including the new `tests/indeed-sync.test.ts` coverage for pagination, blocked pages, and delivery suppression.
- A live CLI smoke run via `pnpm sync:indeed -- --db data/indeed-live.sqlite --config config/indeed-alerts.example.json --alert-id call-centre-canada-remote` now fails with `Indeed returned a blocked page: Enable JavaScript and cookies to continue`, which matches the intended blocked-run behavior.
