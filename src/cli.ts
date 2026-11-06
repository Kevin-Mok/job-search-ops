import path from "node:path";
import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { parseArgs } from "node:util";

import { ingestLinkedInEmail, drainLinkedInAlerts } from "./core/linkedin-route.js";
import { attachLinkedInResume, postingVersion, processLinkedInWork, queueLinkedInWork, type JobEligibility } from "./core/job-workflow.js";
import { createDiscordLinkedInTransport, createFixtureLinkedInTransport } from "./discord/linkedin-transport.js";
import { generateDraftPacket } from "./core/drafting.js";
import { storeIndeedPassCredentials } from "./core/indeed-auth.js";
import { getIndeedAlert, syncIndeedAlert } from "./core/indeed-sync.js";
import { ingestFixtures } from "./core/pipeline.js";
import { getResumeVariant } from "./core/resume-catalog.js";
import { briefXNews, getXNewsFeed, listXNewsWatchlist, syncXNewsFeed } from "./core/x-news-sync.js";
import { buildReviewBoard } from "./discord/review-plan.js";
import { JobStore } from "./db/store.js";

const DEFAULT_DB_PATH = path.resolve(process.cwd(), "data/job-ops.sqlite");
const DEFAULT_FIXTURES_DIR = path.resolve(process.cwd(), "fixtures/email");
const DEFAULT_INDEED_CONFIG_PATH = path.resolve(process.cwd(), "config/indeed-alerts.json");
const DEFAULT_X_NEWS_CONFIG_PATH = path.resolve(process.cwd(), "config/twitter-news.json");

function readCommonArgs(argv: string[]) {
  return parseArgs({
    args: argv,
    options: {
      db: { type: "string" },
      "lead-id": { type: "string" },
      note: { type: "string" },
      reason: { type: "string" },
      resume: { type: "string" },
      status: { type: "string" },
      "fixtures-dir": { type: "string" },
      config: { type: "string" },
      "alert-id": { type: "string" },
      username: { type: "string" },
      list: { type: "string" },
      hours: { type: "string" },
      topic: { type: "string" },
      "email-file": { type: "string" },
      transport: { type: "string" },
      journal: { type: "string" },
      fixture: { type: "boolean" },
      "verified-handoff": { type: "boolean" },
      "authorized-test-destination": { type: "boolean" },
      "channel-id": { type: "string" },
      evidence: { type: "string" },
      candidate: { type: "string" },
      "private-dir": { type: "string" },
      "portfolio-root": { type: "string" },
      render: { type: "boolean" },
      "work-id": { type: "string" },
      sha256: { type: "string" },
      "approve-visual": { type: "boolean" },
      plain: { type: "boolean" },
      details: { type: "boolean" }
    },
    allowPositionals: true
  });
}

function resolveDbPath(raw?: string): string {
  return raw ? path.resolve(process.cwd(), raw) : DEFAULT_DB_PATH;
}

function getLeadId(values: Record<string, string | boolean | undefined>): string | undefined {
  return typeof values["lead-id"] === "string" ? values["lead-id"] : undefined;
}

function getFixturesDir(values: Record<string, string | boolean | undefined>): string | undefined {
  return typeof values["fixtures-dir"] === "string" ? values["fixtures-dir"] : undefined;
}

function getAlertId(values: Record<string, string | boolean | undefined>): string | undefined {
  return typeof values["alert-id"] === "string" ? values["alert-id"] : undefined;
}

function getUsername(values: Record<string, string | boolean | undefined>): string | undefined {
  return typeof values.username === "string" ? values.username : undefined;
}

function getListId(values: Record<string, string | boolean | undefined>): string | undefined {
  return typeof values.list === "string" ? values.list : undefined;
}

function getHours(values: Record<string, string | boolean | undefined>): number {
  const raw = typeof values.hours === "string" ? Number(values.hours) : 24;
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error("--hours must be a positive number");
  }

  return raw;
}

function getTopic(values: Record<string, string | boolean | undefined>): string | undefined {
  return typeof values.topic === "string" ? values.topic : undefined;
}

