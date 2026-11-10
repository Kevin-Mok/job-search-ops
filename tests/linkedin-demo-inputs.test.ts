import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "linkedin-demo-inputs-"));
  const directory = path.join(root, "output");
  const candidate = path.join(root, "candidate-private.json");
  const evidence = path.join(root, "evidence-private.json");
  fs.writeFileSync(candidate, JSON.stringify({ name: "Jordan Example", email: "jordan@example.test" }));
  fs.writeFileSync(evidence, JSON.stringify([{ id: "approved-sample", claim: "Built **TypeScript** validation fixtures.", skills: ["typescript"], source: "synthetic://approved/commit", approved: true }]));
  const run = (args: string[]) => spawnSync(process.execPath, ["scripts/linkedin-demo.mjs", "--output-dir", directory, ...args], { encoding: "utf8", timeout: 30_000 });
  return { root, directory, candidate, evidence, run };
}

describe("paired private demo inputs", () => {
  test.each(["candidate", "evidence"])("requires both flags before writes when only --%s supplied", flag => {
    const s = setup();
    const result = s.run([`--${flag}`, s[flag as "candidate" | "evidence"], "--phase", "connections"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--candidate and --evidence");
    expect(fs.existsSync(s.directory)).toBe(false);
  });

  test("private inputs drive the existing fixture route and persist unchanged across phases", () => {
    const s = setup();
    const candidateBefore = fs.readFileSync(s.candidate);
    const evidenceBefore = fs.readFileSync(s.evidence);
    const first = s.run(["--candidate", s.candidate, "--evidence", s.evidence, "--phase", "connections"]);
    expect(first.status, first.stderr).toBe(0);
    const result = JSON.parse(first.stdout);
    expect(result.jobs).toBe(4);
    expect(result.modelCalls).toBe(0);
    expect(result.productionSends).toBe(0);
    const snapshot = JSON.parse(fs.readFileSync(path.join(s.directory, "candidate.json"), "utf8"));
    expect(snapshot).toMatchObject({ name: "Jordan Example", email: "jordan@example.test" });
    expect(fs.readFileSync(s.candidate)).toEqual(candidateBefore);
    expect(fs.readFileSync(s.evidence)).toEqual(evidenceBefore);
    const next = s.run(["--phase", "state"]);
    expect(next.status, next.stderr).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(s.directory, "candidate.json"), "utf8"))).toEqual(snapshot);
  }, 30_000);

  test("changed paired input cannot overwrite an existing run", () => {
    const s = setup();
    const first = s.run(["--candidate", s.candidate, "--evidence", s.evidence, "--phase", "connections"]);
    expect(first.status, first.stderr).toBe(0);
    const snapshot = fs.readFileSync(path.join(s.directory, "candidate.json"));
    fs.writeFileSync(s.candidate, JSON.stringify({ name: "Different Example", email: "different@example.test" }));
    const changed = s.run(["--candidate", s.candidate, "--evidence", s.evidence, "--phase", "prepare"]);
    expect(changed.status).toBe(1);
    expect(changed.stderr).toMatch(/different|changed|match/i);
    expect(fs.readFileSync(path.join(s.directory, "candidate.json"))).toEqual(snapshot);
  }, 30_000);
});
