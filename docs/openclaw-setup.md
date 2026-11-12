# OpenClaw Setup

Install the local dependencies, exercise fixture intake, then configure an isolated OpenClaw runtime for separately authorized Discord and Gmail checks. For the LinkedIn CLI route, use the [LinkedIn workflow](linkedin-workflow.md).

## 1. Install OpenClaw

The official installer worked in this environment and installed `OpenClaw 2026.3.11`.

If `openclaw` is still missing in a fresh shell, export the npm global bin dir that the installer reported:

```bash
export PATH="/home/kevin/.local/share/fnm/node-versions/v22.15.0/installation/bin:$PATH"
```

Official install doc: <https://docs.openclaw.ai/install>

## 2. Install Repo Dependencies

```bash
pnpm install
pnpm test
```

## 3. Exercise The Fixture-First POC

```bash
pnpm replay:fixtures -- --db data/fresh.sqlite
pnpm review:state -- --db data/fresh.sqlite
pnpm show:lead -- --db data/fresh.sqlite --lead-id maple-systems-junior-python-developer
```

Those commands do not require production secrets.

## 4. Create An Isolated OpenClaw Runtime Config

Use an isolated local state dir so this POC does not touch any existing OpenClaw profile:

```bash
mkdir -p .openclaw-dev
cp config/openclaw.example.json5 .openclaw-dev/openclaw.json
```

Then validate against the isolated repo config:

```bash
openclaw config validate
```

## 5. Verify OpenClaw CLI Paths

These were the useful local checks for this repo:

```bash
openclaw --version
openclaw config file
openclaw doctor --non-interactive
openclaw gateway --help
openclaw status --help
```

In this Codex environment, gateway-facing commands needed unsandboxed execution to see system network interfaces correctly. Outside the sandbox that issue did not reproduce.

## 6. Discord Setup And Smoke Test

This is the fastest path to prove the OpenClaw workspace can respond in Discord on this repo.

### 6.1 Create A Private Discord Test Server

Create a private test server and at least one text channel, for example `#job-ops-review`.

If you want the Discord channel names to line up with the review-state projection in this repo, create these too:

- `#job-ops-needs-review`
- `#job-ops-approved`
- `#job-ops-applied`
- `#job-ops-archive`

Those names match the projected status channels in [`src/discord/review-plan.ts`](/home/kevin/coding/openclaw/src/discord/review-plan.ts), but this repo does not yet auto-post that projection into Discord.

### 6.2 Create And Invite The Bot

In the Discord Developer Portal:

1. Create a new application and bot.
2. Copy the bot token.
3. Invite the bot to the private server with scopes:
   - `bot`
   - `applications.commands`
4. For the quickest smoke test, give the bot `Administrator`.

After the smoke test works, reduce permissions if you want a tighter setup.

If Discord shows the app under `Server Settings > Integrations` but there is no bot member in the server, the app was installed without the `bot` scope. OpenClaw's Discord channel bridge needs a real bot user, not just an app integration with slash commands. In the Developer Portal, check `Installation` and make sure the Guild Install flow includes both `bot` and `applications.commands`, then reinstall the app to the server. A correct server install should show the app in the member list.

### 6.3 Copy The Required Discord IDs

Enable Developer Mode in Discord, then copy:

- your Discord user ID
- your test server ID
- your test channel ID

### 6.4 Prepare The Isolated OpenClaw Config

Create a local config if it does not already exist:

```bash
mkdir -p .openclaw-dev
cp config/openclaw.example.json5 .openclaw-dev/openclaw.json
chmod 700 .openclaw-dev
chmod 600 .openclaw-dev/openclaw.json
```

If you export `OPENCLAW_STATE_DIR` and `OPENCLAW_CONFIG_PATH` in your shell startup for this repo, you can drop the inline env prefixes from the `openclaw` commands below in new shells. Use absolute paths there, not `$PWD`, for example in `fish`:

```fish
set -gx OPENCLAW_STATE_DIR /absolute/path/to/openclaw/.openclaw-dev
set -gx OPENCLAW_CONFIG_PATH /absolute/path/to/openclaw/.openclaw-dev/openclaw.json
```

Restart the shell or re-source your shell config before relying on those exports. Any already-running OpenClaw gateway process keeps the old environment until you restart it.

Edit [`.openclaw-dev/openclaw.json`](/home/kevin/coding/openclaw/.openclaw-dev/openclaw.json) and replace these placeholders:

- `gateway.auth.token`
- `hooks.token`
- `channels.discord.token`
- `channels.discord.allowFrom`
- the placeholder Discord guild and channel IDs

Use this minimal Discord block:

```json5
channels: {
  discord: {
    token: "YOUR_DISCORD_BOT_TOKEN",
    commands: {
      native: true,
      nativeSkills: true
    },
    dmPolicy: "allowlist",
    allowFrom: ["YOUR_DISCORD_USER_ID"],
    threadBindings: {
      enabled: true,
      idleHours: 72,
      maxAgeHours: 336
    },
    guilds: {
      "YOUR_GUILD_ID": {
        slug: "job-ops-private",
        channels: {
          "YOUR_CHANNEL_ID": {
            allow: true,
            autoThread: true,
            skills: [
              "job-triage",
              "job-sync-indeed",
              "x-news-sync",
              "x-news-brief",
              "x-news-watchlist",
              "job-review",
              "job-approve",
              "job-reject",
              "job-note",
              "resume-choice",
              "job-apply-status",
              "draft-packet"
            ]
          }
        }
      }
    }
  }
}
```

### 6.5 Configure A Model Provider For Live Agent Turns

Discord slash-skill invocation needs a live model/provider. The local `openclaw doctor --non-interactive` output reported that live runs are not ready until a model provider is configured.

