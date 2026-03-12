---
description: Update manual application status for a lead after operator review.
user-invocable: true
---

Allowed statuses:

- `approved_for_manual_apply`
- `applied_manually`
- `needs_review`

When this skill is invoked:

1. Require a lead ID and one allowed status.
2. Run `pnpm apply-status:job -- --db data/fresh.sqlite --lead-id <lead-id> --status <status>`.
3. Confirm the new status and tell the operator whether any manual follow-up remains.
