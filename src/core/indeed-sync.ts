import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { ingestParsedLeads } from "./pipeline.js";
import {
  buildIndeedSearchPageUrl,
  loadIndeedAlertsConfig,
  parseIndeedDetailPage,
  parseIndeedSearchPage,
  shouldFetchIndeedCard,
  toParsedLeadInput
} from "./indeed.js";
import { createOpenClawIndeedPageFetcher } from "./openclaw-browser.js";
import type {
  AlertSyncSummary,
  DiscordMessagePayload,
  DiscordMessageResult,
  IndeedAlertConfig,
  IndeedSearchCard,
  IndeedPageFetcher,
  IngestSummary,
  ParsedLeadInput,
  SyncRunStatus
} from "./types.js";
import { JobStore } from "../db/store.js";

const execFileAsync = promisify(execFile);

function buildLeadMessage(lead: NonNullable<ReturnType<JobStore["getLead"]>>): string {
  return [
    `${lead.reviewStatus.toUpperCase()} | score ${lead.score}`,
    `${lead.title} @ ${lead.company}`,
    `Status: ${lead.reviewStatus}`,
    `Lead ID: ${lead.leadId}`,
    `Work model: ${lead.workModel}`,
    `Location: ${lead.locationRaw}`,
    `Resume: ${lead.resumeMatch.variantId}`,
    `URL: ${lead.canonicalUrl}`,
    `Commands: /job-review lead-id:${lead.leadId} | /job-approve lead-id:${lead.leadId} | /job-note lead-id:${lead.leadId}`
  ].join("\n");
}

export function getIndeedAlert(configPath: string, alertId: string): IndeedAlertConfig {
  const config = loadIndeedAlertsConfig(configPath);
  const alert = config.alerts.find((entry) => entry.id === alertId);
  if (!alert) {
    throw new Error(`Indeed alert not found: ${alertId}`);
  }
  return alert;
}

export async function sendDiscordViaOpenClaw(payload: DiscordMessagePayload): Promise<DiscordMessageResult> {
  const { stdout } = await execFileAsync("openclaw", [
    "--no-color",
    "message",
    "send",
    "--channel",
    "discord",
    "--target",
    payload.target,
    "--message",
    payload.message,
    "--json"
  ]);
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {};
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return {
      deliveryId:
        typeof parsed.messageId === "string"
          ? parsed.messageId
          : typeof parsed.id === "string"
            ? parsed.id
            : undefined
    };
  } catch {
    return {};
  }
}

