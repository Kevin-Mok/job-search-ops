import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export interface InitialLinkedInAuthorization { target: string; key?: string; messageId?: string }
export interface LinkedInAlertPayload { key: string; content: string; title: string }
export interface ThreadMessageReceipt { messageId: string; attachmentId?: string }
export interface LinkedInTransport {
  target: string;
  attachmentPolicy?: "disabled" | "linkedin_public";
  sendAlert(payload: LinkedInAlertPayload): Promise<string>;
  findAlert(key: string): Promise<string | undefined>;
  createThread(payload: { messageId: string; title: string }): Promise<string>;
  findThread(messageId: string): Promise<string | undefined>;
  sendThreadMessage?(payload: { threadId: string; key: string; content: string; beforeSend?: () => void }): Promise<string>;
  findThreadMessage?(threadId: string, key: string, attachment?: { filename: string; bytesLength: number }): Promise<ThreadMessageReceipt | undefined>;
  sendAttachment?(payload: { threadId: string; key: string; filename: string; bytes: Buffer; sha256: string; publicDescriptionVersion?: string; beforeSend?: () => void }): Promise<ThreadMessageReceipt>;
}

export class DiscordRouteError extends Error {
  constructor(message: string, readonly certainty: "retry" | "blocked" | "uncertain", readonly retryAfterMs?: number) {
    super(message);
  }
}

function admitInitial(authorize: ((input: InitialLinkedInAuthorization) => void) | undefined, input: InitialLinkedInAuthorization): void {
  try { authorize?.(input); }
  catch (error) { throw new DiscordRouteError(error instanceof Error ? error.message : "Initial delivery admission held.", "retry"); }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new DiscordRouteError("Invalid Discord response; reconcile before retry.", "uncertain");
  return value as Record<string, unknown>;
}
function snowflake(value: unknown): string {
  if (typeof value !== "string" || !/^\d{17,20}$/.test(value)) throw new DiscordRouteError("Invalid Discord receipt; reconcile before retry.", "uncertain");
  return value;
}

