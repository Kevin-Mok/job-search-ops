# LinkedIn email and job review workflow

Run a normalized LinkedIn alert through SQLite, a stable Discord review thread, explained fit, an approved-evidence resume draft and exact PDF attachment. Start with the synthetic local demo, inspect its page images, then retain the database and private artifacts for restart. Gmail/account connection and real Discord delivery require a separate authorized test.

## What this implementation proves

| Stage | Current evidence | Boundary |
| --- | --- | --- |
| LinkedIn intake | Normalized JSON plus trusted captured Gmail full/raw MIME and labeled HTML parsing | Unknown/unlabeled layouts held; no live Gmail history consumer or automatic auth verifier |
| Canonical state | Transactional message/hash versions, posting URL identity, chronological observation pointer | No inference that a repeated alert proves a job is open |
| Initial alert/thread | Durable root/thread receipts, restart, leases, retry/backoff and uncertain readback | Fixture and mocked HTTP; real Discord remains untested |
| Eligibility | Explicit eligible/ineligible/needs_review decisions tied to posting version | Unknown authorization stays needs_review; location rejection cannot be approved through the CLI |
| Fit | Explained 1–10 exact declared-skill coverage, evidence links and version hashes | Does not measure experience depth or hiring probability; does not gate resume work |
| Tailoring | Every eligible job gets durable private prepared JSON and Codex handoff; optional complete canonical profile routes exact approved claims within their original entries | Deterministic target ordering, not model rewriting; actual Codex CLI execution blocked because tool isolation is unproven; approval provenance is a trusted private handoff |
| PDF | Canonical web-dev sections/metadata or legacy contribution draft, unchanged portfolio CSS/local Computer Modern; exact bytes checked for Letter, one page, embedded bold fonts, full required text, existing layout gates and PNG | Only explicitly approved bullets render; source-only statements and summaries remain held. Page review establishes layout, not hiring quality |
| Attachment | Explicit visual approval names the exact hash; current job/version/eligibility rechecked; returned bytes go to the stored thread | Local fixture attachment and mocked REST requests are not live delivery evidence |
| Outcome | Same-thread authenticated local review handoff plus existing operator commands, atomic actor/interaction audit | No live socket/signature consumer; applied_manually requires explicit manual attestation |

## Local prerequisites

Use Node 22 compatible dependencies, pnpm, Google Chrome, Poppler (`pdfinfo`, `pdffonts`, `pdftotext`, `pdftoppm`), and a read-only portfolio checkout containing the existing CMU assets and layout-check scripts. Build with `pnpm build`. If cached `better-sqlite3` was built for another Node ABI, rebuild the task-local dependency using `pnpm rebuild better-sqlite3` before interpreting database test failures.

The demo always uses synthetic job/email data and a local fixture journal. Candidate/evidence inputs default to synthetic data, with an optional paired private handoff described below. It cannot choose a Discord destination. Output inside this checkout must use gitignored `data/`; an external task-private directory also works. No sudo is needed.

```fish
node scripts/linkedin-demo.mjs --output-dir data/linkedin-demo --phase intake
node scripts/linkedin-demo.mjs --output-dir data/linkedin-demo --phase prepare --portfolio-root /absolute/path/to/portfolio-site
```

Intake should report four jobs, three delivered fixture threads and one held posting. Prepare should produce two eligible PDF drafts pending visual review, one needs_review and one ineligible record. Synthetic eligibility decisions are made only by this fixture demo; the production CLI requires explicit operator review.

Inspect both `previewPath` PNGs from the prepare result. Check candidate, target, every approved claim, typography, clipping/overlap, page bounds and readability. The sparse synthetic draft is intentional. After inspecting the exact pages, attach only those fixture bytes:

```fish
node scripts/linkedin-demo.mjs --output-dir data/linkedin-demo --phase attach --approve-visual --portfolio-root /absolute/path/to/portfolio-site
node scripts/linkedin-demo.mjs --output-dir data/linkedin-demo --phase intake
node scripts/linkedin-demo.mjs --output-dir data/linkedin-demo --phase state
```

