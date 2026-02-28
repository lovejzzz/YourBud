import { OpenClawLlm } from "./openclaw.js";
import { LlmMessage, OpenAILlm } from "./openai.js";

type Provider = "auto" | "openai" | "openclaw";

export class Brain {
  private readonly provider: Provider;
  private readonly openai = new OpenAILlm();
  private readonly openclaw = new OpenClawLlm();

  constructor(provider = (process.env.BRAIN_PROVIDER ?? "auto") as Provider) {
    this.provider = provider;
  }

  isEnabled(): boolean {
    if (this.provider === "openclaw") return true;
    if (this.provider === "openai") return this.openai.isEnabled();
    return this.openai.isEnabled() || true;
  }

  async complete(messages: LlmMessage[]): Promise<string> {
    if (this.provider === "openai") {
      return this.openai.complete(messages);
    }

    if (this.provider === "openclaw") {
      return this.openclaw.complete(messages);
    }

    if (this.openai.isEnabled()) {
      return this.openai.complete(messages);
    }

    return this.openclaw.complete(messages);
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
}
