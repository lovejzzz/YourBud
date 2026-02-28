import { AgentCard, AgentRole } from "./types.js";

function runRole(role: AgentRole, task: string, upstream?: string): AgentCard {
  if (role === "researcher") {
    return {
      role,
      task,
      output: [
        "Findings:",
        `- Objective: ${task}`,
        "- Constraints: speed, clarity, safe defaults",
        "- Suggested approach: implement smallest useful vertical slice first"
      ].join("\n")
    };
  }

  if (role === "builder") {
    return {
      role,
      task,
      output: [
        "Build plan:",
        upstream ? upstream : "- no upstream context",
        "- Deliver concrete files + runnable commands",
        "- Keep architecture modular"
      ].join("\n")
    };
  }

  return {
    role,
    task,
    output: [
      "Critique:",
      "- What could break? permissions, long-running tasks, memory bloat",
      "- Add diagnostics + logging",
      "- Keep fallback path if any subsystem fails"
    ].join("\n")
  };
}

export function runMultiAgent(task: string): AgentCard[] {
  const researcher = runRole("researcher", task);
  const builder = runRole("builder", task, researcher.output);
  const critic = runRole("critic", task, builder.output);
  return [researcher, builder, critic];
}
