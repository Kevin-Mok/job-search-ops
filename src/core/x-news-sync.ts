import type {
  DiscordMessagePayload,
  DiscordMessageResult,
  XFollowingAccountSnapshot,
  XNewsBriefItem,
  XNewsBriefSummary,
  XNewsCandidateDiscovery,
  XNewsListConfig,
  XNewsPageFetcher,
  XNewsPostRecord,
  XNewsSyncSummary,
  XNewsTrackedAccountRecord,
  XTimelinePostSnapshot
} from "./types.js";
import { sendDiscordViaOpenClaw } from "./indeed-sync.js";
import {
  buildXProfileUrl,
  getXNewsList,
  inferXTopicsForAccount,
  parseXFollowingPage,
  parseXTimelinePage
} from "./x-news.js";
import { createOpenClawXNewsPageFetcher } from "./openclaw-browser.js";
import { JobStore } from "../db/store.js";

const DELIVERY_SCORE_THRESHOLD = 0.65;
const MAX_DELIVERIES_PER_RUN = 10;
const MAX_DELIVERIES_PER_TOPIC = 3;
const POST_RETENTION_HOURS = 36;
const DISCOVERY_SIGNAL_WINDOW_HOURS = 24 * 7;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function nowIso(): string {
  return new Date().toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@+/, "").toLowerCase();
}

function roundScore(value: number): number {
  return Number(value.toFixed(4));
}

function getAuthorQualityScore(params: {
  source: XNewsTrackedAccountRecord["source"];
  verified: boolean;
  discoveryScore?: number;
}): number {
  const base =
    params.source === "seed_following" ? 0.9 : params.source === "bootstrap" ? 0.8 : params.discoveryScore ?? 0.7;
  return roundScore(clamp(base + (params.verified ? 0.05 : 0)));
}

function computeTopicMatch(params: {
  post: XTimelinePostSnapshot;
  list: XNewsListConfig;
}): { matchedTopicIds: string[]; topicRelevanceScore: number } {
  const haystack = [
    params.post.normalizedText,
    params.post.authorHandle,
    params.post.authorDisplayName.toLowerCase(),
    params.post.quoteHandles.join(" "),
    params.post.replyHandles.join(" "),
    params.post.mentionHandles.join(" ")
  ].join(" ");

  const topicScores = params.list.topics
    .map((topic) => {
      const keywordHits = topic.keywords.filter((keyword) => haystack.includes(keyword.toLowerCase())).length;
      const handleMatch = topic.preferredHandles.some((handle) =>
        [params.post.authorHandle, ...params.post.quoteHandles, ...params.post.replyHandles, ...params.post.mentionHandles].includes(
          normalizeHandle(handle)
        )
      );
      const keywordScore = keywordHits === 0 ? 0 : Math.min(1, keywordHits / 3) * 0.7;
      const score = clamp(keywordScore + (handleMatch ? 0.3 : 0));
      return { topicId: topic.id, score };
    })
    .filter((entry) => entry.score >= 0.3)
    .sort((left, right) => right.score - left.score);

  return {
    matchedTopicIds: topicScores.map((entry) => entry.topicId),
    topicRelevanceScore: roundScore(topicScores[0]?.score ?? 0)
  };
}

function computeFreshnessScore(postedAt: string): number {
  const ageMs = Date.now() - new Date(postedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return 1;
  }

  const ageHours = ageMs / (60 * 60 * 1000);
  return roundScore(clamp(1 - ageHours / POST_RETENTION_HOURS));
}

function computeEngagementPercentiles(posts: XTimelinePostSnapshot[]): Map<string, number> {
  const scored = posts.map((post) => ({
    postId: post.postId,
    engagement: post.likeCount + post.repostCount * 2 + post.replyCount
  }));
  const sortedValues = [...scored].sort((left, right) => left.engagement - right.engagement);

  return new Map(
    scored.map((post) => {
      if (sortedValues.length <= 1) {
        return [post.postId, post.engagement > 0 ? 1 : 0] as const;
      }

      const lastIndex = sortedValues.map((entry) => entry.engagement).lastIndexOf(post.engagement);
      return [post.postId, roundScore(lastIndex / (sortedValues.length - 1))] as const;
    })
  );
}