export function createDiscordLinkedInTransport(params: {
  token: string; channelId: string; fetcher?: typeof fetch; linkedinPublicPdfDelivery?: boolean;
  authorizeInitial?: (input: InitialLinkedInAuthorization) => void;
  authorizePublicPdf?: (input: { threadId: string; sha256: string; descriptionVersion: string }) => void;
}): LinkedInTransport {
  const channelId = snowflake(params.channelId);
  if (!params.token.trim()) throw new Error("Discord bot token is required through the local environment.");
  const fetcher = params.fetcher ?? fetch;
  async function request(route: string, body?: unknown, missingIsAbsent = false): Promise<unknown> {
    const transientCertainty = body === undefined ? "retry" : "uncertain";
    let response: Response;
    try {
      response = await fetcher(`https://discord.com/api/v10${route}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { Authorization: `Bot ${params.token}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000)
      });
    } catch {
      throw new DiscordRouteError(`Discord request interrupted; ${transientCertainty === "retry" ? "retry after read failure" : "remote outcome is uncertain"}.`, transientCertainty);
    }
    if (response.status === 404 && missingIsAbsent) return undefined;
    if (response.status === 429) {
      let seconds = Number(response.headers.get("retry-after"));
      try { const data = record(await response.json()); if (typeof data.retry_after === "number") seconds = data.retry_after; } catch { /* Use header or a conservative fallback. */ }
      throw new DiscordRouteError("Discord rate limited; retry after the recorded time.", "retry", Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : 60_000);
    }
    if (!response.ok) {
      const certainty = response.status >= 500 ? transientCertainty : "blocked";
      throw new DiscordRouteError(`Discord HTTP ${response.status}; ${certainty === "retry" ? "retry after recorded time" : certainty === "uncertain" ? "reconcile before retry" : "operator must check destination and permissions"}.`, certainty);
    }
    try { return await response.json(); } catch { throw new DiscordRouteError(`Discord returned unreadable ${transientCertainty === "retry" ? "data; retry after recorded time" : "receipt; reconcile before retry"}.`, transientCertainty); }
  }
  let botId: string | undefined;
  async function history(channel: string, key: string): Promise<Record<string, unknown> | undefined> {
    botId ??= snowflake(record(await request("/users/@me")).id);
    const messages = await request(`/channels/${snowflake(channel)}/messages?limit=100`);
    if (!Array.isArray(messages)) throw new DiscordRouteError("Invalid Discord history response.", "uncertain");
    const matches = messages.map(record).filter(message => record(message.author).id === botId
      && typeof message.content === "string" && message.content.split("\n").includes(`job-ops-key:${key}`));
    if (matches.length > 1) throw new DiscordRouteError("Multiple matching Discord receipts; operator reconciliation required.", "uncertain");
    return matches[0];
  }
  async function assertThread(threadId: string): Promise<void> {
    const thread = record(await request(`/channels/${snowflake(threadId)}`));
    if (thread.parent_id !== channelId || thread.type !== 11) throw new DiscordRouteError("Discord enrichment thread destination/type mismatch.", "blocked");
  }
  return {
    target: `discord:${channelId}`,
    attachmentPolicy: params.linkedinPublicPdfDelivery === true && params.authorizePublicPdf ? "linkedin_public" : "disabled",
    async sendAlert(payload) {
      admitInitial(params.authorizeInitial, { target: `discord:${channelId}`, key: payload.key });
      const receipt = record(await request(`/channels/${channelId}/messages`, {
        content: payload.content,
        nonce: payload.key,
        enforce_nonce: true,
        allowed_mentions: { parse: [], users: [], roles: [], replied_user: false },
        flags: 4
      }));
      if (receipt.channel_id !== channelId) throw new DiscordRouteError("Discord receipt destination mismatch.", "uncertain");
      return snowflake(receipt.id);
    },
    async findAlert(key) {
      const match = await history(channelId, key);
      // A bounded history read cannot prove absence; missing matches remain uncertain.
      return match ? snowflake(match.id) : undefined;
    },
    async createThread({ messageId, title }) {
      admitInitial(params.authorizeInitial, { target: `discord:${channelId}`, messageId });
      const receipt = record(await request(`/channels/${channelId}/messages/${snowflake(messageId)}/threads`, { name: title.slice(0, 100), auto_archive_duration: 1440 }));
      if (receipt.parent_id !== channelId || receipt.type !== 11) throw new DiscordRouteError("Unexpected Discord thread destination/type.", "uncertain");
      return snowflake(receipt.id);
    },
    async sendThreadMessage({ threadId, key, content, beforeSend }) {
      await assertThread(threadId);
      beforeSend?.();
      const receipt = record(await request(`/channels/${snowflake(threadId)}/messages`, {
        content, nonce: key, enforce_nonce: true,
        allowed_mentions: { parse: [], users: [], roles: [], replied_user: false }, flags: 4
      }));
      if (receipt.channel_id !== threadId) throw new DiscordRouteError("Discord score receipt destination mismatch.", "uncertain");
      return snowflake(receipt.id);
    },
    async findThreadMessage(threadId, key, attachment) {
      await assertThread(threadId);
      const match = await history(threadId, key);
      if (!match) return undefined;
      if (attachment) {
        if (!Array.isArray(match.attachments) || match.attachments.length !== 1) return undefined;
        const file = record(match.attachments[0]);
        if (file.filename !== attachment.filename || file.size !== attachment.bytesLength) return undefined;
        return { messageId: snowflake(match.id), attachmentId: snowflake(file.id) };
      }
      return { messageId: snowflake(match.id) };
    },
    async sendAttachment(payload) {
      if (params.linkedinPublicPdfDelivery !== true || !params.authorizePublicPdf) throw new DiscordRouteError("Real resume PDF uploads are disabled for this rollout; keep the PDF local.", "blocked");
      const { threadId, key, filename, sha256, publicDescriptionVersion, beforeSend } = payload;
      if (!publicDescriptionVersion || !beforeSend) throw new DiscordRouteError('Public PDF authorization and current source admission required.', 'blocked');
      const authorize = () => { params.authorizePublicPdf!({ threadId, sha256, descriptionVersion: publicDescriptionVersion }); beforeSend(); };
      authorize();
      await assertThread(threadId);
      authorize();
      // Access bytes only after scope, source, current posting and destination checks.
      const bytes = payload.bytes;
      if (!Buffer.isBuffer(bytes) || crypto.createHash('sha256').update(bytes).digest('hex') !== sha256 || bytes.subarray(0,5).toString() !== '%PDF-' || bytes.length > 8 * 1024 * 1024 || !filename.endsWith('.pdf') || /[\/\\]/.test(filename)) throw new DiscordRouteError('Invalid bounded public PDF attachment.', 'blocked');
      const form = new FormData();
      form.set('payload_json', JSON.stringify({ content: `📎 Tailored résumé | job-ops-key:${key}\njob-ops-key:${key}`, nonce: key, enforce_nonce: true, attachments: [{ id: 0, filename }], allowed_mentions: { parse: [], users: [], roles: [], replied_user: false } }));
      form.set('files[0]', new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), filename);
      authorize();
      const receipt = record(await request(`/channels/${snowflake(threadId)}/messages`, form));
      if (receipt.channel_id !== threadId || !Array.isArray(receipt.attachments) || receipt.attachments.length !== 1) throw new DiscordRouteError('Public PDF receipt destination/attachment mismatch.', 'uncertain');
      const attachment = record(receipt.attachments[0]);
      if (attachment.filename !== filename || attachment.size !== bytes.length) throw new DiscordRouteError('Public PDF attachment receipt mismatch.', 'uncertain');
      return { messageId: snowflake(receipt.id), attachmentId: snowflake(attachment.id) };
    },
    async findThread(messageId) {
      const receipt = await request(`/channels/${snowflake(messageId)}`, undefined, true);
      if (receipt === undefined) return undefined;
      const thread = record(receipt);
      if (thread.parent_id !== channelId || thread.type !== 11) throw new DiscordRouteError("Discord thread readback destination/type mismatch.", "uncertain");
      return snowflake(thread.id);
    }
  };
}

