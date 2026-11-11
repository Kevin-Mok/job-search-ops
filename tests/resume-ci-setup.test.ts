import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";

// Offline self-check exercises setup validation without any download or real profile.
test("CI preflight refuses missing pinned renderer assets instead of silently skipping", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci-preflight-"));
  const result = spawnSync(process.execPath, ["scripts/resume-ci-assets.mjs", "--check", "--root", root, "--plain"], { encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Missing pinned renderer asset");
  expect(result.stderr).toContain("resume-ci-assets.mjs --setup");
  fs.rmSync(root, { recursive: true, force: true });
});


test("CI setup preserves an existing destination", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci-existing-"));
  fs.writeFileSync(path.join(root, "sentinel"), "unchanged");
  const result = spawnSync(process.execPath, ["scripts/resume-ci-assets.mjs", "--setup", "--root", root, "--plain"], { encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("existing destination is preserved");
  expect(fs.readFileSync(path.join(root, "sentinel"), "utf8")).toBe("unchanged");
  expect(fs.readdirSync(root)).toEqual(["sentinel"]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("CI preflight rejects changed pinned bytes before rendering", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ci-tamper-"));
  fs.mkdirSync(path.join(root, "app/styles"), { recursive: true });
  fs.writeFileSync(path.join(root, "app/styles/03-fonts.css"), "wrong source bytes");
  const result = spawnSync(process.execPath, ["scripts/resume-ci-assets.mjs", "--check", "--root", root, "--plain"], { encoding: "utf8" });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Pinned renderer asset hash mismatch");
  fs.rmSync(root, { recursive: true, force: true });
});
