import { assertSourceBudget } from "../db/source-gate-store.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { loadIndeedPassCredentials } from "./indeed-auth.js";
import { detectIndeedBlock, parseIndeedDetailPage, parseIndeedSearchPage } from "./indeed.js";
import type {
  IndeedAlertConfig,
  IndeedAuthCredentials,
  IndeedPageFetcher,
  XNewsListConfig,
  XNewsPageFetcher
} from "./types.js";
import { buildXFollowingUrl, buildXTimelineUrl, detectXSessionWall, parseXFollowingPage, parseXTimelinePage } from "./x-news.js";

const execFileAsync = promisify(execFile);
const POLL_INTERVAL_MS = 1000;
const QUICK_COMMAND_TIMEOUT_MS = 5000;
const WAIT_COMMAND_TIMEOUT_MS = 10000;
const STATUS_PREFLIGHT_TIMEOUT_MS = 10000;
const LOAD_WAIT_TIMEOUT_BUFFER_MS = 2000;
const LOGIN_STEP_WAIT_MS = 1000;
const SNAPSHOT_LIMIT = 120;
const COMMAND_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

type OpenClawCommandContext = {
  phase: string;
  timeoutMs: number;
  redactValues?: string[];
};

type OpenClawCommandRunner = (args: string[], context?: OpenClawCommandContext) => Promise<string>;

type OpenClawStatusSnapshot = {
  gateway?: {
    url?: string;
    reachable?: boolean;
    error?: string | null;
    misconfigured?: boolean;
    authWarning?: string | null;
  };
};

type BrowserSnapshotRef = {
  role?: string;
  name?: string;
};

type BrowserSnapshot = {
  url?: string;
  snapshot?: string;
  refs: Record<string, BrowserSnapshotRef>;
};

type WaitForUsableResult = "ready" | "retry";

type BrowserSession = {
  browserProfile: string;
  run: (args: string[], context?: OpenClawCommandContext) => Promise<string>;
  loadUrl: (url: string) => Promise<void>;
  close: () => Promise<void>;
};

function sanitizeMessage(message: string, redactValues: string[] = []): string {
  let sanitized = message;
  for (const value of redactValues) {
    if (value) {
      sanitized = sanitized.split(value).join("[REDACTED]");
    }
  }
  return sanitized;
}

function extractString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const match = extractString(entry);
      if (match) {
        return match;
      }
    }
    return undefined;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["value", "result", "html", "text", "body", "data"]) {
      const match = extractString(record[key]);
      if (match) {
        return match;
      }
    }

    for (const entry of Object.values(record)) {
      const match = extractString(entry);
      if (match) {
        return match;
      }
    }
  }

  return undefined;
}

function parseBrowserOutput(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return "";
  }

  const parsed = parseJsonPayload(trimmed);
  return parsed ? extractString(parsed) ?? trimmed : trimmed;
}

function parseJsonPayload(stdout: string): unknown | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }

  for (const candidate of [trimmed, trimmed.includes("{") ? trimmed.slice(trimmed.indexOf("{")) : ""]) {
    if (!candidate) {
      continue;
    }

    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Keep trying fallbacks.
    }
  }

  return undefined;
}

function parseStatusOutput(stdout: string): OpenClawStatusSnapshot {
  const parsed = parseJsonPayload(stdout);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("OpenClaw status did not return machine-readable JSON output");
  }

  return parsed as OpenClawStatusSnapshot;
}

function parseSnapshotOutput(stdout: string): BrowserSnapshot {
  const parsed = parseJsonPayload(stdout);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("OpenClaw snapshot did not return machine-readable JSON output");
  }

  const record = parsed as Record<string, unknown>;
  const refsRecord = record.refs && typeof record.refs === "object" ? (record.refs as Record<string, unknown>) : {};
  const refs: Record<string, BrowserSnapshotRef> = {};

  for (const [refId, refValue] of Object.entries(refsRecord)) {
    if (!refValue || typeof refValue !== "object") {
      continue;
    }

    const ref = refValue as Record<string, unknown>;
    refs[refId] = {
      role: typeof ref.role === "string" ? ref.role : undefined,
      name: typeof ref.name === "string" ? ref.name : undefined
    };
  }

  return {
    url: typeof record.url === "string" ? record.url : undefined,
    snapshot: typeof record.snapshot === "string" ? record.snapshot : undefined,
    refs
  };
}