interface FixtureJournal { entries?: Record<string, { messageId: string; threadId: string; content?: string; attachmentId?: string; filename?: string; bytesLength?: number; sha256?: string }>; version: 1; alerts: Record<string, { id: string; content: string }>; threads: Record<string, { id: string; title: string }> }
export function createFixtureLinkedInTransport(journalPath: string, options: { authorizeInitial?: (input: InitialLinkedInAuthorization) => void } = {}): LinkedInTransport {
  function read(): FixtureJournal {
    if (!fs.existsSync(journalPath)) return { version: 1, alerts: {}, threads: {} };
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as FixtureJournal;
    if (journal.version !== 1 || !journal.alerts || !journal.threads) throw new Error("Unsupported fixture journal; use a new private journal path.");
    return journal;
  }
  function write(journal: FixtureJournal): void {
    const temporary = `${journalPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(journal, null, 2) + "\n", { mode: 0o600 });
    fs.renameSync(temporary, journalPath);
  }
  function mutate<T>(update: (journal: FixtureJournal) => T): T {
    fs.mkdirSync(path.dirname(journalPath), { recursive: true, mode: 0o700 });
    const lockPath = `${journalPath}.lock.sqlite`;
    const lock = new Database(lockPath);
    try {
      fs.chmodSync(lockPath, 0o600);
      return lock.transaction(() => {
        const journal = read();
        const receipt = update(journal);
        write(journal);
        return receipt;
      }).immediate();
    } finally { lock.close(); }
  }
  return {
    target: `fixture:${path.resolve(journalPath)}`,
    async sendAlert({ key, content }) {
      admitInitial(options.authorizeInitial, { target: `fixture:${path.resolve(journalPath)}`, key });
      return mutate(journal => {
        journal.alerts[key] ??= { id: `fixture-message-${key}`, content };
        return journal.alerts[key].id;
      });
    },
    async findAlert(key) { return read().alerts[key]?.id; },
    async createThread({ messageId, title }) {
      admitInitial(options.authorizeInitial, { target: `fixture:${path.resolve(journalPath)}`, messageId });
      return mutate(journal => {
        journal.threads[messageId] ??= { id: `fixture-thread-${messageId}`, title };
        return journal.threads[messageId].id;
      });
    },
    async findThread(messageId) { return read().threads[messageId]?.id; },
    async sendThreadMessage({ threadId, key, content, beforeSend }) {
      return mutate(journal => {
        beforeSend?.();
        journal.entries ??= {};
        journal.entries[key] ??= { messageId: `fixture-enrichment-${key}`, threadId, content };
        return journal.entries[key].messageId;
      });
    },
    async findThreadMessage(threadId, key, attachment) {
      const entry = read().entries?.[key];
      if (!entry || entry.threadId !== threadId || (attachment && (entry.filename !== attachment.filename || entry.bytesLength !== attachment.bytesLength))) return undefined;
      return { messageId: entry.messageId, attachmentId: entry.attachmentId };
    },
    async sendAttachment({ threadId, key, filename, bytes, sha256, beforeSend }) {
      return mutate(journal => {
        beforeSend?.();
        journal.entries ??= {};
        if (!journal.entries[key]) {
          const destination = path.join(path.dirname(journalPath), `fixture-${key}-${path.basename(filename)}`);
          fs.writeFileSync(destination, bytes, { mode: 0o600 });
          journal.entries[key] = { messageId: `fixture-attachment-${key}`, attachmentId: `fixture-file-${key}`, threadId, filename, bytesLength: bytes.length, sha256 };
        }
        return { messageId: journal.entries[key].messageId, attachmentId: journal.entries[key].attachmentId };
      });
    }
  };
}
