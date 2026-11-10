import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { describe, expect, test, vi } from "vitest";
import { createDiscordLinkedInTransport, createFixtureLinkedInTransport, DiscordRouteError } from "../src/discord/linkedin-transport.js";

describe("Discord LinkedIn transport", () => {
  test("disables all generated mentions, suppresses previews and binds a nonce to each alert", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.allowed_mentions).toEqual({ parse: [], users: [], roles: [], replied_user: false });
      expect(body.nonce).toBe("stable-key");
      expect(body.enforce_nonce).toBe(true);
      expect(body.flags).toBe(4);
      return new Response(JSON.stringify({ id: "111111111111111111", channel_id: "222222222222222222" }), { status: 200 });
    });
    const adapter = createDiscordLinkedInTransport({ token: "synthetic-token", channelId: "222222222222222222", fetcher });
    expect(await adapter.sendAlert({ key: "stable-key", content: "@everyone synthetic", title: "Synthetic" })).toBe("111111111111111111");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("distinguishes rate limiting, definite rejection and uncertain server/network results without leaking bodies", async () => {
    for (const [status, certainty] of [[429, "retry"], [403, "blocked"], [500, "uncertain"]] as const) {
      const adapter = createDiscordLinkedInTransport({ token: "synthetic-token", channelId: "222222222222222222", fetcher: async () =>
        new Response(JSON.stringify({ retry_after: 2.5, message: "private-body" }), { status }) });
      const error = await adapter.sendAlert({ key: "key", content: "test", title: "Synthetic" }).catch(error => error);
      expect(error).toBeInstanceOf(DiscordRouteError);
      expect(error.certainty).toBe(certainty);
      expect(error.message).not.toContain("private-body");
      if (status === 429) expect(error.retryAfterMs).toBe(2500);
    }
  });

  test("reconciliation matches the stable marker AND authenticated bot identity", async () => {
    const adapter = createDiscordLinkedInTransport({ token: "synthetic-token", channelId: "222222222222222222", fetcher: async url =>
      String(url).endsWith("/users/@me")
        ? Response.json({ id: "333333333333333333" })
        : Response.json([
          { id: "444444444444444444", content: "job-ops-key:key", author: { id: "attacker" } },
          { id: "555555555555555555", content: "job-ops-key:key", author: { id: "333333333333333333" } }
        ]) });
    expect(await adapter.findAlert("key")).toBe("555555555555555555");
  });
});

describe("fixture journal persistence", () => {
  test("attachment replay preserves the original receipt and exact bytes", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fixture-attachment-"));
    const journalPath = path.join(directory, "discord.json");
    fs.writeFileSync(journalPath, JSON.stringify({ version: 1, alerts: {}, threads: {} }));
    try {
      const adapter = createFixtureLinkedInTransport(journalPath);
      const payload = { threadId: "fixture-thread", key: "stable-pdf", filename: "resume.pdf", bytes: Buffer.from("Original approved PDF"), sha256: "original" };
      const receipt = await adapter.sendAttachment!(payload);
      expect(await adapter.sendAttachment!({ ...payload, bytes: Buffer.from("Different PDF"), sha256: "different" })).toEqual(receipt);
      expect(fs.readFileSync(path.join(directory, "fixture-stable-pdf-resume.pdf"))).toEqual(payload.bytes);
      expect(await createFixtureLinkedInTransport(journalPath).findThreadMessage!(payload.threadId, payload.key, { filename: payload.filename, bytesLength: payload.bytes.length })).toEqual(receipt);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  test.each(["alert", "thread", "fit", "attachment"])("concurrent %s processes retain every successful receipt after restart", async stage => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fixture-journal-"));
    const journalPath = path.join(directory, "discord.json");
    fs.writeFileSync(journalPath, JSON.stringify({ version: 1, alerts: { original: { id: "original", content: "Preserved content" } }, threads: {} }));
    const children: ReturnType<typeof fork>[] = [];
    const start = (role: string) => {
      const releasePath = path.join(directory, `${role}.release`);
      const child = fork("tests/helpers/fixture-transport-process.ts", [journalPath, releasePath, role, stage], { execArgv: ["--import", "tsx"], stdio: ["ignore", "pipe", "pipe", "ipc"] });
      children.push(child);
      let stdout = "";
      let stderr = "";
      child.stdout!.on("data", data => { stdout += data; });
      child.stderr!.on("data", data => { stderr += data; });
      let read!: () => void;
      const snapshotRead = new Promise<void>(resolve => { read = resolve; });
      const ready = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Fixture process ${role} did not start: ${stderr}`)), 10_000);
        child.on("message", message => {
          const phase = (message as { phase: string }).phase;
          if (phase === "read") read();
          if (phase === (role === "first" ? "read" : "attempting")) {
            clearTimeout(timeout);
            resolve();
          }
        });
        child.once("error", error => { clearTimeout(timeout); reject(error); });
        child.once("exit", code => { clearTimeout(timeout); reject(new Error(`Fixture process ${role} exited before its barrier (${code}): ${stderr}`)); });
      });
      const outcome = new Promise<unknown>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", code => {
          if (code !== 0) reject(new Error(`Fixture process ${role} failed (${code}): ${stderr}`));
          else {
            try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
          }
        });
      });
      void outcome.catch(() => undefined);
      return { ready, snapshotRead, outcome, releasePath };
    };
    try {
      const first = start("first");
      await first.ready;
      const second = start("second");
      await second.ready;
      const secondRead = await Promise.race([
        second.snapshotRead.then(() => true),
        new Promise<false>(resolve => setTimeout(() => resolve(false), 1_000))
      ]);
      if (secondRead) await second.outcome;
      fs.writeFileSync(first.releasePath, "release");
      const receipts = await Promise.all([first.outcome, second.outcome]);
      const restarted = createFixtureLinkedInTransport(journalPath);
      expect(await restarted.findAlert("original")).toBe("original");
      for (const [index, role] of ["first", "second"].entries()) {
        if (stage === "alert") expect(await restarted.findAlert(role)).toBe(receipts[index]);
        if (stage === "thread") expect(await restarted.findThread(role)).toBe(receipts[index]);
        if (stage === "fit") expect(await restarted.findThreadMessage!("fixture-thread", role)).toEqual({ messageId: receipts[index] });
        if (stage === "attachment") {
          expect(await restarted.findThreadMessage!("fixture-thread", role, { filename: `${role}.pdf`, bytesLength: Buffer.byteLength(`${role} PDF bytes`) })).toEqual(receipts[index]);
          expect(fs.readFileSync(path.join(directory, `fixture-${role}-${role}.pdf`))).toEqual(Buffer.from(`${role} PDF bytes`));
        }
      }
    } finally {
      for (const child of children) if (child.exitCode === null) child.kill();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }, 20_000);
});
