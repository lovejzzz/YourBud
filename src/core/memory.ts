import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { MemoryEntry } from "./types.js";

export class MemoryStore {
  private readonly dir: string;
  private readonly file: string;

  constructor(baseDir = process.cwd()) {
    this.dir = path.join(baseDir, ".memory");
    this.file = path.join(this.dir, "memory.json");
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      await readFile(this.file, "utf8");
    } catch {
      await writeFile(this.file, "[]\n", "utf8");
    }
  }

  private async load(): Promise<MemoryEntry[]> {
    const raw = await readFile(this.file, "utf8");
    return JSON.parse(raw) as MemoryEntry[];
  }

  private async save(entries: MemoryEntry[]): Promise<void> {
    await writeFile(this.file, JSON.stringify(entries, null, 2) + "\n", "utf8");
  }

  async add(entry: Omit<MemoryEntry, "id" | "ts">): Promise<MemoryEntry> {
    const entries = await this.load();
    const full: MemoryEntry = {
      ...entry,
      id: randomUUID(),
      ts: new Date().toISOString()
    };
    entries.push(full);
    await this.save(entries);
    return full;
  }

  async recent(limit = 12): Promise<MemoryEntry[]> {
    const entries = await this.load();
    return entries.slice(-limit).reverse();
  }

  async search(query: string, limit = 8): Promise<MemoryEntry[]> {
    const q = query.toLowerCase().trim();
    if (!q) return this.recent(limit);

    const terms = q.split(/\s+/).filter(Boolean);
    const entries = await this.load();

    const scored = entries
      .map((e) => {
        const body = `${e.text} ${(e.tags ?? []).join(" ")}`.toLowerCase();
        const hits = terms.reduce((acc, t) => acc + (body.includes(t) ? 1 : 0), 0);
        const recencyBoost = new Date(e.ts).getTime() / 1e13;
        return { ...e, score: hits * 2 + recencyBoost };
      })
      .filter((e) => (e.score ?? 0) > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit);

    return scored;
  }

  async reflectAndCompress(windowSize = 40): Promise<MemoryEntry | null> {
    const entries = await this.load();
    if (entries.length < 8) return null;

    const recent = entries.slice(-windowSize);
    const key = recent
      .filter((e) => e.kind !== "reflection")
      .slice(-10)
      .map((e) => `- [${e.kind}] ${e.text}`)
      .join("\n");

    if (!key.trim()) return null;

    return this.add({
      kind: "reflection",
      text: `Session reflection:\n${key}`,
      tags: ["summary", "auto"]
    });
  }
}
