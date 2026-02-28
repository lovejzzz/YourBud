import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { LlmMessage } from "./openai.js";

const execFile = promisify(execFileCb);

export interface OpenClawConfig {
  agent?: string;
  timeoutMs?: number;
  thinking?: "off" | "minimal" | "low" | "medium" | "high";
}

interface AgentJson {
  status?: string;
  result?: {
    payloads?: Array<{ text?: string | null }>;
    meta?: {
      agentMeta?: {
        model?: string;
        provider?: string;
      };
    };
  };
}

export class OpenClawLlm {
  private readonly agent: string;
  private readonly timeoutMs: number;
  private readonly thinking: OpenClawConfig["thinking"];
  private lastModel = "openclaw/unknown";

  constructor(config: OpenClawConfig = {}) {
    this.agent = config.agent ?? process.env.OPENCLAW_AGENT_ID ?? "main";
    this.timeoutMs = Number(process.env.OPENCLAW_TIMEOUT_MS ?? config.timeoutMs ?? 90000);
    this.thinking = config.thinking ?? (process.env.OPENCLAW_THINKING as OpenClawConfig["thinking"]) ?? "low";
  }

  isEnabled(): boolean {
    return true;
  }

  async complete(messages: LlmMessage[]): Promise<string> {
    const packedPrompt = this.packMessages(messages);
    const args = [
      "agent",
      "--agent",
      this.agent,
      "--message",
      packedPrompt,
      "--thinking",
      this.thinking ?? "low",
      "--json"
    ];

    const { stdout } = await execFile("openclaw", args, { timeout: this.timeoutMs, maxBuffer: 2 * 1024 * 1024 });

    const data = JSON.parse(stdout) as AgentJson;
    const text = data.result?.payloads?.find((p) => typeof p.text === "string")?.text?.trim();

    if (data.result?.meta?.agentMeta?.model) {
      this.lastModel = `${data.result.meta.agentMeta.provider ?? "openclaw"}/${data.result.meta.agentMeta.model}`;
    }

    if (!text) {
      throw new Error("OpenClaw returned empty response");
    }

    return text;
  }

  modelName(): string {
    return this.lastModel;
  }

  private packMessages(messages: LlmMessage[]): string {
    return [
      "You are the language brain for a local app called YourBud.",
      "Follow the SYSTEM instructions exactly.",
      "Return only final assistant content.",
      "",
      ...messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
    ].join("\n\n");
  }
}
