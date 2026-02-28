import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MemoryStore } from "./memory.js";

interface SkillRecord {
  name: string;
  level: number;
  stage: "foundation" | "apprentice" | "practitioner" | "advanced";
  ease: number;
  intervalDays: number;
  dueTs: string;
  streak: number;
  promotions: number;
  demotions: number;
  lastScore?: number;
  lastPracticedTs?: string;
}

interface SkillStoreShape {
  lastDailyRunDate?: string;
  records: SkillRecord[];
}

export interface DailySkillRunResult {
  runDate: string;
  practiced: SkillRecord[];
  promoted: string[];
  demoted: string[];
  summary: string;
}

export class SkillTrainer {
  private readonly dir: string;
  private readonly file: string;

  constructor(baseDir = process.cwd(), private readonly memory?: MemoryStore) {
    this.dir = path.join(baseDir, ".memory");
    this.file = path.join(this.dir, "skills.json");
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      await readFile(this.file, "utf8");
    } catch {
      const initial: SkillStoreShape = {
        records: this.seedCurriculum(),
        lastDailyRunDate: undefined
      };
      await this.save(initial);
    }
  }

  async status(): Promise<SkillStoreShape> {
    return this.load();
  }

  async runDaily(options?: { force?: boolean; date?: Date }): Promise<DailySkillRunResult> {
    const date = options?.date ?? new Date();
    const day = date.toISOString().slice(0, 10);
    const state = await this.load();

    if (!options?.force && state.lastDailyRunDate === day) {
      return {
        runDate: day,
        practiced: [],
        promoted: [],
        demoted: [],
        summary: "Daily run already completed today."
      };
    }

    const due = state.records.filter((r) => r.dueTs.slice(0, 10) <= day).sort((a, b) => a.dueTs.localeCompare(b.dueTs));
    const practiced = due.slice(0, 6);
    const promoted: string[] = [];
    const demoted: string[] = [];

    for (const item of practiced) {
      const score = this.evaluateSkill(item);
      this.applySpacedRepetition(item, score, date);

      if (score >= 4 && item.level % 3 === 0) {
        const before = item.stage;
        item.stage = this.nextStage(item.stage);
        if (item.stage !== before) promoted.push(item.name);
      }

      if (score <= 2 && item.level > 1) {
        item.level -= 1;
        item.demotions += 1;
        demoted.push(item.name);
      }

      if (this.memory) {
        await this.memory.add({
          kind: "lesson",
          text: `Skill ${item.name} evaluated score=${score}, level=${item.level}, stage=${item.stage}`,
          tags: ["skill", "daily", score >= 4 ? "promote" : "review"]
        });
      }
    }

    state.lastDailyRunDate = day;
    await this.save(state);

    const summary = [
      `Daily skill run ${day}`,
      `Practiced: ${practiced.length}`,
      `Promoted: ${promoted.join(", ") || "none"}`,
      `Demoted: ${demoted.join(", ") || "none"}`
    ].join(" | ");

    if (this.memory) {
      await this.memory.add({
        kind: "reflection",
        text: summary,
        tags: ["skill", "daily-summary", "auto"]
      });
    }

    return { runDate: day, practiced, promoted, demoted, summary };
  }

  private seedCurriculum(): SkillRecord[] {
    const now = new Date();
    const dueTs = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const names = [
      "Goal decomposition",
      "Prompt precision",
      "Tool reliability",
      "Memory hygiene",
      "Reflection quality",
      "Self-awareness calibration"
    ];

    return names.map((name) => ({
      name,
      level: 1,
      stage: "foundation",
      ease: 2.5,
      intervalDays: 1,
      dueTs,
      streak: 0,
      promotions: 0,
      demotions: 0
    }));
  }

  private evaluateSkill(item: SkillRecord): number {
    const trend = item.streak >= 2 ? 1 : 0;
    const base = Math.min(5, Math.max(2, Math.round(item.ease + trend)));
    if (item.stage === "advanced") return Math.min(5, base + 1);
    return base;
  }

  private applySpacedRepetition(item: SkillRecord, score: number, now: Date): void {
    if (score >= 4) {
      item.streak += 1;
      item.ease = Math.min(3.0, item.ease + 0.08);
      item.intervalDays = Math.max(1, Math.round(item.intervalDays * item.ease));
      item.level += 1;
      item.promotions += 1;
    } else if (score === 3) {
      item.streak = 0;
      item.intervalDays = Math.max(1, Math.round(item.intervalDays * 0.9));
      item.ease = Math.max(1.7, item.ease - 0.05);
    } else {
      item.streak = 0;
      item.intervalDays = 1;
      item.ease = Math.max(1.5, item.ease - 0.2);
    }

    item.lastScore = score;
    item.lastPracticedTs = now.toISOString();
    item.dueTs = new Date(now.getTime() + item.intervalDays * 24 * 60 * 60 * 1000).toISOString();
  }

  private nextStage(stage: SkillRecord["stage"]): SkillRecord["stage"] {
    if (stage === "foundation") return "apprentice";
    if (stage === "apprentice") return "practitioner";
    if (stage === "practitioner") return "advanced";
    return "advanced";
  }

  private async load(): Promise<SkillStoreShape> {
    const raw = await readFile(this.file, "utf8");
    const state = JSON.parse(raw) as SkillStoreShape;
    state.records ??= [];
    return state;
  }

  private async save(state: SkillStoreShape): Promise<void> {
    await writeFile(this.file, JSON.stringify(state, null, 2) + "\n", "utf8");
  }
}
