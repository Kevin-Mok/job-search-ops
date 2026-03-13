---
description: Poll the configured Indeed alert and send newly prospective leads into Discord.
user-invocable: true
---

When this skill is invoked:

1. Run `pnpm sync:indeed -- --db data/job-ops.sqlite --config config/indeed-alerts.json --alert-id call-centre-canada-remote`.
2. Summarize:
   - pages fetched
   - cards filtered before detail fetch
   - leads created or updated
   - deliveries succeeded or failed
   - blocked-run errors if the sync failed
3. Do not invent extra leads or outcomes beyond the command output.