Fast path with OpenAI:

```bash
export OPENAI_API_KEY="your-key"

openclaw configure --section model
```

For this repo, `openai/gpt-5-mini` is a practical default if you want to stay on OpenAI and keep costs low.

If you do not want embeddings yet, disable memory search to remove the doctor warning:

```bash
openclaw config set agents.defaults.memorySearch.enabled false
```

### 6.6 Validate The Config And Workspace Skills

```bash
openclaw config validate --json

openclaw skills list --json
```

The repo-specific skills should include:

- `job-triage`
- `job-sync-indeed`
- `x-news-sync`
- `x-news-brief`
- `x-news-watchlist`
- `job-review`
- `job-approve`
- `job-reject`
- `job-note`
- `resume-choice`
- `job-apply-status`
- `draft-packet`

### 6.7 Seed The Canonical DB

The Discord skills call the repo CLI against `data/fresh.sqlite`, so seed that DB before the smoke test:

```bash
pnpm replay:fixtures -- --db data/fresh.sqlite
```

### 6.8 Review Job Descriptions Locally

Use the [local full-description review](linkedin-workflow.md#local-full-description-review-pr1) for held LinkedIn/Indeed leads and source controls. The legacy Indeed alert configuration and `job-sync-indeed` skill do not enable automation; do not seed login credentials or attempt browser capture.

### 6.8B Configure X News Sync

Create a local X news config if it does not already exist:

```bash
cp config/twitter-news.example.json config/twitter-news.json
```

Edit `config/twitter-news.json` and replace the placeholder Discord target with the real feed channel. Keep `seedHandle` as `Kev_Mok` if you want the watchlist to follow the same seed graph from this repo's default plan.

The important fields are:

- `browserProfile`
  - persistent OpenClaw browser profile for the logged-in X session
- `maxTrackedAccounts`
  - cap for the internal watchlist the bot will crawl
- `maxPostsPerAccount`
  - per-account crawl cap for one sync
- `discovery.*`
  - controls auto-add behavior for newly discovered internal watchlist handles

Before the first live sync, log into X once in the configured browser profile using OpenClaw browser automation. After that, run one manual sync and one stored brief:

```bash
pnpm sync:x-news -- --db data/job-ops.sqlite --config config/twitter-news.json --list ai-alpha
pnpm brief:x-news -- --db data/job-ops.sqlite --config config/twitter-news.json --list ai-alpha --hours 24
pnpm watchlist:x-news -- --db data/job-ops.sqlite --config config/twitter-news.json --list ai-alpha
```

The X sync uses the OpenClaw browser runtime. If the profile is not logged into X, the sync fails with a logged-in-session error instead of silently returning an empty feed.

### 6.9 Start And Verify The Gateway

Run the gateway in one terminal:

```bash
openclaw gateway
```

In a second terminal, verify the gateway is reachable:

```bash
openclaw health --json

openclaw status --json
```

For gateway-backed operations, the status output should show `"reachable": true` under `gateway`. If you see `connect EPERM`, `gateway closed`, or another local-loopback connectivity error, fix the gateway/runtime before using those operations. This does not enable Indeed sync; see the [source boundary](linkedin-workflow.md#local-full-description-review-pr1).

### 6.10 Run The Discord Smoke Test

In the allowed Discord channel, use the slash skill names from [`openclaw-workspace/skills/`](/home/kevin/coding/openclaw/openclaw-workspace/skills).

Start with:

- `/job-triage`
- `/x-news-sync`
- `/x-news-brief`
- `/job-review lead-id: maple-systems-junior-python-developer`
- `/job-approve lead-id: maple-systems-junior-python-developer`

These should:

- confirm the bot is connected to Discord
- confirm slash commands are registered and invocable
- confirm the workspace skills are loaded
- confirm the repo CLI can mutate the canonical SQLite DB

### 6.11 Register X News Sync

Only the existing X news subsystem has a scheduling procedure here. Job-source acquisition follows the [review runbook](linkedin-workflow.md#local-full-description-review-pr1); do not schedule the legacy Indeed sync.

After the X news sync works, register an hourly cron job:

```bash
openclaw cron add \
  --name x-news-ai-alpha-sync \
  --agent jobops \
  --every 1h \
  --no-deliver \
  --message "Use the x-news-sync skill. Run the configured X news sync for ai-alpha and summarize seed accounts seen, tracked accounts crawled, posts stored, watchlist additions, deliveries succeeded or failed, and any login-wall error."
```

### 6.12 Verify The DB Mutation

After `/job-approve`, confirm the DB state changed:

```bash
pnpm review:state -- --db data/fresh.sqlite
```

You should see `Maple Systems | Junior Python Developer | approved_for_manual_apply`.

### 6.13 Current Limitation

Deterministic fixtures cover DB-backed mutations, description/source holds and the browser-backed X news sync path. Workspace skill loading and Discord connectivity require their separate runtime checks.

The full DB-backed review projection in [`src/discord/review-plan.ts`](../src/discord/review-plan.ts) remains local. The separate [LinkedIn workflow](linkedin-workflow.md) owns per-posting thread delivery and its fixture/live acceptance boundaries.

## 7. Gmail Pub/Sub Setup Path

The example config scaffolds:

- `hooks.presets: ["gmail"]`
- `hooks.gmail.*`
- a mapped `hooks.mappings[]` entry targeting the `jobops` agent

Live Gmail watch configuration is blocked on real Google Cloud and Gmail credentials. For local fixture replay or trusted captured Gmail intake, follow the [LinkedIn workflow](linkedin-workflow.md); those paths do not establish live Pub/Sub delivery.
