# OpenClaw Job Ops POC

This repo is a greenfield proof of concept for a private job-operations assistant built on top of OpenClaw. OpenClaw is treated here as the runtime, workspace, channel bridge, automation ingress, and tool surface. The product in this repo is the job-ingestion + review + drafting system that runs through OpenClaw.

The POC is intentionally fixture-first. It can ingest replayable Indeed and LinkedIn alert fixtures, normalize and dedupe leads, evaluate Toronto location policy for `M1E 4V4`, choose a resume lane, draft application packets without inventing experience, derive a Discord review-thread plan from the canonical DB, run a browser-backed Indeed search sync that posts newly prospective leads into Discord, and run a browser-backed X/Twitter AI news sync that stores and delivers high-signal OpenAI/Codex/Claude/Anthropic and vibe-coding updates.

## Tech Stack And Why Chosen

| Layer | Why it is here |
| --- | --- |
| TypeScript / Node.js | One typed CLI and shared pipeline, with injectable transports for local verification |
| SQLite / better-sqlite3 | Transactional canonical job state and durable replay/retry receipts without another service |
| OpenClaw | Existing browser, Gmail-hook scaffold and Discord operator workspace |
| Vitest | Synthetic regression coverage for ingestion, recovery and operator actions |
| Chrome / Poppler / portfolio CMU assets | Private job-specific PDF drafts using existing fonts, layout checks and exact-byte validation |

The new [LinkedIn workflow](docs/linkedin-workflow.md) connects normalized email intake, stable threads, evidence-backed fit, every-eligible-job prepared work, and exact PDF attachment through a local fixture transport. Real mailbox/Discord delivery remains a separate authorized test gate.

## What Is Implemented

