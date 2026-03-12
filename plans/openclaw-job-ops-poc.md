# OpenClaw Job Ops POC ExecPlan

## Goal

Build a fixture-first proof of concept for a single-user private job-operations assistant that runs on top of OpenClaw, keeps an external DB as canonical state, and uses OpenClaw workspaces plus Discord/Gmail ingress patterns instead of a parallel custom bot runtime.

## Assumptions

1. Live Gmail Pub/Sub and Discord credentials are not available in this workspace, so the POC must be runnable from replayable fixtures.
2. The repo does not already contain reusable application code, so a thin TypeScript scaffold is acceptable.
3. Resume PDFs are not present in this repo, so the POC will route to existing resume variant IDs plus supported evidence snippets rather than embed the real files.

## Plan

- [x] Verify official OpenClaw docs and local CLI/schema before deciding config keys.
- [x] Bootstrap repo structure, package metadata, and top-level docs.
- [ ] Implement the fixture-driven ingest, normalize, dedupe, score, route, and draft pipeline.
- [ ] Persist canonical job/review state in SQLite and derive Discord review projections from DB state.
- [ ] Add OpenClaw workspace files, skills, and an example config using validated OpenClaw keys.
- [ ] Add tests for parsing, policy evaluation, dedupe, routing, and review state reconstruction.
- [ ] Validate the example OpenClaw config and note live-integration blockers.

## Review

- OpenClaw CLI was installed from the official installer and verified locally.
- Gateway subcommands require unsandboxed execution in this environment for accurate validation.
- PATH still needs `/home/kevin/.local/share/fnm/node-versions/v22.15.0/installation/bin` exported for new shells.
