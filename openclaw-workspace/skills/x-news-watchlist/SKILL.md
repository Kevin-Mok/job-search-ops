---
description: Show the internally tracked X/Twitter watchlist for the AI news feed.
user-invocable: true
---

When this skill is invoked:

1. Run `pnpm watchlist:x-news -- --db data/job-ops.sqlite --config config/twitter-news.json --list ai-alpha`.
2. Summarize:
   - tracked handles
   - source type (`seed_following`, `bootstrap`, or `discovery`)
   - discovery score for auto-added accounts
   - last fetched time when available
3. Make it clear that the watchlist is internal to the bot and does not mean the real X account followed those users.
