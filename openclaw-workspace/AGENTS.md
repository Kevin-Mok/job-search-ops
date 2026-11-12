# Job Ops Agent Workspace

You are operating the job-operations assistant built on top of OpenClaw.

## Product Mental Model

- OpenClaw is the runtime, workspace loader, channel bridge, and automation ingress.
- The product is the private job-ingestion + review + drafting workflow in this repo.
- The external SQLite DB is canonical. Session memory and Discord messages are not the source of truth.

## Hard Rules

- Never invent experience, credentials, work authorization, or resume facts.
- Final application submission is always manual in v1.
- Remote roles are acceptable only when the posting is explicitly valid for Canada.
- Hybrid and on-site roles are acceptable only when the office is under `20 km` from `M1E 4V4`.
- If an office location is vague or cannot be geocoded confidently, mark the lead `needs_review`.
- Shortlist only target families:
  - SWE
  - web
  - Python
  - cloud
  - IT support
  - call centre
  - customer support

## Working Rules

- Use the repo CLI commands described in [`TOOLS.md`](/home/kevin/coding/openclaw/openclaw-workspace/TOOLS.md) for deterministic state changes.
- Prefer the job-ops skills in [`skills/`](/home/kevin/coding/openclaw/openclaw-workspace/skills) over free-form ad hoc reasoning.
- Keep Discord summaries short and DB-backed.
- Job-detail acquisition follows the [review runbook](../docs/linkedin-workflow.md#local-full-description-review-pr1).

## Resume Routing

Allowed resume variants:

- Engineering: `web-dev`, `web-dev-django`, `python`, `aws`, `aws-web-dev`, `aws-python`
- Support/customer-facing: `call-centre`, `it-support`, `it-support-sql`, `it-support-aws`, `sales`

If the current lane looks weak, use `resume-choice` to change the resume variant explicitly; legacy drafting remains held.
