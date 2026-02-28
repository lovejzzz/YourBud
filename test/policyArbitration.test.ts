import test from "node:test";
import assert from "node:assert/strict";
import { PolicyArbitrator } from "../src/core/policyArbitration.js";

test("policy arbitrator merges near-duplicates and penalizes contradictions", () => {
  const arb = new PolicyArbitrator();
  const result = arb.resolve([
    { text: "Always ask a clarifying question first", confidence: 0.7, source: "a" },
    { text: "Never ask clarifying questions first", confidence: 0.65, source: "b" },
    { text: "Use concise responses", confidence: 0.75, source: "c" },
    { text: "Keep responses concise", confidence: 0.7, source: "d" }
  ]);

  assert.ok(result.conflicts.length >= 1);
  assert.ok(result.resolved.length >= 2);

  const concise = result.resolved.find((r) => r.text.includes("concise"));
  assert.ok(concise);
  assert.ok((concise?.support ?? 0) >= 2);

  const contradicted = result.resolved.filter((r) => r.text.includes("clarifying"));
  assert.ok(contradicted.length >= 1);
  assert.ok(contradicted.some((r) => (r.conflictsWith?.length ?? 0) > 0));
});
