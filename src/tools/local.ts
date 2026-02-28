import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { Tool } from "../core/types.js";

const exec = promisify(execCb);

export function createLocalTools(): Tool[] {
  return [
    {
      name: "echo",
      description: "Echoes text back. Usage: echo <text>",
      run: async (input) => input
    },
    {
      name: "shell",
      description: "Runs a local shell command. Usage: shell <command>",
      run: async (input) => {
        const { stdout, stderr } = await exec(input, { timeout: 12_000, maxBuffer: 1024 * 1024 });
        return [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").slice(0, 4000) || "(no output)";
      }
    },
    {
      name: "time",
      description: "Shows local time.",
      run: async (_input, ctx) => ctx.now.toString()
    }
  ];
}
