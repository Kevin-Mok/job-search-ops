import { describe, expect, test, vi } from "vitest";
import { createDiscordLinkedInTransport, DiscordRouteError } from "../src/discord/linkedin-transport.js";

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
