export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

export class OpenAILlm {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: LlmConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    this.baseUrl = (config.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
    this.model = config.model ?? process.env.LLM_MODEL ?? "openai-codex/gpt-5.3-codex";
  }

  isEnabled(): boolean {
    return Boolean(this.apiKey);
  }

  async complete(messages: LlmMessage[]): Promise<string> {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY missing");
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.4
      })
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 400)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("LLM returned empty content");
    }

    return text;
  }

  modelName(): string {
    return this.model;
  }
}