Attachment should show two delivered fixture receipts and no application submission. Replay reports `replayed: true` and retains the same lead/thread/artifact identities. Re-running prepare does not repeat completed work. Keep the output directory, database and journal together; creating a new journal selects another fixture target and intentionally produces another projection.

## Captured connection demo

Use `node scripts/linkedin-demo.mjs --output-dir data/linkedin-connections --phase connections` for the complete synthetic connection handoff. It builds a captured Gmail JSON message plus **synthetic-only** trusted context, ingests four jobs, records an authorized note against the original persisted thread, prepares two eligible jobs, and writes immutable private Codex plans. The result reports zero model calls/production sends and `blocked_cli_isolation_unverified`. Continue with the existing prepare/render and visual-review/attach demo phases if desired.

New CLI seams are `gmail-intake --email-file CAPTURE_JSON --trusted-context CONTEXT_JSON --verified-handoff --transport fixture --journal PRIVATE_JSON`, `discord-review --interaction-file CAPTURE_JSON --review-config ALLOWLIST_JSON --verified-handoff`, and `codex-resume-plan --work-id ID --private-dir DIR`, all with the same `--db`.

Gmail context is separate trusted verifier output: `{verifier:"local-gmail",messageId,sender,authenticated:true,evidenceId,payloadSha256}`. The digest is SHA-256 of `JSON.stringify(capture)` and binds the exact verified bytes/identity. It is not generated from mail headers. Supported captures include base64url Gmail multipart, bounded raw MIME/base64/quoted-printable and labeled HTML with explicit job fields. UTF-8 only; missing/ambiguous fields and unsupported layouts produce durable SQLite intake holds with reasons. Correct verification/parsing can resolve the same captured-version hold. No Gmail API/account/authentication verifier is invoked.

Discord review requires separate configured target/user/parent-channel/thread allowlists plus authenticated interaction metadata containing the original thread/root-message IDs. The handler resolves the job from persisted delivery state; payload lead IDs are not authority. `applied_manually` requires `manualApplicationConfirmed:true`, and actor/interaction provenance is stored atomically with state changes. Interaction admission takes the SQLite write lock in that same transaction, so two independent processes cannot both apply one interaction. A replay returns `replayed_interaction` without another state/audit write; audit failure rolls the whole action back. Context-free local operator actions remain repeatable. A JSON flag is not cryptographic authentication; a live signature/socket consumer is still required.

Codex planning validates current eligibility and exact handoff/prepared hashes, job version and thread. Its plan remains private. The injectable isolated-runner API has exclusive durable attempt receipts, approved-ID-only output and uncertainty/restart barriers, verified without model calls. The CLI exposes **planning only**; there is no production model invocation. Installed Codex help did not establish a no-tools/no-network boundary sufficient for untrusted posting text, so execution remains explicitly blocked.

## Actual CLI and private inputs

`node dist/src/cli.js help` prints the supported commands and flags. JSON goes to stdout; progress goes to stderr every five seconds during slow work. `--plain` removes decorative glyphs. No secrets are accepted on the command line.

- `linkedin-intake`: requires `--email-file`, `--transport`, and either `--fixture` or `--verified-handoff`; optionally selects `--db`.
- `linkedin-deliver`: drains/reconciles previously persisted intake without the original email file.
- `linkedin-state`: displays persisted source versions, delivery state and versioned job work.
- `linkedin-eligibility`: requires `--lead-id`, `--status eligible|ineligible|needs_review` and `--note`. An eligible decision means the operator confirmed **all** hard requirements, including authorization, for this exact posting version.
- `linkedin-work`: processes every eligible job, with no minimum score, role exclusion or top-N cutoff. Use private `--candidate` and `--evidence` JSON paths; `--private-dir` controls outputs. Without `--render`, it stops at prepared inputs. Add `--render --portfolio-root` to run the private PDF adapter. Missing/invalid inputs remain durable blocked work.
- `linkedin-attach`: requires `--work-id`, exact `--sha256`, `--approve-visual` and `--portfolio-root`. It revalidates captured bytes and current eligibility before attachment. A validation failure is persisted; an uncertain send must reconcile before another write.

