import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface LearnerMetrics {
  taskSuccessRate: number;
  policyStability: number;
  retrievalStrength: number;
  failureRate: number;
  contextShift: number;
}

export interface LearnerState {
  cycles: number;
  updatedTs: string;
  strengths: {
    clarity: number;
    reliability: number;
    memoryDepth: number;
    adaptability: number;
  };
  uncertainty: number;
  drift: number;
}

export class LearnerCore {
  private readonly file: string;

  constructor(baseDir = process.cwd()) {
    this.file = path.join(baseDir, ".memory", "learner-state.json");
  }

  async init(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    try {
      await readFile(this.file, "utf8");
    } catch {
      await this.save(this.seed());
    }
  }

  async state(): Promise<LearnerState> {
    try {
      const raw = await readFile(this.file, "utf8");
      return JSON.parse(raw) as LearnerState;
    } catch {
      const fresh = this.seed();
      await this.save(fresh);
      return fresh;
    }
  }

  async update(metrics: LearnerMetrics): Promise<LearnerState> {
    const prev = await this.state();
    const next: LearnerState = {
      cycles: prev.cycles + 1,
      updatedTs: new Date().toISOString(),
      strengths: {
        clarity: this.smooth(prev.strengths.clarity, metrics.taskSuccessRate * 0.6 + (1 - metrics.contextShift) * 0.4),
        reliability: this.smooth(prev.strengths.reliability, (1 - metrics.failureRate) * 0.65 + metrics.policyStability * 0.35),
        memoryDepth: this.smooth(prev.strengths.memoryDepth, metrics.retrievalStrength),
        adaptability: this.smooth(prev.strengths.adaptability, (1 - metrics.policyStability) * 0.4 + (1 - metrics.failureRate) * 0.6)
      },
      uncertainty: this.smooth(prev.uncertainty, metrics.failureRate * 0.7 + metrics.contextShift * 0.3),
      drift: this.smooth(prev.drift, metrics.contextShift)
    };

    await this.save(next);
    return next;
  }

  responseConditioning(state: LearnerState): string {
    return [
      `Latent profile: clarity=${state.strengths.clarity.toFixed(2)}, reliability=${state.strengths.reliability.toFixed(2)}, memory=${state.strengths.memoryDepth.toFixed(2)}, adaptability=${state.strengths.adaptability.toFixed(2)}.`,
      `Uncertainty=${state.uncertainty.toFixed(2)}, drift=${state.drift.toFixed(2)}.`,
      state.uncertainty > 0.55 ? "Use tighter scope and ask one clarifying question if needed." : "You can answer directly with concise confidence.",
      state.strengths.memoryDepth < 0.45 ? "Prioritize retrieving memory/library context before advice." : "Memory grounding is healthy; keep references short."
    ].join("\n");
  }

  dailyPlanHints(state: LearnerState): string[] {
    const hints: string[] = [];
    if (state.strengths.memoryDepth < 0.5) hints.push("Do one memory hygiene pass and add 2 high-signal traces.");
    if (state.strengths.reliability < 0.6) hints.push("Favor deterministic commands and verify output before replying.");
    if (state.drift > 0.55) hints.push("Use shorter plan loops; re-anchor to mission every task.");
    if (state.uncertainty > 0.6) hints.push("Reduce scope and ask at most one clarification when ambiguity appears.");
    if (!hints.length) hints.push("Maintain momentum: keep concise execution and capture one reflection.");
    return hints;
  }

  private seed(): LearnerState {
    return {
      cycles: 0,
      updatedTs: new Date().toISOString(),
      strengths: { clarity: 0.5, reliability: 0.5, memoryDepth: 0.5, adaptability: 0.5 },
      uncertainty: 0.4,
      drift: 0.3
    };
  }

  private async save(state: LearnerState): Promise<void> {
    await writeFile(this.file, JSON.stringify(state, null, 2) + "\n", "utf8");
  }

  private smooth(prev: number, next: number): number {
    return Math.max(0.01, Math.min(0.99, Number((prev * 0.72 + next * 0.28).toFixed(4))));
  }
}
