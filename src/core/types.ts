export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
  ts: string;
}

export interface MemoryEntry {
  id: string;
  kind: "decision" | "todo" | "fact" | "note" | "reflection";
  text: string;
  ts: string;
  score?: number;
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

export type AgentRole = "researcher" | "builder" | "critic";

export interface AgentCard {
  role: AgentRole;
  task: string;
  output: string;
}
