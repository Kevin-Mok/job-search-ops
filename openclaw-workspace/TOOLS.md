# Job Ops Tools

All commands assume the repo root is the current working directory.

## Build And Replay

```bash
pnpm replay:fixtures -- --db data/fresh.sqlite
pnpm review:state -- --db data/fresh.sqlite
pnpm sync:x-news -- --db data/job-ops.sqlite --config config/twitter-news.json --list ai-alpha
pnpm brief:x-news -- --db data/job-ops.sqlite --config config/twitter-news.json --list ai-alpha --hours 24
pnpm watchlist:x-news -- --db data/job-ops.sqlite --config config/twitter-news.json --list ai-alpha
```

## Inspect A Lead

```bash
pnpm show:lead -- --db data/fresh.sqlite --lead-id maple-systems-junior-python-developer
pnpm draft:packet -- --db data/fresh.sqlite --lead-id maple-systems-junior-python-developer
```

## Review Actions

```bash
pnpm approve:job -- --db data/fresh.sqlite --lead-id maple-systems-junior-python-developer
pnpm reject:job -- --db data/fresh.sqlite --lead-id maple-systems-junior-python-developer --reason "Outside policy"
pnpm note:job -- --db data/fresh.sqlite --lead-id maple-systems-junior-python-developer --note "Manual recruiter follow-up needed"
pnpm resume:job -- --db data/fresh.sqlite --lead-id maple-systems-junior-python-developer --resume aws-python
pnpm apply-status:job -- --db data/fresh.sqlite --lead-id maple-systems-junior-python-developer --status applied_manually
```

## Expected Outputs

- `replay:fixtures` prints ingest summary JSON plus the current canonical lead set.
- `review:state` prints the Discord shortlist feed and per-lead thread projections rebuilt from DB state.
- For the disabled legacy `sync:indeed` command and local full-description capture, follow the [review runbook](../docs/linkedin-workflow.md#local-full-description-review-pr1).
- `sync:x-news` prints the X news sync summary, stored-post counts, auto-added watchlist handles, and Discord delivery counts.
- `brief:x-news` prints the top stored X news items from the requested lookback window.
- `watchlist:x-news` prints the internal X news watchlist stored in SQLite.
- `show:lead` prints lead JSON. `draft:packet` enforces description acceptance and otherwise returns a hold; use the [review runbook](../docs/linkedin-workflow.md#local-full-description-review-pr1) for approved-evidence work.

## Constraints

- Use these commands for DB mutations instead of editing SQLite manually.
- Treat `data/*.sqlite` as canonical state for this POC.
- If a command output and Discord thread disagree, trust the DB output and rebuild the Discord projection.