function getConfigPath(values: Record<string, string | boolean | undefined>, defaultPath: string): string {
  return typeof values.config === "string"
    ? path.resolve(process.cwd(), values.config)
    : defaultPath;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function promptForSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("This command requires a TTY to read the password securely");
  }

  const mutedOutput = new Writable({
    write(chunk, encoding, callback) {
      if (!(mutedOutput as Writable & { muted?: boolean }).muted) {
        process.stdout.write(chunk, encoding as BufferEncoding);
      }
      callback();
    }
  }) as Writable & { muted?: boolean };
  const readline = createInterface({
    input: process.stdin,
    output: mutedOutput,
    terminal: true
  });

  try {
    process.stdout.write(prompt);
    mutedOutput.muted = true;
    const value = await readline.question("");
    process.stdout.write("\n");
    if (!value) {
      throw new Error("Password cannot be empty");
    }
    return value;
  } finally {
    mutedOutput.muted = false;
    readline.close();
  }
}

function requireLead(store: JobStore, leadId?: string) {
  if (!leadId) {
    throw new Error("--lead-id is required");
  }

  const lead = store.getLead(leadId);
  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  return lead;
}

function rebuildWithResume(store: JobStore, leadId: string, resumeId: string) {
  const lead = requireLead(store, leadId);
  const variant = getResumeVariant(resumeId);
  const resumeMatch = {
    ...lead.resumeMatch,
    variantId: variant.id,
    matchReasons: variant.supportedEvidence.slice(0, 2)
  };
  const draftPacket = generateDraftPacket({ ...lead, resumeMatch }, resumeMatch);

  return store.updateLeadReview({
    leadId,
    resumeVariantId: variant.id,
    resumeMatchJson: JSON.stringify(resumeMatch),
    draftPacketJson: JSON.stringify(draftPacket)
  });
}

