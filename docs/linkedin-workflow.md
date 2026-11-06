# LinkedIn email and job review workflow

Run a normalized LinkedIn alert through SQLite, a stable Discord review thread, explained fit, an approved-evidence resume draft and exact PDF attachment. Start with the synthetic local demo, inspect its page images, then retain the database and private artifacts for restart. Gmail/account connection and real Discord delivery require a separate authorized test.

## What this implementation proves

| Stage | Current evidence | Boundary |
| --- | --- | --- |
| LinkedIn intake | Executable normalized-JSON handoff and multi-job fixture replay | No raw LinkedIn HTML/MIME parser or Gmail history consumer |
| Canonical state | Transactional message/hash versions, posting URL identity, chronological observation pointer | No inference that a repeated alert proves a job is open |
| Initial alert/thread | Durable root/thread receipts, restart, leases, retry/backoff and uncertain readback | Fixture and mocked HTTP; real Discord remains untested |
| Eligibility | Explicit eligible/ineligible/needs_review decisions tied to posting version | Unknown authorization stays needs_review; location rejection cannot be approved through the CLI |
| Fit | Explained 1–10 exact declared-skill coverage, evidence links and version hashes | Does not measure experience depth or hiring probability; does not gate resume work |
| Tailoring | Every eligible job gets durable private prepared JSON and Codex handoff; exact approved claims reordered for the target | No autonomous Codex/model execution or invented claims; real candidate evidence must be approved separately |
| PDF | Private adapter reuses unchanged portfolio CSS/local Computer Modern; exact bytes checked for Letter, one page, embedded bold fonts, text, existing custom layout gates and PNG | Extractive draft, not full canonical variant parity; sparse synthetic pages do not prove real resume quality |
| Attachment | Explicit visual approval names the exact hash; current job/version/eligibility rechecked; returned bytes go to the stored thread | Local fixture attachment and mocked REST requests are not live delivery evidence |
| Outcome | Existing approve/reject/note and applied_manually operator commands | No application submission or automatic applied status |

## Local prerequisites

Use Node 22 compatible dependencies, pnpm, Google Chrome, Poppler (`pdfinfo`, `pdffonts`, `pdftotext`, `pdftoppm`), and a read-only portfolio checkout containing the existing CMU assets and layout-check scripts. Build with `pnpm build`. If cached `better-sqlite3` was built for another Node ABI, rebuild the task-local dependency using `pnpm rebuild better-sqlite3` before interpreting database test failures.

The demo always uses synthetic data and a local fixture journal. It cannot choose a Discord destination. Output inside this checkout must use gitignored `data/`; an external task-private directory also works. No sudo is needed.

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

## Actual CLI and private inputs

`node dist/src/cli.js help` prints the supported commands and flags. JSON goes to stdout; progress goes to stderr every five seconds during slow work. `--plain` removes decorative glyphs. No secrets are accepted on the command line.

- `linkedin-intake`: requires `--email-file`, `--transport`, and either `--fixture` or `--verified-handoff`; optionally selects `--db`.
- `linkedin-deliver`: drains/reconciles previously persisted intake without the original email file.
- `linkedin-state`: displays persisted source versions, delivery state and versioned job work.
- `linkedin-eligibility`: requires `--lead-id`, `--status eligible|ineligible|needs_review` and `--note`. An eligible decision means the operator confirmed **all** hard requirements, including authorization, for this exact posting version.
- `linkedin-work`: processes every eligible job, with no minimum score, role exclusion or top-N cutoff. Use private `--candidate` and `--evidence` JSON paths; `--private-dir` controls outputs. Without `--render`, it stops at prepared inputs. Add `--render --portfolio-root` to run the private PDF adapter. Missing/invalid inputs remain durable blocked work.
- `linkedin-attach`: requires `--work-id`, exact `--sha256`, `--approve-visual` and `--portfolio-root`. It revalidates captured bytes and current eligibility before attachment. A validation failure is persisted; an uncertain send must reconcile before another write.

Every command uses the same `--db`. A fixture transport requires `--transport fixture --journal PRIVATE_JSON`. Private candidate JSON is `{ "name": "Alex Example", "email": "alex@example.test" }` for the synthetic example. Approved evidence is an array of `{ "id": "synthetic-python", "claim": "Built **Python** validation fixtures.", "skills": ["python"], "source": "synthetic://approved/commit", "approved": true }`. Real evidence must come from verified contributions, not posting text or an inferred directory owner. Approval flags are a trusted operator handoff, not an authorship verifier.

