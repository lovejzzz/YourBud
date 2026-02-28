import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MemoryStore } from "./memory.js";
import { PolicyArbitrator } from "./policyArbitration.js";
import { ChatMessage } from "./types.js";

type LlmComplete = (messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) => Promise<string>;

interface LearningReport {
  worked: string[];
  failed: string[];
  policies: string[];
}

interface PolicyRecord {
  text: string;
  score: number;
  updates: number;
  streak: number;
  decay: number;
  evolvedFrom?: string;
  createdTs: string;
  updatedTs: string;
  conflicts?: string[];
}

interface PolicyState {
  records: PolicyRecord[];
  lastRunTs?: string;
}

export class LearningEngine {
  private readonly stateFile: string;
  private readonly arbitrator = new PolicyArbitrator();

  constructor(private readonly memory: MemoryStore, baseDir = process.cwd()) {
    this.stateFile = path.join(baseDir, ".memory", "policy-state.json");
  }

  async improve(history: ChatMessage[], llmComplete: LlmComplete): Promise<string> {
    const report = await this.generateReport(history, llmComplete);
    const state = await this.loadState();

    const incoming = report.policies.map((p) => this.normalizePolicy(p)).filter(Boolean);
    const now = new Date().toISOString();

    for (const row of state.records) {
      row.decay = Number((row.decay + 0.2).toFixed(2));
      row.score = Number(Math.max(0.3, row.score - 0.1 - row.decay * 0.02).toFixed(2));
      row.streak = Math.max(0, row.streak - 1);
      row.updatedTs = now;
    }

    const arbitration = this.arbitrator.resolve([
      ...incoming.map((p) => ({ text: p, confidence: 0.63, source: "incoming" })),
      ...state.records.map((r) => ({ text: r.text, confidence: Math.min(0.99, r.score / 5), source: "memory" }))
    ]);

    const saved: string[] = [];

    for (const policy of arbitration.resolved.slice(0, 10)) {
      const existing = this.findClosestPolicy(state.records, policy.text);
      if (!existing) {
        state.records.push({
          text: policy.text,
          score: Number((policy.confidence * 5).toFixed(2)),
          updates: 1,
          streak: 1,
          decay: 0,
          conflicts: policy.conflictsWith,
          createdTs: now,
          updatedTs: now
        });
        saved.push(`new: ${policy.text}`);
        continue;
      }

      existing.updates += 1;
      existing.streak += 1;
      existing.decay = 0;
      existing.score = Number(Math.min(5, existing.score + 0.5 + policy.confidence * 0.5).toFixed(2));
      existing.updatedTs = now;
      existing.conflicts = policy.conflictsWith;

      if (existing.text !== policy.text && this.shouldEvolve(existing, policy.text)) {
        existing.evolvedFrom = existing.text;
        existing.text = policy.text;
      }

      saved.push(`update: ${existing.text} (score=${existing.score.toFixed(2)})`);
    }

    state.records = state.records
      .filter((r) => r.score >= 0.75)
      .sort((a, b) => b.score - a.score)
      .slice(0, 24);

    state.lastRunTs = now;
    await this.saveState(state);

    for (const p of state.records.slice(0, 6)) {
      const conflictTag = (p.conflicts?.length ?? 0) > 0 ? "conflicted" : "stable";
      await this.memory.add({
        kind: "policy",
        text: `${p.text} [score=${p.score.toFixed(2)} updates=${p.updates}]`,
        tags: ["policy", "auto", conflictTag]
      });
    }

    for (const w of report.worked.slice(0, 4)) {
      await this.memory.add({ kind: "lesson", text: `Worked: ${w}`, tags: ["lesson", "positive", "auto"] });
    }

    for (const f of report.failed.slice(0, 4)) {
      await this.memory.add({ kind: "lesson", text: `Failed: ${f}`, tags: ["lesson", "risk", "auto"] });
    }

    const top = state.records.slice(0, 5).map((r) => `${r.text} (score=${r.score.toFixed(2)})`).join(" | ");
    await this.memory.add({
      kind: "reflection",
      text: [
        "Self-improve cycle complete.",
        `Worked: ${report.worked.join(" | ") || "n/a"}`,
        `Failed: ${report.failed.join(" | ") || "n/a"}`,
        `Policies observed: ${incoming.join(" | ") || "n/a"}`,
        `Top active policies: ${top || "n/a"}`,
        `Conflicts detected: ${arbitration.conflicts.length}`
      ].join("\n"),
      tags: ["summary", "auto", "learning-cycle"]
    });

    return [
      "Learning cycle complete.",
      `Saved/updated: ${saved.length}`,
      `Conflicts detected: ${arbitration.conflicts.length}`,
      `Top policies: ${top || "none"}`
    ].join("\n");
  }

  async activePolicies(limit = 6): Promise<string[]> {
    const state = await this.loadState();
    return state.records
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => `${r.text} [score=${r.score.toFixed(2)}]`);
  }

  async policySummary(limit = 12): Promise<string> {
    const state = await this.loadState();
    const rows = state.records
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) =>
        `- ${r.text} | score=${r.score.toFixed(2)} updates=${r.updates} streak=${r.streak} decay=${r.decay.toFixed(2)} conflicts=${r.conflicts?.length ?? 0}`
      );
    return rows.join("\n") || "No learned policies yet.";
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

  private normalizePolicy(policy: string): string {
    return policy
      .trim()
      .replace(/^[-*\d.\s]+/, "")
      .replace(/\s+/g, " ")
      .replace(/[.。]+$/, "")
      .slice(0, 120);
  }

  private findClosestPolicy(records: PolicyRecord[], candidate: string): PolicyRecord | undefined {
    const candidateTerms = new Set(candidate.toLowerCase().split(/\W+/).filter(Boolean));

    return records.find((r) => {
      const sourceTerms = new Set(r.text.toLowerCase().split(/\W+/).filter(Boolean));
      const overlap = [...candidateTerms].filter((t) => sourceTerms.has(t)).length;
      const ratio = overlap / Math.max(1, Math.min(candidateTerms.size, sourceTerms.size));
      return ratio >= 0.6;
    });
  }

  private shouldEvolve(existing: PolicyRecord, nextText: string): boolean {
    if (existing.text === nextText) return false;
    const existingLen = existing.text.split(/\s+/).length;
    const nextLen = nextText.split(/\s+/).length;
    return nextLen <= existingLen + 3;
  }

  private async loadState(): Promise<PolicyState> {
    const dir = path.dirname(this.stateFile);
    await mkdir(dir, { recursive: true });

    try {
      const raw = await readFile(this.stateFile, "utf8");
      const state = JSON.parse(raw) as PolicyState;
      state.records ??= [];
      return state;
    } catch {
      const seed: PolicyState = { records: [] };
      await this.saveState(seed);
      return seed;
    }
  }

  private async saveState(state: PolicyState): Promise<void> {
    await writeFile(this.stateFile, JSON.stringify(state, null, 2) + "\n", "utf8");
  }
}
