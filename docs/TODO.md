# TODO

This file is the handoff and continuation checklist for the OpenClaw job-ops POC.

## Done

- [x] OpenClaw foundation and architecture documented
  - [`docs/openclaw-foundation.md`](/home/kevin/coding/openclaw/docs/openclaw-foundation.md)
  - [`docs/openclaw-architecture.md`](/home/kevin/coding/openclaw/docs/openclaw-architecture.md)
  - [`docs/openclaw-setup.md`](/home/kevin/coding/openclaw/docs/openclaw-setup.md)
- [x] Repo README updated with run/test flow
  - [`README.md`](/home/kevin/coding/openclaw/README.md)
- [x] Project-managed OpenClaw workspace scaffolded
  - [`openclaw-workspace/AGENTS.md`](/home/kevin/coding/openclaw/openclaw-workspace/AGENTS.md)
  - [`openclaw-workspace/TOOLS.md`](/home/kevin/coding/openclaw/openclaw-workspace/TOOLS.md)
  - [`openclaw-workspace/SOUL.md`](/home/kevin/coding/openclaw/openclaw-workspace/SOUL.md)
  - [`openclaw-workspace/skills/`](/home/kevin/coding/openclaw/openclaw-workspace/skills)
- [x] Example OpenClaw config created and schema-validated
  - [`config/openclaw.example.json5`](/home/kevin/coding/openclaw/config/openclaw.example.json5)
- [x] Fixture-driven job ingest pipeline implemented
  - [`src/core/parsing.ts`](/home/kevin/coding/openclaw/src/core/parsing.ts)
  - [`src/core/pipeline.ts`](/home/kevin/coding/openclaw/src/core/pipeline.ts)
  - [`fixtures/email/`](/home/kevin/coding/openclaw/fixtures/email)
- [x] Location policy, risk checks, and scoring implemented
  - [`src/core/policy.ts`](/home/kevin/coding/openclaw/src/core/policy.ts)
- [x] Resume routing implemented; legacy draft generation now returns holds
  - [`src/core/resume-catalog.ts`](/home/kevin/coding/openclaw/src/core/resume-catalog.ts)
  - [`src/core/routing.ts`](/home/kevin/coding/openclaw/src/core/routing.ts)
  - [`src/core/drafting.ts`](/home/kevin/coding/openclaw/src/core/drafting.ts)
- [x] External DB made canonical
  - [`src/db/store.ts`](/home/kevin/coding/openclaw/src/db/store.ts)
- [x] Discord review projection rebuilt from DB state
  - [`src/discord/review-plan.ts`](/home/kevin/coding/openclaw/src/discord/review-plan.ts)
- [x] Repo CLI added for deterministic review actions
  - [`src/cli.ts`](/home/kevin/coding/openclaw/src/cli.ts)
