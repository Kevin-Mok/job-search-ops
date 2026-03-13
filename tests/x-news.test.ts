import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { briefXNews, listXNewsWatchlist, syncXNewsFeed } from "../src/core/x-news-sync.js";
import { parseXFollowingPage, parseXTimelinePage } from "../src/core/x-news.js";
import type { XNewsListConfig, XNewsPageFetcher } from "../src/core/types.js";
import { JobStore } from "../src/db/store.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures/x");

function loadHtml(fileName: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, fileName), "utf8");
}

function createStore(): JobStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "job-ops-x-news-"));
  return new JobStore(path.join(dir, "job-ops.sqlite"));
}

function createList(overrides: Partial<XNewsListConfig> = {}): XNewsListConfig {
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
    bootstrapHandles: ["openai", "AnthropicAI"],
    pageTimeoutMs: 30000,
    challengeTimeoutMs: 12000,
    topics: [
      {
        id: "vibe-coding-alpha",
        label: "Vibe Coding Alpha",
        keywords: ["vibe coding", "alpha", "coding workflows"],
        preferredHandles: ["latentspacepod"]
      },
      {
        id: "openai",
        label: "OpenAI",
        keywords: ["openai", "responses api", "gpt-5"],
        preferredHandles: ["openai"]
      },
      {
        id: "codex",
        label: "Codex",
        keywords: ["codex", "agentic coding", "coding agent"],
        preferredHandles: ["openai"]
      },
      {
        id: "claude",
        label: "Claude",
        keywords: ["claude", "claude code"],
        preferredHandles: ["anthropicai"]
      },
      {
        id: "anthropic",
        label: "Anthropic",
        keywords: ["anthropic", "mcp", "model context protocol"],
        preferredHandles: ["anthropicai"]
      }
    ],
    discovery: {
      autoAdd: true,
      maxNewAccountsPerRun: 10,
      minDiscoveryScore: 0.72
    },
    ...overrides
  };
}

describe("X news parsing", () => {
  test("parses followed accounts from the rendered following page", () => {
    const accounts = parseXFollowingPage(loadHtml("following-kev-mok.html"));

    expect(accounts).toHaveLength(3);
    expect(accounts[0]).toMatchObject({
      handle: "openai",
      displayName: "OpenAI",
      verified: true
    });
    expect(accounts[1]).toMatchObject({
      handle: "anthropicai",
      displayName: "Anthropic"
    });
  });

  test("parses rendered timeline posts, mentions, quotes, and reply targets", () => {
    const posts = parseXTimelinePage(loadHtml("timeline-openai.html"), "openai");

    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      postId: "1001",
      authorHandle: "openai",
      likeCount: 1800,
      repostCount: 220
    });
    expect(posts[1].replyHandles).toEqual(["anthropicai"]);
    expect(posts[1].quoteHandles).toContain("anthropicai");
    expect(posts[1].mentionHandles).toContain("alphasignalai");
  });
});

describe("syncXNewsFeed", () => {
  test("seeds from the following graph, stores posts, auto-adds discoveries, and suppresses repeat deliveries", async () => {
    const store = createStore();
    const deliveries: Array<{ target: string; message: string }> = [];
    let closed = false;
    const list = createList();

    const pageFetcher: XNewsPageFetcher = {
      async fetchFollowingPage(handle) {
        expect(handle).toBe("Kev_Mok");
        return loadHtml("following-kev-mok.html");
      },
      async fetchTimelinePage(handle) {
        const normalized = handle.toLowerCase();
        if (normalized === "openai") {
          return loadHtml("timeline-openai.html");
        }
        if (normalized === "anthropicai") {
          return loadHtml("timeline-anthropic.html");
        }
        if (normalized === "latentspacepod") {
          return loadHtml("timeline-latentspacepod.html");
        }
        throw new Error(`Unexpected handle: ${handle}`);
      },
      async close() {
        closed = true;
      }
    };

    const summary = await syncXNewsFeed({
      list,
      store,
      pageFetcher,
      sendDiscordMessage: async (payload) => {
        deliveries.push(payload);
        return { deliveryId: `delivery-${deliveries.length}` };
      }
    });

    expect(summary.status).toBe("completed");
    expect(summary.seedAccountsSeen).toBe(3);
    expect(summary.trackedAccountsCrawled).toBe(3);
    expect(summary.postsSeen).toBe(4);
    expect(summary.postsStored).toBe(4);
    expect(summary.accountsAdded).toBe(1);
    expect(summary.addedHandles).toEqual(["alphasignalai"]);
    expect(summary.deliveriesSucceeded).toBe(3);
    expect(deliveries).toHaveLength(3);
    expect(deliveries[0].message).toContain("score");
    expect(closed).toBe(true);

    const watchlist = listXNewsWatchlist({ list, store });
    expect(watchlist.map((account) => account.handle)).toContain("alphasignalai");
    expect(watchlist.find((account) => account.handle === "alphasignalai")?.source).toBe("discovery");

    const secondSummary = await syncXNewsFeed({
      list,
      store,
      pageFetcher: {
        async fetchFollowingPage() {
          return loadHtml("following-kev-mok.html");
        },
        async fetchTimelinePage(handle) {
          const normalized = handle.toLowerCase();
          if (normalized === "openai") {
            return loadHtml("timeline-openai.html");
          }
          if (normalized === "anthropicai") {
            return loadHtml("timeline-anthropic.html");
          }
          if (normalized === "latentspacepod") {
            return loadHtml("timeline-latentspacepod.html");
          }
          if (normalized === "alphasignalai") {
            return "<html><body><main><article data-testid=\"tweet\" data-like-count=\"20\" data-repost-count=\"4\" data-reply-count=\"2\"><div data-testid=\"User-Name\"><span>Alpha Signal AI</span><span>@AlphaSignalAI</span></div><a href=\"/AlphaSignalAI/status/4001\"><time datetime=\"2099-03-13T07:00:00.000Z\">7:00 AM</time></a><div data-testid=\"tweetText\"><span>Daily agent launch notes.</span></div></article></main></body></html>";
          }
          throw new Error(`Unexpected handle: ${handle}`);
        },
        async close() {}
      },
      sendDiscordMessage: async (payload) => {
        deliveries.push(payload);
        return { deliveryId: `delivery-${deliveries.length}` };
      }
    });

    expect(secondSummary.accountsAdded).toBe(0);
    expect(secondSummary.deliveriesSucceeded).toBe(0);
    expect(deliveries).toHaveLength(3);
  });

  test("briefs stored posts by lookback window and topic", async () => {
    const store = createStore();
    const list = createList();

    await syncXNewsFeed({
      list,
      store,
      pageFetcher: {
        async fetchFollowingPage() {
          return loadHtml("following-kev-mok.html");
        },
        async fetchTimelinePage(handle) {
          const normalized = handle.toLowerCase();
          if (normalized === "openai") {
            return loadHtml("timeline-openai.html");
          }
          if (normalized === "anthropicai") {
            return loadHtml("timeline-anthropic.html");
          }
          if (normalized === "latentspacepod") {
            return loadHtml("timeline-latentspacepod.html");
          }
          throw new Error(`Unexpected handle: ${handle}`);
        },
        async close() {}
      },
      sendDiscordMessage: async () => ({})
    });

    const codexBrief = briefXNews({
      list,
      store,
      hours: 24,
      topicId: "codex"
    });

    expect(codexBrief.items.length).toBeGreaterThan(0);
    expect(codexBrief.items.every((item) => item.matchedTopicIds.includes("codex"))).toBe(true);
    expect(codexBrief.items[0].whyItMatters).toContain("codex");
  });
});
