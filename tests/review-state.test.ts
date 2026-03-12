import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { ingestFixtures } from "../src/core/pipeline.js";
import { buildReviewBoard } from "../src/discord/review-plan.js";
import { JobStore } from "../src/db/store.js";

const FIXTURES_DIR = path.resolve(process.cwd(), "fixtures/email");

function createStore(): JobStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "job-ops-review-"));
  return new JobStore(path.join(dir, "job-ops.sqlite"));
}

describe("buildReviewBoard", () => {
  test("reconstructs Discord review state from canonical DB records", () => {
    const store = createStore();
    ingestFixtures(store, FIXTURES_DIR);

    store.updateLeadReview({
      leadId: "maple-systems-junior-python-developer",
      status: "approved_for_manual_apply",
      note: "Ready for manual submission"
    });

    const board = buildReviewBoard(store.listLeads(), store.listReviewEvents());
    const mapleThread = board.threads.find((thread) => thread.leadId === "maple-systems-junior-python-developer");
    const shortlistEntry = board.shortlistFeed.find((entry) => entry.includes("Maple Systems"));

    expect(shortlistEntry).toContain("approved_for_manual_apply");
    expect(mapleThread).toMatchObject({
      statusChannel: "job-ops-approved"
    });
    expect(mapleThread?.starterMessage).toContain("status_changed");
    expect(mapleThread?.commands).toContain("/job_approve maple-systems-junior-python-developer");
  });
});