function buildTrackedAccountRecord(params: {
  list: XNewsListConfig;
  account: Pick<XFollowingAccountSnapshot, "handle" | "displayName" | "profileUrl" | "bio" | "verified">;
  source: XNewsTrackedAccountRecord["source"];
  existing?: XNewsTrackedAccountRecord;
  discoveryScore?: number;
  fetchedAt?: string;
}): XNewsTrackedAccountRecord {
  const timestamp = nowIso();
  const topicIds = inferXTopicsForAccount(params.list.topics, params.account);

  return {
    accountId: `${params.list.id}:${normalizeHandle(params.account.handle)}`,
    listId: params.list.id,
    handle: normalizeHandle(params.account.handle),
    displayName: params.account.displayName,
    profileUrl: params.account.profileUrl,
    bio: params.account.bio,
    verified: params.account.verified,
    source: params.source,
    discoveryScore: params.discoveryScore,
    topicIds,
    authorQualityScore: getAuthorQualityScore({
      source: params.source,
      verified: params.account.verified,
      discoveryScore: params.discoveryScore
    }),
    firstSeenAt: params.existing?.firstSeenAt ?? timestamp,
    lastSeenAt: timestamp,
    lastFetchedAt: params.fetchedAt ?? params.existing?.lastFetchedAt
  };
}

function buildXNewsMessage(post: XNewsPostRecord, list: XNewsListConfig): string {
  const topicMap = new Map(list.topics.map((topic) => [topic.id, topic.label]));
  const primaryTopic = post.matchedTopicIds[0] ? topicMap.get(post.matchedTopicIds[0]) ?? post.matchedTopicIds[0] : "AI news";
  const whyItMatters =
    post.matchedTopicIds.length > 1
      ? `Touches ${post.matchedTopicIds.length} tracked topic clusters.`
      : `High-signal ${primaryTopic.toLowerCase()} post from a tracked source.`;

  return [
    `${primaryTopic.toUpperCase()} | score ${post.score}`,
    `${post.authorDisplayName} (@${post.authorHandle})`,
    post.text,
    `Why it matters: ${whyItMatters}`,
    `Posted: ${post.postedAt}`,
    `URL: ${post.postUrl}`
  ].join("\n");
}

function buildBriefItem(post: XNewsPostRecord, list: XNewsListConfig): XNewsBriefItem {
  const topicMap = new Map(list.topics.map((topic) => [topic.id, topic.label]));
  const primaryTopic = post.matchedTopicIds[0] ? topicMap.get(post.matchedTopicIds[0]) ?? post.matchedTopicIds[0] : "AI news";
  const topicLabels = post.matchedTopicIds
    .map((topicId) => topicMap.get(topicId) ?? topicId)
    .map((label) => label.toLowerCase());

  return {
    postId: post.postId,
    authorHandle: post.authorHandle,
    authorDisplayName: post.authorDisplayName,
    postUrl: post.postUrl,
    postedAt: post.postedAt,
    text: post.text,
    matchedTopicIds: post.matchedTopicIds,
    score: post.score,
    whyItMatters: `High-signal ${primaryTopic.toLowerCase()} post touching ${topicLabels.join(", ")} with freshness ${post.freshnessScore} and engagement ${post.engagementScore}.`
  };
}

