import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CentralLibrary } from "../src/core/centralLibrary.js";

test("central library retrieval prefers title/tag hits", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "yourbud-library-"));
  try {
    const lib = new CentralLibrary(dir);
    await lib.init();

    await lib.add({ kind: "knowledge", title: "Retry policy", text: "Use exponential backoff for flaky APIs", tags: ["retries"] });
    await lib.add({ kind: "reflection", title: "Morning notes", text: "Worked on dashboard formatting", tags: ["report"] });

    const hits = await lib.retrieve("retry backoff", 5);
    assert.equal(hits.length > 0, true);
    assert.equal(hits[0].title, "Retry policy");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
