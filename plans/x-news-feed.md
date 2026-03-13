# X News Feed ExecPlan

## Goal

Implement an additive X/Twitter news subsystem that monitors AI-news accounts through a logged-in OpenClaw browser session, keeps SQLite as canonical state, and supports both scheduled Discord push delivery and on-demand briefing.

## Assumptions

1. X access in v1 uses a persistent logged-in browser profile instead of the official X API.
2. The tracked watchlist is internal to the bot and must not auto-follow accounts on the real X account.
3. Existing job-ingestion and review flows must remain behaviorally unchanged.

## Plan

- [x] Add X news config, types, DB tables, and CLI commands.
- [x] Implement fixture-backed following/timeline parsing, scoring, discovery, and delivery suppression.
- [x] Reuse the OpenClaw browser runtime for authenticated X scraping.
- [x] Add OpenClaw skills, example config, and docs for sync, brief, and watchlist inspection.
- [x] Verify with automated tests plus build.

## Review

- Implemented an additive X/Twitter AI news subsystem with canonical SQLite storage for watchlist accounts, posts, sync runs, and Discord deliveries.
- Reused the OpenClaw browser runtime for both Indeed and X/Twitter so gateway preflight, profile reuse, timeouts, and tab lifecycle stay consistent.
- Verified on March 13, 2026 with `pnpm test` and `pnpm build`, including new fixture coverage for following parsing, timeline parsing, discovery auto-add, delivery suppression, and X browser session-wall handling.
