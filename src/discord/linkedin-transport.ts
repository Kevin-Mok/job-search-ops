import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export interface LinkedInAlertPayload { key: string; content: string; title: string }
export interface ThreadMessageReceipt { messageId: string; attachmentId?: string }
export interface LinkedInTransport {
  target: string;
  sendAlert(payload: LinkedInAlertPayload): Promise<string>;
  findAlert(key: string): Promise<string | undefined>;
  createThread(payload: { messageId: string; title: string }): Promise<string>;
  findThread(messageId: string): Promise<string | undefined>;
  sendThreadMessage?(payload: { threadId: string; key: string; content: string; beforeSend?: () => void }): Promise<string>;
  findThreadMessage?(threadId: string, key: string, attachment?: { filename: string; bytesLength: number }): Promise<ThreadMessageReceipt | undefined>;
  sendAttachment?(payload: { threadId: string; key: string; filename: string; bytes: Buffer; sha256: string; beforeSend?: () => void }): Promise<ThreadMessageReceipt>;
}

export class DiscordRouteError extends Error {
  constructor(message: string, readonly certainty: "retry" | "blocked" | "uncertain", readonly retryAfterMs?: number) {
    super(message);
  }
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
  token: string; channelId: string; fetcher?: typeof fetch;
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
    async sendAlert(payload) {
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
    async sendAttachment({ threadId, key, filename, bytes, sha256, beforeSend }) {
      if (bytes.length > 8 * 1024 * 1024) throw new DiscordRouteError("PDF exceeds the conservative 8 MiB upload cap.", "blocked");
      await assertThread(threadId);
      const form = new FormData();
      form.append("payload_json", JSON.stringify({
        content: `📄 Validated job resume — manual application only\nSHA-256: ${sha256}\njob-ops-key:${key}`,
        nonce: key, enforce_nonce: true, allowed_mentions: { parse: [], users: [], roles: [], replied_user: false },
        attachments: [{ id: 0, filename }], flags: 4
      }));
      form.append("files[0]", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), filename);
      beforeSend?.();
      const receipt = record(await request(`/channels/${snowflake(threadId)}/messages`, form));
      if (receipt.channel_id !== threadId || !Array.isArray(receipt.attachments) || receipt.attachments.length !== 1) throw new DiscordRouteError("Discord PDF attachment receipt missing; do not claim delivery.", "uncertain");
      const file = record(receipt.attachments[0]);
      if (file.filename !== filename || file.size !== bytes.length) throw new DiscordRouteError("Discord PDF attachment receipt mismatch.", "uncertain");
      return { messageId: snowflake(receipt.id), attachmentId: snowflake(file.id) };
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
export function createFixtureLinkedInTransport(journalPath: string): LinkedInTransport {
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
      return mutate(journal => {
        journal.alerts[key] ??= { id: `fixture-message-${key}`, content };
        return journal.alerts[key].id;
      });
    },
    async findAlert(key) { return read().alerts[key]?.id; },
    async createThread({ messageId, title }) {
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
