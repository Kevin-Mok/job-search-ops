---
description: Review a specific job lead and summarize fit, policy outcome, resume choice, and draft status.
user-invocable: true
---

When this skill is invoked:

1. Require a lead ID.
2. Run `pnpm show:lead -- --db data/fresh.sqlite --lead-id <lead-id>`.
3. To inspect the legacy draft hold, run `pnpm draft:packet -- --db data/fresh.sqlite --lead-id <lead-id>`.
4. Summarize the lead in four parts:
   - fit and score
   - location policy result
   - chosen resume lane
   - next operator action
