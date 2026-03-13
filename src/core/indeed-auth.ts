import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import type { IndeedAlertConfig, IndeedAuthCredentials, IndeedPassAuthConfig } from "./types.js";

const execFileAsync = promisify(execFile);

export type PassEntryReader = (entry: string) => Promise<string>;
export type PassEntryWriter = (entry: string, value: string) => Promise<void>;

function stripTrailingLineBreaks(value: string): string {
  return value.replace(/(?:\r?\n)+$/g, "");
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

export function getDefaultIndeedPassEntries(alertId: string): Pick<IndeedPassAuthConfig, "usernameEntry" | "passwordEntry"> {
  return {
    usernameEntry: `openclaw/indeed/${alertId}/username`,
    passwordEntry: `openclaw/indeed/${alertId}/password`
  };
}

export function normalizeIndeedPassAuthConfig(alertId: string, rawAuth: unknown): IndeedPassAuthConfig | undefined {
  if (rawAuth === undefined || rawAuth === null) {
    return undefined;
  }

  if (!rawAuth || typeof rawAuth !== "object") {
    throw new Error(`Invalid Indeed auth config for ${alertId}`);
  }

  const auth = rawAuth as Record<string, unknown>;
  if (auth.mode !== "pass") {
    throw new Error(`Invalid Indeed auth mode for ${alertId}: expected "pass"`);
  }

  const defaults = getDefaultIndeedPassEntries(alertId);

  return {
    mode: "pass",
    usernameEntry:
      typeof auth.usernameEntry === "string" && auth.usernameEntry.trim().length > 0
        ? auth.usernameEntry.trim()
        : defaults.usernameEntry,
    passwordEntry:
      typeof auth.passwordEntry === "string" && auth.passwordEntry.trim().length > 0
        ? auth.passwordEntry.trim()
        : defaults.passwordEntry
  };
}

async function defaultReadPassEntry(entry: string): Promise<string> {
  const { stdout } = await execFileAsync("pass", ["show", entry]);
  return stripTrailingLineBreaks(stdout);
}

async function defaultWritePassEntry(entry: string, value: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pass", ["insert", "--multiline", "--force", entry], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `pass insert exited with code ${code ?? "unknown"}`));
    });
    child.stdin.end(`${value}\n`);
  });
}

export async function readIndeedPassEntry(entry: string, readEntry: PassEntryReader = defaultReadPassEntry): Promise<string> {
  try {
    const value = stripTrailingLineBreaks(await readEntry(entry));
    if (!value) {
      throw new Error("entry is empty");
    }
    return value;
  } catch (error) {
    const detail = extractErrorMessage(error);
    throw new Error(`Unable to read Indeed auth from pass entry '${entry}': ${detail}`);
  }
}

export async function loadIndeedPassCredentials(
  alert: Pick<IndeedAlertConfig, "id" | "auth">,
  readEntry?: PassEntryReader
): Promise<IndeedAuthCredentials | undefined> {
  if (!alert.auth) {
    return undefined;
  }

  const username = await readIndeedPassEntry(alert.auth.usernameEntry, readEntry);
  const password = await readIndeedPassEntry(alert.auth.passwordEntry, readEntry);

  return { username, password };
}

export async function storeIndeedPassCredentials(params: {
  alert: Pick<IndeedAlertConfig, "id" | "auth">;
  username: string;
  password: string;
  writeEntry?: PassEntryWriter;
}): Promise<IndeedPassAuthConfig> {
  if (!params.alert.auth) {
    throw new Error(`Indeed alert '${params.alert.id}' is missing auth.mode="pass" in config`);
  }

  const writer = params.writeEntry ?? defaultWritePassEntry;
  await writer(params.alert.auth.usernameEntry, params.username);
  await writer(params.alert.auth.passwordEntry, params.password);
  return params.alert.auth;
}
