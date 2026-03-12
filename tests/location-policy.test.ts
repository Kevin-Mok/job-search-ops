import path from "node:path";
import fs from "node:fs";

import { describe, expect, test } from "vitest";

import { parseEmailFixture } from "../src/core/parsing.js";
import { evaluateLocationPolicy } from "../src/core/policy.js";
import type { EmailFixture } from "../src/core/types.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures/email");

function loadFixture(fileName: string): EmailFixture {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, fileName), "utf8")) as EmailFixture;
}

describe("evaluateLocationPolicy", () => {
  test("accepts Canada-eligible remote roles", () => {
    const fixture = loadFixture("linkedin-alert-2026-03-12.json");
    const brightdesk = parseEmailFixture(fixture, path.join(FIXTURES_DIR, "linkedin-alert-2026-03-12.json"))[2];

    expect(evaluateLocationPolicy(brightdesk)).toMatchObject({
      decision: "accepted",
      canadaEligibleRemote: true
    });
  });

  test("rejects U.S.-only remote roles", () => {
    const fixture = loadFixture("linkedin-alert-2026-03-12.json");
    const redwood = parseEmailFixture(fixture, path.join(FIXTURES_DIR, "linkedin-alert-2026-03-12.json"))[1];

    expect(evaluateLocationPolicy(redwood)).toMatchObject({
      decision: "rejected",
      canadaEligibleRemote: false
    });
  });

  test("marks vague hybrid office locations for manual review", () => {
    const fixture = loadFixture("linkedin-alert-2026-03-12.json");
    const nimbus = parseEmailFixture(fixture, path.join(FIXTURES_DIR, "linkedin-alert-2026-03-12.json"))[3];

    expect(evaluateLocationPolicy(nimbus)).toMatchObject({
      decision: "needs_review"
    });
  });
});
