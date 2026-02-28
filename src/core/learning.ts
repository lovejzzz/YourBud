import { MemoryStore } from "./memory.js";
import { ChatMessage } from "./types.js";

type LlmComplete = (messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) => Promise<string>;

interface LearningReport {
  worked: string[];
  failed: string[];
  policies: string[];
}

export class LearningEngine {
  constructor(private readonly memory: MemoryStore) {}

  async improve(history: ChatMessage[], llmComplete: LlmComplete): Promise<string> {
    const report = await this.generateReport(history, llmComplete);

    const saved: string[] = [];
    for (const p of report.policies.slice(0, 6)) {
      await this.memory.add({ kind: "policy", text: p, tags: ["policy", "auto"] });
      saved.push(`policy: ${p}`);
    }

    for (const w of report.worked.slice(0, 4)) {
      await this.memory.add({ kind: "lesson", text: `Worked: ${w}`, tags: ["lesson", "positive", "auto"] });
    }

    for (const f of report.failed.slice(0, 4)) {
      await this.memory.add({ kind: "lesson", text: `Failed: ${f}`, tags: ["lesson", "risk", "auto"] });
    }

    await this.memory.add({
      kind: "reflection",
      text: [
        "Self-improve cycle complete.",
        `Worked: ${report.worked.join(" | ") || "n/a"}`,
        `Failed: ${report.failed.join(" | ") || "n/a"}`,
        `Policies: ${report.policies.join(" | ") || "n/a"}`
      ].join("\n"),
      tags: ["summary", "auto", "learning-cycle"]
    });

    return saved.length
      ? `Learning cycle complete.\n${saved.map((s) => `- ${s}`).join("\n")}`
      : "Learning cycle complete, but no new policies extracted.";
  }

  private async generateReport(history: ChatMessage[], llmComplete: LlmComplete): Promise<LearningReport> {
    const recent = history.slice(-12);
    const compact = recent.map((m) => `${m.role}: ${m.content}`).join("\n");

    try {
      const raw = await llmComplete([
        {
          role: "system",
          content: [
            "You are a learning critic for an AI agent.",
            "Extract behavior improvements from recent chat.",
            "Return strict JSON only with keys: worked (string[]), failed (string[]), policies (string[]).",
            "Policies must be short imperative rules, <= 14 words each."
          ].join("\n")
        },
        { role: "user", content: compact || "No chat context available." }
      ]);

      const parsed = this.tryParseJson(raw);
      if (parsed) return parsed;
    } catch {
      // fallback below
    }

    return this.heuristicReport(recent);
  }

  private tryParseJson(raw: string): LearningReport | null {
    const fenced = raw.match(/\{[\s\S]*\}/);
    const candidate = fenced ? fenced[0] : raw;
    try {
      const obj = JSON.parse(candidate) as LearningReport;
      if (!Array.isArray(obj.worked) || !Array.isArray(obj.failed) || !Array.isArray(obj.policies)) {
        return null;
      }
      return {
        worked: obj.worked.map((s) => String(s)).filter(Boolean),
        failed: obj.failed.map((s) => String(s)).filter(Boolean),
        policies: obj.policies.map((s) => String(s)).filter(Boolean)
      };
    } catch {
      return null;
    }
  }

  private heuristicReport(recent: ChatMessage[]): LearningReport {
    const users = recent.filter((m) => m.role === "user").map((m) => m.content);
    const assistants = recent.filter((m) => m.role === "assistant").map((m) => m.content);

    const worked = [
      users.length ? "Kept context from recent user requests" : "n/a",
      assistants.some((a) => a.length < 500) ? "Responses stayed concise" : "n/a"
    ].filter((x) => x !== "n/a");

    const failed = [
      assistants.some((a) => a.toLowerCase().includes("tool not found")) ? "Unknown tools surfaced to user" : "n/a",
      assistants.some((a) => a.toLowerCase().includes("recovered from error")) ? "Runtime errors happened during execution" : "n/a"
    ].filter((x) => x !== "n/a");

    const policies = [
      "Restate user goal in one line before acting.",
      "Use memory hits before generating long answers.",
      "If uncertain, ask one clarifying question only.",
      "Prefer concrete steps over abstract advice."
    ];

    return { worked, failed, policies };
  }
}
