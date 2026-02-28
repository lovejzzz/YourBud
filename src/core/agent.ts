import { Brain } from "../llm/brain.js";
import { MemoryStore } from "./memory.js";
import { runMultiAgent } from "./orchestrator.js";
import { naivePlan } from "./planner.js";
import { AgentConfig, ChatMessage, Tool } from "./types.js";

export class BudAgent {
  private history: ChatMessage[] = [];
  private failures = 0;
  private readonly llm = new Brain();

  constructor(
    private readonly config: AgentConfig,
    private readonly memory: MemoryStore,
    private readonly tools: Tool[]
  ) {}

  async init(): Promise<void> {
    await this.memory.init();
  }

  async diagnostics(): Promise<string> {
    const recent = await this.memory.recent(5);
    return [
      `name=${this.config.name}`,
      `mission=${this.config.mission}`,
      `tools=${this.tools.map((t) => t.name).join(",")}`,
      `recent_memories=${recent.length}`,
      `failures=${this.failures}`,
      `llm_enabled=${this.llm.isEnabled()}`,
      `llm_provider=${this.llm.providerName()}`,
      `llm_model=${this.llm.modelName()}`
    ].join("\n");
  }

  async handleUserInput(input: string): Promise<string> {
    this.history.push({ role: "user", content: input, ts: new Date().toISOString() });

    const low = input.toLowerCase().trim();
    if (low.startsWith("swarm ")) {
      const task = input.slice(6).trim();
      const cards = runMultiAgent(task || "general task");
      const out = cards.map((c) => `## ${c.role}\n${c.output}`).join("\n\n");
      await this.memory.add({ kind: "decision", text: `Swarm ran on: ${task}`, tags: ["swarm"] });
      return out;
    }

    if (low === "self-debug") {
      return this.diagnostics();
    }

    if (low.startsWith("recall ")) {
      const q = input.slice(7).trim();
      const hits = await this.memory.search(q, 8);
      return hits.map((h) => `- [${h.kind}] ${h.text}`).join("\n") || "No memory hits.";
    }

    if (low === "self-improve") {
      const reflection = await this.memory.reflectAndCompress();
      return reflection ? `Improvement pass done.\n${reflection.text}` : "Not enough history yet for reflection.";
    }

    const steps = naivePlan(input, this.tools);
    const outputs: string[] = [];

    for (const step of steps.slice(0, this.config.maxTurnsPerRun)) {
      try {
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
          outputs.push(await this.smartReply(step.payload));
        }
      } catch (error) {
        this.failures += 1;
        outputs.push(`Recovered from error: ${(error as Error).message}`);
      }
    }

    const reply = outputs.join("\n");
    this.history.push({ role: "assistant", content: reply, ts: new Date().toISOString() });
    await this.memory.add({ kind: "note", text: `Q: ${input} | A: ${reply.slice(0, 220)}`, tags: ["chat"] });
    return reply;
  }

  private async smartReply(input: string): Promise<string> {
    if (!this.llm.isEnabled()) {
      return this.defaultReply(input);
    }

    const memoryHits = await this.memory.search(input, 6);
    const memoryContext = memoryHits.length
      ? memoryHits.map((m) => `- [${m.kind}] ${m.text}`).join("\n")
      : "(no relevant memory)";

    const convo = this.history.slice(-8).map((m) => ({ role: m.role, content: m.content }));

    try {
      return await this.llm.complete([
        {
          role: "system",
          content: [
            `You are ${this.config.name}.`,
            `Mission: ${this.config.mission}`,
            "Be concise, practical, and honest.",
            "If user asks for commands, provide exact commands.",
            "Available built-in commands: shell, time, echo, remember, recall, swarm, self-debug, self-improve, memories.",
            "Relevant memory context:",
            memoryContext
          ].join("\n")
        },
        ...convo,
        { role: "user", content: input }
      ]);
    } catch {
      this.failures += 1;
      return this.defaultReply(input);
    }
  }

  private defaultReply(input: string): string {
    const low = input.toLowerCase();
    if (low.includes("mission")) {
      return `${this.config.name} mission: ${this.config.mission}`;
    }
    return [
      `I got: ${input}`,
      "Commands:",
      "- shell <command>",
      "- time",
      "- echo <text>",
      "- remember <text>",
      "- recall <query>",
      "- swarm <task>",
      "- self-debug",
      "- self-improve"
    ].join("\n");
  }
}