export async function syncIndeedAlert(params: {
  alert: IndeedAlertConfig;
  store: JobStore;
  pageFetcher?: IndeedPageFetcher;
  sendDiscordMessage?: (payload: DiscordMessagePayload) => Promise<DiscordMessageResult>;
}): Promise<AlertSyncSummary> {
  if (!params.alert.enabled) {
    throw new Error(`Indeed alert is disabled: ${params.alert.id}`);
  }

  const pageFetcher = params.pageFetcher ?? createOpenClawIndeedPageFetcher({ alert: params.alert });
  const sendDiscordMessage = params.sendDiscordMessage ?? sendDiscordViaOpenClaw;
  const run = params.store.startSyncRun({
    alertId: params.alert.id,
    searchUrl: params.alert.searchUrl
  });

  let pagesFetched = 0;
  let cardsSeen = 0;
  let cardsFilteredBeforeDetail = 0;
  let detailPagesFetched = 0;
  let deliveriesAttempted = 0;
  let deliveriesSucceeded = 0;
  let deliveriesFailed = 0;
  const partialErrors: string[] = [];
  let ingest: IngestSummary = {
    fixturesProcessed: 0,
    leadCandidates: 0,
    created: 0,
    updated: 0,
    duplicatesMerged: 0,
    touchedLeadIds: [],
    leads: params.store.listLeads()
  };
  const deliveredLeadIds: string[] = [];

  try {
    const cards: IndeedSearchCard[] = [];
    const seenJobKeys = new Set<string>();

    for (let pageIndex = 0; pageIndex < Math.max(1, params.alert.maxPages); pageIndex += 1) {
      const pageUrl = buildIndeedSearchPageUrl(params.alert.searchUrl, pageIndex);
      const html = await pageFetcher.fetchSearchPage(pageUrl);
      pagesFetched += 1;
      const pageCards = parseIndeedSearchPage(html, pageUrl);
      if (pageCards.length === 0) {
        break;
      }

      let newCardsOnPage = 0;
      for (const card of pageCards) {
        if (seenJobKeys.has(card.jobKey)) {
          continue;
        }
        seenJobKeys.add(card.jobKey);
        cards.push(card);
        newCardsOnPage += 1;
      }

      if (newCardsOnPage === 0) {
        break;
      }
    }

    cardsSeen = cards.length;
    const filteredCards = cards.filter((card) => shouldFetchIndeedCard(card));
    cardsFilteredBeforeDetail = cards.length - filteredCards.length;
    const parsedLeads: ParsedLeadInput[] = [];

    for (const card of filteredCards) {
      try {
        const html = await pageFetcher.fetchDetailPage(card.jobKey, card.detailUrl);
        detailPagesFetched += 1;

        const detail = parseIndeedDetailPage(html, card.jobKey);
        parsedLeads.push(
          toParsedLeadInput({
            alertId: params.alert.id,
            runId: run.runId,
            detail
          })
        );
      } catch (error) {
        partialErrors.push(error instanceof Error ? error.message : String(error));
      }
    }

    ingest = ingestParsedLeads(params.store, parsedLeads);

    for (const leadId of ingest.touchedLeadIds) {
      const lead = params.store.getLead(leadId);
      if (!lead) {
        continue;
      }

      if (lead.reviewStatus !== "shortlisted" && lead.reviewStatus !== "needs_review") {
        continue;
      }

      if (params.store.hasDiscordDelivery(params.alert.discordTarget, lead.leadId)) {
        continue;
      }

      deliveriesAttempted += 1;

      try {
        const result = await sendDiscordMessage({
          target: params.alert.discordTarget,
          message: buildLeadMessage(lead)
        });
        params.store.recordDiscordDelivery({
          alertId: params.alert.id,
          target: params.alert.discordTarget,
          leadId: lead.leadId,
          reviewStatus: lead.reviewStatus,
          syncRunId: run.runId,
          externalMessageId: result.deliveryId
        });
        deliveredLeadIds.push(lead.leadId);
        deliveriesSucceeded += 1;
      } catch {
        deliveriesFailed += 1;
      }
    }

    const status: SyncRunStatus =
      deliveriesFailed > 0 || partialErrors.length > 0 ? "completed_with_errors" : "completed";
    params.store.finishSyncRun({
      runId: run.runId,
      status,
      pagesFetched,
      cardsSeen,
      cardsFilteredBeforeDetail,
      detailPagesFetched,
      parsedLeads: ingest.leadCandidates,
      leadsCreated: ingest.created,
      leadsUpdated: ingest.updated,
      duplicatesMerged: ingest.duplicatesMerged,
      deliveriesAttempted,
      deliveriesSucceeded,
      deliveriesFailed,
      errorMessage: partialErrors[0]
    });

    return {
      runId: run.runId,
      alertId: params.alert.id,
      status,
      pagesFetched,
      cardsSeen,
      cardsFilteredBeforeDetail,
      detailPagesFetched,
      deliveriesAttempted,
      deliveriesSucceeded,
      deliveriesFailed,
      deliveredLeadIds,
      ingest
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    params.store.finishSyncRun({
      runId: run.runId,
      status: "failed",
      pagesFetched,
      cardsSeen,
      cardsFilteredBeforeDetail,
      detailPagesFetched,
      parsedLeads: ingest.leadCandidates,
      leadsCreated: ingest.created,
      leadsUpdated: ingest.updated,
      duplicatesMerged: ingest.duplicatesMerged,
      deliveriesAttempted,
      deliveriesSucceeded,
      deliveriesFailed,
      errorMessage: message
    });
    throw error;
  } finally {
    await pageFetcher.close().catch(() => undefined);
  }
}
