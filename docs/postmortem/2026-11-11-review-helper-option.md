# Review helper option mismatch

This records a read-only lookup failure during duplicate-hold review. Consult installed help before selecting helper options, then keep product verification scoped to the review phase.

- Symptom: postmortem-memory search rejected `--compact` with exit2.
- Impact: lookup delayed; no product or external state changed.
- Evidence: installed search help lists query and optional `--knowledge`, without `--compact`.
- Cause: skill instructions and installed helper options differ.
- Resolution: used supported search syntax; exit0. Search for `duplicate operator hold posting refresh` produced no applicable remedy for the product defect.
- Status: resolved lookup failure; duplicate-hold product regression is recorded in plans/linkedin-resume-ci.md.
- Follow-up: canonical external knowledge registration remains owner-controlled because this review prohibits intentional writes outside the worktree. No tool/config changes attempted.
