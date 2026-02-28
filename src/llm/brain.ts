import { OpenClawLlm } from "./openclaw.js";
import { LlmMessage, OpenAILlm } from "./openai.js";

type Provider = "auto" | "openai" | "openclaw";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class Brain {
  private readonly provider: Provider;
  private readonly openai = new OpenAILlm();
  private readonly openclaw = new OpenClawLlm();
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;

  constructor(provider = (process.env.BRAIN_PROVIDER ?? "auto") as Provider) {
    this.provider = provider;
    this.maxRetries = Math.max(0, Number(process.env.BRAIN_RETRY_MAX ?? 2));
    this.retryBaseMs = Math.max(50, Number(process.env.BRAIN_RETRY_BASE_MS ?? 350));
  }

  isEnabled(): boolean {
    if (this.provider === "openclaw") return true;
    if (this.provider === "openai") return this.openai.isEnabled();
    return this.openai.isEnabled() || true;
  }

  async complete(messages: LlmMessage[]): Promise<string> {
    if (this.provider === "openai") {
      return this.withRetry(() => this.openai.complete(messages), "openai");
    }

    if (this.provider === "openclaw") {
      return this.withRetry(() => this.openclaw.complete(messages), "openclaw");
    }

    if (this.openai.isEnabled()) {
      try {
        return await this.withRetry(() => this.openai.complete(messages), "openai");
      } catch {
        return this.withRetry(() => this.openclaw.complete(messages), "openclaw");
      }
    }

    return this.withRetry(() => this.openclaw.complete(messages), "openclaw");
  }

  modelName(): string {
    if (this.provider === "openai") return this.openai.modelName();
    if (this.provider === "openclaw") return this.openclaw.modelName();
    return this.openai.isEnabled() ? this.openai.modelName() : this.openclaw.modelName();
  }

  providerName(): string {
    if (this.provider === "auto") {
      return this.openai.isEnabled() ? "openai" : "openclaw";
    }
    return this.provider;
  }

  private async withRetry(run: () => Promise<string>, provider: string): Promise<string> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        lastError = error;
        if (attempt >= this.maxRetries || !this.shouldRetry(error)) {
          break;
        }

        const backoff = this.retryBaseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 120);
        await sleep(backoff);
      }
    }

    const msg = lastError instanceof Error ? lastError.message : String(lastError ?? "unknown error");
    throw new Error(`Brain ${provider} failed after retries: ${msg}`);
  }

  private shouldRetry(error: unknown): boolean {
    const msg = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("429") ||
      msg.includes("rate") ||
      msg.includes("econn") ||
      msg.includes("socket") ||
      msg.includes("temporary") ||
      msg.includes("503") ||
      msg.includes("502")
    );
  }
}
