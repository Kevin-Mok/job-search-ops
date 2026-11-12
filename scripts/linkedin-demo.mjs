#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

// Jobs and transport are always fixtures; paired private profile inputs are optional.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { values } = parseArgs({ options: {
  "output-dir": { type: "string" }, phase: { type: "string", default: "intake" },
  candidate: { type: "string" }, evidence: { type: "string" },
  "portfolio-root": { type: "string" }, "approve-visual": { type: "boolean" }, plain: { type: "boolean" }
} });
const badge = values.plain ? "" : "🧪 ";
function run(command, args = [], allowedStatuses = [0]) {
  const result = spawnSync(process.execPath, [path.join(root, "dist/src/cli.js"), command, ...args, ...(values.plain ? ["--plain"] : [])], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 16 * 1024 * 1024 });
  if (!allowedStatuses.includes(result.status)) throw new Error(`Demo stage ${command} failed; preserve its private output and inspect the preceding error.`);
  return JSON.parse(result.stdout);
}
try {
  if (!values["output-dir"]) throw new Error("--output-dir is required; choose a task-private directory.");
  if (!fs.existsSync(path.join(root, "dist/src/cli.js"))) throw new Error("Build the repository with pnpm build before running the demo.");
  const directory = path.resolve(values["output-dir"]);
  const relative = path.relative(root, directory);
  if (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative) && relative.split(path.sep)[0] !== "data") throw new Error("Use gitignored data/ or an external private output directory.");
  const db = path.join(directory, "demo.sqlite");
  const journal = path.join(directory, "discord-fixture.json");
  const marker = path.join(directory, "synthetic-demo.json");
  const fixture = path.join(root, "fixtures/email/linkedin-alert-2026-03-12.json");
  const fixtureHash = crypto.createHash("sha256").update(fs.readFileSync(fixture)).digest("hex");
  const readInput = (file, label) => {
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) throw new Error("Invalid input file");
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch { throw new Error(`Could not read bounded ${label} JSON; preserve the original input and check its path/format.`); }
  };
  if (Boolean(values.candidate) !== Boolean(values.evidence)) throw new Error("--candidate and --evidence must be supplied together.");
  const previousMarker = fs.existsSync(marker) ? readInput(marker, "demo marker") : undefined;
  if (fs.existsSync(db) && !previousMarker) throw new Error("Existing database has no demo marker; use another output directory.");
  if (previousMarker && (![1, 2].includes(previousMarker.version) || previousMarker.fixtureHash !== fixtureHash)) throw new Error("Demo fixture/marker changed; preserve this run and choose a new output directory.");
  const common = ["--db", db];
  const transport = ["--transport", "fixture", "--journal", journal];
  const defaultCandidate = { name: "Alex Example", email: "alex@example.test" };
  const defaultEvidence = [
    { id: "synthetic-python", claim: "Built **Python** parsing fixtures with explicit validation errors.", skills: ["python", "apis"], source: "synthetic://approved/python", approved: true },
    { id: "synthetic-support", claim: "Documented **customer support** ticket triage and follow-up procedures in a synthetic demo.", skills: ["customer service", "ticketing", "phone support", "crm"], source: "synthetic://approved/support", approved: true }
  ];
  const privateJson = (name, data) => { const file = path.join(directory, name); fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 }); return file; };
  const candidateFile = path.join(directory, "candidate.json");
  const evidenceFile = path.join(directory, "approved-evidence.json");
  const inputKind = values.candidate ? "private" : previousMarker?.inputKind ?? "synthetic";
  const candidateInput = values.candidate ? readInput(path.resolve(values.candidate), "candidate")
    : inputKind === "private" ? readInput(candidateFile, "saved candidate") : defaultCandidate;
  const evidenceInput = values.evidence ? readInput(path.resolve(values.evidence), "evidence")
    : inputKind === "private" ? readInput(evidenceFile, "saved evidence") : defaultEvidence;
  const { validateApprovedFitEvidence } = await import(pathToFileURL(path.join(root, "dist/src/core/fit-scoring.js")).href);
  const { prepareJobResume } = await import(pathToFileURL(path.join(root, "dist/src/core/job-resume.js")).href);
  const evidence = validateApprovedFitEvidence(evidenceInput);
  const candidate = prepareJobResume({ jobId: "fixture-input-check", postingVersion: "fixture-input-check", threadId: "fixture-input-check", candidate: candidateInput, target: { title: "Fixture Input Check", company: "Fixture Employer" }, evidence }).candidate;
  const inputHash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const inputMarker = { version: 2, fixtureHash, transport: "fixture-only", inputKind, candidateHash: inputHash(candidate), evidenceHash: inputHash(evidence) };
  if (previousMarker && ((previousMarker.inputKind ?? "synthetic") !== inputKind
    || (previousMarker.candidateHash && previousMarker.candidateHash !== inputMarker.candidateHash)
    || (previousMarker.evidenceHash && previousMarker.evidenceHash !== inputMarker.evidenceHash))) {
    throw new Error("Paired inputs changed or differ from this run; preserve it and choose a new output directory.");
  }
  for (const [file, value] of [[candidateFile, candidate], [evidenceFile, evidence]]) {
    if (fs.existsSync(file) && inputHash(readInput(file, "saved input")) !== inputHash(value)) throw new Error("Saved input changed; preserve this run and choose another output directory.");
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(candidateFile)) privateJson("candidate.json", candidate);
  if (!fs.existsSync(evidenceFile)) privateJson("approved-evidence.json", evidence);
  privateJson("synthetic-demo.json", inputMarker);
  process.stderr.write(`${badge}LinkedIn offline fixture workflow | ${values.phase} | ${inputKind} inputs\n`);
  function confirmSyntheticDescription(leadId) {
    const file = path.join(directory, `synthetic-description-${leadId}.json`);
    if (!fs.existsSync(file)) {
      run("description-template", [...common, "--lead-id", leadId, "--output", file]);
      const template = JSON.parse(fs.readFileSync(file, "utf8"));
      fs.writeFileSync(file, JSON.stringify({ ...template, fullDescriptionConfirmed: true, body: "About the role: maintain synthetic validation systems. Responsibilities: write tests, review changes and document engineering behavior. Requirements: experience with Python and TypeScript. Benefits: flexible hours. Apply through the employer portal." }), { mode: 0o600 });
    }
    run("description-capture", [...common, "--input", file]);
  }
  if (values.phase === "connections") {
    const email = JSON.parse(fs.readFileSync(fixture, "utf8"));
    const capture = { id: "synthetic-gmail-demo", internalDate: String(Date.parse(email.receivedAt)), payload: { mimeType: "text/plain", headers: [{ name: "From", value: email.from }, { name: "Subject", value: email.subject }], body: { data: Buffer.from(email.textBody).toString("base64url") } } };
    const context = { verifier: "local-gmail", messageId: capture.id, sender: email.from, authenticated: true, evidenceId: "synthetic-fixture-verifier-only", payloadSha256: crypto.createHash("sha256").update(JSON.stringify(capture)).digest("hex") };
    const intake = run("gmail-intake", [...common, ...transport, "--verified-handoff", "--email-file", privateJson("gmail-capture.json", capture), "--trusted-context", privateJson("gmail-context.json", context)]);
    for (const work of intake.work) {
      const lead = run("show-lead", [...common, "--lead-id", work.leadId]);
      confirmSyntheticDescription(work.leadId);
      if (lead.locationDecision === "accepted") run("linkedin-eligibility", [...common, "--lead-id", work.leadId, "--status", "eligible", "--note", "Offline operator approved this synthetic fixture posting; real-job authorization is not established."]);
    }
    const work = run("linkedin-work", [...common, ...transport, "--candidate", candidateFile, "--evidence", evidenceFile, "--private-dir", path.join(directory, "private")]);
    const binding = intake.delivery.deliveries.find(row => row.status === "delivered");
    const interaction = { id: "synthetic-demo-review", userId: "synthetic-operator", target: binding.target, channelId: "synthetic-parent", threadId: binding.threadId, rootMessageId: binding.messageId, action: "note", note: "Synthetic operator reviewed the original job thread." };
    const authorization = { expectedTarget: binding.target, allowedUserIds: [interaction.userId], allowedChannelIds: [interaction.channelId], allowedThreadIds: [interaction.threadId] };
    const review = run("discord-review", [...common, "--verified-handoff", "--interaction-file", privateJson("review-interaction.json", interaction), "--review-config", privateJson("review-authorization.json", authorization)], [0, 2]);
    if (!review.ok && review.code !== "replayed_interaction") throw new Error("Synthetic bound review was denied; inspect its private authorization.");
    const plans = work.filter(row => row.eligibility === "eligible" && ["prepared", "awaiting_visual_review"].includes(row.status)).map(row => run("codex-resume-plan", [...common, "--work-id", row.workId, "--private-dir", path.join(directory, "private")]));
    process.stdout.write(JSON.stringify({ phase: "connections", intakeStatus: intake.status, jobs: intake.intake.leadIds.length, replayed: intake.intake.replayed, review, plans, modelCalls: 0, productionSends: 0 }, null, 2) + "\n");
  } else if (values.phase === "intake") {
    const result = run("linkedin-intake", [...common, "--email-file", fixture, "--fixture", ...transport]);
    process.stdout.write(JSON.stringify({ phase: "intake", replayed: result.intake.replayed, jobs: result.intake.leadIds.length, initialDeliveries: result.delivery.deliveries.map(row => ({ leadId: row.leadId, status: row.status, threadId: row.threadId })), db, journal }, null, 2) + "\n");
  } else if (values.phase === "prepare") {
    if (!values["portfolio-root"]) throw new Error("--portfolio-root is required for the read-only CMU renderer.");
    const state = run("linkedin-state", common);
    for (const work of state.work) {
      const lead = run("show-lead", [...common, "--lead-id", work.leadId]);
      confirmSyntheticDescription(work.leadId);
      if (lead.locationDecision === "accepted") run("linkedin-eligibility", [...common, "--lead-id", work.leadId, "--status", "eligible", "--note", "Offline operator approved this synthetic fixture posting; real-job authorization is not established."]);
    }
    const work = run("linkedin-work", [...common, ...transport, "--candidate", candidateFile, "--evidence", evidenceFile, "--private-dir", path.join(directory, "private"), "--render", "--portfolio-root", path.resolve(values["portfolio-root"])]);
    process.stdout.write(JSON.stringify({ phase: "prepare", work: work.filter(row => row.descriptionVersion).map(row => ({ workId: row.workId, leadId: row.leadId, eligibility: row.eligibility, status: row.status, codexStatus: row.codexStatus, tailoringMode: row.tailoringMode, fit: row.fit?.score, sha256: row.artifact?.sha256, previewPath: row.artifact?.previewPath, error: row.lastError })) }, null, 2) + "\n");
  } else if (values.phase === "attach") {
    if (!values["approve-visual"] || !values["portfolio-root"]) throw new Error("Inspect every pending PNG, then pass --approve-visual and --portfolio-root.");
    const state = run("linkedin-state", common);
    const attached = [];
    for (const work of state.work.filter(row => row.eligibility === "eligible" && row.artifact)) {
      const result = run("linkedin-attach", [...common, ...transport, "--work-id", work.workId, "--sha256", work.artifact.sha256, "--approve-visual", "--portfolio-root", path.resolve(values["portfolio-root"])]);
      attached.push({ workId: result.workId, status: result.status, threadId: result.threadId, sha256: result.artifact.sha256, receipt: result.attachmentDelivery?.messageId });
    }
    process.stdout.write(JSON.stringify({ phase: "attach", attached, manualApplication: "No application submitted or automatically marked applied." }, null, 2) + "\n");
  } else if (values.phase === "state") {
    process.stdout.write(JSON.stringify(run("linkedin-state", common), null, 2) + "\n");
  } else throw new Error("--phase must be connections, intake, prepare, attach or state.");
} catch (error) {
  process.stderr.write(`${values.plain ? "" : "⚠️ "}${error instanceof Error ? error.message : "Offline demo failed."}\n`);
  process.exitCode = 1;
}
