import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { createOpenClawIndeedPageFetcher, createOpenClawXNewsPageFetcher } from "../src/core/openclaw-browser.js";
import type { IndeedAlertConfig, XNewsListConfig } from "../src/core/types.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures/indeed");
const X_FIXTURES_DIR = path.resolve(process.cwd(), "fixtures/x");
const SEARCH_URL =
  "https://ca.indeed.com/jobs?q=call+centre&l=Canada&from=subwaywebapp&sc=0kf%3Aattr%28DSQF7%29%3B&radius=50&vjk=dce1e0f08d112161";

function loadHtml(fileName: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, fileName), "utf8");
}

function loadXHtml(fileName: string): string {
  return fs.readFileSync(path.join(X_FIXTURES_DIR, fileName), "utf8");
}

function createAlert(overrides: Partial<IndeedAlertConfig> = {}): IndeedAlertConfig {
  return {
    id: "call-centre-canada-remote",
    label: "Call centre jobs in Canada",
    searchUrl: SEARCH_URL,
    discordTarget: "channel:123456789012345680",
    enabled: true,
    maxPages: 5,
    browserProfile: "indeed-call-centre-canada-remote",
    pageTimeoutMs: 4000,
    challengeTimeoutMs: 2000,
    ...overrides
  };
}

function createXList(overrides: Partial<XNewsListConfig> = {}): XNewsListConfig {
  return {
    id: "ai-alpha",
    label: "AI alpha and model news",
    seedHandle: "Kev_Mok",
    discordTarget: "channel:123456789012345680",
    enabled: true,
    browserProfile: "x-news-ai-alpha",
    pollEveryMinutes: 60,
    maxTrackedAccounts: 10,
    maxPostsPerAccount: 5,
    bootstrapHandles: ["openai"],
    pageTimeoutMs: 4000,
    challengeTimeoutMs: 2000,
    topics: [],
    discovery: {
      autoAdd: true,
      maxNewAccountsPerRun: 10,
      minDiscoveryScore: 0.72
    },
    ...overrides
  };
}

