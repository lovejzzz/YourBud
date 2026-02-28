import { Tool } from "./types.js";

export interface PlanStep {
  kind: "tool" | "memory" | "reply";
  payload: string;
}

export function naivePlan(input: string, tools: Tool[]): PlanStep[] {
  const t = input.trim();
  const [head, ...rest] = t.split(" ");
  const command = head.toLowerCase();
  const arg = rest.join(" ");

  const tool = tools.find((x) => x.name === command);
  if (tool) {
    return [{ kind: "tool", payload: `${command} ${arg}`.trim() }];
  }

  if (command === "remember") {
    return [{ kind: "memory", payload: arg }];
  }

  return [{ kind: "reply", payload: t }];
}
