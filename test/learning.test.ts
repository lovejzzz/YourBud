import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { MemoryStore } from "../src/core/memory.js";
import { LearningEngine } from "../src/core/learning.js";

test("learning engine stores scored policies and exposes active policies", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "yourbud-learning-"));
  try {
    const memory = new MemoryStore(dir);
    await memory.init();
    const learning = new LearningEngine(memory, dir);

    const history = [
      { role: "user" as const, content: "Help me", ts: new Date().toISOString() },
      { role: "assistant" as const, content: "Sure", ts: new Date().toISOString() }
    ];

    const llm = async () =>
      JSON.stringify({
        worked: ["clear steps"],
        failed: ["too verbose"],
        policies: ["Prefer short direct answers", "Ask one clarifying question when requirements are vague"]
      });

    const out = await learning.improve(history, llm);
    assert.match(out, /Learning cycle complete/);

    const active = await learning.activePolicies(5);
    assert.ok(active.length >= 2);
    assert.ok(active[0].includes("score="));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
