# OpenClaw Foundation

This POC uses OpenClaw as the foundation, not as the product name.

The product here is a single-user private job-operations assistant. OpenClaw provides the runtime and operator surface that the product runs through:

- Gateway: the long-running local control plane, configured through `gateway.*`
- Agent workspace: repo-managed instructions and skills under [`openclaw-workspace/`](/home/kevin/coding/openclaw/openclaw-workspace)
- Discord channel bridge: configured with `channels.discord.*`, native commands, native skill commands, and thread bindings
- Automation ingress: configured with `hooks.*`, Gmail preset support, and hook mappings
- Tool surface: agent exec/fs/web/message behavior governed through agent tool policy instead of a custom bot runtime

## Source Of Truth

The implementation in this repo was grounded in the official OpenClaw docs and then cross-checked against the installed `OpenClaw 2026.3.11` CLI/schema:

- Install and getting started: <https://docs.openclaw.ai/install>, <https://docs.openclaw.ai/start/getting-started>
- Agent workspaces and skills: <https://docs.openclaw.ai/concepts/agent-workspace>, <https://docs.openclaw.ai/tools/skills>, <https://docs.openclaw.ai/tools/creating-skills>
- Discord and slash skills: <https://docs.openclaw.ai/channels/discord>, <https://docs.openclaw.ai/tools/slash-commands>
- Webhooks and Gmail Pub/Sub: <https://docs.openclaw.ai/automation/webhook>, <https://docs.openclaw.ai/automation/gmail-pubsub>
- Gateway config and security: <https://docs.openclaw.ai/gateway/configuration>, <https://docs.openclaw.ai/gateway/security>
- Repo: <https://github.com/openclaw/openclaw>

## Thin Viable Architecture

The thinnest viable architecture for this repo is:

1. Replay Gmail-like alert fixtures into the domain pipeline.
2. Normalize leads and write canonical records to SQLite.
3. Run location policy, dedupe, fit scoring and resume routing.
4. Follow the [description acceptance workflow](linkedin-workflow.md#local-full-description-review-pr1) before approved-evidence preparation; legacy drafting stays held.
5. Optionally poll a configured X/Twitter news list, rank high-signal AI posts, and push the top items into a Discord feed channel.
6. Derive Discord feed/thread state from DB records.
7. Expose operator actions as OpenClaw workspace skills that call the repo CLI.

That keeps OpenClaw in its intended role:

- OpenClaw owns gateway lifecycle, channel wiring, skill invocation, and webhook ingress.
- This repo owns the job-domain logic, canonical DB schema, scoring policy, and application drafting rules.

## What Is Real vs Scaffolded

- Implemented now:
  - Fixture-driven ingest pipeline
  - Canonical SQLite DB
  - Resume lane routing; see the [review runbook](linkedin-workflow.md#local-full-description-review-pr1) for description and drafting boundaries
  - Discord review-thread projection from DB state
  - Local description ledger and persisted source controls described in the [architecture](openclaw-architecture.md#data-model)
  - Browser-backed X/Twitter sync command with persistent session reuse, following-graph seeding, watchlist discovery, and Discord delivery audit
  - Project-managed OpenClaw workspace files and skills
- Scaffolded but not live-tested:
  - Real Discord bot connectivity
  - Gmail Pub/Sub watch delivery into OpenClaw hooks
  - Live gateway sessions with external model/provider secrets
- Intentionally deferred:
  - Auto-applying on LinkedIn or Indeed
  - A custom OpenClaw plugin for DB access
  - Multi-user or multi-tenant abstractions
