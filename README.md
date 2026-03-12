# OpenClaw Job Ops POC

This repo is a greenfield proof of concept for a private job-operations assistant built on top of OpenClaw. OpenClaw is treated here as the runtime, workspace, channel bridge, automation ingress, and tool surface. The product in this repo is the job-ingestion + review + drafting system that runs through OpenClaw.

The POC is intentionally fixture-first. It can ingest replayable Indeed and LinkedIn alert fixtures, normalize and dedupe leads, evaluate Toronto location policy for `M1E 4V4`, choose a resume lane, draft application packets without inventing experience, and derive a Discord review-thread plan from the canonical DB.

## What Is Implemented

- OpenClaw-oriented architecture and setup docs in [`docs/openclaw-foundation.md`](/home/kevin/coding/openclaw/docs/openclaw-foundation.md), [`docs/openclaw-architecture.md`](/home/kevin/coding/openclaw/docs/openclaw-architecture.md), and [`docs/openclaw-setup.md`](/home/kevin/coding/openclaw/docs/openclaw-setup.md)
- Project-managed OpenClaw workspace assets under [`openclaw-workspace/`](/home/kevin/coding/openclaw/openclaw-workspace)
- Example OpenClaw config in [`config/openclaw.example.json5`](/home/kevin/coding/openclaw/config/openclaw.example.json5)
- Fixture-driven ingest pipeline and SQLite persistence under [`src/`](/home/kevin/coding/openclaw/src)
- Critical workflow tests under [`tests/`](/home/kevin/coding/openclaw/tests)

## What Is Scaffolded

- OpenClaw Discord routing and slash-skill operator workflow
- OpenClaw Gmail Pub/Sub hook mapping path
- Gateway validation path with isolated config and workspace

These are documented and locally verifiable, but not live-tested without secrets.

## Quick Start

```bash
pnpm install
pnpm replay:fixtures
pnpm review:state
pnpm test
```

By default the CLI writes the canonical SQLite DB to `data/job-ops.sqlite`.

## Setup

Install OpenClaw first if it is not already available:

```bash
curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard
```

If the installer binary is not on `PATH` in a new shell, export the path noted by the installer:

```bash
export PATH="/home/kevin/.local/share/fnm/node-versions/v22.15.0/installation/bin:$PATH"
```

Install repo dependencies and validate the local POC:

```bash
pnpm install
pnpm test
```

Create an isolated OpenClaw config for this repo:

```bash
mkdir -p .openclaw-dev
cp config/openclaw.example.json5 .openclaw-dev/openclaw.json
chmod 700 .openclaw-dev
chmod 600 .openclaw-dev/openclaw.json
```

Validate the config against the installed OpenClaw schema:

```bash
OPENCLAW_STATE_DIR="$PWD/.openclaw-dev" \
OPENCLAW_CONFIG_PATH="$PWD/.openclaw-dev/openclaw.json" \
openclaw config validate --json
```

Load-check the workspace skills:

```bash
OPENCLAW_STATE_DIR="$PWD/.openclaw-dev" \
OPENCLAW_CONFIG_PATH="$PWD/.openclaw-dev/openclaw.json" \
openclaw skills list
```

For live Discord/Gmail work, replace the placeholder values in [`config/openclaw.example.json5`](/home/kevin/coding/openclaw/config/openclaw.example.json5).

## How To Use

The fixture-first workflow is:

1. Replay the sample alert inbox into the canonical DB.
2. Inspect the rebuilt shortlist and per-job review threads.
3. Open a lead, review the chosen resume lane and draft packet.
4. Record approval, rejection, notes, resume changes, or manual-apply status.

Replay and inspect:

```bash
pnpm replay:fixtures -- --db data/fresh.sqlite
pnpm review:state -- --db data/fresh.sqlite
```

Inspect one lead:

```bash
pnpm show:lead -- --db data/fresh.sqlite --lead-id maple-systems-junior-python-developer
pnpm draft:packet -- --db data/fresh.sqlite --lead-id maple-systems-junior-python-developer
```

Apply operator actions:

```bash
pnpm approve:job -- --db data/fresh.sqlite --lead-id maple-systems-junior-python-developer
pnpm reject:job -- --db data/fresh.sqlite --lead-id redwood-cloud-principal-solutions-architect --reason "US-only remote and seniority mismatch"
pnpm note:job -- --db data/fresh.sqlite --lead-id nimbus-ops-it-support-analyst --note "Office location needs manual confirmation"
pnpm resume:job -- --db data/fresh.sqlite --lead-id velocity-staffing-cloud-support-associate --resume it-support-aws
pnpm apply-status:job -- --db data/fresh.sqlite --lead-id maple-systems-junior-python-developer --status applied_manually
```

Optional OpenClaw runtime checks with the isolated config:

```bash
OPENCLAW_STATE_DIR="$PWD/.openclaw-dev" \
OPENCLAW_CONFIG_PATH="$PWD/.openclaw-dev/openclaw.json" \
openclaw health --json

OPENCLAW_STATE_DIR="$PWD/.openclaw-dev" \
OPENCLAW_CONFIG_PATH="$PWD/.openclaw-dev/openclaw.json" \
openclaw status --json
```

The current repo treats SQLite state as canonical. Discord review state is meant to be rebuilt from DB records, and final application submission remains manual.

## Useful Commands

```bash
pnpm replay:fixtures
pnpm review:state
pnpm show:lead -- --lead-id maple-systems-junior-python-developer
pnpm approve:job -- --lead-id maple-systems-junior-python-developer
pnpm note:job -- --lead-id maple-systems-junior-python-developer --note "Manual recruiter follow-up needed"
pnpm resume:job -- --lead-id maple-systems-junior-python-developer --resume aws-python
pnpm apply-status:job -- --lead-id maple-systems-junior-python-developer --status applied_manually
pnpm draft:packet -- --lead-id maple-systems-junior-python-developer
```

## Status

- Implemented locally: fixture replay, normalization, dedupe, location policy, resume routing, draft packets, DB state, Discord review projection, tests.
- Scaffolded but not live-tested: Discord bot connectivity, Gmail Pub/Sub watch delivery, live gateway run with external model/provider secrets.
- Deferred intentionally: auto-apply flows, browser automation for obvious rejects, multi-tenant abstractions.
