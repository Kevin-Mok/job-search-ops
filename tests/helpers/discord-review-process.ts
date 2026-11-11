import fs from "node:fs";
import { JobStore } from "../../src/db/store.js";
import { handleJobReviewAction } from "../../src/discord/review-actions.js";

const [dbPath, releasePath, envelopeJson] = process.argv.slice(2);
const store = new JobStore(dbPath);
const update = store.updateLeadReview.bind(store);
store.updateLeadReview = params => {
  // Pause after handler validation but before the real SQLite transaction.
  process.send!({ ready: true, pid: process.pid });
  const deadline = Date.now() + 10_000;
  const signal = new Int32Array(new SharedArrayBuffer(4));
  while (!fs.existsSync(releasePath)) {
    if (Date.now() >= deadline) throw new Error("Synthetic review barrier was not released.");
    Atomics.wait(signal, 0, 0, 10);
  }
  return update(params);
};

const envelope = JSON.parse(envelopeJson);
process.stdout.write(JSON.stringify(handleJobReviewAction({ store, ...envelope })));
process.disconnect!();