- [x] Job-description and source-control boundaries: see the [PR1 plan](../plans/job-description-pr1.md) and [review runbook](linkedin-workflow.md#local-full-description-review-pr1)
- [x] Browser-backed X/Twitter AI news sync added with internal watchlist discovery and Discord delivery audit
  - [`src/core/x-news.ts`](/home/kevin/coding/openclaw/src/core/x-news.ts)
  - [`src/core/x-news-sync.ts`](/home/kevin/coding/openclaw/src/core/x-news-sync.ts)
  - [`config/twitter-news.example.json`](/home/kevin/coding/openclaw/config/twitter-news.example.json)
- [x] Critical workflow tests added and passing
  - [`tests/parsing.test.ts`](/home/kevin/coding/openclaw/tests/parsing.test.ts)
  - [`tests/location-policy.test.ts`](/home/kevin/coding/openclaw/tests/location-policy.test.ts)
  - [`tests/pipeline.test.ts`](/home/kevin/coding/openclaw/tests/pipeline.test.ts)
  - [`tests/review-state.test.ts`](/home/kevin/coding/openclaw/tests/review-state.test.ts)
  - [`tests/indeed-sync.test.ts`](/home/kevin/coding/openclaw/tests/indeed-sync.test.ts)
  - [`tests/openclaw-browser.test.ts`](/home/kevin/coding/openclaw/tests/openclaw-browser.test.ts)
  - [`tests/x-news.test.ts`](/home/kevin/coding/openclaw/tests/x-news.test.ts)

## Verified

- [x] `pnpm test`
- [x] `pnpm replay:fixtures -- --db data/fresh.sqlite`
- [x] `pnpm review:state -- --db data/fresh.sqlite`
- [x] `openclaw config validate --json` against the isolated config
- [x] `openclaw skills list` showed workspace skills loading
- [x] `openclaw health --json` returned healthy against the isolated gateway
- [x] `openclaw status --json` showed the isolated gateway reachable

## Setup Needed

- [ ] Replace placeholder secrets and IDs in [`config/openclaw.example.json5`](/home/kevin/coding/openclaw/config/openclaw.example.json5)
  - `gateway.auth.token`
  - `hooks.token`
  - `channels.discord.token`
  - `channels.discord.allowFrom`
  - Discord guild/channel IDs
- [ ] Configure a real model/provider for live OpenClaw agent turns
• As of March 12, 2026, use openai/gpt-5-mini if you want to stay on OpenAI and stay safely under a hard CA$1/day cap.

Using the Bank of Canada USD/CAD rate from March 11, 2026 (1 USD = 1.3587 CAD), CA$1/day is about US$0.736/day.Bank of Canada
(https://www.bankofcanada.ca/rates/daily-digest/) OpenAI’s current standard pricing puts gpt-5-mini at $0.25 / 1M input and $2.00 / 1M
output, while gpt-5.1-codex is $1.25 / 1M input and $10.00 / 1M output.OpenAI pricing (https://developers.openai.com/api/docs/pricing)

For a realistic light OpenClaw workload like 200k input + 50k output tokens/day:

- openai/gpt-5-mini: about US$0.15/day = CA$0.20/day
- openai/gpt-5.1-codex: about US$0.75/day = CA$1.02/day

So gpt-5.1-codex is too close or slightly over if you really mean a hard CA$1/day ceiling.

If cheapest is the priority, google/gemini-2.5-flash-lite is even lower at $0.10 / 1M input and $0.40 / 1M output.Gemini pricing
(https://ai.google.dev/gemini-api/docs/pricing) That same sample workload is only about US$0.04/day = CA$0.05/day.

My practical recommendation:

- Best balance: openai/gpt-5-mini
- Cheapest acceptable: google/gemini-2.5-flash-lite
- Don’t use openai/gpt-5.1-codex if CA$1/day is a real hard cap

This assumes standard token pricing only, not priority tier, grounding/search charges, or other tool fees. If you want, I can turn
this into an exact OpenClaw config recommendation for both model and memorySearch.
  - Current doctor output reported missing embedding/model provider setup for memory and live runs
- [ ] Tighten isolated OpenClaw state permissions when using `.openclaw-dev`
  - `chmod 700 .openclaw-dev`
  - `chmod 600 .openclaw-dev/openclaw.json`
- [ ] If running `openclaw` from a fresh shell, export the installer bin path
  - See [`docs/openclaw-setup.md`](/home/kevin/coding/openclaw/docs/openclaw-setup.md)

## Continue Next

- [ ] Review the PR1 paste flow and source defaults using the [review runbook](linkedin-workflow.md#local-full-description-review-pr1)
- [ ] Wire real Discord posting from the DB-backed review projection
  - Start from [`src/discord/review-plan.ts`](/home/kevin/coding/openclaw/src/discord/review-plan.ts)
  - Keep Discord as a projection of DB state, not the source of truth
- [ ] Replace fixture replay with real Gmail Pub/Sub ingestion
  - Keep the same normalization path in [`src/core/pipeline.ts`](/home/kevin/coding/openclaw/src/core/pipeline.ts)
  - Use the existing `hooks.gmail` and `hooks.mappings` scaffold in [`config/openclaw.example.json5`](/home/kevin/coding/openclaw/config/openclaw.example.json5)
- [ ] Add a real hook transform module only if Gmail payload shape needs preprocessing
  - Current config already reserves `hooks.transformsDir`
- [ ] Decide whether to keep CLI-driven mutations or promote them into a minimal OpenClaw plugin
  - Do this only if structured runtime DB access becomes necessary
- [ ] Later employer enrichment: follow the deferred scope in the [PR1 plan](../plans/job-description-pr1.md#scope-and-decisions)
- [ ] Improve X news discovery heuristics after real usage
  - Tune topic keywords and preferred handles in [`config/twitter-news.example.json`](/home/kevin/coding/openclaw/config/twitter-news.example.json)
  - Revisit the score threshold once live X engagement patterns are known
- [ ] Add more fixtures for scammy/staffing/seniority edge cases
  - Extend [`fixtures/email/`](/home/kevin/coding/openclaw/fixtures/email)
  - Extend [`tests/`](/home/kevin/coding/openclaw/tests)

## Intentionally Deferred

- [ ] Auto-submitting applications
- [ ] Reimplementing Discord outside OpenClaw
- [ ] Multi-tenant abstractions
- [ ] Employer ATS expansion beyond PR1; LinkedIn/Indeed automation is excluded, as defined in the [review runbook](linkedin-workflow.md#local-full-description-review-pr1)
- [ ] Resume fact invention or unsupported claim generation

## Useful Entry Points

- Architecture:
  - [`docs/openclaw-foundation.md`](/home/kevin/coding/openclaw/docs/openclaw-foundation.md)
  - [`docs/openclaw-architecture.md`](/home/kevin/coding/openclaw/docs/openclaw-architecture.md)
- Local runbook:
  - [`docs/openclaw-setup.md`](/home/kevin/coding/openclaw/docs/openclaw-setup.md)
- Main implementation:
  - [`src/core/pipeline.ts`](/home/kevin/coding/openclaw/src/core/pipeline.ts)
  - [`src/db/store.ts`](/home/kevin/coding/openclaw/src/db/store.ts)
  - [`src/discord/review-plan.ts`](/home/kevin/coding/openclaw/src/discord/review-plan.ts)
  - [`src/cli.ts`](/home/kevin/coding/openclaw/src/cli.ts)
- OpenClaw workspace:
  - [`openclaw-workspace/`](/home/kevin/coding/openclaw/openclaw-workspace)
