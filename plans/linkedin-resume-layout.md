# LinkedIn resume layout correction

Diagnose the supplied sparse synthetic screenshots separately from approved-content exclusions and renderer geometry. Compare identical synthetic content with the canonical Letter print context, then correct only demonstrated adapter differences and retain fresh private rendering/attachment evidence.

## Scope and assumptions

- Isolated `fm/linkedin-resume-layout`, clean initial base `7192d8d0b3a0c7374e6cd179d101896bb511ff03`; preserve predecessor pipeline and history. No push until Firstmate authorizes native no-mistakes against `fm/job-search-1h-sprint`.
- Portfolio is read-only. Its current Letter PDF is the reference; legacy A3 baseline and minimum-whitespace pass are insufficient parity evidence.
- Private inputs/outputs remain outside Git. No held intro/bullets, invented claims, fill stretching, external services, model dispatch or global/config changes.
- No local root AGENTS or `.agent/PLANS.md` exists. Follow supplied worker brief. Execute already approved prompt rather than authoring another prompt.

## Investigation

- [x] Read saved prompt, frozen observations, renderer/profile/demo/tests, current plan, runbook and lessons. Inspect original screenshots and canonical source/CSS/generator. Initial title/isolation/branch checks and no-mistakes doctor passed; Node launcher reports v22.15.0.
- [x] Memory lookup `resume PDF layout whitespace CMU`: toolbar/color and unrelated operational findings do not apply to print geometry; no remedy reused.
- [x] Trigger: screenshot comparison. Masking inputs: default demo has only two synthetic claims/no profile; approved real profile also excludes held text. Visible symptom: sparse page plus wider text bounds. History: canonical adapter introduced in `4a5c2ef`, copied resume CSS without surrounding page context.
- [x] Define executable same-content geometry regression; observe RED for expected margin/context differences.
- [x] Compare canonical context and minimal counterfactual, including bounding boxes, fonts, wrap/line/section gaps. Disconfirm content-only and font-size-only explanations.
- [x] Minimum GREEN adapter correction; preserve escaping, links, full approved text and CMU faces.
- [x] Verify both job targets, complete synthetic approved profile and long-text controls. Inspect exact new PNGs before hash-bound fixture attachment; replay in separate processes. Repeat immutable paired private inputs privately.
- [x] Run focused/full checks and build, review diff/docs, record exact commands, hashes, measurements/artifacts and risks in task-private report/progress/checks.
- [x] Prepare one cohesive implementation/test/docs/plan commit, subject `fix: match canonical resume print context`; actual commit hash and final clean inventory are recorded in task-private progress after commit. Native validation remains a separately authorized next phase.

## Evidence and risks

Fresh command logs and rendered artifacts live under the authorized task-private output directory. Prior 277-test proof is historical. Public tests contain only synthetic claims; no private claim text or artifact enters Git or review intent. Canonical icons/intro differ from approved adapter content and must not be misrepresented as matched content. Whitespace remaining due to missing approved material is an explicit limit, not a reason to stretch the page.

## Verification and delivery milestone

- Defining RED: environment-enabled `tests/resume-layout.test.ts` at the original renderer fails at left text14.25pt versus expected32.25pt (18pt error). Same-content original bounds14.25–597.75pt; canonical32.25–579.75pt. All use612×792pt Letter and local CMU.
- Minimal counterfactual: wrapper inset alone corrects horizontal bounds but leaves bottom whitespace64.465pt versus canonical55.465pt. Restoring the canonical base reset/heading rhythm yields zero measured word-box differences in both normal targets and a long target that wraps. No canonical print scaling, line/section gap variables, claim text or font files changed.
- Complete representative synthetic profile: two jobs, two projects,12 bullets. Both normal targets have55.465pt bottom whitespace; long target40.465pt. An intentionally combined overlong work/project/title case is rejected as multi-page; no compression or silent omission.
- Supplied screenshot fixture has3 bullets and less content than the canonical portfolio. Default demo is even smaller (2 claims/no profile); neither establishes density parity. Added explicit synthetic profile/evidence for public layout proof rather than replacing old defaults or markers.
- Immutable private paired inputs: both fit1 targets rendered, inspected, hash-approved and attached through existing fixture interfaces. Corrected bounds32.25–579.75pt; bottom whitespace107.215pt versus prior163.465pt. Remaining whitespace reflects different approved content, including held intro/two bullets, not a request to fill it.
- Fresh focused47/47 passed. Final environment-enabled full suite278/278 across25 files,0 skipped, exit0 (17.11s). `pnpm build` exit0. All4 exact attachment PDFs and PNG hashes remain unchanged after separate-process replay; second full replay retains identical journal bytes. Every matched canonical and generated PNG was visually inspected at1400px scale.
- README scope gate: update_in_same_change, one truthful layout-proof bullet; existing stack/setup/workflow remain accurate. Updated runbook, smoke checks, continuation prompt and local lesson. No config changed; refresh/chezmoi is explicitly excluded.
- Task-private replay helper initially expected an invented status; corrected to the existing `delivered` contract and reran both proofs successfully. [Local incident](../docs/postmortem/2026-11-10-resume-layout-proof-status.md) records the evidence. Canonical incident registration remains Firstmate-owned: read-only helper reports this new hash/alias; worker outside-write authority excludes that repository.
- Review: minimal production diff is one HTML print-context adjustment plus explanation. No renderer framework, output/protocol, approval, receipt or job-selection changes. Existing profiles/approved text, escaping, links, stale-input/admission and artifact validation regressions pass.
- Rollback: revert this focused change through the authorized owner; retain old receipts and private run directories. A changed renderer requires fresh artifact/PNG approval, never replacement of a delivered run.
- Publication: final local commit is the implementation handoff; native no-mistakes has not started. Firstmate inbox001 authorizes this worker to drive it after the focused commit and clean status. New run must preserve Codex, every gate, `--no-publish-intent`, no `--yes`, and `--base-branch fm/job-search-1h-sprint`. No direct push/merge/CI/config changes.
