import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { parseEmailFixture } from "../src/core/parsing.js";
import type { EmailFixture } from "../src/core/types.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures/email");

function loadFixture(fileName: string): EmailFixture {
  const raw = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, fileName), "utf8")) as EmailFixture;
  return raw;
}

describe("parseEmailFixture", () => {
  test("parses an Indeed alert into structured leads", () => {
    const fixture = loadFixture("indeed-alert-2026-03-12.json");
    const leads = parseEmailFixture(fixture, path.join(FIXTURES_DIR, "indeed-alert-2026-03-12.json"));

    expect(leads).toHaveLength(2);
    expect(leads[0]).toMatchObject({
      title: "Junior Python Developer",
      company: "Maple Systems",
      workModel: "hybrid",
      officeLocationRaw: "255 Consumers Road, North York, ON"
    });
    expect(leads[1].skills).toContain("sql");
  });

  test("normalizes LinkedIn remote eligibility and URLs", () => {
    const fixture = loadFixture("linkedin-alert-2026-03-12.json");
    const leads = parseEmailFixture(fixture, path.join(FIXTURES_DIR, "linkedin-alert-2026-03-12.json"));
    const maple = leads[0];

    expect(maple.remoteEligibility).toBe("Canada");
    expect(maple.canonicalUrl).toBe("https://www.linkedin.com/jobs/view/maple-python-duplicate");
  });
});
