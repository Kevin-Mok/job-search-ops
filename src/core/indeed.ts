import fs from "node:fs";

import { normalizeIndeedPassAuthConfig } from "./indeed-auth.js";
import { inferJobFamily } from "./policy.js";
import {
  inferSeniority,
  inferWorkModel,
  normalizeText,
  normalizeUrl,
  parseCompensation,
  splitSkills
} from "./parsing.js";
import type {
  IndeedAlertConfig,
  IndeedAlertsConfig,
  IndeedDetailSnapshot,
  IndeedSearchCard,
  ParsedLeadInput
} from "./types.js";

const BASE_URL = "https://ca.indeed.com";
const CARD_BLOCK_START_REGEX = /<div\b[^>]*class="[^"]*\bcardOutline\b[^"]*\bresult\b[^"]*"[^>]*>/gi;
const JOB_BLOCK_START_REGEX = /<div\b[^>]*class="[^"]*\bjob_seen_beacon\b[^"]*"[^>]*>/gi;
const DIV_TAG_REGEX = /<\/?div\b[^>]*>/gi;
const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " "
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, raw: string) => {
    const key = raw.toLowerCase();
    if (key.startsWith("#x")) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    }
    if (key.startsWith("#")) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    }
    return HTML_ENTITY_MAP[key] ?? _;
  });
}

function stripHtml(value: string): string {
  return normalizeText(decodeHtmlEntities(value.replace(/<[^>]+>/g, " ")));
}

function extractAttribute(html: string, attribute: string): string | undefined {
  const match = html.match(new RegExp(`${attribute}="([^"]+)"`, "i"));
  return match?.[1];
}

function extractText(html: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return stripHtml(match[1]);
    }
  }
  return undefined;
}

function normalizeDetailUrl(rawHref: string | undefined, jobKey: string): string {
  if (rawHref) {
    try {
      return normalizeUrl(new URL(rawHref, BASE_URL).toString());
    } catch {
      return normalizeUrl(`${BASE_URL}/viewjob?jk=${jobKey}`);
    }
  }

  return normalizeUrl(`${BASE_URL}/viewjob?jk=${jobKey}`);
}

function extractJobKey(html: string): string | undefined {
  return extractAttribute(html, "data-jk") ?? html.match(/[?&]jk=([^"&]+)/i)?.[1];
}

function extractMetadataTags(cardHtml: string): string[] {
  const blockMatch = cardHtml.match(/<div\b[^>]*class="[^"]*\bmetadata\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (!blockMatch?.[1]) {
    return [];
  }

  return [...blockMatch[1].matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);
}

function extractBalancedDiv(html: string, startIndex: number): string | undefined {
  const firstTagEnd = html.indexOf(">", startIndex);
  if (firstTagEnd === -1) {
    return undefined;
  }

  let depth = 1;
  DIV_TAG_REGEX.lastIndex = firstTagEnd + 1;

  for (let match = DIV_TAG_REGEX.exec(html); match; match = DIV_TAG_REGEX.exec(html)) {
    const tag = match[0];
    if (/^<div\b/i.test(tag) && !/\/>$/.test(tag)) {
      depth += 1;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return html.slice(startIndex, DIV_TAG_REGEX.lastIndex);
    }
  }

  return undefined;
}

function extractBlocks(html: string, startRegex: RegExp): string[] {
  const blocks: string[] = [];

  for (const match of html.matchAll(new RegExp(startRegex.source, startRegex.flags))) {
    if (match.index === undefined) {
      continue;
    }

    const block = extractBalancedDiv(html, match.index);
    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
}

function extractSearchCardBlocks(html: string): string[] {
  const cardBlocks = extractBlocks(html, CARD_BLOCK_START_REGEX);
  if (cardBlocks.length > 0) {
    return cardBlocks;
  }

  return extractBlocks(html, JOB_BLOCK_START_REGEX);
}

function extractSearchCard(cardHtml: string): IndeedSearchCard | undefined {
  const jobKey = extractJobKey(cardHtml);
  if (!jobKey) {
    return undefined;
  }

  const href = extractAttribute(cardHtml, "href");
  const title = extractText(cardHtml, [
    /<a\b[^>]*data-testid="job-title"[^>]*>([\s\S]*?)<\/a>/i,
    /<a\b[^>]*class="[^"]*\bjcs-JobTitle\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i
  ]);
  const company = extractText(cardHtml, [
    /<span\b[^>]*data-testid="company-name"[^>]*>([\s\S]*?)<\/span>/i,
    /<span\b[^>]*data-company-name="true"[^>]*>([\s\S]*?)<\/span>/i,
    /<div\b[^>]*class="[^"]*\bcompanyName\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  ]);
  const locationRaw = extractText(cardHtml, [
    /<div\b[^>]*data-testid="text-location"[^>]*>([\s\S]*?)<\/div>/i,
    /<div\b[^>]*class="[^"]*\bcompanyLocation\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  ]);
  const compensationText = extractText(cardHtml, [
    /<li\b[^>]*class="[^"]*\bsalary-snippet-container\b[^"]*"[^>]*>([\s\S]*?)<\/li>/i,
    /<div\b[^>]*class="[^"]*\bsalary-snippet\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<span\b[^>]*class="[^"]*\bestimated-salary\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i
  ]);
  const summaryText = extractText(cardHtml, [
    /<div\b[^>]*data-testid="belowJobSnippet"[^>]*>([\s\S]*?)<\/div>/i,
    /<div\b[^>]*class="[^"]*\bjob-snippet\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div\b[^>]*data-testid="job-snippet"[^>]*>([\s\S]*?)<\/div>/i
  ]);
  const metadataTags = extractMetadataTags(cardHtml);

  if (!title || !company || !locationRaw || !summaryText) {
    return undefined;
  }

  return {
    jobKey,
    title,
    company,
    locationRaw,
    compensationText,
    summaryText,
    metadataTags,
    workModel: inferWorkModel([locationRaw, summaryText, metadataTags.join(" ")].join(" ")),
    detailUrl: normalizeDetailUrl(href, jobKey)
  };
}

