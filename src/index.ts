import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { BudAgent } from "./core/agent.js";
import { MemoryStore } from "./core/memory.js";
import { createLocalTools } from "./tools/local.js";

async function main() {
  const agent = new BudAgent(
    {
      name: process.env.AGENT_NAME ?? "Bud",
      mission: process.env.AGENT_MISSION ?? "Be useful, fast, and honest.",
      maxTurnsPerRun: Number(process.env.MAX_TURNS_PER_RUN ?? 4)
    },
    new MemoryStore(process.cwd()),
    createLocalTools()
  );

  await agent.init();

  const rl = readline.createInterface({ input, output });
  console.log("🌱 YourBud ready. Type 'exit' to quit.");

  while (true) {
    const line = (await rl.question("> ")).trim();
    if (!line) continue;
    if (line.toLowerCase() === "exit") break;

    if (line.toLowerCase() === "memories") {
      const recent = await new MemoryStore(process.cwd());
      await recent.init();
      const rows = await recent.recent(10);
      console.log(rows.map((r) => `- [${r.kind}] ${r.text}`).join("\n") || "(no memory yet)");
      continue;
    }

    const out = await agent.handleUserInput(line);
    console.log(out);
  }

  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
