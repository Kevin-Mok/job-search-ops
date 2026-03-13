import fs from "node:fs";

import { normalizeText } from "./parsing.js";
import type {
  XFollowingAccountSnapshot,
  XNewsConfig,
  XNewsListConfig,
  XNewsTopicConfig,
  XTimelinePostSnapshot
} from "./types.js";

const BASE_X_URL = "https://x.com";
const USER_CELL_START_REGEX = /<div\b[^>]*data-testid="UserCell"[^>]*>/gi;
const TWEET_START_REGEX = /<article\b[^>]*data-testid="tweet"[^>]*>/gi;
const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " "
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, raw: string) => {
    const key = raw.toLowerCase();
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return HTML_ENTITY_MAP[key] ?? match;
  });
}

function stripHtml(value: string): string {
  return normalizeText(decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")));
}

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "").toLowerCase();
}

function buildProfileUrl(handle: string): string {
  return `${BASE_X_URL}/${normalizeHandle(handle)}`;
}

export function buildXProfileUrl(handle: string): string {
  return buildProfileUrl(handle);
}

export function buildXFollowingUrl(handle: string): string {
  return `${buildProfileUrl(handle)}/following`;
}

export function buildXTimelineUrl(handle: string): string {
  return buildProfileUrl(handle);
}

function extractBalancedTag(html: string, startIndex: number, tagName: string): string | undefined {
  const firstTagEnd = html.indexOf(">", startIndex);
  if (firstTagEnd === -1) {
    return undefined;
  }

  const openPattern = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const closePattern = new RegExp(`</${tagName}>`, "gi");
  let depth = 1;
  let cursor = firstTagEnd + 1;

  while (cursor < html.length) {
    openPattern.lastIndex = cursor;
    closePattern.lastIndex = cursor;
    const nextOpen = openPattern.exec(html);
    const nextClose = closePattern.exec(html);

    if (!nextClose) {
      return undefined;
    }

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = openPattern.lastIndex;
      continue;
    }

    depth -= 1;
    cursor = closePattern.lastIndex;
    if (depth === 0) {
      return html.slice(startIndex, cursor);
    }
  }

  return undefined;
}

function extractBalancedBlocks(html: string, startRegex: RegExp, tagName: string): string[] {
  const blocks: string[] = [];

  for (const match of html.matchAll(startRegex)) {
    if (match.index === undefined) {
      continue;
    }

    const block = extractBalancedTag(html, match.index, tagName);
    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
}

function extractAttribute(html: string, attribute: string): string | undefined {
  const match = html.match(new RegExp(`${attribute}="([^"]+)"`, "i"));
  return match?.[1];
}

function extractSpanTexts(html: string): string[] {
  return [...html.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);
}

function parseCount(raw?: string): number | undefined {
  if (!raw) {
    return undefined;
  }

  const normalized = raw.replaceAll(",", "").trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)([km])?$/i);
  if (!match) {
    const integer = Number.parseInt(normalized.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(integer) ? integer : undefined;
  }

  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) {
    return undefined;
  }

  const multiplier = match[2] === "k" ? 1_000 : match[2] === "m" ? 1_000_000 : 1;
  return Math.round(value * multiplier);
}

