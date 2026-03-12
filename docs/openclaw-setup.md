# OpenClaw Setup

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

Then validate with environment overrides:

```bash
OPENCLAW_STATE_DIR="$PWD/.openclaw-dev" \
OPENCLAW_CONFIG_PATH="$PWD/.openclaw-dev/openclaw.json" \
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

## 6. Discord Setup Path

Fill in the placeholder values in [`config/openclaw.example.json5`](/home/kevin/coding/openclaw/config/openclaw.example.json5):

- `gateway.auth.token`
- `channels.discord.token`
- `channels.discord.allowFrom`
- `channels.discord.guilds.*`

The current repo implementation provides:

- skill commands for review actions
- thread/feed projection data
- a DB-first review model

It does not include live Discord posting tests because no bot token or server IDs are available in this workspace.

## 7. Gmail Pub/Sub Setup Path

The example config scaffolds:

- `hooks.presets: ["gmail"]`
- `hooks.gmail.*`
- a mapped `hooks.mappings[]` entry targeting the `jobops` agent

Live Gmail watch configuration is blocked on real Google Cloud and Gmail credentials. The fixture replay path is the supported local substitute in this repo.
