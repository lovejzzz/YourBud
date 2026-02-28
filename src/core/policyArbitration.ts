export interface PolicyCandidate {
  text: string;
  confidence?: number;
  source?: string;
}

export interface ResolvedPolicy {
  text: string;
  confidence: number;
  support: number;
  conflictsWith: string[];
  provenance: string[];
}

export interface ArbitrationResult {
  resolved: ResolvedPolicy[];
  conflicts: Array<{ a: string; b: string; severity: number }>;
}

const ANTONYM_PAIRS: Array<[string, string]> = [
  ["always", "never"],
  ["verbose", "concise"],
  ["long", "short"],
  ["ask", "avoid"],
  ["confirm", "skip"],
  ["detailed", "brief"]
];

export class PolicyArbitrator {
  resolve(candidates: PolicyCandidate[], limit = 12): ArbitrationResult {
    const normalized = candidates
      .map((c) => ({
        ...c,
        text: this.normalize(c.text),
        confidence: this.clamp(c.confidence ?? 0.55, 0.05, 0.99)
      }))
      .filter((c) => c.text.length > 0);

    const merged: ResolvedPolicy[] = [];
    const conflicts: Array<{ a: string; b: string; severity: number }> = [];

    for (const candidate of normalized) {
      const similar = merged.find(
        (m) => this.similarity(m.text, candidate.text) >= 0.64 && this.conflictSeverity(m.text, candidate.text) < 0.35
      );
      if (similar) {
        similar.support += 1;
        similar.confidence = this.clamp(similar.confidence + candidate.confidence * 0.22, 0.05, 0.99);
        if (candidate.source) similar.provenance.push(candidate.source);
        if (candidate.text.split(" ").length < similar.text.split(" ").length + 3) {
          similar.text = candidate.text;
        }
        continue;
      }

      merged.push({
        text: candidate.text,
        confidence: candidate.confidence,
        support: 1,
        conflictsWith: [],
        provenance: candidate.source ? [candidate.source] : []
      });
    }

    for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        const a = merged[i];
        const b = merged[j];
        const severity = this.conflictSeverity(a.text, b.text);
        if (severity <= 0) continue;

        a.conflictsWith.push(b.text);
        b.conflictsWith.push(a.text);
        conflicts.push({ a: a.text, b: b.text, severity });

        if (a.confidence >= b.confidence) {
          b.confidence = this.clamp(b.confidence - 0.18 * severity, 0.05, 0.99);
        } else {
          a.confidence = this.clamp(a.confidence - 0.18 * severity, 0.05, 0.99);
        }
      }
    }

    const resolved = merged
      .map((m) => ({ ...m, confidence: this.clamp(m.confidence + m.support * 0.04, 0.05, 0.99) }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    return { resolved, conflicts };
  }

  private normalize(text: string): string {
    return text
      .trim()
      .replace(/^[-*\d.\s]+/, "")
      .replace(/\s+/g, " ")
      .replace(/[.。]+$/, "")
      .slice(0, 140);
  }

  private conflictSeverity(a: string, b: string): number {
    const aTerms = this.terms(a);
    const bTerms = this.terms(b);
    if (!aTerms.size || !bTerms.size) return 0;

    let severity = 0;
    const overlap = [...aTerms].filter((t) => bTerms.has(t)).length;
    const sharedRatio = overlap / Math.max(1, Math.min(aTerms.size, bTerms.size));

    if (sharedRatio < 0.2) return 0;

    if (this.hasNegationConflict(aTerms, bTerms)) severity += 0.6;
    if (this.hasAntonymConflict(aTerms, bTerms)) severity += 0.7;

    return Math.min(1, severity);
  }

  private hasNegationConflict(aTerms: Set<string>, bTerms: Set<string>): boolean {
    const neg = new Set(["no", "not", "never", "avoid", "without", "skip"]);
    const aNeg = [...aTerms].some((t) => neg.has(t));
    const bNeg = [...bTerms].some((t) => neg.has(t));
    return aNeg !== bNeg;
  }

  private hasAntonymConflict(aTerms: Set<string>, bTerms: Set<string>): boolean {
    return ANTONYM_PAIRS.some(([x, y]) =>
      (aTerms.has(x) && bTerms.has(y)) || (aTerms.has(y) && bTerms.has(x))
    );
  }

  private similarity(a: string, b: string): number {
    const aTerms = this.terms(a);
    const bTerms = this.terms(b);
    const overlap = [...aTerms].filter((t) => bTerms.has(t)).length;
    return overlap / Math.max(1, Math.max(aTerms.size, bTerms.size));
  }

  private terms(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3)
    );
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Number(value.toFixed(3))));
  }
}