Every command uses the same `--db`. A fixture transport requires `--transport fixture --journal PRIVATE_JSON`. Private candidate JSON is `{ "name": "Alex Example", "email": "alex@example.test" }` for the synthetic example. Approved evidence is an array of `{ "id": "synthetic-python", "claim": "Built **Python** validation fixtures.", "skills": ["python"], "source": "synthetic://approved/commit", "approved": true }`. Real evidence must come from verified contributions, not posting text or an inferred directory owner. Approval flags are a trusted operator handoff, not an authorship verifier.

## Canonical profile and approval boundary

Add an optional `profile` to the private candidate JSON to preserve the complete existing web-dev structure. The exported [CanonicalResumeProfile](../src/core/resume-profile.ts) and [synthetic profile tests](../tests/resume-profile.test.ts) define the exact version1 schema:

- `baseline`: `variantId: "web-dev"` and relative portfolio source paths with SHA-256 hashes. Bind the baseline data, approved bank, layout specification/baseline, CSS and local fonts you actually verified. Referenced files are checked read-only at render and attachment; traversal, symlink escape or changed hashes block work.
- `contact`: phone, LinkedIn and GitHub; candidate name/email remain at the top level. LinkedIn/GitHub accept scheme-less labels or absolute HTTPS URLs, preserving their display text. Explicit non-HTTPS schemes are rejected during preparation and rendering. `sectionTitles` names experience, projects, skills and education, optionally otherExperience.
- `experience` and optional `otherExperience`: company, title, date, languages, `evidenceIds`, and optional company/title/evidence HTTPS links. `projects`: name, date, languages, `evidenceIds` and optional HTTPS URL.
- `skills`, optional `skillsBold`, `education` (institution, degree, GPA text, date), and optional `primarySectionOrder` (`experience-first` or `projects-first`). Existing CMU layout classes, spacing, bold typography and one-page gates are reused unchanged. The target header explicitly says **Application target**.

Metadata comes from the operator-approved canonical baseline; contribution bullets come only from exact IDs in the approved evidence input. A baseline document alone does not approve a contribution claim. Preserve source/author/approval evidence in private provenance records; repo attribution does not establish employment. Do not invent approval IDs. `SRC-` references, absent/unapproved IDs, duplicate routing, arbitrary bullet text and summaries are rejected. Empty entry `evidenceIds` retain the metadata while unapproved statements stay held privately. Unrouted bank claims do not appear. This is structural retention with approved content, not verbatim reproduction of held source text.

For a private profile fixture run, choose a fresh output directory and pass both inputs:

```fish
node scripts/linkedin-demo.mjs --output-dir /absolute/private/profile-demo --phase connections --candidate /absolute/private/candidate.json --evidence /absolute/private/approved-evidence.json
node scripts/linkedin-demo.mjs --output-dir /absolute/private/profile-demo --phase prepare --portfolio-root /absolute/path/to/portfolio-site
```

Both files must be bounded regular JSON files. They are validated before creating the run, copied with private permissions and fingerprinted in its fixture-only marker. Later phases may omit both flags and reuse those snapshots. A missing partner or changed candidate/evidence is rejected without replacing saved inputs. Keep the original input files and provenance privately; no real candidate facts belong in committed examples. Fixture-job eligibility remains synthetic and establishes no authorization for a real vacancy.

The general `linkedin-work` command binds candidate/profile and approved evidence before its first fit delivery attempt. Changed inputs are rejected while preserving prepared files, handoffs, PDF metadata, visual approval and all delivery receipts, including uncertain outcomes. Prepared candidate/profile/claim hashes and derived required text are recomputed before attachment, in addition to the exact PDF hash and job/version/thread binding. Treat work as immutable: restore the original inputs to reconcile an uncertain delivery, and use a separate private fixture run for revised inputs. Completed receipts remain historical; changing an input does not rewrite a delivered resume.

