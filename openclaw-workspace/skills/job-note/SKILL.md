---
description: Attach an operator note to a lead without changing its current status.
user-invocable: true
---

When this skill is invoked:

1. Require a lead ID and note text.
2. Run `pnpm note:job -- --db data/fresh.sqlite --lead-id <lead-id> --note "<note>"`.
3. Confirm that the note was recorded in review events.