function extractMetric(block: string, attrName: string, fallbackPattern: RegExp): number {
  const attrValue = extractAttribute(block, attrName);
  const fromAttr = parseCount(attrValue);
  if (typeof fromAttr === "number") {
    return fromAttr;
  }

  const match = block.match(fallbackPattern);
  const fromFallback = parseCount(match?.[1]);
  return typeof fromFallback === "number" ? fromFallback : 0;
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractFirstBalancedDivByTestId(html: string, testId: string): string | undefined {
  const regex = new RegExp(`<div\\b[^>]*data-testid="${testId}"[^>]*>`, "i");
  const match = regex.exec(html);
  return match?.index === undefined ? undefined : extractBalancedTag(html, match.index, "div");
}

function extractReplyHandles(block: string): string[] {
  const replyContext = stripHtml(extractFirstBalancedDivByTestId(block, "reply") ?? block);
  return uniq([...replyContext.matchAll(/replying to\s+@([a-z0-9_]{1,15})/gi)].map((match) => normalizeHandle(match[1])));
}

function extractMentionHandles(text: string): string[] {
  return uniq([...text.matchAll(/(^|[^a-z0-9_])@([a-z0-9_]{1,15})\b/gi)].map((match) => normalizeHandle(match[2])));
}

function extractQuotedHandles(block: string, authorHandle: string, postId: string): string[] {
  return uniq(
    [...block.matchAll(/href="\/([a-z0-9_]{1,15})\/status\/(\d+)"/gi)]
      .map((match) => ({ handle: normalizeHandle(match[1]), postId: match[2] }))
      .filter((entry) => entry.handle !== authorHandle || entry.postId !== postId)
      .map((entry) => entry.handle)
  );
}

function inferTopicIds(topics: XNewsTopicConfig[], text: string, bio?: string): string[] {
  const haystack = `${text} ${bio ?? ""}`.toLowerCase();
  return topics
    .filter((topic) => {
      if (topic.preferredHandles.some((handle) => haystack.includes(normalizeHandle(handle)))) {
        return true;
      }

      return topic.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
    })
    .map((topic) => topic.id);
}

export function detectXSessionWall(html: string): string | undefined {
  const plainText = stripHtml(html).toLowerCase();
  if (
    !/log in|sign in|join x today|sign up/i.test(plainText) ||
    /data-testid="tweet"|data-testid="UserCell"/i.test(html)
  ) {
    return undefined;
  }

  return "X requires a logged-in browser session for this page";
}

export function parseXFollowingPage(html: string): XFollowingAccountSnapshot[] {
  const blocked = detectXSessionWall(html);
  if (blocked) {
    throw new Error(blocked);
  }

  const seen = new Set<string>();
  const accounts: XFollowingAccountSnapshot[] = [];

  for (const block of extractBalancedBlocks(html, USER_CELL_START_REGEX, "div")) {
    const handleMatch = block.match(/href="\/([a-z0-9_]{1,15})(?:[/?"][^"]*)?"/i);
    if (!handleMatch?.[1]) {
      continue;
    }

    const handle = normalizeHandle(handleMatch[1]);
    if (seen.has(handle)) {
      continue;
    }
    seen.add(handle);

    const spanTexts = extractSpanTexts(block);
    const displayName =
      spanTexts.find((entry) => !entry.startsWith("@") && !/^follow$/i.test(entry) && entry !== "Verified account") ??
      handle;
    const bio = stripHtml(extractFirstBalancedDivByTestId(block, "UserDescription") ?? "");

    accounts.push({
      handle,
      displayName,
      profileUrl: buildProfileUrl(handle),
      bio: bio || undefined,
      verified: /verified account|icon-verified/i.test(block)
    });
  }

  return accounts;
}

export function parseXTimelinePage(html: string, fallbackHandle?: string): XTimelinePostSnapshot[] {
  const blocked = detectXSessionWall(html);
  if (blocked) {
    throw new Error(blocked);
  }

  const posts: XTimelinePostSnapshot[] = [];

  for (const block of extractBalancedBlocks(html, TWEET_START_REGEX, "article")) {
    const mainLinkMatch =
      block.match(/href="\/([a-z0-9_]{1,15})\/status\/(\d+)"[\s\S]*?<time\b[^>]*datetime="([^"]+)"/i) ??
      block.match(/href="\/([a-z0-9_]{1,15})\/status\/(\d+)"/i);
    const authorHandle = normalizeHandle(mainLinkMatch?.[1] ?? fallbackHandle ?? "");
    const postId = mainLinkMatch?.[2];
    const postedAt = mainLinkMatch?.[3] ?? extractAttribute(block, "datetime");
    const textBlock = extractFirstBalancedDivByTestId(block, "tweetText");
    const text = stripHtml(textBlock ?? "");

    if (!authorHandle || !postId || !postedAt || !text) {
      continue;
    }

    const userNameBlock = extractFirstBalancedDivByTestId(block, "User-Name") ?? "";
    const spanTexts = extractSpanTexts(userNameBlock);
    const authorDisplayName =
      spanTexts.find((entry) => entry && !entry.startsWith("@") && entry !== "Verified account") ?? authorHandle;
    const mentionHandles = extractMentionHandles(text);
    const replyHandles = extractReplyHandles(block);
    const quoteHandles = extractQuotedHandles(block, authorHandle, postId);

    posts.push({
      postId,
      authorHandle,
      authorDisplayName,
      authorProfileUrl: buildProfileUrl(authorHandle),
      postUrl: `${buildProfileUrl(authorHandle)}/status/${postId}`,
      postedAt,
      text,
      normalizedText: normalizeText(text.toLowerCase()),
      quoteHandles,
      replyHandles,
      mentionHandles,
      likeCount: extractMetric(block, "data-like-count", /([\d.,kKmM]+)\s+likes?/i),
      repostCount: extractMetric(block, "data-repost-count", /([\d.,kKmM]+)\s+reposts?/i),
      replyCount: extractMetric(block, "data-reply-count", /([\d.,kKmM]+)\s+repl(?:y|ies)/i),
      viewCount: parseCount(extractAttribute(block, "data-view-count")),
      verified: /verified account|icon-verified/i.test(block)
    });
  }

  return posts;
}

