import { MemoryStore } from "./memory.js";
import { naivePlan } from "./planner.js";
import { AgentConfig, ChatMessage, Tool } from "./types.js";

export class BudAgent {
  private history: ChatMessage[] = [];

  constructor(
    private readonly config: AgentConfig,
    private readonly memory: MemoryStore,
    private readonly tools: Tool[]
  ) {}

  async init(): Promise<void> {
    await this.memory.init();
  }

  async handleUserInput(input: string): Promise<string> {
    this.history.push({ role: "user", content: input, ts: new Date().toISOString() });

    const steps = naivePlan(input, this.tools);
    const outputs: string[] = [];

    for (const step of steps.slice(0, this.config.maxTurnsPerRun)) {
      if (step.kind === "tool") {
        const [name, ...rest] = step.payload.split(" ");
        const tool = this.tools.find((t) => t.name === name);
        if (!tool) {
          outputs.push(`Tool not found: ${name}`);
          continue;
        }

        const out = await tool.run(rest.join(" "), { now: new Date() });
        outputs.push(`[tool:${name}] ${out}`);
      } else if (step.kind === "memory") {
        const text = step.payload.trim();
        if (!text) {
          outputs.push("Usage: remember <text>");
        } else {
          await this.memory.add({ kind: "note", text, tags: ["manual"] });
          outputs.push(`Saved to memory: ${text}`);
        }
      } else {
        outputs.push(this.defaultReply(step.payload));
      }
    }

    const reply = outputs.join("\n");
    this.history.push({ role: "assistant", content: reply, ts: new Date().toISOString() });
    return reply;
  }

  private defaultReply(input: string): string {
    const low = input.toLowerCase();
    if (low.includes("mission")) {
      return `${this.config.name} mission: ${this.config.mission}`;
    }
    if (low.includes("recent memory")) {
      return "Use command: memories";
    }
    return [
      `I got: ${input}`,
      "Commands:",
      "- shell <command>",
      "- time",
      "- echo <text>",
      "- remember <text>"
    ].join("\n");
  }
}