function extractDescription(html: string): string {
  const match = html.match(/<div\b[^>]*id="jobDescriptionText"[^>]*>([\s\S]*?)<\/div>/i);
  if (!match?.[1]) {
    throw new Error("Indeed detail page is missing jobDescriptionText");
  }
  return stripHtml(match[1]);
}

function extractFromDescription(description: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = description.match(new RegExp(`${escaped}:\\s*([^.;]+)`, "i"));
  return match?.[1] ? normalizeText(match[1]) : undefined;
}

export function detectIndeedBlock(html: string): string | undefined {
  if (!/just a moment/i.test(html) && !/enable javascript and cookies to continue/i.test(html) && !/__cf_chl_/i.test(html)) {
    return undefined;
  }

  const explicit = extractText(html, [/<[^>]*id="challenge-error-text"[^>]*>([\s\S]*?)<\/[^>]+>/i]);
  return explicit ?? "Indeed returned a blocked page";
}

export function buildIndeedSearchPageUrl(searchUrl: string, pageIndex: number): string {
  const url = new URL(searchUrl);
  if (pageIndex === 0) {
    url.searchParams.delete("start");
  } else {
    url.searchParams.set("start", String(pageIndex * 10));
  }
  return url.toString();
}

export function parseIndeedSearchPage(html: string, searchUrl: string): IndeedSearchCard[] {
  if (detectIndeedBlock(html)) {
    throw new Error(`Indeed blocked search page: ${searchUrl}`);
  }

  return extractSearchCardBlocks(html)
    .map((block) => extractSearchCard(block))
    .filter((card): card is IndeedSearchCard => card !== undefined);
}

export function parseIndeedDetailPage(html: string, jobKey: string): IndeedDetailSnapshot {
  if (detectIndeedBlock(html)) {
    throw new Error(`Indeed blocked detail page for ${jobKey}`);
  }

  const title = extractText(html, [
    /<h1\b[^>]*data-testid="jobsearch-JobInfoHeader-title"[^>]*>([\s\S]*?)<\/h1>/i,
    /<h1\b[^>]*>([\s\S]*?)<\/h1>/i
  ]);
  const company = extractText(html, [
    /<div\b[^>]*data-testid="inlineHeader-companyName"[^>]*>([\s\S]*?)<\/div>/i,
    /<div\b[^>]*data-company-name="true"[^>]*>([\s\S]*?)<\/div>/i
  ]);
  const locationRaw = extractText(html, [
    /<div\b[^>]*data-testid="job-location"[^>]*>([\s\S]*?)<\/div>/i,
    /<div\b[^>]*class="[^"]*\bjobsearch-JobInfoHeader-subtitle\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  ]);
  const compensationText = extractText(html, [
    /<div\b[^>]*id="salaryInfoAndJobType"[^>]*>([\s\S]*?)<\/div>/i,
    /<span\b[^>]*data-testid="attribute_snippet_testid"[^>]*>([\s\S]*?)<\/span>/i
  ]);

  if (!title || !company || !locationRaw) {
    throw new Error(`Indeed detail page for ${jobKey} is missing a required field`);
  }

  const normalizedDescription = extractDescription(html);
  const remoteEligibility = extractFromDescription(normalizedDescription, "Remote eligibility");
  const officeLocationRaw = extractFromDescription(normalizedDescription, "Office location");
  const employmentType = extractFromDescription(normalizedDescription, "Employment type");
  const explicitWorkModel = extractFromDescription(normalizedDescription, "Work model");
  const skills = splitSkills(extractFromDescription(normalizedDescription, "Skills"));

  return {
    jobKey,
    title,
    company,
    locationRaw,
    workModel: inferWorkModel([locationRaw, explicitWorkModel ?? "", normalizedDescription].join(" ")),
    officeLocationRaw,
    remoteEligibility,
    seniority: inferSeniority(title),
    employmentType,
    compensationText,
    skills,
    normalizedDescription,
    canonicalUrl: normalizeUrl(`${BASE_URL}/viewjob?jk=${jobKey}`)
  };
}

