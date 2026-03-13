---
description: Summarize the highest-signal stored X/Twitter AI news items from the last day.
user-invocable: true
---

When this skill is invoked:

1. Run `pnpm brief:x-news -- --db data/job-ops.sqlite --config config/twitter-news.json --list ai-alpha --hours 24`.
2. Present:
   - author
   - matched topic tags
   - why it matters
   - direct X link
3. If the user asks for one topic only, rerun with `--topic <topic-id>`.