- OpenClaw-oriented architecture and setup docs in [`docs/openclaw-foundation.md`](/home/kevin/coding/openclaw/docs/openclaw-foundation.md), [`docs/openclaw-architecture.md`](/home/kevin/coding/openclaw/docs/openclaw-architecture.md), and [`docs/openclaw-setup.md`](/home/kevin/coding/openclaw/docs/openclaw-setup.md)
- Project-managed OpenClaw workspace assets under [`openclaw-workspace/`](/home/kevin/coding/openclaw/openclaw-workspace)
- Example OpenClaw config in [`config/openclaw.example.json5`](/home/kevin/coding/openclaw/config/openclaw.example.json5)
- Example Indeed alert config in [`config/indeed-alerts.example.json`](/home/kevin/coding/openclaw/config/indeed-alerts.example.json)
- Example X news config in [`config/twitter-news.example.json`](/home/kevin/coding/openclaw/config/twitter-news.example.json)
- Fixture-driven ingest pipeline and SQLite persistence under [`src/`](/home/kevin/coding/openclaw/src)
- Browser-backed Indeed sync path with persistent OpenClaw browser profiles, blocked-page detection, sync-run audit records, and Discord feed delivery suppression
- Browser-backed X news sync path with authenticated following/timeline scraping, internal watchlist discovery, sync-run audit records, and Discord delivery suppression
- Trusted captured Gmail JSON/MIME parsing with durable holds, normalized LinkedIn handoff with transactional versions, conservative posting-URL identity and durable thread/retry reconciliation
- Allowlisted same-thread Discord review handoff with transactional cross-process replay admission and operator provenance; immutable Codex dispatch planning with real execution blocked pending isolation
- Evidence-backed 1–10 fit, explicit versioned eligibility, optional complete canonical resume profiles with approved bullet routing, CMU PDF checks and hash-bound same-thread fixture attachment
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
openclaw config validate --json
```

Load-check the workspace skills:

```bash
openclaw skills list
```

These `openclaw` commands assume `OPENCLAW_STATE_DIR` and `OPENCLAW_CONFIG_PATH` are already exported for this repo, as shown in [`docs/openclaw-setup.md`](/home/kevin/coding/openclaw/docs/openclaw-setup.md).

For live Discord/Gmail work, replace the placeholder values in [`config/openclaw.example.json5`](/home/kevin/coding/openclaw/config/openclaw.example.json5). For direct Indeed sync, copy [`config/indeed-alerts.example.json`](/home/kevin/coding/openclaw/config/indeed-alerts.example.json) to `config/indeed-alerts.json`, replace the placeholder Discord target with the real feed channel, and keep the browser profile/timeouts unless you have a reason to tune them. The example alert also enables `auth.mode: "pass"` so the sync can recover from Indeed sign-in redirects by reading machine-local credentials from `pass`. For X news, copy [`config/twitter-news.example.json`](/home/kevin/coding/openclaw/config/twitter-news.example.json) to `config/twitter-news.json`, keep the seed handle as `Kev_Mok` unless you want a different graph root, and log into X once in the configured OpenClaw browser profile before the first sync.

## LinkedIn Email To Discord Demo

Build once, then exercise the synthetic workflow. These commands never connect accounts or send Discord messages:

```fish
pnpm build
node scripts/linkedin-demo.mjs --output-dir data/linkedin-demo --phase connections
node scripts/linkedin-demo.mjs --output-dir data/linkedin-demo --phase prepare --portfolio-root /absolute/path/to/portfolio-site
```

`--output-dir` keeps the SQLite DB, local Discord journal and private PDFs together. `--phase connections` exercises synthetic captured Gmail, bound review and blocked Codex plans; `--phase intake` is replayable; `prepare` explicitly approves synthetic eligible cases and stops for page-image review. Inspect the returned PNGs before using `--phase attach --approve-visual --portfolio-root /absolute/path/to/portfolio-site`. `--phase state` reports durable state; `--plain` removes decorative terminal glyphs. The PDF phase requires Chrome, Poppler and the read-only portfolio assets.

To use approved private candidate data with these fixture jobs, supply **both** `--candidate /absolute/private/candidate.json --evidence /absolute/private/approved-evidence.json` on the first phase. Later phases reuse validated private snapshots; changed inputs require a fresh output directory. Optional `candidate.profile` retains the canonical web-dev contact, experience, projects, skills and education structure, source hashes and approved evidence IDs. Unapproved/SRC-only bullets and summaries remain review holds. Name/email-only inputs retain the simpler contribution draft. This is offline, deterministic evidence ordering; model tailoring, candidate quality and live service readiness are separate gates. See the [profile contract](docs/linkedin-workflow.md#canonical-profile-and-approval-boundary).

For the real CLI/input contract, source trust, retry recovery, exact artifact gates and rollback, read [LinkedIn workflow](docs/linkedin-workflow.md). `node dist/src/cli.js help` lists the new commands; `--db` selects canonical storage, and `--transport fixture --journal PATH` selects local delivery. A real transport requires an explicitly authorized private destination and environment credentials; there is no default live send. Unknown authorization stays held for review. Fit never suppresses an eligible job.

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

Direct Indeed sync:

```bash
cp config/indeed-alerts.example.json config/indeed-alerts.json
pnpm indeed:auth:set -- --config config/indeed-alerts.json --alert-id call-centre-canada-remote --username you@example.com
pnpm sync:indeed -- --db data/job-ops.sqlite --config config/indeed-alerts.json --alert-id call-centre-canada-remote
```

The sync uses OpenClaw browser automation with a persistent browser profile and browser-managed cookies/storage. Before it opens or waits on any page, it checks `openclaw status --json` and fails fast with a gateway/browser-state error if the local runtime is unhealthy. If Indeed redirects the run to sign-in, the fetcher reuses the saved browser session first and then falls back to the configured `pass` entries when it needs to re-authenticate. If Indeed still returns a Cloudflare interstitial instead of usable job HTML, the sync fails loudly and records the blocked run in SQLite instead of treating it as an empty result set.

Direct X news sync:

```bash
cp config/twitter-news.example.json config/twitter-news.json
pnpm sync:x-news -- --db data/job-ops.sqlite --config config/twitter-news.json --list ai-alpha
pnpm brief:x-news -- --db data/job-ops.sqlite --config config/twitter-news.json --list ai-alpha --hours 24
pnpm watchlist:x-news -- --db data/job-ops.sqlite --config config/twitter-news.json --list ai-alpha
```

The X sync reuses the same OpenClaw browser runtime and expects a logged-in X session in the configured browser profile. It seeds from `@Kev_Mok`'s following graph, auto-adds strong discovery candidates to an internal watchlist, and suppresses duplicate Discord deliveries per target and post.

Optional OpenClaw runtime checks with the isolated config:

```bash
openclaw health --json

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
pnpm indeed:auth:set -- --config config/indeed-alerts.json --alert-id call-centre-canada-remote --username you@example.com
pnpm sync:indeed -- --config config/indeed-alerts.json --alert-id call-centre-canada-remote
pnpm sync:x-news -- --config config/twitter-news.json --list ai-alpha
pnpm brief:x-news -- --config config/twitter-news.json --list ai-alpha --hours 24
pnpm watchlist:x-news -- --config config/twitter-news.json --list ai-alpha
```

## Status

- Implemented locally: normalized LinkedIn email → durable initial thread → explained fit → private approved-claim PDF → hash-bound fixture attachment, versioned eligibility and resume work, fixture replay, normalization, dedupe, location policy, resume routing, draft packets, DB state, Discord review projection, browser-backed Indeed sync, browser-backed X news sync with internal watchlist discovery, and tests.
- Not live-tested: the new Discord REST adapter and trusted email handoff. Live Gmail watch/history and automatic sender/signature verification, unsupported alert layouts, and actual Codex execution remain gaps. Captured MIME/labeled HTML, local review and safe planning are implemented.
- Scaffolded but not live-tested end-to-end: Discord bot connectivity, Gmail Pub/Sub watch delivery, live gateway run with external model/provider secrets, and successful Indeed fetches beyond Cloudflare interstitial handling.
- Deferred intentionally: auto-apply flows, full browser automation for all leads before first-pass filtering, multi-tenant abstractions.
