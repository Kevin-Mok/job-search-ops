---
description: Reject a lead and record the reason in canonical review state.
user-invocable: true
---

When this skill is invoked:

1. Require a lead ID and a short rejection reason.
2. Run `pnpm reject:job -- --db data/fresh.sqlite --lead-id <lead-id> --reason "<reason>"`.
3. Confirm the rejection and summarize the stored reason.
