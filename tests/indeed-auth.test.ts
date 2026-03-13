import { describe, expect, test } from "vitest";

import {
  getDefaultIndeedPassEntries,
  loadIndeedPassCredentials,
  normalizeIndeedPassAuthConfig,
  storeIndeedPassCredentials
} from "../src/core/indeed-auth.js";
import type { IndeedAlertConfig } from "../src/core/types.js";

describe("indeed-auth", () => {
  test("derives default pass entries from the alert id", () => {
    expect(getDefaultIndeedPassEntries("call-centre-canada-remote")).toEqual({
      usernameEntry: "openclaw/indeed/call-centre-canada-remote/username",
      passwordEntry: "openclaw/indeed/call-centre-canada-remote/password"
    });
  });

  test("normalizes pass auth config with default entry names", () => {
    expect(normalizeIndeedPassAuthConfig("call-centre-canada-remote", { mode: "pass" })).toEqual({
      mode: "pass",
      usernameEntry: "openclaw/indeed/call-centre-canada-remote/username",
      passwordEntry: "openclaw/indeed/call-centre-canada-remote/password"
    });
  });

  test("loads username and password from pass entries", async () => {
    const alert: IndeedAlertConfig = {
      id: "call-centre-canada-remote",
      label: "Call centre jobs in Canada",
      searchUrl: "https://ca.indeed.com/jobs?q=call+centre&l=Canada",
      discordTarget: "channel:123456789012345680",
      enabled: true,
      maxPages: 5,
      auth: {
        mode: "pass",
        usernameEntry: "openclaw/indeed/call-centre-canada-remote/username",
        passwordEntry: "openclaw/indeed/call-centre-canada-remote/password"
      }
    };

    const credentials = await loadIndeedPassCredentials(alert, async (entry) => {
      if (entry.endsWith("/username")) {
        return "kevin@example.com\n";
      }

      if (entry.endsWith("/password")) {
        return "super-secret-password\n";
      }

      throw new Error(`Unexpected pass entry: ${entry}`);
    });

    expect(credentials).toEqual({
      username: "kevin@example.com",
      password: "super-secret-password"
    });
  });

  test("surfaces a clear error when a pass entry cannot be read", async () => {
    const alert: IndeedAlertConfig = {
      id: "call-centre-canada-remote",
      label: "Call centre jobs in Canada",
      searchUrl: "https://ca.indeed.com/jobs?q=call+centre&l=Canada",
      discordTarget: "channel:123456789012345680",
      enabled: true,
      maxPages: 5,
      auth: {
        mode: "pass",
        usernameEntry: "openclaw/indeed/call-centre-canada-remote/username",
        passwordEntry: "openclaw/indeed/call-centre-canada-remote/password"
      }
    };

    await expect(
      loadIndeedPassCredentials(alert, async () => {
        throw new Error("pass show failed: entry not found");
      })
    ).rejects.toThrow("Unable to read Indeed auth from pass entry");
  });

  test("stores credentials through the provided writer", async () => {
    const writes: Array<{ entry: string; value: string }> = [];
    const alert: IndeedAlertConfig = {
      id: "call-centre-canada-remote",
      label: "Call centre jobs in Canada",
      searchUrl: "https://ca.indeed.com/jobs?q=call+centre&l=Canada",
      discordTarget: "channel:123456789012345680",
      enabled: true,
      maxPages: 5,
      auth: {
        mode: "pass",
        usernameEntry: "openclaw/indeed/call-centre-canada-remote/username",
        passwordEntry: "openclaw/indeed/call-centre-canada-remote/password"
      }
    };

    const auth = await storeIndeedPassCredentials({
      alert,
      username: "kevin@example.com",
      password: "super-secret-password",
      writeEntry: async (entry, value) => {
        writes.push({ entry, value });
      }
    });

    expect(auth).toEqual(alert.auth);
    expect(writes).toEqual([
      {
        entry: "openclaw/indeed/call-centre-canada-remote/username",
        value: "kevin@example.com"
      },
      {
        entry: "openclaw/indeed/call-centre-canada-remote/password",
        value: "super-secret-password"
      }
    ]);
  });
});