Normalized email input follows the existing fixture contract: `messageId`, `source: "linkedin"`, `receivedAt`, `from`, `subject`, and `textBody`. Bodies use `Title:`, `Company:`, `Location:`, `Work model:`, `Remote eligibility:`, `Skills:`, `View Job:` and `Description:` blocks separated by `---`. See the checked-in synthetic LinkedIn fixture. Only exact `jobs-noreply@linkedin.com` and `jobalerts-noreply@linkedin.com` senders are currently accepted. HTTPS LinkedIn posting URLs are canonicalized, including numeric IDs and removal of tracking query strings.

`--verified-handoff` is for an already authenticated, trusted local adapter/operator. It does **not** verify SMTP headers, DKIM, Gmail identity or DMARC. Do not expose this command as an unauthenticated webhook or let an email/model set its own trust metadata. Captured raw MIME/labeled HTML uses the bounded parser above; unfamiliar real layouts and the external sender-authentication boundary still require verified continuation. Posting text is stored as untrusted data and never executed.

## Delivery recovery

SQLite is canonical; the Discord journal/remote channel is a projection. Message replays are transactional. Different posting URLs stay separate even with identical titles/companies. Older observations remain in the message version ledger but cannot replace newer posting content. Equal observation timestamps are not a robust external ordering signal; controlled handoffs should preserve accurate provider receive times. The existing Indeed/legacy fixture dedupe policy is unchanged.

Initial sends have a 60-second per-item lease; job work has a five-minute lease. A crashed write becomes reconciliation-required after its lease expires. Readback looks for the stable marker authored by the configured bot, and validates thread/attachment receipts. A bounded 100-message history read cannot prove absence: a missing match stays uncertain. Do not clear uncertain state or resubmit blindly. A later matching readback resumes the same job/thread. Missing permissions, deleted/archived threads or unresolved ambiguity require operator investigation.

429 timing starts when the response arrives, and target backoff is persisted. Readback throttling preserves uncertainty across retries. Corrected location holds can resume, while a current rejection stops pending delivery, expired-send recovery and new thread creation after readback. Completed receipts are preserved. Posting versions include exact parsed remote-eligibility text, seniority, employment type, office location and compensation fields as well as title, company, location, work model, description, skills and location decision. A change requires a new eligibility decision and keeps prior work for audit; existing work made with the older fingerprint also requires renewed review after upgrading. Explicit operator rejection and manual resume selection are retained across source refresh, and the packet is rebuilt from the final state.

Remote-eligibility text is stored in the nullable `remote_eligibility_raw` column, added automatically when opening an older database. Historical missing text remains unknown until a new observation; no eligibility classification or inferred backfill is introduced. A newer LinkedIn observation replaces the exact parsed text, including removal. Legacy merged observations retain the most recently supplied text when later metadata omits it.

Work admission is checked after claim and again after awaited fit delivery/readback, PDF validation and rendering, before new preparation or artifact publication. Fit and PDF transports recheck synchronously after thread lookup, immediately before POST. Revocation or changed source facts block further writes while retaining prior inputs and known/uncertain receipts; a returned receipt is recorded even when its send or readback overlaps revocation. Validation-time attachment denial fails before creating a delivery attempt or replacing visual approval.

A known local admission denial before POST preserves the previous fit/PDF delivery record exactly, including an absent record or a definite retry. Restore explicit eligibility for the unchanged posting and repeat the same work/attachment command to resume; the inputs remain immutable. Actual transport permission blocks stay blocked, and uncertain attempts still require matching readback. An already issued remote request may finish after revocation; its returned receipt is retained rather than claiming cancellation.

Fixture journal mutations share a SQLite immediate transaction using a private adjacent `.lock.sqlite` file. Concurrent alert, thread, fit and attachment writes preserve successful receipts; repeated attachment keys retain the original bytes. SQLite releases the lock when a process exits. Keep the private run directory together when resuming or restoring; the JSON journal remains the receipt record. Lock contention errors flow through the existing uncertainty handling.

