# OpenClaw Architecture

## Component Layout

- [`src/core/`](/home/kevin/coding/openclaw/src/core)
  - Parses raw alert fixtures
  - Evaluates location policy for `M1E 4V4`
  - Infers job family, risk flags, and resume lane
  - Generates draft packets without inventing experience
- [`src/db/store.ts`](/home/kevin/coding/openclaw/src/db/store.ts)
  - SQLite-backed canonical state
  - Stores job leads, ingest events, and review events
- [`src/discord/review-plan.ts`](/home/kevin/coding/openclaw/src/discord/review-plan.ts)
  - Rebuilds Discord shortlist and thread state from DB records
- [`openclaw-workspace/`](/home/kevin/coding/openclaw/openclaw-workspace)
  - OpenClaw workspace instructions and operator skills
- [`config/openclaw.example.json5`](/home/kevin/coding/openclaw/config/openclaw.example.json5)
  - Example OpenClaw config for gateway, hooks, Discord, and workspace routing

## End-To-End Flow

1. Gmail Pub/Sub or fixture replay produces inbound alert content.
2. The parser converts provider-specific alert text into structured lead candidates.
3. The policy layer evaluates:
   - remote Canada eligibility
   - `< 20 km` office constraint for hybrid/on-site
   - vague location fallback to `needs_review`
   - risk flags for U.S.-only remote, staffing spam, seniority mismatch, and suspicious language
4. The routing layer picks the best existing resume variant from the allowed list.
5. The drafting layer generates a packet constrained to supported resume evidence.
6. SQLite stores the canonical lead plus ingest and review events.
7. Discord feed/thread state is rebuilt from SQLite, not from chat memory.
8. Final application submission remains manual.

## Data Model

- `job_leads`
  - Canonical record per duplicate key
  - Includes score, policy outcome, resume match, and draft packet
- `ingest_events`
  - Preserves each source alert that touched a lead
- `review_events`
  - Preserves approval, rejection, notes, and apply-status changes

This satisfies the repo requirement that DB state is canonical and Discord state is reconstructible.

## Why No Plugin Yet

OpenClaw plugins are appropriate when the runtime needs a structured DB tool or deterministic RPC surface. For this first POC, the simpler path is:

- use OpenClaw workspace skills as the operator entry points
- have those skills call the repo CLI
- keep the domain logic inside the repo, not inside free-form prompts

That keeps the first version small and reversible. If this POC graduates into a live Discord/Gmail deployment, the next likely upgrade is a narrow plugin that exposes structured lead lookup and review mutations.
