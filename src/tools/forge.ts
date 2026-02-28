import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Tool } from "../core/types.js";

type ForgedKind = "text-stats" | "slugify";

interface ForgedToolSpec {
  id: string;
  name: string;
  description: string;
  kind: ForgedKind;
  enabled: boolean;
  createdAt: string;
  notes?: string;
}

interface Registry {
  tools: ForgedToolSpec[];
}

export class ToolForge {
  private readonly dir: string;
  private readonly registryPath: string;

  constructor(baseDir = process.cwd()) {
    this.dir = path.join(baseDir, ".yourbud-tools");
    this.registryPath = path.join(baseDir, ".memory", "tool-registry.json");
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await mkdir(path.dirname(this.registryPath), { recursive: true });
    try {
      await readFile(this.registryPath, "utf8");
    } catch {
      await this.saveRegistry({ tools: [] });
    }
  }

  async forgeSmallTool(name = "textstats", kind: ForgedKind = "text-stats", notes?: string): Promise<ForgedToolSpec> {
    const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const registry = await this.loadRegistry();

    if (registry.tools.some((t) => t.name === safeName)) {
      return registry.tools.find((t) => t.name === safeName)!;
    }

    const spec: ForgedToolSpec = {
      id: randomUUID(),
      name: safeName,
      description: kind === "text-stats" ? "Counts chars/words/lines from input text" : "Converts text to URL-friendly slug",
      kind,
      enabled: true,
      createdAt: new Date().toISOString(),
      notes
    };

    registry.tools.push(spec);
    await this.saveRegistry(registry);
    await writeFile(path.join(this.dir, `${safeName}.json`), JSON.stringify(spec, null, 2) + "\n", "utf8");
    return spec;
  }

  async list(): Promise<ForgedToolSpec[]> {
    const registry = await this.loadRegistry();
    return registry.tools;
  }

  async loadEnabledTools(): Promise<Tool[]> {
    const files = await readdir(this.dir).catch(() => []);
    const specs: ForgedToolSpec[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(path.join(this.dir, file), "utf8");
        const spec = JSON.parse(raw) as ForgedToolSpec;
        if (spec.enabled) specs.push(spec);
      } catch {
        // ignore invalid tool files
      }
    }

    return specs.map((spec) => this.toTool(spec));
  }

  private toTool(spec: ForgedToolSpec): Tool {
    if (spec.kind === "slugify") {
      return {
        name: spec.name,
        description: spec.description,
        run: async (input) =>
          input
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .trim()
            .replace(/\s+/g, "-")
      };
    }

    return {
      name: spec.name,
      description: spec.description,
      run: async (input) => {
        const chars = input.length;
        const words = input.trim() ? input.trim().split(/\s+/).length : 0;
        const lines = input ? input.split(/\n/).length : 0;
        return `chars=${chars}\nwords=${words}\nlines=${lines}`;
      }
    };
  }

  private async loadRegistry(): Promise<Registry> {
    const raw = await readFile(this.registryPath, "utf8");
    return JSON.parse(raw) as Registry;
  }

  private async saveRegistry(reg: Registry): Promise<void> {
    await writeFile(this.registryPath, JSON.stringify(reg, null, 2) + "\n", "utf8");
  }
}
