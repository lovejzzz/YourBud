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

type InvertedIndex = Record<string, string[]>;

export class CentralLibrary {
  private readonly dir: string;
  private readonly file: string;
  private readonly indexFile: string;

  constructor(baseDir = process.cwd()) {
    this.dir = path.join(baseDir, ".memory");
    this.file = path.join(this.dir, "library.json");
    this.indexFile = path.join(this.dir, "library.index.json");
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    try {
      await readFile(this.file, "utf8");
    } catch {
      await writeFile(this.file, "[]\n", "utf8");
    }

    try {
      await readFile(this.indexFile, "utf8");
    } catch {
      await writeFile(this.indexFile, "{}\n", "utf8");
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
    await this.reindex(rows);
    return trace;
  }

  async catalog(limit = 24): Promise<LibraryTrace[]> {
    const rows = await this.load();
    return rows.slice(-limit).reverse();
  }

  async retrieve(query: string, limit = 8, kind?: LibraryKind): Promise<LibraryTrace[]> {
    const q = query.trim().toLowerCase();
    const terms = this.tokenize(q);
    const rows = await this.load();
    const scoped = kind ? rows.filter((r) => r.kind === kind) : rows;

    if (!terms.length) return scoped.slice(-limit).reverse();

    const index = await this.loadIndex();
    const idSet = new Set<string>();
    for (const term of terms) {
      for (const id of index[term] ?? []) idSet.add(id);
    }

    const candidates = scoped.filter((r) => idSet.has(r.id));
    const source = candidates.length > 0 ? candidates : scoped;

    return source
      .map((r) => {
        const titleHits = this.termHits(this.tokenize(r.title), terms) * 2.4;
        const textHits = this.termHits(this.tokenize(r.text), terms) * 1.6;
        const tagHits = this.termHits(this.tokenize(r.tags.join(" ")), terms) * 2.1;
        const termCoverage = this.coverage(this.tokenize(`${r.title} ${r.text} ${r.tags.join(" ")}`), terms) * 1.8;
        const recency = new Date(r.ts).getTime() / 1e13;
        return { ...r, score: titleHits + textHits + tagHits + termCoverage + recency };
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

  private async loadIndex(): Promise<InvertedIndex> {
    try {
      const raw = await readFile(this.indexFile, "utf8");
      return JSON.parse(raw) as InvertedIndex;
    } catch {
      return {};
    }
  }

  private async reindex(rows: LibraryTrace[]): Promise<void> {
    const index: InvertedIndex = {};

    for (const row of rows) {
      const tokens = new Set(this.tokenize(`${row.title} ${row.text} ${(row.tags ?? []).join(" ")}`));
      for (const token of tokens) {
        index[token] ??= [];
        index[token].push(row.id);
      }
    }

    await writeFile(this.indexFile, JSON.stringify(index, null, 2) + "\n", "utf8");
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);
  }

  private termHits(sourceTerms: string[], terms: string[]): number {
    const source = new Set(sourceTerms);
    return terms.reduce((acc, t) => acc + (source.has(t) ? 1 : 0), 0);
  }

  private coverage(sourceTerms: string[], terms: string[]): number {
    const source = new Set(sourceTerms);
    const hit = terms.filter((t) => source.has(t)).length;
    return hit / Math.max(1, terms.length);
  }
}
