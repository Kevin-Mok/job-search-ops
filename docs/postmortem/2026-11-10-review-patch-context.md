# Review documentation patch context mismatch

Keep each patch anchored to the complete current source line, then inspect the actual file state before correcting a failed multi-file patch.

- Symptom: the review fix round's documentation patch was rejected because its final context line was only a prefix of an existing paragraph.
- Impact: documentation changes were not applied by that invocation; no runtime command, private input or delivery receipt was affected. Earlier file edits in that invocation required inspection before retry.
- Lookup: the local `2026-11-10-offline-verification-command-boundaries.md` incident concerns verification setup and input-shape assumptions. Its producer/consumer inspection lesson applies; its pnpm and private-data remedies do not apply to this patch-context error.
- Evidence: `apply_patch` reported `Failed to find expected lines` for the environment-enabled verification paragraph in `docs/linkedin-workflow.md`. Reading the complete paragraph confirmed that additional text followed the proposed context.
- Root cause: an unnecessary trailing documentation hunk used incomplete exact-match context.
- Resolution: inspected both files and confirmed that the rejected invocation applied no partial edits. Reapplied the bounded source/doc changes using complete current paragraphs, omitting the unnecessary trailing hunk; `apply_patch` succeeded.
- Verification: the corrected patch applied successfully. After all source fixes and retracing, the focused six-file regression command passed55 tests with1 existing environment-gated render skip; the demo setup build succeeded. Full output is retained at ignored `data/review-fixes/green.log`.
- Status: patch-context error resolved; broader validation remains with the outer executor.
- Follow-up: cross-repository postmortem-memory registration is outside this worktree's authorized write boundary. The supervising owner must register this report in the canonical ledger; installed copies were not changed.
