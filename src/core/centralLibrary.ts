import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export type LibraryKind = "knowledge" | "thinking" | "reflection" | "self-awareness";

export interface LibraryTrace {
  id: string;
  kind: LibraryKind;
  title: string;
  text: string;
  tags: string[];
  ts: string;
  score?: number;
}

export class CentralLibrary {
  private readonly dir: string;
  private readonly file: string;

  constructor(baseDir = process.cwd()) {
    this.dir = path.join(baseDir, ".memory");
    this.file = path.join(this.dir, "library.json");
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      await readFile(this.file, "utf8");
    } catch {
      await writeFile(this.file, "[]\n", "utf8");
    }
  }

  async add(input: { kind: LibraryKind; title: string; text: string; tags?: string[] }): Promise<LibraryTrace> {
    const rows = await this.load();
    const trace: LibraryTrace = {
      id: randomUUID(),
      kind: input.kind,
      title: input.title,
      text: input.text,
      tags: input.tags ?? [],
      ts: new Date().toISOString()
    };
    rows.push(trace);
    await this.save(rows);
    return trace;
  }

  async catalog(limit = 24): Promise<LibraryTrace[]> {
    const rows = await this.load();
    return rows.slice(-limit).reverse();
  }

  async retrieve(query: string, limit = 8, kind?: LibraryKind): Promise<LibraryTrace[]> {
    const q = query.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    const rows = await this.load();
    const scoped = kind ? rows.filter((r) => r.kind === kind) : rows;

    if (!terms.length) return scoped.slice(-limit).reverse();

    return scoped
      .map((r) => {
        const body = `${r.title} ${r.text} ${r.tags.join(" ")}`.toLowerCase();
        const hits = terms.reduce((acc, t) => acc + (body.includes(t) ? 1 : 0), 0);
        const recency = new Date(r.ts).getTime() / 1e13;
        return { ...r, score: hits * 2 + recency };
      })
      .filter((r) => (r.score ?? 0) > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit);
  }

  private async load(): Promise<LibraryTrace[]> {
    const raw = await readFile(this.file, "utf8");
    return JSON.parse(raw) as LibraryTrace[];
  }

  private async save(rows: LibraryTrace[]): Promise<void> {
    await writeFile(this.file, JSON.stringify(rows, null, 2) + "\n", "utf8");
  }
}
