# Job Ops Tools

All commands assume the repo root is the current working directory.

## Build And Replay

```bash
pnpm replay:fixtures -- --db data/fresh.sqlite
pnpm review:state -- --db data/fresh.sqlite
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
- `show:lead` and `draft:packet` print exact JSON for the selected lead.

## Constraints

- Use these commands for DB mutations instead of editing SQLite manually.
- Treat `data/*.sqlite` as canonical state for this POC.
- If a command output and Discord thread disagree, trust the DB output and rebuild the Discord projection.
