import { Brain } from "../llm/brain.js";
import { CentralLibrary, LibraryKind } from "./centralLibrary.js";
import { LearningEngine } from "./learning.js";
import { MemoryStore } from "./memory.js";
import { runMultiAgent } from "./orchestrator.js";
import { naivePlan } from "./planner.js";
import { SkillTrainer } from "./skillTrainer.js";
import { AgentConfig, ChatMessage, Tool } from "./types.js";

export class BudAgent {
  private history: ChatMessage[] = [];
  private failures = 0;
  private turns = 0;
  private readonly llm = new Brain();
  private readonly learning: LearningEngine;
  private readonly skillTrainer: SkillTrainer;
  private readonly library: CentralLibrary;
  private readonly autoLearnInterval: number;
  private readonly autoDailyRun: boolean;

  constructor(
    private readonly config: AgentConfig,
    private readonly memory: MemoryStore,
    private readonly tools: Tool[]
  ) {
    this.learning = new LearningEngine(this.memory);
    this.skillTrainer = new SkillTrainer(process.cwd(), this.memory);
    this.library = new CentralLibrary(process.cwd());
    this.autoLearnInterval = Number(process.env.AUTO_LEARN_INTERVAL ?? 6);
    this.autoDailyRun = String(process.env.AUTO_DAILY_RUN ?? "true").toLowerCase() !== "false";
  }

  async init(): Promise<void> {
    await this.memory.init();
    await this.skillTrainer.init();
    await this.library.init();
  }

  async diagnostics(): Promise<string> {
    const recent = await this.memory.recent(5);
    const policies = await this.learning.activePolicies(5);
    const skills = await this.skillTrainer.status();
    const dueSkills = skills.records.filter((r) => r.dueTs.slice(0, 10) <= new Date().toISOString().slice(0, 10)).length;
    const traces = await this.library.catalog(5);

    return [
      `name=${this.config.name}`,
      `mission=${this.config.mission}`,
      `tools=${this.tools.map((t) => t.name).join(",")}`,
      `recent_memories=${recent.length}`,
      `failures=${this.failures}`,
      `llm_enabled=${this.llm.isEnabled()}`,
      `llm_provider=${this.llm.providerName()}`,
      `llm_model=${this.llm.modelName()}`,
      `auto_learn_interval=${this.autoLearnInterval}`,
      `active_policies=${policies.length}`,
      `auto_daily_run=${this.autoDailyRun}`,
      `skill_curriculum_size=${skills.records.length}`,
      `skill_due_today=${dueSkills}`,
      `library_traces=${traces.length}`,
      `last_daily_skill_run=${skills.lastDailyRunDate ?? "never"}`
    ].join("\n");
  }

  async dashboardHighlights(): Promise<string> {
    const skillState = await this.skillTrainer.status();
    const due = skillState.records
      .filter((r) => r.dueTs.slice(0, 10) <= new Date().toISOString().slice(0, 10))
      .slice(0, 3)
      .map((r) => `${r.name} (L${r.level}/${r.stage})`);
    const traces = await this.library.catalog(3);

    return [
      `Last daily run: ${skillState.lastDailyRunDate ?? "never"}`,
      `Due skills: ${due.join(", ") || "none"}`,
      "Library latest:",
      ...traces.map((t) => `- [${t.kind}] ${t.title}`)
    ].join("\n");
  }

