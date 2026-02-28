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

  async find(query: string, limit = 8): Promise<MemoryEntry[]> {
    const q = query.toLowerCase();
    const entries = await this.load();
    return entries
      .filter((e) => e.text.toLowerCase().includes(q) || e.tags?.some((t) => t.toLowerCase().includes(q)))
      .slice(-limit)
      .reverse();
  }

  async recent(limit = 12): Promise<MemoryEntry[]> {
    const entries = await this.load();
    return entries.slice(-limit).reverse();
  }
}