export function shouldFetchIndeedCard(card: IndeedSearchCard): boolean {
  const previewLead: ParsedLeadInput = {
    source: "indeed",
    sourceMessageId: "search-preview",
    sourceItemKey: `preview:${card.jobKey}`,
    sourceFixture: "indeed-search-preview",
    title: card.title,
    company: card.company,
    locationRaw: card.locationRaw,
    workModel: card.workModel,
    seniority: inferSeniority(card.title),
    compensationText: card.compensationText,
    skills: [],
    canonicalUrl: card.detailUrl,
    normalizedDescription: [card.summaryText, ...card.metadataTags].join(" ")
  };
  const haystack = `${card.title} ${card.summaryText} ${card.locationRaw} ${card.metadataTags.join(" ")}`.toLowerCase();

  if (previewLead.seniority === "senior" || previewLead.seniority === "staff" || previewLead.seniority === "manager") {
    return false;
  }

  if (/must be bilingual in french|security clearance|\bcpa\b|\brn\b|licensed electrician/i.test(haystack)) {
    return false;
  }

  return inferJobFamily(previewLead) !== "unknown";
}

export function toParsedLeadInput(params: {
  alertId: string;
  runId: string;
  detail: IndeedDetailSnapshot;
}): ParsedLeadInput {
  const compensation = parseCompensation(params.detail.compensationText);

  return {
    source: "indeed",
    sourceMessageId: params.runId,
    sourceItemKey: `${params.alertId}:${params.detail.jobKey}`,
    sourceFixture: `indeed-search:${params.alertId}`,
    title: params.detail.title,
    company: params.detail.company,
    locationRaw: params.detail.locationRaw,
    workModel: params.detail.workModel,
    officeLocationRaw: params.detail.officeLocationRaw,
    remoteEligibility: params.detail.remoteEligibility,
    seniority: params.detail.seniority,
    employmentType: params.detail.employmentType,
    skills: params.detail.skills,
    canonicalUrl: params.detail.canonicalUrl,
    normalizedDescription: params.detail.normalizedDescription,
    ...compensation
  };
}

export function loadIndeedAlertsConfig(configPath: string): IndeedAlertsConfig {
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as Partial<IndeedAlertsConfig>;
  if (!Array.isArray(raw.alerts)) {
    throw new Error(`Invalid Indeed alerts config: ${configPath}`);
  }

  const alerts = raw.alerts.map((alert) => {
    if (
      typeof alert?.id !== "string" ||
      typeof alert.label !== "string" ||
      typeof alert.searchUrl !== "string" ||
      typeof alert.discordTarget !== "string"
    ) {
      throw new Error(`Invalid Indeed alert entry in ${configPath}`);
    }

    return {
      id: alert.id,
      label: alert.label,
      searchUrl: alert.searchUrl,
      discordTarget: alert.discordTarget,
      enabled: alert.enabled !== false,
      maxPages: typeof alert.maxPages === "number" && Number.isInteger(alert.maxPages) ? alert.maxPages : 5,
      browserProfile:
        typeof alert.browserProfile === "string" && alert.browserProfile.trim().length > 0
          ? alert.browserProfile.trim()
          : `indeed-${alert.id}`,
      pageTimeoutMs:
        typeof alert.pageTimeoutMs === "number" && Number.isFinite(alert.pageTimeoutMs) ? alert.pageTimeoutMs : 30000,
      challengeTimeoutMs:
        typeof alert.challengeTimeoutMs === "number" && Number.isFinite(alert.challengeTimeoutMs)
          ? alert.challengeTimeoutMs
          : 20000,
      auth: normalizeIndeedPassAuthConfig(alert.id, alert.auth)
    } satisfies IndeedAlertConfig;
  });

  return { alerts };
}