function collectDiscoveryCandidates(params: {
  posts: XNewsPostRecord[];
  trackedHandles: Set<string>;
  trackedAccountsByHandle: Map<string, XNewsTrackedAccountRecord>;
}): XNewsCandidateDiscovery[] {
  const cutoff = hoursAgo(DISCOVERY_SIGNAL_WINDOW_HOURS);
  const candidates = new Map<
    string,
    {
      topicIds: Set<string>;
      sourceHandles: Set<string>;
      postIds: Set<string>;
      topicRelevanceTotal: number;
      authorQualityTotal: number;
      signalCount: number;
    }
  >();

  for (const post of params.posts) {
    if (post.postedAt < cutoff || post.matchedTopicIds.length === 0) {
      continue;
    }

    const referencedHandles = [...new Set([...post.quoteHandles, ...post.replyHandles, ...post.mentionHandles])]
      .map((handle) => normalizeHandle(handle))
      .filter((handle) => handle && handle !== post.authorHandle && !params.trackedHandles.has(handle));

    for (const handle of referencedHandles) {
      const existing = candidates.get(handle) ?? {
        topicIds: new Set<string>(),
        sourceHandles: new Set<string>(),
        postIds: new Set<string>(),
        topicRelevanceTotal: 0,
        authorQualityTotal: 0,
        signalCount: 0
      };

      for (const topicId of post.matchedTopicIds) {
        existing.topicIds.add(topicId);
      }
      existing.sourceHandles.add(post.authorHandle);
      existing.postIds.add(post.postId);
      existing.topicRelevanceTotal += post.topicRelevanceScore;
      existing.authorQualityTotal += params.trackedAccountsByHandle.get(post.authorHandle)?.authorQualityScore ?? post.authorQualityScore;
      existing.signalCount += 1;
      candidates.set(handle, existing);
    }
  }

  return [...candidates.entries()]
    .map(([handle, candidate]) => {
      const topicRelevanceScore = clamp(candidate.topicRelevanceTotal / Math.max(1, candidate.signalCount));
      const networkScore = clamp(candidate.sourceHandles.size / 4);
      const authorQualityScore = clamp(candidate.authorQualityTotal / Math.max(1, candidate.signalCount));
      const discoveryScore = roundScore(
        clamp(topicRelevanceScore * 0.45 + networkScore * 0.35 + authorQualityScore * 0.2)
      );

      return {
        handle,
        topicIds: [...candidate.topicIds].sort(),
        sourceHandles: [...candidate.sourceHandles].sort(),
        postIds: [...candidate.postIds].sort(),
        topicRelevanceScore: roundScore(topicRelevanceScore),
        networkScore: roundScore(networkScore),
        authorQualityScore: roundScore(authorQualityScore),
        discoveryScore
      } satisfies XNewsCandidateDiscovery;
    })
    .filter((candidate) => candidate.sourceHandles.length >= 2)
    .sort((left, right) => right.discoveryScore - left.discoveryScore || left.handle.localeCompare(right.handle));
}

function selectDeliveryPosts(posts: XNewsPostRecord[]): XNewsPostRecord[] {
  const topicCounts = new Map<string, number>();
  const selected: XNewsPostRecord[] = [];

  for (const post of posts.sort((left, right) => right.score - left.score || right.postedAt.localeCompare(left.postedAt))) {
    if (selected.length >= MAX_DELIVERIES_PER_RUN) {
      break;
    }

    if (post.score < DELIVERY_SCORE_THRESHOLD || post.matchedTopicIds.length === 0) {
      continue;
    }

    const primaryTopic = post.matchedTopicIds[0];
    const count = topicCounts.get(primaryTopic) ?? 0;
    if (count >= MAX_DELIVERIES_PER_TOPIC) {
      continue;
    }

    topicCounts.set(primaryTopic, count + 1);
    selected.push(post);
  }

  return selected;
}

export function getXNewsFeed(configPath: string, listId: string): XNewsListConfig {
  return getXNewsList(configPath, listId);
}

