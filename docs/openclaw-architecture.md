# OpenClaw Architecture

This document describes the shared ingestion, policy and canonical-state layers. The [LinkedIn workflow](linkedin-workflow.md) owns the dedicated email-to-thread route, fit/resume preparation, delivery recovery and acceptance boundaries.

## Component Layout

- [`src/core/`](/home/kevin/coding/openclaw/src/core)
  - Parses raw alert fixtures; the retained Indeed HTML parser has offline coverage only
  - Parses rendered X/Twitter following and timeline HTML
  - Evaluates location policy for `M1E 4V4`
  - Infers job family, risk flags, and resume lane
  - Returns holds for legacy draft packets; approved-evidence preparation follows the [LinkedIn workflow](linkedin-workflow.md#local-full-description-review-pr1)
- [`src/db/store.ts`](/home/kevin/coding/openclaw/src/db/store.ts)
  - SQLite-backed canonical state
  - Stores job leads, ingest events, review events, sync runs, and Discord deliveries
  - Stores tracked X news accounts, posts, sync runs, and Discord deliveries for news digests
- [`src/discord/review-plan.ts`](/home/kevin/coding/openclaw/src/discord/review-plan.ts)
  - Rebuilds Discord shortlist and thread state from DB records
- [`openclaw-workspace/`](/home/kevin/coding/openclaw/openclaw-workspace)
  - OpenClaw workspace instructions and operator skills
- [`config/openclaw.example.json5`](/home/kevin/coding/openclaw/config/openclaw.example.json5)
  - Example OpenClaw config for gateway, hooks, Discord, and workspace routing

## End-To-End Flow

1. Fixture replay and trusted captured Gmail intake produce job alerts. X/Twitter news sync is a separate subsystem; live Gmail Pub/Sub remains future work. The [LinkedIn workflow](linkedin-workflow.md) defines the captured-email trust contract.
2. The parser converts provider-specific alert content into structured lead candidates.
3. The policy layer evaluates:
   - remote Canada eligibility
   - `< 20 km` office constraint for hybrid/on-site
   - vague location fallback to `needs_review`
   - risk flags for U.S.-only remote, staffing spam, seniority mismatch, and suspicious language
4. The routing layer picks the best existing resume variant from the allowed list.
5. Legacy drafting returns a hold; full-description acceptance gates approved-evidence work as defined in the [review runbook](linkedin-workflow.md#local-full-description-review-pr1).
6. SQLite stores the canonical lead plus ingest and review events.
7. Discord feed/thread state is rebuilt from SQLite, not from chat memory.
8. Final application submission remains manual.

## Data Model

- `job_leads`
  - Canonical record per duplicate key
  - Includes score, policy outcome, resume match, and historical draft fields; reads project a held draft packet
- `ingest_events`
  - Preserves each source alert that touched a lead
- `review_events`
  - Preserves approval, rejection, notes, and apply-status changes
- `job_description_versions` / `job_description_current`
  - Immutable capture ledger and current pointer; see the [acceptance contract](linkedin-workflow.md#local-full-description-review-pr1)
- `job_source_controls`
  - Persists task-domain kill switches
- `sync_runs`
  - Retains historical Indeed sync attempts; current source-gate refusals occur before a sync run is recorded
- `discord_deliveries`
  - Preserves which candidate leads were already announced into each Discord target
- `x_news_tracked_accounts`
  - Preserves the internal X watchlist seeded from `@Kev_Mok` following plus auto-added discovery accounts
- `x_news_posts`
  - Preserves normalized X posts, matched topic tags, and ranking scores
- `x_news_sync_runs`
  - Preserves X sync attempts, crawl counts, auto-added watchlist accounts, and failure reasons
- `x_news_discord_deliveries`
  - Preserves which X posts were already announced into each Discord target

This satisfies the repo requirement that DB state is canonical and Discord state is reconstructible.

## Why No Plugin Yet

OpenClaw plugins are appropriate when the runtime needs a structured DB tool or deterministic RPC surface. For this first POC, the simpler path is:

- use OpenClaw workspace skills as the operator entry points
- have those skills call the repo CLI
- keep the domain logic inside the repo, not inside free-form prompts

That keeps the first version small and reversible. If this POC graduates into a live Discord/Gmail deployment, the next likely upgrade is a narrow plugin that exposes structured lead lookup and review mutations.
