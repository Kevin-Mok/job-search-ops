---
description: Inspect the legacy draft hold for a lead without changing review state.
user-invocable: true
---

When this skill is invoked:

1. Require a lead ID.
2. Run `pnpm draft:packet -- --db data/fresh.sqlite --lead-id <lead-id>`.
3. Report the refusal or hold exactly; follow the [review runbook](../../../docs/linkedin-workflow.md#local-full-description-review-pr1) for approved-evidence work.
