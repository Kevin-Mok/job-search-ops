import crypto from "node:crypto";
import { parseEmailFixture } from "./parsing.js";
import type { EmailFixture } from "./types.js";

/** Only a trusted local verifier may supply this context; message JSON/headers are untrusted. */
export interface TrustedGmailContext {
  verifier: "local-gmail";
  messageId: string;
  sender: string;
  authenticated: true;
  evidenceId: string;
  /** SHA-256 of JSON.stringify(input), binding the verification record to this exact capture. */
  payloadSha256: string;
}
export type GmailLinkedInResult =
  | { status: "parsed"; email: EmailFixture; jobCount: number }
  | { status: "held"; messageId?: string; reasons: string[] };

type ObjectValue = Record<string, unknown>;
type Header = { name: string; value: string };
const SENDERS = new Set(["jobs-noreply@linkedin.com", "jobalerts-noreply@linkedin.com"]);
const FIELDS = new Set(["title", "company", "location", "work model", "office location", "remote eligibility", "seniority", "employment type", "skills", "compensation", "view job", "url", "apply url", "job url", "description"]);
const MAX_BYTES = 2_000_000;
function object(input: unknown): ObjectValue {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Capture must be a Gmail message JSON object.");
  return input as ObjectValue;
}
function utf8(bytes: Buffer): string { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
function base64(input: unknown, url = true): string {
  if (typeof input !== "string" || !input || input.length > MAX_BYTES * 2 || !(url ? /^[A-Za-z0-9_-]+={0,2}$/ : /^[A-Za-z0-9+/]+={0,2}$/).test(input) || input.replace(/=+$/, "").length % 4 === 1) {
    throw new Error("Invalid or oversized base64 MIME body; recapture the complete message.");
  }
  const bytes = Buffer.from(input, url ? "base64url" : "base64");
  if (bytes.length > MAX_BYTES || bytes.toString(url ? "base64url" : "base64").replace(/=+$/, "") !== input.replace(/=+$/, "")) throw new Error("Invalid base64 MIME body.");
  return utf8(bytes);
}
function headers(input: unknown): Header[] {
  if (!Array.isArray(input)) throw new Error("Gmail payload headers are missing.");
  return input.map(entry => {
    const h = object(entry);
    if (typeof h.name !== "string" || typeof h.value !== "string") throw new Error("Invalid MIME header.");
    return { name: h.name.toLowerCase(), value: h.value };
  });
}
function header(input: Header[], name: string): string {
  const found = input.filter(h => h.name === name);
  if (found.length !== 1) throw new Error(`Capture requires one unambiguous ${name} header.`);
  return found[0].value.trim();
}
function decodeWords(value: string): string {
  return value.replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (_, encoding: string, content: string) => {
    if (encoding.toLowerCase() === "b") return base64(content, false);
    return quotedPrintable(content.replaceAll("_", " "));
  });
}
function quotedPrintable(value: string): string {
  const joined = value.replace(/=\r?\n/g, "");
  if (/=(?![\da-f]{2})/i.test(joined)) throw new Error("Invalid quoted-printable body.");
  return utf8(Buffer.from(joined.replace(/=([\da-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1"));
}
function rawPart(raw: string, depth = 0): ObjectValue {
  if (depth > 12) throw new Error("MIME nesting exceeds the intake limit.");
  const split = raw.search(/\r?\n\r?\n/);
  if (split < 0) throw new Error("Raw MIME is missing its header/body separator.");
  const head = raw.slice(0, split).replace(/\r?\n[ \t]+/g, " ");
  const hs = head.split(/\r?\n/).map(line => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) throw new Error("Malformed raw MIME header.");
    return { name: match[1].toLowerCase(), value: match[2] };
  });
  const contentType = hs.find(h => h.name === "content-type")?.value ?? "text/plain";
  const mimeType = contentType.split(";")[0].trim().toLowerCase();
  const body = raw.slice(split).replace(/^\r?\n\r?\n/, "");
  if (mimeType.startsWith("multipart/")) {
    const boundary = contentType.match(/boundary\s*=\s*(?:"([^"\r\n]+)"|([^;\s]+))/i)?.slice(1).find(Boolean);
    if (!boundary || boundary.length > 200) throw new Error("Multipart MIME has no usable boundary.");
    const pieces = body.split(/\r?\n/);
    const parts: ObjectValue[] = [];
    let lines: string[] | undefined;
    let closed = false;
    for (const line of pieces) {
      if (line === `--${boundary}` || line === `--${boundary}--`) {
        if (lines) {
          if (parts.length >= 100) throw new Error("MIME part count exceeds the intake limit.");
          parts.push(rawPart(lines.join("\n"), depth + 1));
        }
        if (line.endsWith("--")) { closed = true; break; }
        lines = [];
      } else if (lines) lines.push(line);
    }
    if (!closed || !parts.length) throw new Error("Multipart MIME is truncated or empty; recapture the complete message.");
    return { mimeType, headers: hs, parts };
  }
  const transfer = hs.find(h => h.name === "content-transfer-encoding")?.value.toLowerCase().trim();
  if (transfer && !["base64", "quoted-printable", "7bit", "8bit"].includes(transfer)) throw new Error("Unsupported MIME transfer encoding; export Gmail full JSON instead.");
  const decoded = transfer === "base64" ? base64(body.replace(/\s/g, ""), false) : transfer === "quoted-printable" ? quotedPrintable(body) : body;
  return { mimeType, headers: hs, body: { data: Buffer.from(decoded).toString("base64url") } };
}
function collectParts(input: unknown, collected: { plain: string[]; html: string[] }, depth = 0): void {
  if (depth > 12) throw new Error("MIME nesting exceeds the intake limit.");
  const part = object(input);
  const hs = part.headers === undefined ? [] : headers(part.headers);
  if (part.filename || hs.some(h => h.name === "content-disposition" && /^attachment(?:;|$)/i.test(h.value))) return;
  const mime = String(part.mimeType ?? "").toLowerCase();
  if (mime.startsWith("multipart/")) {
    if (!Array.isArray(part.parts) || part.parts.length > 100) throw new Error("Invalid multipart payload.");
    for (const child of part.parts) collectParts(child, collected, depth + 1);
  } else if (mime === "text/plain" || mime === "text/html") {
    if (hs.some(h => h.name === "content-type" && /charset\s*=\s*"?(?!utf-8|us-ascii)[\w-]+/i.test(h.value))) throw new Error("Unsupported MIME charset; recapture as UTF-8.");
    const body = object(part.body);
    const text = base64(body.data);
    (mime === "text/plain" ? collected.plain : collected.html).push(text);
  }
}
function entities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, key: string) => {
    if (key.startsWith("#")) {
      const code = parseInt(key.slice(/^#x/i.test(key) ? 2 : 1), /^#x/i.test(key) ? 16 : 10);
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[key.toLowerCase()];
  });
}
function postingUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "https:" || !["linkedin.com", "www.linkedin.com"].includes(url.hostname) || url.username || url.password || url.port || !/^\/(?:comm\/)?jobs\/view\/[^/]+\/?$/.test(url.pathname)) throw new Error("Job link is not an allowlisted HTTPS LinkedIn posting URL.");
  url.hostname = "www.linkedin.com";
  url.pathname = url.pathname.replace(/^\/comm\//, "/").replace(/\/$/, "");
  const numeric = url.pathname.match(/(?:\/|-)(\d+)$/)?.[1];
  if (numeric) url.pathname = `/jobs/view/${numeric}`;
  url.search = ""; url.hash = "";
  return url.toString();
}
function htmlText(html: string): string {
  // shortcut: only explicit labeled HTML details are accepted; unknown alert layouts require review.
  return entities(html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>[\s\S]*?<\/a>/gi, (whole: string, _quote: string, href: string) => {
      try { return `\nView Job: ${postingUrl(entities(href))}\n`; } catch { return whole.replace(/<[^>]*>/g, ""); }
    })
    .replace(/<br\s*\/?\s*>|<\/(?:div|p|tr|h[1-6]|li|table)>/gi, "\n").replace(/<[^>]*>/g, ""));
}
function normalizeJobs(text: string): { text: string; count: number } {
  const blocks = text.replaceAll("\r\n", "\n").split(/\n---+\n/).map(x => x.trim()).filter(Boolean);
  if (!blocks.length || blocks.length > 100) throw new Error("No usable job blocks; capture labeled title, company, location and LinkedIn posting URL for review.");
  const normalized = blocks.map((block, index) => {
    const seen = new Set<string>();
    let description = false;
    const lines = block.split("\n").map(x => x.trim()).filter(Boolean).map(line => {
      const field = line.match(/^([A-Za-z /-]+):\s*(.*)$/);
      if (!field) {
        if (description) return line;
        throw new Error(`Job ${index + 1}: unsupported alert layout; capture explicit title, company, location and posting URL for manual review.`);
      }
      const key = field[1].trim().toLowerCase();
      if (!FIELDS.has(key) || seen.has(key)) throw new Error(`Job ${index + 1}: unknown or duplicate field '${key}'; review the capture before intake.`);
      seen.add(key); description = key === "description";
      if (["url", "view job", "job url", "apply url"].includes(key)) return `View Job: ${postingUrl(field[2])}`;
      return line;
    });
    const urls = ["url", "view job", "job url", "apply url"].filter(key => seen.has(key));
    if (!["title", "company", "location"].every(key => seen.has(key)) || urls.length !== 1) throw new Error(`Job ${index + 1}: missing required title, company, location or one posting URL; manual review required.`);
    return lines.join("\n");
  });
  return { text: normalized.join("\n---\n"), count: normalized.length };
}

/** No network calls. Authentication must be established outside this parser by a trusted local caller. */
export function parseTrustedGmailLinkedIn(input: unknown, trustedContext: TrustedGmailContext | undefined): GmailLinkedInResult {
  let messageId: string | undefined;
  try {
    const capture = object(input);
    if (typeof capture.id !== "string" || !capture.id.trim() || capture.id.length > 512) throw new Error("Gmail message ID is missing or invalid.");
    messageId = capture.id;
    const serialized = JSON.stringify(input);
    if (Buffer.byteLength(serialized) > MAX_BYTES) throw new Error("Gmail capture exceeds the intake size limit.");
    const trust = trustedContext;
    if (!trust || trust.verifier !== "local-gmail" || trust.authenticated !== true || typeof trust.evidenceId !== "string" || !trust.evidenceId.trim()) throw new Error("Independent trusted local sender verification provenance is required; Authentication-Results and body assertions are not authentication.");
    if (trust.messageId !== messageId || !/^[a-f\d]{64}$/.test(trust.payloadSha256) || crypto.createHash("sha256").update(serialized).digest("hex") !== trust.payloadSha256) throw new Error("Trusted verification does not match this exact Gmail capture; verify it again locally.");
    const verifiedSender = trust.sender?.trim().toLowerCase();
    if (!SENDERS.has(verifiedSender)) throw new Error("Verified LinkedIn sender is not allowlisted; manual review required.");
    if (capture.raw !== undefined && capture.payload !== undefined) throw new Error("Capture contains both raw and full MIME; select one unambiguous representation.");
    const payload = capture.raw !== undefined ? rawPart(base64(capture.raw)) : object(capture.payload);
    const hs = headers(payload.headers);
    const from = header(hs, "from");
    const sender = from.match(/^(?:[^<>\r\n,]+\s*)?<([^<>\s,]+)>$/)?.[1] ?? (/^[^<>\s,]+@[^<>\s,]+$/.test(from) ? from : "");
    if (sender.toLowerCase() !== verifiedSender) throw new Error("Message From does not match the independently verified sender.");
    const subject = decodeWords(header(hs, "subject"));
    if (!subject.trim()) throw new Error("Gmail subject is missing.");
    if (typeof capture.internalDate !== "string" || !/^\d+$/.test(capture.internalDate)) throw new Error("Gmail internalDate receipt timestamp is required.");
    const date = new Date(Number(capture.internalDate));
    if (!Number.isFinite(date.getTime())) throw new Error("Invalid Gmail internalDate timestamp.");
    const parts = { plain: [] as string[], html: [] as string[] };
    collectParts(payload, parts);
    const text = parts.plain.length ? parts.plain.join("\n---\n") : parts.html.map(htmlText).join("\n---\n");
    if (Buffer.byteLength(text) > 200_000) throw new Error("Decoded message exceeds the intake limit.");
    const jobs = normalizeJobs(text);
    const email: EmailFixture = { messageId, source: "linkedin", receivedAt: date.toISOString(), from: verifiedSender, subject, textBody: jobs.text };
    parseEmailFixture(email, "gmail-capture.json");
    return { status: "parsed", email, jobCount: jobs.count };
  } catch (error) {
    return { status: "held", messageId, reasons: [error instanceof Error ? error.message : "Gmail parsing failed; manual review required."] };
  }
}
