export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
  ts: string;
}

export interface MemoryEntry {
  id: string;
  kind: "decision" | "todo" | "fact" | "note";
  text: string;
  ts: string;
  tags?: string[];
}

export interface ToolContext {
  now: Date;
}

export interface Tool {
  name: string;
  description: string;
  run(input: string, ctx: ToolContext): Promise<string>;
}

export interface AgentConfig {
  name: string;
  mission: string;
  maxTurnsPerRun: number;
}
