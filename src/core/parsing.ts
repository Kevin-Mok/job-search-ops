import path from "node:path";

import type { EmailFixture, LeadSource, ParsedLeadInput, Seniority, WorkModel } from "./types.js";

const BLOCK_SEPARATOR = /\n---+\n/g;

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function inferWorkModel(value: string): WorkModel {
  const normalized = value.toLowerCase();
  if (normalized.includes("remote")) return "remote";
  if (normalized.includes("hybrid")) return "hybrid";
  if (normalized.includes("on-site") || normalized.includes("onsite") || normalized.includes("on site")) {
    return "onsite";
  }
  return "unknown";
}

export function inferSeniority(title: string, explicit?: string): Seniority {
  const source = `${title} ${explicit ?? ""}`.toLowerCase();
  if (source.includes("entry")) return "entry";
  if (source.includes("junior") || source.includes("jr")) return "junior";
  if (source.includes("staff") || source.includes("principal")) return "staff";
  if (source.includes("senior") || source.includes("sr")) return "senior";
  if (source.includes("manager") || source.includes("lead")) return "manager";
  if (source.includes("mid")) return "mid";
  return "unknown";
}

export function parseCompensation(input?: string): Pick<
  ParsedLeadInput,
  "compensationText" | "compensationCurrency" | "compensationMin" | "compensationMax"
> {
  if (!input) {
    return {};
  }

  const text = normalizeText(input);
  const matches = [...text.matchAll(/(\$|CA\$|CAD)\s?([\d,]+(?:\.\d+)?)/gi)];
  const numbers = matches.map((match) => Number(match[2].replaceAll(",", ""))).filter(Number.isFinite);
  const currency = matches[0]?.[1]?.toUpperCase() ?? (text.toLowerCase().includes("cad") ? "CAD" : undefined);

  return {
    compensationText: text,
    compensationCurrency: currency,
    compensationMin: numbers[0],
    compensationMax: numbers[1] ?? numbers[0]
  };
}

export function splitSkills(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[;,]/g)
    .map((entry) => normalizeText(entry).toLowerCase())
    .filter(Boolean);
}

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.searchParams.delete("trk");
    parsed.searchParams.delete("trackingId");
    parsed.searchParams.delete("utm_source");
    parsed.searchParams.delete("utm_medium");
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

function parseBlock(block: string, fixture: EmailFixture, index: number): ParsedLeadInput {
  const fieldMap = new Map<string, string>();
  let currentKey = "";
  const descriptionLines: string[] = [];

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/^([A-Za-z /-]+):\s*(.*)$/);
    if (match) {
      currentKey = match[1].trim().toLowerCase();
      const value = match[2].trim();
      fieldMap.set(currentKey, value);
      if (currentKey === "description") {
        descriptionLines.push(value);
      }
      continue;
    }

    if (currentKey === "description") {
      descriptionLines.push(line);
    }
  }

  const title = normalizeText(fieldMap.get("title") ?? "");
  const company = normalizeText(fieldMap.get("company") ?? "");
  const locationRaw = normalizeText(fieldMap.get("location") ?? "");
  const workModelRaw = normalizeText(fieldMap.get("work model") ?? locationRaw);
  const url =
    fieldMap.get("url") ??
    fieldMap.get("apply url") ??
    fieldMap.get("view job") ??
    fieldMap.get("job url") ??
    "";

  if (!title || !company || !locationRaw || !url) {
    throw new Error(`Fixture ${fixture.messageId} block ${index + 1} is missing a required field`);
  }

  const compensation = parseCompensation(fieldMap.get("compensation"));
  const sourceItemKey = `${fixture.messageId}:${index + 1}`;

  return {
    source: fixture.source,
    sourceMessageId: fixture.messageId,
    sourceFixture: path.basename(`${fixture.source}-${fixture.messageId}.json`),
    sourceItemKey,
    title,
    company,
    locationRaw,
    workModel: inferWorkModel(workModelRaw),
    officeLocationRaw: fieldMap.get("office location")?.trim(),
    remoteEligibility: fieldMap.get("remote eligibility")?.trim(),
    seniority: inferSeniority(title, fieldMap.get("seniority")),
    employmentType: fieldMap.get("employment type")?.trim(),
    skills: splitSkills(fieldMap.get("skills")),
    canonicalUrl: normalizeUrl(url),
    normalizedDescription: normalizeText(descriptionLines.join(" ")),
    ...compensation
  };
}

export function parseEmailFixture(fixture: EmailFixture, fixturePath: string): ParsedLeadInput[] {
  const blocks = fixture.textBody
    .split(BLOCK_SEPARATOR)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block, index) => ({
    ...parseBlock(block, fixture, index),
    sourceFixture: path.basename(fixturePath)
  }));
}

export function parseFixtureSource(raw: string): LeadSource {
  const source = raw.trim().toLowerCase();
  if (source === "indeed" || source === "linkedin") {
    return source;
  }
  throw new Error(`Unsupported fixture source: ${raw}`);
}
