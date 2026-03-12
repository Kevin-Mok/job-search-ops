---
description: Mark a lead approved for manual application.
user-invocable: true
---

When this skill is invoked:

1. Require a lead ID.
2. Run `pnpm approve:job -- --db data/fresh.sqlite --lead-id <lead-id>`.
3. Confirm that the lead is now `approved_for_manual_apply`.
4. Remind the operator that final submission is still manual.
