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

describe("createOpenClawIndeedPageFetcher rollout gate", () => {
  test("refuses direct adapter use before browser or credentials access", () => {
    let calls = 0;
    const request = async () => { calls++; throw new Error("Forbidden browser/login action"); };
    expect(() => createOpenClawIndeedPageFetcher({ alert: createAlert(), runCommand: request, loadAuthCredentials: request })).toThrow(/budget = 0/);
    expect(calls).toBe(0);
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