export async function syncXNewsFeed(params: {
  list: XNewsListConfig;
  store: JobStore;
  pageFetcher?: XNewsPageFetcher;
  sendDiscordMessage?: (payload: DiscordMessagePayload) => Promise<DiscordMessageResult>;
}): Promise<XNewsSyncSummary> {
  if (!params.list.enabled) {
    throw new Error(`X news list is disabled: ${params.list.id}`);
  }

  const pageFetcher = params.pageFetcher ?? createOpenClawXNewsPageFetcher({ list: params.list });
  const sendDiscordMessage = params.sendDiscordMessage ?? sendDiscordViaOpenClaw;
  const run = params.store.startXNewsSyncRun({ listId: params.list.id });
  const partialErrors: string[] = [];
  const addedHandles: string[] = [];
  const deliveredPostIds: string[] = [];
  let seedAccountsSeen = 0;
  let trackedAccountsCrawled = 0;
  let postsSeen = 0;
  let postsStored = 0;
  let accountsAdded = 0;
  let deliveriesAttempted = 0;
  let deliveriesSucceeded = 0;
  let deliveriesFailed = 0;

  try {
    let seedAccounts: XFollowingAccountSnapshot[] = [];
    try {
      seedAccounts = parseXFollowingPage(await pageFetcher.fetchFollowingPage(params.list.seedHandle));
      seedAccountsSeen = seedAccounts.length;
    } catch (error) {
      partialErrors.push(error instanceof Error ? error.message : String(error));
      if (params.list.bootstrapHandles.length === 0) {
        throw error;
      }
    }

    if (seedAccounts.length === 0 && params.list.bootstrapHandles.length > 0) {
      seedAccounts = params.list.bootstrapHandles.map((handle) => ({
        handle,
        displayName: handle,
        profileUrl: buildXProfileUrl(handle),
        verified: false
      }));
    }

    for (const account of seedAccounts) {
      const existing = params.store.getXNewsTrackedAccount(params.list.id, account.handle);
      params.store.upsertXNewsTrackedAccount(
        buildTrackedAccountRecord({
          list: params.list,
          account,
          source: seedAccountsSeen > 0 ? "seed_following" : "bootstrap",
          existing
        })
      );
    }

    const trackedAccounts = params.store.listXNewsTrackedAccounts(params.list.id, params.list.maxTrackedAccounts);
    const trackedAccountsByHandle = new Map(trackedAccounts.map((account) => [account.handle, account]));
    const recentSnapshots: Array<{ snapshot: XTimelinePostSnapshot; account: XNewsTrackedAccountRecord }> = [];

    for (const account of trackedAccounts) {
      try {
        const timeline = parseXTimelinePage(await pageFetcher.fetchTimelinePage(account.handle), account.handle).slice(
          0,
          params.list.maxPostsPerAccount
        );
        trackedAccountsCrawled += 1;
        postsSeen += timeline.length;

        params.store.upsertXNewsTrackedAccount({
          ...account,
          lastSeenAt: nowIso(),
          lastFetchedAt: nowIso()
        });

        for (const snapshot of timeline) {
          if (snapshot.postedAt < hoursAgo(POST_RETENTION_HOURS)) {
            continue;
          }
          recentSnapshots.push({ snapshot, account });
        }
      } catch (error) {
        partialErrors.push(`${account.handle}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const engagementScores = computeEngagementPercentiles(recentSnapshots.map((entry) => entry.snapshot));
    const storedPosts: XNewsPostRecord[] = [];

    for (const { snapshot, account } of recentSnapshots) {
      const topicMatch = computeTopicMatch({ post: snapshot, list: params.list });
      const freshnessScore = computeFreshnessScore(snapshot.postedAt);
      const engagementScore = engagementScores.get(snapshot.postId) ?? 0;
      const score = roundScore(
        clamp(
          topicMatch.topicRelevanceScore * 0.5 +
            account.authorQualityScore * 0.2 +
            engagementScore * 0.2 +
            freshnessScore * 0.1
        )
      );

      const existingPost = params.store.getXNewsPost(params.list.id, snapshot.postId);
      const record = params.store.saveXNewsPost({
        postId: snapshot.postId,
        listId: params.list.id,
        authorHandle: snapshot.authorHandle,
        authorDisplayName: snapshot.authorDisplayName,
        authorProfileUrl: snapshot.authorProfileUrl,
        postUrl: snapshot.postUrl,
        postedAt: snapshot.postedAt,
        text: snapshot.text,
        normalizedText: snapshot.normalizedText,
        quoteHandles: snapshot.quoteHandles,
        replyHandles: snapshot.replyHandles,
        mentionHandles: snapshot.mentionHandles,
        likeCount: snapshot.likeCount,
        repostCount: snapshot.repostCount,
        replyCount: snapshot.replyCount,
        viewCount: snapshot.viewCount,
        matchedTopicIds: topicMatch.matchedTopicIds,
        topicRelevanceScore: topicMatch.topicRelevanceScore,
        authorQualityScore: account.authorQualityScore,
        engagementScore: roundScore(engagementScore),
        freshnessScore,
        score,
        ingestedAt: existingPost?.ingestedAt ?? nowIso(),
        updatedAt: nowIso()
      });
      storedPosts.push(record);
      postsStored += 1;
    }

    const trackedHandles = new Set(trackedAccounts.map((account) => account.handle));
    const discoveryCandidates = collectDiscoveryCandidates({
      posts: storedPosts,
      trackedHandles,
      trackedAccountsByHandle
    });
    const availableSlots = Math.max(0, params.list.maxTrackedAccounts - params.store.countXNewsTrackedAccounts(params.list.id));
    const maxToAdd = Math.min(params.list.discovery.maxNewAccountsPerRun, availableSlots);

    if (params.list.discovery.autoAdd && maxToAdd > 0) {
      for (const candidate of discoveryCandidates.slice(0, maxToAdd)) {
        if (candidate.discoveryScore < params.list.discovery.minDiscoveryScore) {
          continue;
        }

        const handle = normalizeHandle(candidate.handle);
        if (params.store.getXNewsTrackedAccount(params.list.id, handle)) {
          continue;
        }

        params.store.upsertXNewsTrackedAccount(
          buildTrackedAccountRecord({
            list: params.list,
            account: {
              handle,
              displayName: handle,
              profileUrl: buildXProfileUrl(handle),
              verified: false
            },
            source: "discovery",
            discoveryScore: candidate.discoveryScore
          })
        );
        addedHandles.push(handle);
        accountsAdded += 1;
      }
    }

    const deliveryCandidates = selectDeliveryPosts(
      storedPosts.filter((post) => !params.store.hasXNewsDelivery(params.list.discordTarget, post.postId))
    );

    for (const post of deliveryCandidates) {
      deliveriesAttempted += 1;
      try {
        const result = await sendDiscordMessage({
          target: params.list.discordTarget,
          message: buildXNewsMessage(post, params.list)
        });
        params.store.recordXNewsDelivery({
          listId: params.list.id,
          target: params.list.discordTarget,
          postId: post.postId,
          syncRunId: run.runId,
          externalMessageId: result.deliveryId
        });
        deliveriesSucceeded += 1;
        deliveredPostIds.push(post.postId);
      } catch {
        deliveriesFailed += 1;
      }
    }

    const status = partialErrors.length > 0 || deliveriesFailed > 0 ? "completed_with_errors" : "completed";
    params.store.finishXNewsSyncRun({
      runId: run.runId,
      status,
      seedAccountsSeen,
      trackedAccountsCrawled,
      postsSeen,
      postsStored,
      accountsAdded,
      deliveriesAttempted,
      deliveriesSucceeded,
      deliveriesFailed,
      errorMessage: partialErrors[0]
    });

    return {
      runId: run.runId,
      listId: params.list.id,
      status,
      seedAccountsSeen,
      trackedAccountsCrawled,
      postsSeen,
      postsStored,
      accountsAdded,
      deliveriesAttempted,
      deliveriesSucceeded,
      deliveriesFailed,
      deliveredPostIds,
      addedHandles,
      partialErrors
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    params.store.finishXNewsSyncRun({
      runId: run.runId,
      status: "failed",
      seedAccountsSeen,
      trackedAccountsCrawled,
      postsSeen,
      postsStored,
      accountsAdded,
      deliveriesAttempted,
      deliveriesSucceeded,
      deliveriesFailed,
      errorMessage: message
    });
    throw error;
  } finally {
    await pageFetcher.close();
  }
}

export function briefXNews(params: {
  list: XNewsListConfig;
  store: JobStore;
  hours: number;
  topicId?: string;
  limit?: number;
}): XNewsBriefSummary {
  const items = params.store
    .listXNewsPosts({
      listId: params.list.id,
      since: hoursAgo(params.hours),
      topicId: params.topicId,
      limit: params.limit ?? 10
    })
    .filter((post) => post.matchedTopicIds.length > 0)
    .map((post) => buildBriefItem(post, params.list));

  return {
    hours: params.hours,
    topic: params.topicId,
    items
  };
}

export function listXNewsWatchlist(params: {
  list: XNewsListConfig;
  store: JobStore;
}): XNewsTrackedAccountRecord[] {
  return params.store.listXNewsTrackedAccounts(params.list.id, params.list.maxTrackedAccounts);
}