  async handleUserInput(input: string): Promise<string> {
    await this.autoDailyHook();

    this.turns += 1;
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

    if (low === "dashboard-highlights") {
      return this.dashboardHighlights();
    }

    if (low.startsWith("recall ")) {
      const q = input.slice(7).trim();
      const hits = await this.memory.search(q, 8);
      return hits.map((h) => `- [${h.kind}] ${h.text}`).join("\n") || "No memory hits.";
    }

    if (low === "self-improve") {
      const report = await this.learning.improve(this.history, (messages) => this.llm.complete(messages));
      await this.library.add({
        kind: "self-awareness",
        title: "Learning cycle",
        text: report,
        tags: ["auto", "learning"]
      });
      return report;
    }

    if (low === "policy-status") {
      return this.learning.policySummary();
    }

    if (low === "daily-report" || low.startsWith("daily-report ")) {
      const mode = low.replace("daily-report", "").trim() || "auto";
      return this.buildDailyReport(mode);
    }

    if (low === "daily-run" || low === "daily-run now") {
      const report = await this.skillTrainer.runDaily({ force: true });
      await this.library.add({ kind: "reflection", title: `Manual daily run ${report.runDate}`, text: report.summary, tags: ["manual", "daily"] });
      return report.summary;
    }

    if (low === "daily-run auto") {
      const report = await this.skillTrainer.runDaily();
      if (report.practiced.length > 0) {
        await this.library.add({ kind: "reflection", title: `Auto daily run ${report.runDate}`, text: report.summary, tags: ["auto", "daily"] });
      }
      return report.summary;
    }

    if (low === "skill-status") {
      const state = await this.skillTrainer.status();
      return state.records
        .slice(0, 10)
        .map((r) => `${r.name}: L${r.level}, ${r.stage}, due ${r.dueTs.slice(0, 10)}, score ${r.lastScore ?? "n/a"}`)
        .join("\n");
    }

    if (low === "library catalog") {
      const rows = await this.library.catalog(16);
      return rows.map((r) => `- [${r.kind}] ${r.title}: ${r.text.slice(0, 100)}`).join("\n") || "Library is empty.";
    }

    if (low.startsWith("library find ")) {
      const q = input.slice("library find ".length).trim();
      const rows = await this.library.retrieve(q, 10);
      return rows.map((r) => `- [${r.kind}] ${r.title}: ${r.text.slice(0, 120)}`).join("\n") || "No library hits.";
    }

    if (low.startsWith("library add ")) {
      return this.handleLibraryAdd(input.slice("library add ".length));
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

    if (this.autoLearnInterval > 0 && this.turns % this.autoLearnInterval === 0) {
      await this.learning.improve(this.history, (messages) => this.llm.complete(messages));
    }

    return reply;
  }

  private async autoDailyHook(): Promise<void> {
    if (!this.autoDailyRun) return;
    const result = await this.skillTrainer.runDaily();
    if (result.practiced.length > 0) {
      await this.library.add({
        kind: "reflection",
        title: `Daily skill run ${result.runDate}`,
        text: result.summary,
        tags: ["auto", "daily"]
      });
    }
  }

  private async buildDailyReport(mode: string): Promise<string> {
    const [diag, highlights, policySummary] = await Promise.all([
      this.diagnostics(),
      this.dashboardHighlights(),
      this.learning.policySummary(6)
    ]);

    const contextMode = mode === "auto" ? (this.history.length > 20 ? "compact" : "markdown") : mode;
    const today = new Date().toISOString().slice(0, 10);

    if (contextMode === "json") {
      return JSON.stringify({ date: today, diagnostics: diag, highlights, policies: policySummary }, null, 2);
    }

    if (contextMode === "compact") {
      return [
        `Daily report ${today}`,
        highlights,
        "Top policies:",
        policySummary
          .split("\n")
          .slice(0, 4)
          .join("\n")
      ].join("\n");
    }

    return [
      `# Daily Report — ${today}`,
      "",
      "## Highlights",
      highlights,
      "",
      "## Diagnostics",
      "```",
      diag,
      "```",
      "",
      "## Policy Health",
      policySummary
    ].join("\n");
  }

  private async handleLibraryAdd(raw: string): Promise<string> {
    const [kindRaw, titleAndText] = raw.split("::");
    if (!kindRaw || !titleAndText) {
      return "Usage: library add <knowledge|thinking|reflection|self-awareness> <title> :: <text>";
    }

    const firstSplit = kindRaw.trim().split(/\s+/);
    const kind = firstSplit[0] as LibraryKind;
    const title = firstSplit.slice(1).join(" ").trim() || "Untitled";

    if (!["knowledge", "thinking", "reflection", "self-awareness"].includes(kind)) {
      return "Invalid kind. Use: knowledge, thinking, reflection, self-awareness.";
    }

    const item = await this.library.add({ kind, title, text: titleAndText.trim(), tags: ["manual"] });
    await this.memory.add({ kind: "note", text: `Library add: [${item.kind}] ${item.title}`, tags: ["library", "manual"] });
    return `Added to library: [${item.kind}] ${item.title}`;
  }

  private async smartReply(input: string): Promise<string> {
    if (!this.llm.isEnabled()) {
      return this.defaultReply(input);
    }

    const memoryHits = await this.memory.search(input, 6);
    const memoryContext = memoryHits.length
      ? memoryHits.map((m) => `- [${m.kind}] ${m.text}`).join("\n")
      : "(no relevant memory)";

    const policyHits = await this.learning.activePolicies(6);
    const policyContext = policyHits.length ? policyHits.map((p) => `- ${p}`).join("\n") : "(no active policies yet)";

    const libraryHits = await this.library.retrieve(input, 4);
    const libraryContext = libraryHits.length
      ? libraryHits.map((l) => `- [${l.kind}] ${l.title}: ${l.text}`).join("\n")
      : "(no relevant library traces)";

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
            "Available built-in commands: shell, time, echo, remember, recall, swarm, self-debug, self-improve, policy-status, memories, daily-run, skill-status, daily-report, library catalog, library find, library add, dashboard-highlights.",
            "Active learned policies (follow these unless user overrides):",
            policyContext,
            "Relevant memory context:",
            memoryContext,
            "Central Library context:",
            libraryContext
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
      "- self-improve",
      "- daily-run",
      "- skill-status",
      "- policy-status",
      "- daily-report [auto|compact|markdown|json]",
      "- library catalog",
      "- library find <query>",
      "- library add <kind> <title> :: <text>",
      "- dashboard-highlights"
    ].join("\n");
  }
}
