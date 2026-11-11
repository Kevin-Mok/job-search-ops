import fs from "node:fs";
import { createFixtureLinkedInTransport } from "../../src/discord/linkedin-transport.js";

const [journalPath, releasePath, role, stage] = process.argv.slice(2);
const originalRead = fs.readFileSync;
fs.readFileSync = ((...args: Parameters<typeof fs.readFileSync>) => {
  const bytes = originalRead(...args);
  if (String(args[0]) === journalPath) {
    process.send!({ phase: "read" });
    if (role === "first") {
      const signal = new Int32Array(new SharedArrayBuffer(4));
      const deadline = Date.now() + 10_000;
      while (!fs.existsSync(releasePath)) {
        if (Date.now() >= deadline) throw new Error("Fixture read barrier was not released.");
        Atomics.wait(signal, 0, 0, 10);
      }
    }
  }
  return bytes;
}) as typeof fs.readFileSync;

const adapter = createFixtureLinkedInTransport(journalPath);
process.send!({ phase: "attempting" });
let receipt: unknown;
if (stage === "alert") receipt = await adapter.sendAlert({ key: role, content: `${role} content`, title: role });
else if (stage === "thread") receipt = await adapter.createThread({ messageId: role, title: role });
else if (stage === "fit") receipt = await adapter.sendThreadMessage!({ threadId: "fixture-thread", key: role, content: `${role} fit` });
else if (stage === "attachment") receipt = await adapter.sendAttachment!({ threadId: "fixture-thread", key: role, filename: `${role}.pdf`, bytes: Buffer.from(`${role} PDF bytes`), sha256: role });
else throw new Error("Unknown synthetic fixture stage.");
process.stdout.write(JSON.stringify(receipt));
process.disconnect!();