The [Discord message API](https://docs.discord.com/developers/resources/message) only deduplicates an enforced nonce over a short recent window; this implementation therefore retains local receipts/reconciliation rather than claiming exactly-once delivery. It disables all generated mentions, suppresses previews and uses [documented message threads](https://docs.discord.com/developers/resources/channel). [Rate-limit responses](https://docs.discord.com/developers/topics/rate-limits) control retry timing. Attachments above the conservative 8 MiB cap block; text fallback never counts as PDF delivery.

## Exact remaining live gate

Before any real send, choose an explicitly authorized private **text** channel, confirm the intended bot/server and permissions (view channel, read history, send messages, create public threads, send in threads, attach files), and provide `JOB_OPS_DISCORD_BOT_TOKEN` through the existing local environment/secret mechanism. Select `--transport discord --channel-id CHANNEL_ID --authorized-test-destination`; no default real destination is inferred. Fixture intake cannot select that live transport. Do not place tokens in files, arguments, prompts, reports or Discord.

No mailbox/account connection, production send or gateway/service change was performed. Gmail Pub/Sub watch renewal/history recovery, automatic trustworthy sender/signature verification, unfamiliar actual LinkedIn layouts and a controlled live replay/retry test remain unimplemented/unverified. LinkedIn stays email/manual handoff; there is no authenticated LinkedIn extraction. X news is unrelated to the job loop.

## Verification, rollback and continuation

```fish
pnpm test
pnpm build
env JOB_OPS_PORTFOLIO_ROOT=/absolute/path/to/portfolio-site pnpm exec vitest run tests/job-workflow.test.ts tests/job-resume.test.ts tests/resume-profile.test.ts tests/linkedin-route.test.ts tests/linkedin-transport.test.ts
```

The environment-enabled command exercises actual private PDF rendering and hash-bound fixture attachment. Include `tests/resume-profile.test.ts` for canonical metadata, source hashes, routed evidence and full required-text gates. Without the portfolio environment, optional real-render tests are skipped; that is not PDF verification. The suite also covers corrupt/multi-page/non-CMU PDFs, prepared-metadata tampering, changed candidate snapshots, sender rejection, genuine low-fit intake, source ordering, changed versions, current admission, rate limits, uncertainty and revoked eligibility. Separate-process review tests preserve the first decision and two audit rows when one interaction races. See [smoke tests](smoke-tests.md) for manual page/restart checks.

The paired-input demo tests run the existing `pnpm build` helper before launching compiled CLI/module consumers, so both fresh and cached checkouts test the current sources. Focused refresh and fixture transport regressions also exercise manual resume choices, final operator packets and concurrent journal receipt preservation.

Rollback is to stop invoking the new commands and return to existing replay/Indeed commands. No scheduler or service was installed. Tables are additive and existing job data is retained; back up the DB/private artifacts before changing code. Do not delete uncertain delivery records or migrate targets as a retry workaround.

Delivery validation uses native **Codex only** for the complete no-mistakes pipeline, including review/fix roles. Explicit machine selection must be `agent: codex`, with every review-role override absent or explicitly Codex. Never rely on `auto`/mixed fallbacks, invoke Claude or request its credentials. The installed v1.84.0 CLI has no native per-run agent flag; model/effort flags are Pi-only. Feature-branch provider settings cannot override the trusted default-branch policy, so the machine configuration owner must establish supported selection. Doctor confirms executable resolution, not authentication/model availability. No daemon restart/update or account change is required for new-run config loading.

After clean local commits and Firstmate authorization, run every no-mistakes step with yolo off, no `--yes` or skips; pipeline agents own fixes/publication. Pass supported `--no-publish-intent` when validation intent includes private task context; it withholds the public PR Intent section without removing validation context or skipping a step. Escalate all ask-user findings to Firstmate and stop at the CI-ready result; confirm the PR is ready and never merge. Report a genuine Codex-specific blocker without switching providers. The historical Claude OAuth401 is retained as evidence, while its login/restoration requirement is withdrawn. A private machine-only selection change introduces no tracked-config refresh requirement; any required cross-repo refresh remains Firstmate-owned.

Next bounded implementation work: approval decisions for privately held claims and candidate content quality, trustworthy Gmail consumer and real alert parsing, authorized private live transport acceptance, richer requirement-weighted fit and controlled job-flow Codex execution from the persisted handoff. These are separate gates; applications remain manual. Pipeline Codex validation does not authorize production job-flow model calls or live sends.
