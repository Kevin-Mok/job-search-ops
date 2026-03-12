---
description: Show the current draft packet for a lead without changing review state.
user-invocable: true
---

When this skill is invoked:

1. Require a lead ID.
2. Run `pnpm draft:packet -- --db data/fresh.sqlite --lead-id <lead-id>`.
3. Present:
   - chosen resume
   - rationale
   - tailored summary
   - cover letter draft
   - screener answers
4. If the draft depends on unsupported facts, say so plainly.
