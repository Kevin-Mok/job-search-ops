import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JobStore } from "../src/db/store.js";
import { ingestLinkedInEmail } from "../src/core/linkedin-route.js";
import { describe, expect, test } from "vitest";
import { parseTrustedGmailLinkedIn, type TrustedGmailContext } from "../src/core/gmail-linkedin.js";
import { parseEmailFixture } from "../src/core/parsing.js";

const block = (id: number) => `Title: Junior Python Developer\nCompany: Synthetic Example ${id}\nLocation: Toronto, ON\nWork model: Hybrid\nView Job: https://www.linkedin.com/jobs/view/${id}?trk=email\nDescription: Synthetic alert.`;
const encoded = (s: string) => Buffer.from(s).toString("base64url");
function message(text = `${block(123)}\n---\n${block(456)}`) {
  return { id: "synthetic-gmail-01", internalDate: "1794002400000", payload: { mimeType: "multipart/alternative", headers: [
    { name: "From", value: 'LinkedIn Jobs <jobs-noreply@linkedin.com>' },
    { name: "Subject", value: "Synthetic job alert" },
    { name: "Authentication-Results", value: "untrusted pasted header; dkim=pass" }
  ], parts: [{ mimeType: "text/plain", body: { data: encoded(text) } }] } };
}
function trust(input: unknown): TrustedGmailContext {
  return { verifier: "local-gmail", messageId: "synthetic-gmail-01", sender: "jobs-noreply@linkedin.com", authenticated: true,
    evidenceId: "synthetic-verifier-record-01", payloadSha256: crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex") };
}

describe("trusted captured Gmail LinkedIn parser", () => {
  test("fails closed without independent verification even with authentication assertions in the message", () => {
    const input = { ...message(), verifiedHandoff: true, authenticated: true };
    expect(parseTrustedGmailLinkedIn(input, undefined).status).toBe("held");
    expect(parseTrustedGmailLinkedIn(input, { ...trust(input), evidenceId: "" }).status).toBe("held");
  });
  test("decodes multipart base64url into the normalized multi-job handoff with stable source IDs", () => {
    const input = message();
    const result = parseTrustedGmailLinkedIn(input, trust(input));
    expect(result.status).toBe("parsed");
    if (result.status !== "parsed") throw new Error(result.reasons.join("; "));
    expect(result.jobCount).toBe(2);
    expect(result.email.from).toBe("jobs-noreply@linkedin.com");
    expect(parseEmailFixture(result.email, "capture.json").map(x => x.sourceItemKey)).toEqual(["synthetic-gmail-01:1", "synthetic-gmail-01:2"]);
  });
  test("binds verification to capture bytes, Gmail ID and allowlisted sender", () => {
    const input = message();
    expect(parseTrustedGmailLinkedIn(input, { ...trust(input), payloadSha256: "0".repeat(64) }).status).toBe("held");
    expect(parseTrustedGmailLinkedIn(input, { ...trust(input), messageId: "other" }).status).toBe("held");
    expect(parseTrustedGmailLinkedIn(input, { ...trust(input), sender: "evil@linkedin.com.evil.test" }).status).toBe("held");
    const forged = message(); forged.payload.headers[0].value = "jobs-noreply@linkedin.com, attacker@example.test";
    expect(parseTrustedGmailLinkedIn(forged, trust(forged)).status).toBe("held");
  });
  test("accepts HTML labeled job details and preserves actual LinkedIn href instead of anchor label", () => {
    const input = message();
    input.payload.parts = [{ mimeType: "text/html", body: { data: encoded('<div>Title: Junior Python Developer</div><div>Company: Synthetic Example</div><div>Location: Toronto, ON</div><a href="https://www.linkedin.com/jobs/view/789?trk=eml&amp;refId=test">View job</a>') } }];
    const result = parseTrustedGmailLinkedIn(input, trust(input));
    expect(result.status).toBe("parsed");
    if (result.status === "parsed") expect(result.email.textBody).toContain("View Job: https://www.linkedin.com/jobs/view/789");
  });
  test("holds insufficient HTML without inventing company or location and includes an actionable reason", () => {
    const input = message(); input.payload.parts = [{ mimeType: "text/html", body: { data: encoded('<a href="https://www.linkedin.com/jobs/view/789">Junior Engineer</a>') } }];
    const result = parseTrustedGmailLinkedIn(input, trust(input));
    expect(result.status).toBe("held");
    if (result.status === "held") expect(result.reasons.join(" ")).toMatch(/title.*company.*location|missing.*required/i);
  });
  test("supports captured raw RFC822 MIME with folded headers and multipart base64 body", () => {
    const raw = ['From: LinkedIn Jobs', ' <jobs-noreply@linkedin.com>', 'Subject: =?UTF-8?B?U3ludGhldGljIGFsZXJ0?=', 'MIME-Version: 1.0', 'Content-Type: multipart/alternative; boundary="synthetic-boundary"', '', '--synthetic-boundary', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(block(321)).toString('base64'), '--synthetic-boundary--', ''].join('\r\n');
    const input = { id: "synthetic-gmail-01", internalDate: "1794002400000", raw: encoded(raw) };
    const result = parseTrustedGmailLinkedIn(input, trust(input));
    expect(result.status).toBe("parsed");
    if (result.status === "parsed") expect(result.email.subject).toBe("Synthetic alert");
  });
  test("normalized handoff ingests and replays two actual posting identities without external calls", () => {
    const input = message(); const result = parseTrustedGmailLinkedIn(input, trust(input));
    if (result.status !== "parsed") throw new Error(result.reasons.join("; "));
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gmail-linkedin-"));
    const store = new JobStore(path.join(directory, "jobs.sqlite"));
    const first = ingestLinkedInEmail(store, result.email, { verifiedHandoff: true });
    expect(first.leadIds).toHaveLength(2);
    expect(new Set(first.leadIds).size).toBe(2);
    expect(ingestLinkedInEmail(store, result.email, { verifiedHandoff: true }).replayed).toBe(true);
    expect(first.leadIds.map(id => store.getLead(id)!.sourceItemKey).sort()).toEqual(["synthetic-gmail-01:1", "synthetic-gmail-01:2"]);
  });
  test("caps raw MIME nesting before recursively parsing child bodies", () => {
    let raw = "Content-Type: text/plain\n\n" + block(321);
    for (let depth = 0; depth < 15; depth += 1) raw = `Content-Type: multipart/mixed; boundary="b${depth}"\n\n--b${depth}\n${raw}\n--b${depth}--`;
    const input = { id: "synthetic-gmail-01", internalDate: "1794002400000", raw: encoded(raw) };
    const result = parseTrustedGmailLinkedIn(input, trust(input));
    expect(result.status).toBe("held");
    if (result.status === "held") expect(result.reasons.join(" ")).toMatch(/nesting/);
  });
  test("holds malformed encodings, unsafe links, duplicate fields and unknown normalized fields", () => {
    for (const body of [block(123).replace('https://www.linkedin.com', 'https://linkedin.com.evil.test'), block(123) + '\nCompany: Ambiguous', block(123) + '\nUnexpected: unknown field']) {
      const input = message(body); expect(parseTrustedGmailLinkedIn(input, trust(input)).status).toBe("held");
    }
    const bad = message(); bad.payload.parts[0].body.data = "@@not-base64@@";
    expect(parseTrustedGmailLinkedIn(bad, trust(bad)).status).toBe("held");
  });
});