describe("createOpenClawIndeedPageFetcher", () => {
  test("fails fast when the OpenClaw gateway is unreachable before any browser navigation", async () => {
    const calls: string[][] = [];
    const fetcher = createOpenClawIndeedPageFetcher({
      alert: createAlert(),
      runCommand: async (args) => {
        calls.push(args);
        if (args[0] === "status") {
          return [
            "[memory] fts unavailable: no such module: fts5",
            JSON.stringify({
              gateway: {
                url: "ws://127.0.0.1:19001",
                reachable: false,
                error: "connect failed: connect EPERM 127.0.0.1:19001 - Local (undefined:undefined)"
              }
            })
          ].join("\n");
        }

        throw new Error(`Unexpected browser command: ${args.join(" ")}`);
      }
    });

    await expect(fetcher.fetchSearchPage(SEARCH_URL)).rejects.toThrow("OpenClaw gateway is not reachable");
    expect(calls).toEqual([["status", "--json"]]);
  });

  test("surfaces the browser phase when an OpenClaw command times out", async () => {
    const calls: string[][] = [];
    const fetcher = createOpenClawIndeedPageFetcher({
      alert: createAlert(),
      runCommand: async (args) => {
        calls.push(args);
        if (args[0] === "status") {
          return JSON.stringify({
            gateway: {
              url: "ws://127.0.0.1:19001",
              reachable: true,
              error: null
            }
          });
        }

        if (args.includes("open")) {
          throw new Error("Command timed out after 5000ms");
        }

        return "";
      }
    });

    await expect(fetcher.fetchSearchPage(SEARCH_URL)).rejects.toThrow("OpenClaw browser open timed out");
    expect(calls.some((args) => args.includes("wait") || args.includes("evaluate"))).toBe(false);
  });

  test("reuses one browser tab, tolerates a transient challenge, and closes the tab at the end", async () => {
    const calls: string[][] = [];
    const evaluateOutputs = [loadHtml("blocked-cloudflare.html"), loadHtml("search-page-1.html"), loadHtml("detail-call01.html")];

    const fetcher = createOpenClawIndeedPageFetcher({
      alert: createAlert(),
      runCommand: async (args) => {
        calls.push(args);
        if (args[0] === "status") {
          return JSON.stringify({
            gateway: {
              url: "ws://127.0.0.1:19001",
              reachable: true,
              error: null
            }
          });
        }
        if (args.includes("evaluate")) {
          return JSON.stringify({ value: evaluateOutputs.shift() ?? "" });
        }
        return "";
      }
    });

    const searchHtml = await fetcher.fetchSearchPage(SEARCH_URL);
    const detailHtml = await fetcher.fetchDetailPage("call01", "https://ca.indeed.com/viewjob?jk=call01");
    await fetcher.close();

    expect(searchHtml).toContain("Call Centre Representative");
    expect(detailHtml).toContain("jobDescriptionText");
    expect(calls.some((args) => args.includes("create-profile"))).toBe(true);
    expect(calls.some((args) => args.includes("open") && args.includes(SEARCH_URL))).toBe(true);
    expect(calls.some((args) => args.includes("navigate") && args.includes("https://ca.indeed.com/viewjob?jk=call01"))).toBe(true);
    expect(calls.some((args) => args.includes("close"))).toBe(true);
  });

  test("fails when the challenge persists past the configured timeout", async () => {
    const calls: string[][] = [];
    const fetcher = createOpenClawIndeedPageFetcher({
      alert: createAlert({
        pageTimeoutMs: 4000,
        challengeTimeoutMs: 2000
      }),
      runCommand: async (args) => {
        calls.push(args);
        if (args[0] === "status") {
          return JSON.stringify({
            gateway: {
              url: "ws://127.0.0.1:19001",
              reachable: true,
              error: null
            }
          });
        }
        if (args.includes("evaluate")) {
          return JSON.stringify({ value: loadHtml("blocked-cloudflare.html") });
        }
        return "";
      }
    });

    await expect(fetcher.fetchSearchPage(SEARCH_URL)).rejects.toThrow("Enable JavaScript and cookies to continue");
    expect(calls.some((args) => args.includes("evaluate"))).toBe(true);
  });

  test("automates Indeed login with stored credentials before resuming the search page", async () => {
    const calls: string[][] = [];
    const snapshots = [
      JSON.stringify({
        url: "https://secure.indeed.com/auth",
        refs: {
          e7: { role: "textbox", name: "Email address" },
          e8: { role: "button", name: "Continue" }
        }
      }),
      JSON.stringify({
        url: "https://secure.indeed.com/auth",
        refs: {
          e9: { role: "textbox", name: "Password" },
          e10: { role: "button", name: "Sign in" }
        }
      }),
      JSON.stringify({
        url: SEARCH_URL,
        refs: {}
      })
    ];
    const evaluateOutputs = [
      JSON.stringify({
        value: `
          <html>
            <body>
              <h1>Indeed Sign In</h1>
              <label>Email address</label>
              <button>Continue with Google</button>
            </body>
          </html>
        `
      }),
      JSON.stringify({ value: loadHtml("search-page-1.html") })
    ];

    const fetcher = createOpenClawIndeedPageFetcher({
      alert: createAlert({
        auth: {
          mode: "pass",
          usernameEntry: "openclaw/indeed/call-centre-canada-remote/username",
          passwordEntry: "openclaw/indeed/call-centre-canada-remote/password"
        }
      }),
      loadAuthCredentials: async () => ({
        username: "kevin@example.com",
        password: "super-secret-password"
      }),
      runCommand: async (args) => {
        calls.push(args);
        if (args[0] === "status") {
          return JSON.stringify({
            gateway: {
              url: "ws://127.0.0.1:19001",
              reachable: true,
              error: null
            }
          });
        }
        if (args.includes("evaluate")) {
          return evaluateOutputs.shift() ?? JSON.stringify({ value: "" });
        }
        if (args.includes("snapshot")) {
          return snapshots.shift() ?? JSON.stringify({ url: SEARCH_URL, refs: {} });
        }
        return "";
      }
    });

    const html = await fetcher.fetchSearchPage(SEARCH_URL);

    expect(html).toContain("Call Centre Representative");
    expect(calls.some((args) => args.includes("fill") && args.some((entry) => entry.includes("kevin@example.com")))).toBe(true);
    expect(
      calls.some((args) => args.includes("fill") && args.some((entry) => entry.includes("super-secret-password")))
    ).toBe(true);
    expect(calls.filter((args) => args.includes("click"))).toHaveLength(2);
  });

  test("fails clearly when Indeed redirects to login and no auth config is present", async () => {
    const fetcher = createOpenClawIndeedPageFetcher({
      alert: createAlert(),
      runCommand: async (args) => {
        if (args[0] === "status") {
          return JSON.stringify({
            gateway: {
              url: "ws://127.0.0.1:19001",
              reachable: true,
              error: null
            }
          });
        }
        if (args.includes("evaluate")) {
          return JSON.stringify({
            value: `
              <html>
                <body>
                  <h1>Indeed Sign In</h1>
                  <label>Email address</label>
                  <button>Continue with Google</button>
                </body>
              </html>
            `
          });
        }
        return "";
      }
    });

    await expect(fetcher.fetchSearchPage(SEARCH_URL)).rejects.toThrow("Indeed requires a logged-in browser session");
  });

  test("redacts credentials from browser fill errors", async () => {
    const username = "kevin@example.com";
    const password = "super-secret-password";
    const fetcher = createOpenClawIndeedPageFetcher({
      alert: createAlert({
        auth: {
          mode: "pass",
          usernameEntry: "openclaw/indeed/call-centre-canada-remote/username",
          passwordEntry: "openclaw/indeed/call-centre-canada-remote/password"
        }
      }),
      loadAuthCredentials: async () => ({ username, password }),
      runCommand: async (args) => {
        if (args[0] === "status") {
          return JSON.stringify({
            gateway: {
              url: "ws://127.0.0.1:19001",
              reachable: true,
              error: null
            }
          });
        }
        if (args.includes("evaluate")) {
          return JSON.stringify({
            value: `
              <html>
                <body>
                  <h1>Indeed Sign In</h1>
                  <label>Email address</label>
                  <button>Continue with Google</button>
                </body>
              </html>
            `
          });
        }
        if (args.includes("snapshot")) {
          return JSON.stringify({
            url: "https://secure.indeed.com/auth",
            refs: {
              e7: { role: "textbox", name: "Email address" },
              e8: { role: "button", name: "Continue" }
            }
          });
        }
        if (args.includes("fill")) {
          throw new Error(`fill failed for ${username} / ${password}`);
        }
        return "";
      }
    });

    try {
      await fetcher.fetchSearchPage(SEARCH_URL);
      throw new Error("Expected fetchSearchPage to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("[REDACTED]");
      expect(message).not.toContain(username);
      expect(message).not.toContain(password);
    }
  });

  test("uses elapsed time instead of evaluate-attempt count for parseable-page timeout", async () => {
    const evaluateDelayMs = 700;
    const fetcher = createOpenClawIndeedPageFetcher({
      alert: createAlert({
        pageTimeoutMs: 1100,
        challengeTimeoutMs: 1100
      }),
      runCommand: async (args) => {
        if (args[0] === "status") {
          return JSON.stringify({
            gateway: {
              url: "ws://127.0.0.1:19001",
              reachable: true,
              error: null
            }
          });
        }
        if (args.includes("evaluate")) {
          await new Promise((resolve) => setTimeout(resolve, evaluateDelayMs));
          return JSON.stringify({ value: "<html><body><main>loading</main></body></html>" });
        }
        return "";
      }
    });

    const startedAt = Date.now();

    await expect(fetcher.fetchSearchPage(SEARCH_URL)).rejects.toThrow("OpenClaw browser evaluate timed out");

    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(1300);
  });

  test("allows a small overhead buffer for browser wait commands", async () => {
    const fetcher = createOpenClawIndeedPageFetcher({
      alert: createAlert({
        pageTimeoutMs: 1200,
        challengeTimeoutMs: 1200
      }),
      runCommand: async (args) => {
        if (args[0] === "status") {
          return JSON.stringify({
            gateway: {
              url: "ws://127.0.0.1:19001",
              reachable: true,
              error: null
            }
          });
        }
        if (args.includes("evaluate")) {
          return JSON.stringify({ value: "<html><body><main>loading</main></body></html>" });
        }
        if (args.includes("wait")) {
          await new Promise((resolve) => setTimeout(resolve, 1050));
        }
        return "";
      }
    });

    await expect(fetcher.fetchSearchPage(SEARCH_URL)).rejects.toThrow(
      "Browser did not produce usable Indeed HTML"
    );
  });
});

describe("createOpenClawXNewsPageFetcher", () => {
  test("surfaces X session-wall failures through the shared browser runtime", async () => {
    const fetcher = createOpenClawXNewsPageFetcher({
      list: createXList(),
      runCommand: async (args) => {
        if (args[0] === "status") {
          return JSON.stringify({
            gateway: {
              url: "ws://127.0.0.1:19001",
              reachable: true,
              error: null
            }
          });
        }
        if (args.includes("evaluate")) {
          return JSON.stringify({ value: "<html><body><main><h1>Log in to X</h1></main></body></html>" });
        }
        return "";
      }
    });

    await expect(fetcher.fetchFollowingPage("Kev_Mok")).rejects.toThrow("X requires a logged-in browser session");
  });

  test("reuses the same browser tab for following and timeline fetches", async () => {
    const calls: string[][] = [];
    const outputs = [loadXHtml("following-kev-mok.html"), loadXHtml("timeline-openai.html")];

    const fetcher = createOpenClawXNewsPageFetcher({
      list: createXList(),
      runCommand: async (args) => {
        calls.push(args);
        if (args[0] === "status") {
          return JSON.stringify({
            gateway: {
              url: "ws://127.0.0.1:19001",
              reachable: true,
              error: null
            }
          });
        }
        if (args.includes("evaluate")) {
          return JSON.stringify({ value: outputs.shift() ?? "" });
        }
        return "";
      }
    });

    const followingHtml = await fetcher.fetchFollowingPage("Kev_Mok");
    const timelineHtml = await fetcher.fetchTimelinePage("openai");
    await fetcher.close();

    expect(followingHtml).toContain("OpenAI");
    expect(timelineHtml).toContain("Codex update");
    expect(calls.some((args) => args.includes("open") && args.includes("https://x.com/kev_mok/following"))).toBe(true);
    expect(calls.some((args) => args.includes("navigate") && args.includes("https://x.com/openai"))).toBe(true);
    expect(calls.some((args) => args.includes("close"))).toBe(true);
  });
});