function buildBrowserCommandArgs(
  command: string[],
  options: {
    browserProfile?: string;
    json?: boolean;
    timeoutMs?: number;
  } = {}
): string[] {
  const args = ["browser"];
  if (options.browserProfile) {
    args.push("--browser-profile", options.browserProfile);
  }
  if (options.json) {
    args.push("--json");
  }
  if (typeof options.timeoutMs === "number") {
    args.push("--timeout", String(options.timeoutMs));
  }
  return [...args, ...command];
}

function extractErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["stderr", "message", "stdout"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return error instanceof Error ? error.message : String(error);
}

function isTimeoutError(error: unknown, message: string): boolean {
  if (/timed out/i.test(message)) {
    return true;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (record.killed === true) {
      return true;
    }
    if (record.code === "ETIMEDOUT") {
      return true;
    }
  }

  return false;
}

function isGatewayStateFailure(message: string): boolean {
  return /(gateway closed|connect failed|ECONNREFUSED|EPERM|auth warning|misconfigured)/i.test(message);
}

function formatGatewayUnavailableError(gateway: OpenClawStatusSnapshot["gateway"]): Error {
  const url = gateway?.url ?? "unknown gateway";
  const reasons = [
    gateway?.error,
    gateway?.authWarning,
    gateway?.misconfigured ? "gateway configuration is marked misconfigured" : undefined
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const detail = reasons[0] ?? "status.gateway.reachable=false";

  return new Error(
    `OpenClaw gateway is not reachable for browser automation (${url}): ${detail}. Run 'openclaw gateway' and confirm 'openclaw status --json' reports reachable=true.`
  );
}

function formatCommandError(context: OpenClawCommandContext, error: unknown): Error {
  const detail = sanitizeMessage(extractErrorMessage(error), context.redactValues);

  if (context.phase === "status" && isTimeoutError(error, detail)) {
    return new Error(
      `OpenClaw browser preflight timed out after ${context.timeoutMs}ms before navigation. Check 'openclaw status --json' and the local browser runtime.`
    );
  }

  if (isTimeoutError(error, detail)) {
    return new Error(
      `OpenClaw browser ${context.phase} timed out after ${context.timeoutMs}ms. Check 'openclaw status --json' and the local browser runtime.`
    );
  }

  if (context.phase === "status") {
    return new Error(
      `OpenClaw browser preflight failed before navigation: ${detail}. Run 'openclaw gateway' and confirm 'openclaw status --json' succeeds.`
    );
  }

  if (isGatewayStateFailure(detail)) {
    return new Error(
      `OpenClaw browser ${context.phase} failed because the local gateway/browser runtime is unavailable: ${detail}`
    );
  }

  return new Error(`OpenClaw browser ${context.phase} failed: ${detail}`);
}

async function runOpenClawCommand(args: string[], context?: OpenClawCommandContext): Promise<string> {
  const { stdout } = await execFileAsync("openclaw", ["--no-color", ...args], {
    timeout: context?.timeoutMs,
    maxBuffer: COMMAND_MAX_BUFFER_BYTES
  });
  return stdout;
}

async function ensureProfileExists(browserProfile: string, run: OpenClawCommandRunner): Promise<void> {
  try {
    await run(
      buildBrowserCommandArgs(["create-profile", "--name", browserProfile], {
        json: true,
        timeoutMs: QUICK_COMMAND_TIMEOUT_MS
      }),
      {
        phase: "create-profile",
        timeoutMs: QUICK_COMMAND_TIMEOUT_MS
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/already exists|duplicate|409/i.test(message)) {
      return;
    }
    throw error;
  }
}

function looksLikeIndeedLoginHtml(html: string): boolean {
  if (!/indeed/i.test(html)) {
    return false;
  }

  return (
    /secure\.indeed\.com\/auth/i.test(html) ||
    /continue with google/i.test(html) ||
    /email address/i.test(html) ||
    /type="password"/i.test(html) ||
    /autocomplete="username"/i.test(html)
  );
}

function looksLikeIndeedLoginSnapshot(snapshot: BrowserSnapshot): boolean {
  if (snapshot.url && /secure\.indeed\.com\/auth/i.test(snapshot.url)) {
    return true;
  }

  return Object.values(snapshot.refs).some(
    (ref) =>
      ref.role === "textbox" &&
      typeof ref.name === "string" &&
      /(email address|email|password)/i.test(ref.name)
  );
}

function findSnapshotRef(
  snapshot: BrowserSnapshot,
  predicate: (ref: BrowserSnapshotRef) => boolean
): string | undefined {
  for (const [refId, ref] of Object.entries(snapshot.refs)) {
    if (predicate(ref)) {
      return refId;
    }
  }

  return undefined;
}

function findTextboxRef(snapshot: BrowserSnapshot, pattern: RegExp): string | undefined {
  return findSnapshotRef(
    snapshot,
    (ref) => ref.role === "textbox" && typeof ref.name === "string" && pattern.test(ref.name)
  );
}

function findButtonRef(snapshot: BrowserSnapshot, pattern: RegExp): string | undefined {
  return findSnapshotRef(
    snapshot,
    (ref) =>
      ref.role === "button" &&
      typeof ref.name === "string" &&
      pattern.test(ref.name) &&
      !/google|apple/i.test(ref.name)
  );
}

async function captureInteractiveSnapshot(run: OpenClawCommandRunner, browserProfile: string): Promise<BrowserSnapshot> {
  const rawSnapshot = await run(
    buildBrowserCommandArgs(["snapshot", "--interactive", "--limit", String(SNAPSHOT_LIMIT)], {
      browserProfile,
      json: true,
      timeoutMs: QUICK_COMMAND_TIMEOUT_MS
    }),
    {
      phase: "snapshot",
      timeoutMs: QUICK_COMMAND_TIMEOUT_MS
    }
  );

  return parseSnapshotOutput(rawSnapshot);
}

async function fillSnapshotFields(params: {
  run: OpenClawCommandRunner;
  browserProfile: string;
  fields: Array<{ ref: string; value: string }>;
  redactValues?: string[];
}): Promise<void> {
  await params.run(
    buildBrowserCommandArgs(["fill", "--fields", JSON.stringify(params.fields)], {
      browserProfile: params.browserProfile,
      json: true,
      timeoutMs: QUICK_COMMAND_TIMEOUT_MS
    }),
    {
      phase: "fill",
      timeoutMs: QUICK_COMMAND_TIMEOUT_MS,
      redactValues: params.redactValues
    }
  );
}

async function clickSnapshotRef(params: {
  run: OpenClawCommandRunner;
  browserProfile: string;
  ref: string;
}): Promise<void> {
  await params.run(
    buildBrowserCommandArgs(["click", params.ref], {
      browserProfile: params.browserProfile,
      json: true,
      timeoutMs: QUICK_COMMAND_TIMEOUT_MS
    }),
    {
      phase: "click",
      timeoutMs: QUICK_COMMAND_TIMEOUT_MS
    }
  );
}

async function waitForTime(params: {
  run: OpenClawCommandRunner;
  browserProfile: string;
  waitTimeMs: number;
}): Promise<void> {
  const timeoutMs = Math.max(WAIT_COMMAND_TIMEOUT_MS, params.waitTimeMs + LOAD_WAIT_TIMEOUT_BUFFER_MS);
  await params.run(
    buildBrowserCommandArgs(["wait", "--time", String(params.waitTimeMs)], {
      browserProfile: params.browserProfile,
      timeoutMs
    }),
    {
      phase: "wait",
      timeoutMs
    }
  );
}

function getIndeedLoginRequiredError(alert: IndeedAlertConfig): Error {
  return new Error(
    `Indeed requires a logged-in browser session for alert '${alert.id}'. Configure auth.mode=\"pass\" and store credentials with 'pnpm indeed:auth:set -- --alert-id ${alert.id} --username <email>'.`
  );
}

async function automateIndeedLogin(params: {
  alert: IndeedAlertConfig;
  browserProfile: string;
  run: OpenClawCommandRunner;
  loadCredentials: () => Promise<IndeedAuthCredentials | undefined>;
}): Promise<void> {
  const credentials = await params.loadCredentials();
  if (!credentials) {
    throw getIndeedLoginRequiredError(params.alert);
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const snapshot = await captureInteractiveSnapshot(params.run, params.browserProfile);
    if (!looksLikeIndeedLoginSnapshot(snapshot)) {
      return;
    }

    const emailRef = findTextboxRef(snapshot, /email/i);
    const passwordRef = findTextboxRef(snapshot, /password/i);
    if (!emailRef && !passwordRef) {
      throw new Error("Indeed login page did not expose an email or password field");
    }

    const fields: Array<{ ref: string; value: string }> = [];
    if (emailRef) {
      fields.push({ ref: emailRef, value: credentials.username });
    }
    if (passwordRef) {
      fields.push({ ref: passwordRef, value: credentials.password });
    }

    await fillSnapshotFields({
      run: params.run,
      browserProfile: params.browserProfile,
      fields,
      redactValues: [credentials.username, credentials.password]
    });

    const submitRef = findButtonRef(snapshot, /(continue|next|sign in|log in)/i);
    if (!submitRef) {
      throw new Error("Indeed login page did not expose a continue or sign-in button");
    }

    await clickSnapshotRef({
      run: params.run,
      browserProfile: params.browserProfile,
      ref: submitRef
    });
    await waitForTime({
      run: params.run,
      browserProfile: params.browserProfile,
      waitTimeMs: LOGIN_STEP_WAIT_MS
    });
  }

  throw new Error("Indeed login did not complete after automated submission");
}

async function waitForUsableHtml(params: {
  browserProfile: string;
  url: string;
  contentLabel: string;
  pageTimeoutMs: number;
  challengeTimeoutMs: number;
  run: OpenClawCommandRunner;
  detectBlocked?: (html: string) => string | undefined;
  inspectHtml: (html: string) => Promise<WaitForUsableResult>;
}): Promise<string> {
  const deadlineAt = Date.now() + params.pageTimeoutMs;
  let blockedStartedAt: number | undefined;
  let lastValidationError: string | undefined;
  let lastBlockedMessage: string | undefined;

  while (Date.now() < deadlineAt) {
    const remainingBeforeEvaluateMs = Math.max(1, deadlineAt - Date.now());
    const evaluateTimeoutMs = Math.min(QUICK_COMMAND_TIMEOUT_MS, remainingBeforeEvaluateMs);
    const rawHtml = await params.run(
      buildBrowserCommandArgs(["evaluate", "--fn", "() => document.documentElement ? document.documentElement.outerHTML : ''"], {
        browserProfile: params.browserProfile,
        json: true,
        timeoutMs: evaluateTimeoutMs
      }),
      {
        phase: "evaluate",
        timeoutMs: evaluateTimeoutMs
      }
    );
    const html = parseBrowserOutput(rawHtml);
    const blocked = params.detectBlocked?.(html);

    if (blocked) {
      blockedStartedAt ??= Date.now();
      lastBlockedMessage = blocked;
      if (Date.now() - blockedStartedAt >= params.challengeTimeoutMs) {
        throw new Error(blocked);
      }
    } else {
      blockedStartedAt = undefined;
      lastBlockedMessage = undefined;
      try {
        const result = await params.inspectHtml(html);
        if (result === "ready") {
          return html;
        }
        lastValidationError = undefined;
      } catch (error) {
        lastValidationError = error instanceof Error ? error.message : String(error);
      }
    }

    const remainingBeforeWaitMs = deadlineAt - Date.now();
    if (remainingBeforeWaitMs > 0) {
      await waitForTime({
        run: params.run,
        browserProfile: params.browserProfile,
        waitTimeMs: Math.max(1, Math.min(POLL_INTERVAL_MS, remainingBeforeWaitMs))
      });
    }
  }

  if (lastBlockedMessage) {
    throw new Error(lastBlockedMessage);
  }

  if (lastValidationError) {
    throw new Error(`Browser did not produce usable ${params.contentLabel} for ${params.url}: ${lastValidationError}`);
  }

  throw new Error(`Browser did not produce usable ${params.contentLabel} for ${params.url}`);
}

function createBrowserSession(params: {
  browserProfile: string;
  pageTimeoutMs: number;
  runCommand?: OpenClawCommandRunner;
}): BrowserSession {
  const runCommand = params.runCommand ?? runOpenClawCommand;
  const loadTimeoutMs = params.pageTimeoutMs + LOAD_WAIT_TIMEOUT_BUFFER_MS;
  let sessionReady = false;
  let hasOpenTab = false;

  async function run(
    args: string[],
    context: OpenClawCommandContext = {
      phase: "command",
      timeoutMs: QUICK_COMMAND_TIMEOUT_MS
    }
  ): Promise<string> {
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      return await Promise.race([
        runCommand(args, context),
        new Promise<string>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Command timed out after ${context.timeoutMs}ms`));
          }, context.timeoutMs);
        })
      ]);
    } catch (error) {
      throw formatCommandError(context, error);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function ensureGatewayReady(): Promise<void> {
    const rawStatus = await run(["status", "--json"], {
      phase: "status",
      timeoutMs: STATUS_PREFLIGHT_TIMEOUT_MS
    });

    let status: OpenClawStatusSnapshot;
    try {
      status = parseStatusOutput(rawStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenClaw browser preflight failed before navigation: ${message}`);
    }

    if (status.gateway?.reachable !== true) {
      throw formatGatewayUnavailableError(status.gateway);
    }
  }

  async function ensureSession(): Promise<void> {
    if (sessionReady) {
      return;
    }

    await ensureGatewayReady();
    await run(
      buildBrowserCommandArgs(["start"], {
        json: true,
        timeoutMs: QUICK_COMMAND_TIMEOUT_MS
      }),
      {
        phase: "start",
        timeoutMs: QUICK_COMMAND_TIMEOUT_MS
      }
    );
    await ensureProfileExists(params.browserProfile, run);
    sessionReady = true;
  }

  async function loadUrl(url: string): Promise<void> {
    await ensureSession();

    if (!hasOpenTab) {
      await run(
        buildBrowserCommandArgs(["open", url], {
          browserProfile: params.browserProfile,
          json: true,
          timeoutMs: QUICK_COMMAND_TIMEOUT_MS
        }),
        {
          phase: "open",
          timeoutMs: QUICK_COMMAND_TIMEOUT_MS
        }
      );
      hasOpenTab = true;
    } else {
      await run(
        buildBrowserCommandArgs(["navigate", url], {
          browserProfile: params.browserProfile,
          json: true,
          timeoutMs: QUICK_COMMAND_TIMEOUT_MS
        }),
        {
          phase: "navigate",
          timeoutMs: QUICK_COMMAND_TIMEOUT_MS
        }
      );
    }

    await run(
      buildBrowserCommandArgs(["wait", "--load", "domcontentloaded", "--timeout-ms", String(params.pageTimeoutMs)], {
        browserProfile: params.browserProfile,
        timeoutMs: loadTimeoutMs
      }),
      {
        phase: "wait",
        timeoutMs: loadTimeoutMs
      }
    );
  }

  async function close(): Promise<void> {
    if (!hasOpenTab) {
      return;
    }

    try {
      await run(
        buildBrowserCommandArgs(["close"], {
          browserProfile: params.browserProfile,
          json: true,
          timeoutMs: QUICK_COMMAND_TIMEOUT_MS
        }),
        {
          phase: "close",
          timeoutMs: QUICK_COMMAND_TIMEOUT_MS
        }
      );
    } finally {
      hasOpenTab = false;
    }
  }

  return {
    browserProfile: params.browserProfile,
    run,
    loadUrl,
    close
  };
}

export function createOpenClawIndeedPageFetcher(params: {
  alert: IndeedAlertConfig;
  runCommand?: OpenClawCommandRunner;
  loadAuthCredentials?: () => Promise<IndeedAuthCredentials | undefined>;
}): IndeedPageFetcher {
  assertSourceBudget("indeed");
  const browserProfile = params.alert.browserProfile ?? `indeed-${params.alert.id}`;
  const pageTimeoutMs = params.alert.pageTimeoutMs ?? 30000;
  const challengeTimeoutMs = params.alert.challengeTimeoutMs ?? 20000;
  const session = createBrowserSession({
    browserProfile,
    pageTimeoutMs,
    runCommand: params.runCommand
  });
  let cachedCredentialsPromise: Promise<IndeedAuthCredentials | undefined> | undefined;

  async function loadCredentials(): Promise<IndeedAuthCredentials | undefined> {
    cachedCredentialsPromise ??= params.loadAuthCredentials
      ? params.loadAuthCredentials()
      : loadIndeedPassCredentials(params.alert);
    return cachedCredentialsPromise;
  }

  async function inspectIndeedHtml(
    html: string,
    validate: () => void
  ): Promise<WaitForUsableResult> {
    if (looksLikeIndeedLoginHtml(html)) {
      await automateIndeedLogin({
        alert: params.alert,
        browserProfile,
        run: session.run,
        loadCredentials
      });
      return "retry";
    }

    validate();
    return "ready";
  }

  return {
    async fetchSearchPage(url: string): Promise<string> {
      await session.loadUrl(url);
      return waitForUsableHtml({
        browserProfile,
        url,
        contentLabel: "Indeed HTML",
        pageTimeoutMs,
        challengeTimeoutMs,
        run: session.run,
        detectBlocked: detectIndeedBlock,
        inspectHtml: async (html) =>
          inspectIndeedHtml(html, () => {
            const cards = parseIndeedSearchPage(html, url);
            if (cards.length === 0) {
              throw new Error("Indeed search page did not contain any job cards");
            }
          })
      });
    },
    async fetchDetailPage(jobKey: string, url: string): Promise<string> {
      await session.loadUrl(url);
      return waitForUsableHtml({
        browserProfile,
        url,
        contentLabel: "Indeed HTML",
        pageTimeoutMs,
        challengeTimeoutMs,
        run: session.run,
        detectBlocked: detectIndeedBlock,
        inspectHtml: async (html) =>
          inspectIndeedHtml(html, () => {
            parseIndeedDetailPage(html, jobKey);
          })
      });
    },
    close: session.close
  };
}

export function createOpenClawXNewsPageFetcher(params: {
  list: XNewsListConfig;
  runCommand?: OpenClawCommandRunner;
}): XNewsPageFetcher {
  const pageTimeoutMs = params.list.pageTimeoutMs;
  const challengeTimeoutMs = params.list.challengeTimeoutMs;
  const browserProfile = params.list.browserProfile;
  const session = createBrowserSession({
    browserProfile,
    pageTimeoutMs,
    runCommand: params.runCommand
  });

  return {
    async fetchFollowingPage(handle: string): Promise<string> {
      const url = buildXFollowingUrl(handle);
      await session.loadUrl(url);
      return waitForUsableHtml({
        browserProfile,
        url,
        contentLabel: "X HTML",
        pageTimeoutMs,
        challengeTimeoutMs,
        run: session.run,
        detectBlocked: detectXSessionWall,
        inspectHtml: async (html) => {
          parseXFollowingPage(html);
          return "ready";
        }
      });
    },
    async fetchTimelinePage(handle: string): Promise<string> {
      const url = buildXTimelineUrl(handle);
      await session.loadUrl(url);
      return waitForUsableHtml({
        browserProfile,
        url,
        contentLabel: "X HTML",
        pageTimeoutMs,
        challengeTimeoutMs,
        run: session.run,
        detectBlocked: detectXSessionWall,
        inspectHtml: async (html) => {
          parseXTimelinePage(html, handle);
          return "ready";
        }
      });
    },
    close: session.close
  };
}
