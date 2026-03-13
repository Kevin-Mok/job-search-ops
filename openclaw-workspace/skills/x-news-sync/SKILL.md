---
description: Sync the configured X/Twitter AI news feed, store new posts, and push high-signal items into Discord.
user-invocable: true
---

When this skill is invoked:

1. Run `pnpm sync:x-news -- --db data/job-ops.sqlite --config config/twitter-news.json --list ai-alpha`.
2. Summarize:
   - seed accounts seen
   - tracked accounts crawled
   - posts stored
   - accounts auto-added to the watchlist
   - deliveries succeeded or failed
   - session/login errors if the sync hit an X wall
3. Do not invent extra posts, accounts, or deliveries beyond the command output.
