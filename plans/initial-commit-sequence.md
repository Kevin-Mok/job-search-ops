# Initial Commit Sequence ExecPlan

## Goal

Capture the current greenfield OpenClaw job-ops POC in a small sequence of reviewable commits instead of one large initial dump.

## Assumptions

1. The current worktree is intended to become the first committed version of this repo.
2. The plan may be used directly to execute the staged commit sequence.
3. Keeping each commit buildable and testable is more important than minimizing the number of commits.

## Proposed Commit Sequence

- [x] Commit 1: bootstrap the repo toolchain and ignore rules.
  - Message: `chore(repo): bootstrap job ops poc toolchain`
  - Files:
    - `.gitignore`
    - `package.json`
    - `pnpm-lock.yaml`
    - `tsconfig.json`
    - `vitest.config.ts`
  - Verification:
    - `pnpm test`

- [x] Commit 2: add the fixture-driven job-ops implementation and regression tests.
  - Message: `feat(job-ops): implement fixture-driven ingest and review pipeline`
  - Files:
    - `src/cli.ts`
    - `src/core/drafting.ts`
    - `src/core/parsing.ts`
    - `src/core/pipeline.ts`
    - `src/core/policy.ts`
    - `src/core/resume-catalog.ts`
    - `src/core/routing.ts`
    - `src/core/types.ts`
    - `src/db/store.ts`
    - `src/discord/review-plan.ts`
    - `fixtures/email/indeed-alert-2026-03-12.json`
    - `fixtures/email/indeed-alert-2026-03-13.json`
    - `fixtures/email/linkedin-alert-2026-03-12.json`
    - `tests/location-policy.test.ts`
    - `tests/parsing.test.ts`
    - `tests/pipeline.test.ts`
    - `tests/review-state.test.ts`
  - Verification:
    - `pnpm test`
    - `pnpm replay:fixtures -- --db data/fresh.sqlite`
    - `pnpm review:state -- --db data/fresh.sqlite`

- [x] Commit 3: add operator docs, OpenClaw workspace assets, and the example config.
  - Message: `docs(openclaw): add workspace config and runbooks`
  - Files:
    - `README.md`
    - `codex-plan.md`
    - `config/openclaw.example.json5`
    - `docs/TODO.md`
    - `docs/openclaw-architecture.md`
    - `docs/openclaw-foundation.md`
    - `docs/openclaw-setup.md`
    - `openclaw-workspace/AGENTS.md`
    - `openclaw-workspace/SOUL.md`
    - `openclaw-workspace/TOOLS.md`
    - `openclaw-workspace/skills/draft-packet/SKILL.md`
    - `openclaw-workspace/skills/job-apply-status/SKILL.md`
    - `openclaw-workspace/skills/job-approve/SKILL.md`
    - `openclaw-workspace/skills/job-note/SKILL.md`
    - `openclaw-workspace/skills/job-reject/SKILL.md`
    - `openclaw-workspace/skills/job-review/SKILL.md`
    - `openclaw-workspace/skills/job-triage/SKILL.md`
    - `openclaw-workspace/skills/resume-choice/SKILL.md`
    - `plans/initial-commit-sequence.md`
    - `plans/openclaw-job-ops-poc.md`
  - Verification:
    - `pnpm test`
    - `OPENCLAW_STATE_DIR="$PWD/.openclaw-dev" OPENCLAW_CONFIG_PATH="$PWD/.openclaw-dev/openclaw.json" openclaw config validate --json`
    - `OPENCLAW_STATE_DIR="$PWD/.openclaw-dev" OPENCLAW_CONFIG_PATH="$PWD/.openclaw-dev/openclaw.json" openclaw skills list`

## Notes

- The current `.gitignore` already excludes `node_modules/`, `dist/`, `coverage/`, `data/`, and `.openclaw-dev/`, so generated DBs and local OpenClaw state should stay untracked.
- `codex-plan.md` reads like design/provenance documentation. If the user does not want planning artifacts in the repo history, move it out of Commit 3 or drop it entirely before staging.
- If the user prefers a single public-facing commit after local review, this sequence can still be used locally and later squashed into `feat(job-ops): add OpenClaw job ops POC`.

## Review

- Current baseline verification passed: `pnpm test` completed successfully with 4 test files and 7 tests passing on March 12, 2026.
- This sequence is designed so each commit has a clear intent and avoids mixing runtime code with operator documentation/config scaffolding.
- Commit 1 created `7570c94` with the planned toolchain and ignore files.
- Commit 2 created `d1c8a3f` with the fixture-driven pipeline, SQLite store, CLI, and regression tests.
- Commit 2 verification succeeded via `pnpm test`, `pnpm replay:fixtures -- --db data/fresh.sqlite`, and `pnpm review:state -- --db data/fresh.sqlite`.
- No git remote is configured in this repository, so there was nothing to push after the commits.
