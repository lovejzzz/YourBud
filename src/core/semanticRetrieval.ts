import { createHash } from "node:crypto";

export interface RetrievalDoc {
  id: string;
  title: string;
  text: string;
  tags: string[];
  ts: string;
}

export interface RetrievalResult {
  id: string;
  score: number;
  lexicalScore: number;
  semanticScore: number;
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

export interface VectorStore {
  dims: number;
  vectors: Record<string, number[]>;
}

export class SemanticRetrieval {
  constructor(private readonly provider?: EmbeddingProvider) {}

  async retrieve(query: string, docs: RetrievalDoc[], vectors: VectorStore, limit = 8): Promise<RetrievalResult[]> {
    const lexical = this.lexicalRetrieve(query, docs, limit * 3);
    const q = query.trim();
    if (!q) return lexical.slice(0, limit);

    const semantic = await this.semanticScores(q, docs, vectors);
    const byId = new Map<string, RetrievalResult>();

    for (const row of lexical) byId.set(row.id, row);
    for (const row of semantic) {
      const prev = byId.get(row.id);
      if (!prev) byId.set(row.id, row);
      else {
        byId.set(row.id, {
          ...prev,
          semanticScore: row.semanticScore,
          score: prev.lexicalScore * 0.62 + row.semanticScore * 0.38
        });
      }
    }

    return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  lexicalRetrieve(query: string, docs: RetrievalDoc[], limit = 8): RetrievalResult[] {
    const qTerms = this.tokenize(query);
    return docs
      .map((doc) => {
        const titleHits = this.hits(this.tokenize(doc.title), qTerms) * 2.4;
        const textHits = this.hits(this.tokenize(doc.text), qTerms) * 1.4;
        const tagHits = this.hits(this.tokenize(doc.tags.join(" ")), qTerms) * 2;
        const coverage = this.coverage(this.tokenize(`${doc.title} ${doc.text} ${doc.tags.join(" ")}`), qTerms) * 1.8;
        const recency = new Date(doc.ts).getTime() / 1e13;
        const lexicalScore = titleHits + textHits + tagHits + coverage + recency;
        return {
          id: doc.id,
          score: lexicalScore,
          lexicalScore,
          semanticScore: 0
        };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async embedDoc(doc: Pick<RetrievalDoc, "id" | "title" | "text" | "tags">): Promise<{ id: string; vector: number[] }> {
    const text = `${doc.title}\n${doc.text}\n${doc.tags.join(" ")}`;
    const vector = this.provider ? (await this.provider.embed([text]))[0] : this.lexicalVector(text);
    return { id: doc.id, vector };
  }

  async semanticScores(query: string, docs: RetrievalDoc[], vectors: VectorStore): Promise<RetrievalResult[]> {
    if (!docs.length) return [];
    const qVec = this.provider ? (await this.provider.embed([query]))[0] : this.lexicalVector(query, vectors.dims || 48);

    return docs
      .map((doc) => {
        const v = vectors.vectors[doc.id];
        if (!v || !v.length) return null;
        const semanticScore = this.cosine(qVec, v);
        return { id: doc.id, score: semanticScore, lexicalScore: 0, semanticScore };
      })
      .filter((row): row is RetrievalResult => Boolean(row))
      .sort((a, b) => b.semanticScore - a.semanticScore)
      .slice(0, 24);
  }

  lexicalVector(text: string, dims = 48): number[] {
    const vec = new Array<number>(dims).fill(0);
    const tokens = this.tokenize(text);
    if (!tokens.length) return vec;

    for (const token of tokens) {
      const h = this.hash(token);
      const idx = h % dims;
      vec[idx] += 1;
    }

    const norm = Math.sqrt(vec.reduce((acc, n) => acc + n * n, 0)) || 1;
    return vec.map((n) => Number((n / norm).toFixed(6)));
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2);
  }

  private hits(source: string[], q: string[]): number {
    const set = new Set(source);
    return q.reduce((acc, t) => acc + (set.has(t) ? 1 : 0), 0);
  }

  private coverage(source: string[], q: string[]): number {
    const set = new Set(source);
    const n = q.filter((t) => set.has(t)).length;
    return n / Math.max(1, q.length);
  }

  private cosine(a: number[], b: number[]): number {
    const d = Math.min(a.length, b.length);
    let dot = 0;
    let a2 = 0;
    let b2 = 0;
    for (let i = 0; i < d; i += 1) {
      dot += a[i] * b[i];
      a2 += a[i] * a[i];
      b2 += b[i] * b[i];
    }
    return dot / (Math.sqrt(a2) * Math.sqrt(b2) || 1);
  }

  private hash(token: string): number {
    const h = createHash("sha1").update(token).digest("hex").slice(0, 8);
    return Number.parseInt(h, 16);
  }
}
