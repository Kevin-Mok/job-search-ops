---
description: Replay fixtures or review newly ingested job leads and summarize the shortlist queue.
user-invocable: true
---

When this skill is invoked:

1. Run `pnpm replay:fixtures -- --db data/fresh.sqlite` unless the user clearly asks to inspect an existing DB only.
2. Run `pnpm review:state -- --db data/fresh.sqlite`.
3. Summarize:
   - new shortlisted leads
   - leads marked `needs_review`
   - rejected leads worth mentioning only if they explain policy coverage
4. Do not invent extra facts beyond the DB output.
