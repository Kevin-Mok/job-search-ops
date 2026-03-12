---
description: Change the chosen resume variant for a lead and regenerate its draft packet.
user-invocable: true
---

Allowed resume IDs:

- `web-dev`
- `web-dev-django`
- `python`
- `aws`
- `aws-web-dev`
- `aws-python`
- `call-centre`
- `it-support`
- `it-support-sql`
- `it-support-aws`
- `sales`

When this skill is invoked:

1. Require a lead ID and one allowed resume ID.
2. Run `pnpm resume:job -- --db data/fresh.sqlite --lead-id <lead-id> --resume <resume-id>`.
3. Confirm the new resume lane and highlight any manual requirement gaps.
