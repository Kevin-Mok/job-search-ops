import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { ingestFixtures } from "../src/core/pipeline.js";
import { JobStore } from "../src/db/store.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures/email");

function createStore(): JobStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "job-ops-poc-"));
  return new JobStore(path.join(dir, "job-ops.sqlite"));
}

describe("ingestFixtures", () => {
  test("dedupes repeat alerts and routes shortlisted jobs to resume lanes", () => {
    const store = createStore();
    const summary = ingestFixtures(store, FIXTURES_DIR);

    expect(summary.fixturesProcessed).toBe(3);
    expect(summary.leadCandidates).toBe(8);
    expect(summary.created).toBe(6);
    expect(summary.duplicatesMerged).toBe(2);

    const leads = store.listLeads();
    expect(leads).toHaveLength(6);

    const maple = store.getLead("maple-systems-junior-python-developer");
    const harbour = store.getLead("harbour-health-it-support-specialist");
    const velocity = store.getLead("velocity-staffing-cloud-support-associate");
    const redwood = store.getLead("redwood-cloud-principal-solutions-architect");

    expect(maple).toMatchObject({
      reviewStatus: "shortlisted",
      locationDecision: "accepted"
    });
    expect(maple?.resumeMatch.variantId).toBe("web-dev-django");

    expect(harbour?.resumeMatch.variantId).toBe("it-support-sql");
    expect(harbour?.reviewStatus).toBe("shortlisted");

    expect(velocity).toMatchObject({
      reviewStatus: "needs_review"
    });
    expect(velocity?.riskFlags).toContain("staffing_spam");

    expect(redwood).toMatchObject({
      reviewStatus: "rejected"
    });
  });
});
