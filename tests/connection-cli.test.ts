import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

describe("captured connection CLI", () => {
  test("rejects unsupported --details before opening the database", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unsupported-details-"));
    const db = path.join(dir, "jobs.sqlite");
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", "linkedin-state", "--db", db, "--details"], { encoding: "utf8", timeout: 30_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--details");
    expect(fs.existsSync(db)).toBe(false);
  });

  test("connects trusted Gmail capture, durable parser hold, same-thread operator review and blocked Codex plan", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "connection-cli-"));
    const db = path.join(dir, "jobs.sqlite");
    const journal = path.join(dir, "discord.json");
    const jsonFile = (name: string, value: unknown) => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(value)); return p; };
    const cli = (command: string, args: string[] = [], expected = 0) => {
      const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", command, "--db", db, ...args], { encoding: "utf8", timeout: 30_000 });
      expect(result.status, result.stderr).toBe(expected);
      return JSON.parse(result.stdout);
    };
    const email = JSON.parse(fs.readFileSync("fixtures/email/linkedin-alert-2026-03-12.json", "utf8"));
    const capture = { id: "captured-gmail-synthetic", internalDate: "1794006000000", payload: { mimeType: "text/plain", headers: [{ name: "From", value: email.from }, { name: "Subject", value: email.subject }], body: { data: Buffer.from(email.textBody).toString("base64url") } } };
    const captureFile = jsonFile("gmail.json", capture);
    const trusted = { verifier: "local-gmail", messageId: capture.id, sender: email.from, authenticated: true, evidenceId: "synthetic-verifier-evidence", payloadSha256: crypto.createHash("sha256").update(JSON.stringify(capture)).digest("hex") };
    const badContext = jsonFile("bad-context.json", { ...trusted, payloadSha256: "0".repeat(64) });
    const common = ["--email-file", captureFile, "--verified-handoff", "--transport", "fixture", "--journal", journal];
    const held = cli("gmail-intake", [...common, "--trusted-context", badContext]);
    expect(held.status).toBe("held");
    expect(cli("linkedin-state").intakeHolds[0].status).toBe("held");
    const intake = cli("gmail-intake", [...common, "--trusted-context", jsonFile("trusted-context.json", trusted)]);
    expect(intake.intake.leadIds).toHaveLength(4);
    const state = cli("linkedin-state");
    expect(state.intakeHolds[0].status).toBe("resolved");
    const root = state.deliveries.find((entry: { leadId: string }) => entry.leadId.includes("maple-systems"));
    const review = { id: "synthetic-note", userId: "operator", target: root.target, channelId: "parent", threadId: root.threadId, rootMessageId: root.messageId, action: "note", note: "Synthetic operator reviewed this job." };
    const config = { expectedTarget: root.target, allowedUserIds: ["operator"], allowedChannelIds: ["parent"], allowedThreadIds: [root.threadId] };
    expect(cli("discord-review", ["--verified-handoff", "--interaction-file", jsonFile("interaction.json", review), "--review-config", jsonFile("review-config.json", config)]).ok).toBe(true);
    cli("linkedin-eligibility", ["--lead-id", root.leadId, "--status", "eligible", "--note", "Synthetic operator confirmed all requirements."]);
    const candidateFile = jsonFile("candidate.json", { name: "Synthetic Candidate", email: "synthetic@example.test" });
    const evidenceFile = jsonFile("evidence.json", [{ id: "synthetic-fact", claim: "Built **Python** validation fixtures.", skills: ["python"], source: "synthetic://approved/commit", approved: true }]);
    const privateDir = path.join(dir, "private");
    const work = cli("linkedin-work", ["--transport", "fixture", "--journal", journal, "--candidate", candidateFile, "--evidence", evidenceFile, "--private-dir", privateDir]);
    const prepared = work.find((entry: { leadId: string }) => entry.leadId === root.leadId);
    const plan = cli("codex-resume-plan", ["--work-id", prepared.workId, "--private-dir", privateDir]);
    expect(plan.execution).toBe("blocked_cli_isolation_unverified");
    expect(fs.existsSync(plan.planPath)).toBe(true);
    expect(fs.existsSync(plan.receiptPath)).toBe(false);
    expect(cli("show-lead", ["--lead-id", root.leadId]).reviewStatus).not.toBe("applied_manually");
  }, 30_000);
});
