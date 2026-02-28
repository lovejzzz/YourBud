import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { EmbeddingProvider, SemanticRetrieval, VectorStore } from "./semanticRetrieval.js";

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
  private readonly vectorFile: string;
  private readonly retrieval: SemanticRetrieval;

  constructor(baseDir = process.cwd(), embedder?: EmbeddingProvider) {
    this.dir = path.join(baseDir, ".memory");
    this.file = path.join(this.dir, "library.json");
    this.indexFile = path.join(this.dir, "library.index.json");
    this.vectorFile = path.join(this.dir, "library.vectors.json");
    this.retrieval = new SemanticRetrieval(embedder);
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

    try {
      await readFile(this.vectorFile, "utf8");
    } catch {
      await writeFile(this.vectorFile, JSON.stringify({ dims: 48, vectors: {} }, null, 2) + "\n", "utf8");
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
    await this.upsertVector(trace);
    return trace;
  }

  async catalog(limit = 24): Promise<LibraryTrace[]> {
    const rows = await this.load();
    return rows.slice(-limit).reverse();
  }

  async retrieve(query: string, limit = 8, kind?: LibraryKind): Promise<LibraryTrace[]> {
    const rows = await this.load();
    const scoped = kind ? rows.filter((r) => r.kind === kind) : rows;
    if (!query.trim()) return scoped.slice(-limit).reverse();

    const vectors = await this.loadVectors();
    const ranked = await this.retrieval.retrieve(query, scoped, vectors, limit);
    const map = new Map(scoped.map((s) => [s.id, s]));

    const out: LibraryTrace[] = [];
    for (const row of ranked) {
      const found = map.get(row.id);
      if (!found) continue;
      out.push({ ...found, score: row.score });
    }
    return out;
  }

  private async load(): Promise<LibraryTrace[]> {
    const raw = await readFile(this.file, "utf8");
    return JSON.parse(raw) as LibraryTrace[];
  }

  private async save(rows: LibraryTrace[]): Promise<void> {
    await writeFile(this.file, JSON.stringify(rows, null, 2) + "\n", "utf8");
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

  private async loadVectors(): Promise<VectorStore> {
    try {
      const raw = await readFile(this.vectorFile, "utf8");
      const parsed = JSON.parse(raw) as VectorStore;
      if (!parsed.vectors) parsed.vectors = {};
      parsed.dims ??= 48;
      return parsed;
    } catch {
      return { dims: 48, vectors: {} };
    }
  }

  private async saveVectors(vectors: VectorStore): Promise<void> {
    await writeFile(this.vectorFile, JSON.stringify(vectors, null, 2) + "\n", "utf8");
  }

  private async upsertVector(trace: LibraryTrace): Promise<void> {
    const vectors = await this.loadVectors();
    const embedded = await this.retrieval.embedDoc(trace);
    vectors.vectors[trace.id] = embedded.vector;
    vectors.dims = embedded.vector.length || vectors.dims;
    await this.saveVectors(vectors);
  }
}