function normalizeTopicConfig(topic: Partial<XNewsTopicConfig>): XNewsTopicConfig {
  if (typeof topic.id !== "string" || typeof topic.label !== "string") {
    throw new Error("Invalid X news topic entry");
  }

  return {
    id: topic.id,
    label: topic.label,
    keywords: Array.isArray(topic.keywords) ? topic.keywords.map((entry) => String(entry).trim()).filter(Boolean) : [],
    preferredHandles: Array.isArray(topic.preferredHandles)
      ? topic.preferredHandles.map((entry) => normalizeHandle(String(entry))).filter(Boolean)
      : []
  };
}

export function loadXNewsConfig(configPath: string): XNewsConfig {
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<XNewsConfig>;
  if (!Array.isArray(raw.lists)) {
    throw new Error(`Invalid X news config: ${configPath}`);
  }

  return {
    lists: raw.lists.map((list) => {
      if (
        typeof list?.id !== "string" ||
        typeof list.label !== "string" ||
        typeof list.seedHandle !== "string" ||
        typeof list.discordTarget !== "string"
      ) {
        throw new Error(`Invalid X news list entry in ${configPath}`);
      }

      return {
        id: list.id,
        label: list.label,
        seedHandle: normalizeHandle(list.seedHandle),
        discordTarget: list.discordTarget,
        enabled: list.enabled !== false,
        browserProfile:
          typeof list.browserProfile === "string" && list.browserProfile.trim().length > 0
            ? list.browserProfile.trim()
            : `x-news-${list.id}`,
        pollEveryMinutes:
          typeof list.pollEveryMinutes === "number" && Number.isFinite(list.pollEveryMinutes)
            ? Math.max(5, Math.floor(list.pollEveryMinutes))
            : 60,
        maxTrackedAccounts:
          typeof list.maxTrackedAccounts === "number" && Number.isFinite(list.maxTrackedAccounts)
            ? Math.max(1, Math.floor(list.maxTrackedAccounts))
            : 200,
        maxPostsPerAccount:
          typeof list.maxPostsPerAccount === "number" && Number.isFinite(list.maxPostsPerAccount)
            ? Math.max(1, Math.floor(list.maxPostsPerAccount))
            : 5,
        bootstrapHandles: Array.isArray(list.bootstrapHandles)
          ? list.bootstrapHandles.map((entry) => normalizeHandle(String(entry))).filter(Boolean)
          : [],
        pageTimeoutMs:
          typeof list.pageTimeoutMs === "number" && Number.isFinite(list.pageTimeoutMs) ? list.pageTimeoutMs : 30000,
        challengeTimeoutMs:
          typeof list.challengeTimeoutMs === "number" && Number.isFinite(list.challengeTimeoutMs)
            ? list.challengeTimeoutMs
            : 12000,
        topics: Array.isArray(list.topics) ? list.topics.map((entry) => normalizeTopicConfig(entry)) : [],
        discovery: {
          autoAdd: list.discovery?.autoAdd !== false,
          maxNewAccountsPerRun:
            typeof list.discovery?.maxNewAccountsPerRun === "number" &&
            Number.isFinite(list.discovery.maxNewAccountsPerRun)
              ? Math.max(1, Math.floor(list.discovery.maxNewAccountsPerRun))
              : 10,
          minDiscoveryScore:
            typeof list.discovery?.minDiscoveryScore === "number" && Number.isFinite(list.discovery.minDiscoveryScore)
              ? Math.max(0, Math.min(1, list.discovery.minDiscoveryScore))
              : 0.72
        }
      } satisfies XNewsListConfig;
    })
  };
}

export function getXNewsList(configPath: string, listId: string): XNewsListConfig {
  const config = loadXNewsConfig(configPath);
  const list = config.lists.find((entry) => entry.id === listId);
  if (!list) {
    throw new Error(`X news list not found: ${listId}`);
  }
  return list;
}

export function inferXTopicsForAccount(
  topics: XNewsTopicConfig[],
  account: Pick<XFollowingAccountSnapshot, "handle" | "bio" | "displayName">
): string[] {
  return inferTopicIds(topics, `${account.handle} ${account.displayName}`, account.bio);
}