type CliValues = Record<string, string | boolean | undefined>;
function requiredArg(values: CliValues, name: string): string {
  const value = values[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`--${name} is required`);
  return value;
}
function readPrivateJson(file: string): unknown {
  try { return JSON.parse(fs.readFileSync(file, "utf8")) as unknown; }
  catch { throw new Error("Could not read a valid private JSON input; check its path and format."); }
}
function linkedInTransport(values: CliValues) {
  if (values.transport === "fixture") return createFixtureLinkedInTransport(path.resolve(requiredArg(values, "journal")));
  if (values.transport !== "discord") throw new Error("--transport must be fixture or discord; no live destination is selected by default.");
  if (values.fixture) throw new Error("Fixture intake cannot select a live Discord transport.");
  if (!values["authorized-test-destination"]) throw new Error("Live sends require --authorized-test-destination and an explicitly selected private --channel-id.");
  return createDiscordLinkedInTransport({ channelId: requiredArg(values, "channel-id"), token: process.env.JOB_OPS_DISCORD_BOT_TOKEN ?? "" });
}
async function withProgress<T>(label: string, values: CliValues, action: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const prefix = values.plain ? "" : "⏳ ";
  const report = () => process.stderr.write(`${prefix}${label} | elapsed ${Math.floor((Date.now() - started) / 1000)}s\n`);
  report();
  const timer = setInterval(report, 5000);
  try { return await action(); } finally { clearInterval(timer); }
}
function privateDirectory(values: CliValues, dbPath: string): string {
  const result = path.resolve(typeof values["private-dir"] === "string" ? values["private-dir"] : path.join(path.dirname(dbPath), "private"));
  const relative = path.relative(process.cwd(), result);
  if (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) && relative.split(path.sep)[0] !== "data") {
    throw new Error("Private job outputs inside the checkout must use gitignored data/ storage.");
  }
  return result;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const cleanedRest = rest.filter((entry, index) => !(entry === "--" && index === 0));
  const parsed = readCommonArgs(cleanedRest);
  if (command === "help") {
    print({ commands: {
      "linkedin-intake": "--db PATH --email-file JSON --fixture --transport fixture --journal PRIVATE_JSON (or trusted --verified-handoff with an explicitly authorized discord destination)",
      "linkedin-deliver": "--db PATH --transport fixture --journal PRIVATE_JSON; retries durable initial delivery only",
      "linkedin-state": "--db PATH; lists messages, initial deliveries and versioned work",
      "linkedin-eligibility": "--db PATH --lead-id ID --status eligible|ineligible|needs_review --note REASON; eligible requires accepted location policy",
      "linkedin-work": "--db PATH --transport fixture --journal PRIVATE_JSON --evidence PRIVATE_JSON --candidate PRIVATE_JSON [--private-dir DIR] [--render --portfolio-root READ_ONLY_PATH]",
      "linkedin-attach": "--db PATH --transport fixture --journal PRIVATE_JSON --work-id ID --sha256 EXACT_HASH --approve-visual --portfolio-root READ_ONLY_PATH",
      "discord transport": "--transport discord --channel-id PRIVATE_TEST_CHANNEL --authorized-test-destination; JOB_OPS_DISCORD_BOT_TOKEN environment only",
      "output": "JSON stdout; progress stderr; --plain removes decorative glyphs"
    } });
    return;
  }
  const store = new JobStore(resolveDbPath(parsed.values.db));

  switch (command) {
    case "linkedin-intake": {
      const transport = linkedInTransport(parsed.values);
      const intake = ingestLinkedInEmail(store, readPrivateJson(requiredArg(parsed.values, "email-file")), { fixture: parsed.values.fixture === true, verifiedHandoff: parsed.values["verified-handoff"] === true });
      const delivery = await withProgress("Delivering LinkedIn initial alerts", parsed.values, () => drainLinkedInAlerts({ store, transport }));
      print({ intake, delivery, work: queueLinkedInWork(store, transport.target) });
      return;
    }
    case "linkedin-deliver": {
      const transport = linkedInTransport(parsed.values);
      print(await withProgress("Reconciling LinkedIn deliveries", parsed.values, () => drainLinkedInAlerts({ store, transport })));
      queueLinkedInWork(store, transport.target);
      return;
    }
    case "linkedin-state": {
      print({ messages: store.linkedin.listMessages(), deliveries: store.linkedin.listDeliveries(), work: store.work.list() });
      return;
    }
    case "linkedin-eligibility": {
      const lead = requireLead(store, getLeadId(parsed.values));
      const eligibility = requiredArg(parsed.values, "status");
      if (!["eligible", "ineligible", "needs_review"].includes(eligibility)) throw new Error("--status must be eligible, ineligible or needs_review.");
      if (eligibility === "eligible" && lead.locationDecision !== "accepted") throw new Error("Existing location policy must be accepted before eligible approval; resolve location evidence first.");
      const decision = { leadId: lead.leadId, postingVersion: postingVersion(lead), eligibility: eligibility as JobEligibility, reason: requiredArg(parsed.values, "note") };
      store.work.decideEligibility(decision);
      for (const target of new Set(store.linkedin.listDeliveries().map(delivery => delivery.target))) queueLinkedInWork(store, target);
      print(decision);
      return;
    }
    case "linkedin-work": {
      const transport = linkedInTransport(parsed.values);
      const candidate = parsed.values.candidate ? readPrivateJson(String(parsed.values.candidate)) as { name: string; email: string } : undefined;
      const evidence = parsed.values.evidence ? readPrivateJson(String(parsed.values.evidence)) : undefined;
      const portfolioRoot = parsed.values.render ? path.resolve(requiredArg(parsed.values, "portfolio-root")) : undefined;
      print(await withProgress("Processing every eligible job", parsed.values, () => processLinkedInWork({ store, transport, privateDir: privateDirectory(parsed.values, store.dbPath), candidate, evidence, portfolioRoot })));
      return;
    }
    case "linkedin-attach": {
      if (!parsed.values["approve-visual"]) throw new Error("Inspect the exact pending PNG, then pass --approve-visual with its PDF --sha256.");
      const transport = linkedInTransport(parsed.values);
      print(await withProgress("Validating and attaching exact resume bytes", parsed.values, () => attachLinkedInResume({ store, transport, workId: requiredArg(parsed.values, "work-id"), approvedSha256: requiredArg(parsed.values, "sha256"), portfolioRoot: path.resolve(requiredArg(parsed.values, "portfolio-root")) })));
      return;
    }
    case "replay-fixtures": {
      const fixturesDir = getFixturesDir(parsed.values);
      const summary = ingestFixtures(
        store,
        fixturesDir ? path.resolve(process.cwd(), fixturesDir) : DEFAULT_FIXTURES_DIR
      );
      print(summary);
      return;
    }
    case "review-state": {
      const board = buildReviewBoard(store.listLeads(), store.listReviewEvents());
      print(board);
      return;
    }
    case "show-lead": {
      print(requireLead(store, getLeadId(parsed.values)));
      return;
    }
    case "approve": {
      const updated = store.updateLeadReview({
        leadId: requireLead(store, getLeadId(parsed.values)).leadId,
        status: "approved_for_manual_apply"
      });
      print(updated);
      return;
    }
    case "reject": {
      const updated = store.updateLeadReview({
        leadId: requireLead(store, getLeadId(parsed.values)).leadId,
        status: "rejected",
        note: parsed.values.reason ?? "Rejected by operator"
      });
      print(updated);
      return;
    }
    case "note": {
      const lead = requireLead(store, getLeadId(parsed.values));
      const updated = store.updateLeadReview({
        leadId: lead.leadId,
        note: parsed.values.note ?? "Operator note added"
      });
      print(updated);
      return;
    }
    case "set-resume": {
      if (!parsed.values.resume) {
        throw new Error("--resume is required");
      }
      print(rebuildWithResume(store, requireLead(store, getLeadId(parsed.values)).leadId, parsed.values.resume));
      return;
    }
    case "apply-status": {
      const status = parsed.values.status;
      if (status !== "approved_for_manual_apply" && status !== "applied_manually" && status !== "needs_review") {
        throw new Error("--status must be one of approved_for_manual_apply, applied_manually, needs_review");
      }
      const updated = store.updateLeadReview({
        leadId: requireLead(store, getLeadId(parsed.values)).leadId,
        status
      });
      print(updated);
      return;
    }
    case "draft-packet": {
      const lead = requireLead(store, getLeadId(parsed.values));
      print(lead.draftPacket);
      return;
    }
    case "sync-indeed": {
      const alertId = getAlertId(parsed.values);
      if (!alertId) {
        throw new Error("--alert-id is required");
      }

      const alert = getIndeedAlert(getConfigPath(parsed.values, DEFAULT_INDEED_CONFIG_PATH), alertId);
      print(await syncIndeedAlert({ alert, store }));
      return;
    }
    case "indeed-auth-set": {
      const alertId = getAlertId(parsed.values);
      if (!alertId) {
        throw new Error("--alert-id is required");
      }

      const username = getUsername(parsed.values);
      if (!username) {
        throw new Error("--username is required");
      }

      const alert = getIndeedAlert(getConfigPath(parsed.values, DEFAULT_INDEED_CONFIG_PATH), alertId);
      const password = await promptForSecret("Indeed password: ");
      const auth = await storeIndeedPassCredentials({
        alert,
        username,
        password
      });
      print({
        alertId: alert.id,
        mode: auth.mode,
        usernameEntry: auth.usernameEntry,
        passwordEntry: auth.passwordEntry,
        stored: true
      });
      return;
    }
    case "sync-x-news": {
      const listId = getListId(parsed.values);
      if (!listId) {
        throw new Error("--list is required");
      }

      const list = getXNewsFeed(getConfigPath(parsed.values, DEFAULT_X_NEWS_CONFIG_PATH), listId);
      print(await syncXNewsFeed({ list, store }));
      return;
    }
    case "brief-x-news": {
      const listId = getListId(parsed.values);
      if (!listId) {
        throw new Error("--list is required");
      }

      const list = getXNewsFeed(getConfigPath(parsed.values, DEFAULT_X_NEWS_CONFIG_PATH), listId);
      print(
        briefXNews({
          list,
          store,
          hours: getHours(parsed.values),
          topicId: getTopic(parsed.values)
        })
      );
      return;
    }
    case "watchlist-x-news": {
      const listId = getListId(parsed.values);
      if (!listId) {
        throw new Error("--list is required");
      }

      const list = getXNewsFeed(getConfigPath(parsed.values, DEFAULT_X_NEWS_CONFIG_PATH), listId);
      print(listXNewsWatchlist({ list, store }));
      return;
    }
    default:
      throw new Error(`Unknown command: ${command ?? "(missing)"}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${process.argv.includes("--plain") ? "" : "⚠️ "}${message}\n`);
  process.exitCode = 1;
});