Normalized email input follows the existing fixture contract: `messageId`, `source: "linkedin"`, `receivedAt`, `from`, `subject`, and `textBody`. Bodies use `Title:`, `Company:`, `Location:`, `Work model:`, `Remote eligibility:`, `Skills:`, `View Job:` and `Description:` blocks separated by `---`. See the checked-in synthetic LinkedIn fixture. Only exact `jobs-noreply@linkedin.com` and `jobalerts-noreply@linkedin.com` senders are currently accepted. HTTPS LinkedIn posting URLs are canonicalized, including numeric IDs and removal of tracking query strings.

`--verified-handoff` is for an already authenticated, trusted local adapter/operator. It does **not** verify SMTP headers, DKIM, Gmail identity or DMARC. Do not expose this command as an unauthenticated webhook or let an email/model set its own trust metadata. Raw HTML/MIME requires a separate parser and preserved sender-authentication boundary. Posting text is stored as untrusted data and never executed.

## Delivery recovery

SQLite is canonical; the Discord journal/remote channel is a projection. Message replays are transactional. Different posting URLs stay separate even with identical titles/companies. Older observations remain in the message version ledger but cannot replace newer posting content. Equal observation timestamps are not a robust external ordering signal; controlled handoffs should preserve accurate provider receive times. The existing Indeed/legacy fixture dedupe policy is unchanged.

Initial sends have a 60-second per-item lease; job work has a five-minute lease. A crashed write becomes reconciliation-required after its lease expires. Readback looks for the stable marker authored by the configured bot, and validates thread/attachment receipts. A bounded 100-message history read cannot prove absence: a missing match stays uncertain. Do not clear uncertain state or resubmit blindly. A later matching readback resumes the same job/thread. Missing permissions, deleted/archived threads or unresolved ambiguity require operator investigation.

429 timing starts when the response arrives, and target backoff is persisted. Readback throttling preserves uncertainty across retries. Corrected location holds can resume, while a current rejection stops pending delivery. Completed receipts are preserved. A posting-version change requires a new eligibility decision and keeps prior work for audit. Explicit operator rejection is retained across posting refresh.

The [Discord message API](https://docs.discord.com/developers/resources/message) only deduplicates an enforced nonce over a short recent window; this implementation therefore retains local receipts/reconciliation rather than claiming exactly-once delivery. It disables all generated mentions, suppresses previews and uses [documented message threads](https://docs.discord.com/developers/resources/channel). [Rate-limit responses](https://docs.discord.com/developers/topics/rate-limits) control retry timing. Attachments above the conservative 8 MiB cap block; text fallback never counts as PDF delivery.

## Exact remaining live gate

Before any real send, choose an explicitly authorized private **text** channel, confirm the intended bot/server and permissions (view channel, read history, send messages, create public threads, send in threads, attach files), and provide `JOB_OPS_DISCORD_BOT_TOKEN` through the existing local environment/secret mechanism. Select `--transport discord --channel-id CHANNEL_ID --authorized-test-destination`; no default real destination is inferred. Fixture intake cannot select that live transport. Do not place tokens in files, arguments, prompts, reports or Discord.

No mailbox/account connection, production send or gateway/service change was performed. Gmail Pub/Sub watch renewal/history recovery, actual LinkedIn mail samples, trustworthy sender verification and a controlled live replay/retry test remain unimplemented/unverified. LinkedIn stays email/manual handoff; there is no authenticated LinkedIn extraction. X news is unrelated to the job loop.

## Verification, rollback and continuation

```fish
pnpm test
pnpm build
env JOB_OPS_PORTFOLIO_ROOT=/absolute/path/to/portfolio-site pnpm exec vitest run tests/job-workflow.test.ts tests/job-resume.test.ts tests/linkedin-route.test.ts tests/linkedin-transport.test.ts
```

The environment-enabled command exercises actual private PDF rendering and hash-bound fixture attachment. Without the portfolio environment, optional real-render tests are skipped; that is not PDF verification. The suite also covers corrupt/multi-page/non-CMU PDFs, sender rejection, genuine low-fit intake, source ordering, changed versions, current admission, rate limits, uncertainty and revoked eligibility. See [smoke tests](smoke-tests.md) for manual page/restart checks.

Rollback is to stop invoking the new commands and return to existing replay/Indeed commands. No scheduler or service was installed. Tables are additive and existing job data is retained; back up the DB/private artifacts before changing code. Do not delete uncertain delivery records or migrate targets as a retry workaround.

Next bounded work: trustworthy Gmail consumer and real alert parsing, authorized private live transport acceptance, richer approved evidence/rubric and complete candidate resume layout/content review, then controlled Codex execution from the persisted handoff. These are separate gates; applications remain manual.
