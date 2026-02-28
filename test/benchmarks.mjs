import { performance } from "node:perf_hooks";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CentralLibrary } from "../dist/core/centralLibrary.js";
import { PolicyArbitrator } from "../dist/core/policyArbitration.js";

async function run() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "yourbud-bench-"));
  try {
    const lib = new CentralLibrary(dir);
    await lib.init();

    for (let i = 0; i < 400; i += 1) {
      await lib.add({
        kind: "knowledge",
        title: `Doc ${i} retry resilience`,
        text: `service ${i} uses exponential backoff and circuit breaker for api reliability`,
        tags: ["api", "retry", i % 2 ? "ops" : "infra"]
      });
    }

    const t0 = performance.now();
    for (let i = 0; i < 80; i += 1) {
      await lib.retrieve("api retry circuit breaker backoff", 6);
    }
    const t1 = performance.now();

    const arb = new PolicyArbitrator();
    const policies = [];
    for (let i = 0; i < 250; i += 1) {
      policies.push({ text: i % 2 ? "Always ask for confirmation before deletion" : "Never ask for confirmation before deletion", confidence: 0.6 + (i % 10) * 0.02 });
    }

    const t2 = performance.now();
    for (let i = 0; i < 120; i += 1) {
      arb.resolve(policies);
    }
    const t3 = performance.now();

    console.log(`bench retrieval avg_ms=${((t1 - t0) / 80).toFixed(2)}`);
    console.log(`bench arbitration avg_ms=${((t3 - t2) / 120).toFixed(2)}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
