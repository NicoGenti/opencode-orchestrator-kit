import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

import plugin from "../plugin/src/index.ts";
import { loadPackagedCommand } from "../plugin/src/command";

const ROOT = join(import.meta.dir, "..");

/** Every packaged command: the exact registration order the plugin must use. */
const COMMAND_SOURCES = ["start-session", "recall", "research-mode"] as const;

/** Parsed source of one repo-root command file: frontmatter + trimmed body. */
function parseCommandSource(name: string): { description: string; agent: string; body: string } {
  const raw = readFileSync(join(ROOT, "command", `${name}.md`), "utf-8");
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) {
    throw new Error(`command/${name}.md has no frontmatter block`);
  }
  const value = (key: string): string => {
    const found = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(frontmatter[1])?.[1]?.trim();
    if (!found) {
      throw new Error(`command/${name}.md frontmatter has no "${key}"`);
    }
    return found;
  };
  return {
    description: value("description"),
    agent: value("agent"),
    body: raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim(),
  };
}

/** Recursively collect every SKILL.md path under a directory. */
function collectSkillFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectSkillFiles(fullPath));
    } else if (entry.name === "SKILL.md") {
      found.push(fullPath);
    }
  }
  return found;
}

/**
 * Skill ids derived from the repo-root kit sources (the relative directories
 * of every SKILL.md under skills/) — the source of truth the plugin must
 * mirror.
 */
const repoSkillIds: string[] = collectSkillFiles(join(ROOT, "skills"))
  .map((path) =>
    relative(join(ROOT, "skills"), dirname(path)).split(sep).join("/"),
  )
  .sort();

const expectedSources: Record<string, ReturnType<typeof parseCommandSource>> = {};
for (const name of COMMAND_SOURCES) {
  expectedSources[name] = parseCommandSource(name);
}

const commands: Array<Record<string, unknown>> = [];
const skills: Array<Record<string, unknown>> = [];
const tools: Array<Record<string, unknown>> = [];

/** Minimal agent editor: records nothing; skeleton test only guards shape. */
function noopAgentEditor() {
  const agents = new Map<string, Record<string, unknown>>();
  return {
    list: () => [...agents.keys()],
    get: (id: string) => agents.get(id),
    default: (id: string) => void agents.set(id, { id, mode: "primary" }),
    update: (id: string, fn: (agent: Record<string, unknown>) => void) => {
      const agent = agents.get(id) ?? { id, name: id, mode: "primary" };
      fn(agent);
      agents.set(id, agent);
    },
    remove: (id: string) => void agents.delete(id),
  };
}

const warned: string[] = [];
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  warned.push(args.map(String).join(" "));
};

// Run the plugin setup once against a recording mock context.
let setupPromise: unknown;
try {
  setupPromise = plugin.setup({
    options: {},
    model: {
      list: async () => [
        { providerID: "opencode-go", id: "gpt-5.6-luna" },
        { providerID: "opencode-go", id: "kimi-k3" },
        { providerID: "opencode-go", id: "minimax-m3" },
        { providerID: "ollama", id: "deepseek-v4.1-flash:cloud" },
      ],
    },
    agent: {
      transform: async (callback) => {
        await callback(noopAgentEditor());
      },
    },
    command: {
      transform: (callback) => {
        void callback({
          add: (entry: Record<string, unknown>) => {
            commands.push(entry);
          },
        });
      },
    },
    skill: {
      transform: (callback) => {
        void callback({
          add: (entry: Record<string, unknown>) => {
            skills.push(entry);
          },
        });
      },
    },
    tool: {
      transform: (callback: (editor: { add(): void }) => void) => {
        void callback({
          add: (entry: Record<string, unknown>) => {
            tools.push(entry);
          },
        });
      },
    },
  } as never);
} finally {
  console.warn = originalWarn;
}
await setupPromise;

if (warned.length !== 0) {
  throw new Error(
    `setup must not warn in the happy-path mock context: ${warned.join(" | ")}`,
  );
}

describe("opencode-orchestrator-kit plugin skeleton", () => {
  test("default export has the stable plugin id and a setup function", () => {
    expect(plugin.id).toBe("opencode-orchestrator-kit");
    expect(typeof plugin.setup).toBe("function");
  });

  test("registers exactly three commands in registration order", () => {
    expect(commands).toHaveLength(3);
    expect(commands.map((command) => command.name)).toEqual([...COMMAND_SOURCES]);
  });

  test("each command mirrors its repo-root source: agent/description/body", () => {
    for (let index = 0; index < COMMAND_SOURCES.length; index++) {
      const name = COMMAND_SOURCES[index];
      const expected = expectedSources[name];
      const command = commands[index];
      expect(command.name).toBe(name);
      expect(command.agent).toBe(expected.agent);
      expect(command.agent).toBe("orchestrator");
      expect(command.description).toBe(expected.description);
      expect(typeof command.execute).toBe("function");
      const execute = command.execute as () => string;
      expect(execute()).toBe(expected.body);
    }
  });

  test("loadPackagedCommand loads each packaged stem from its repo-root source", () => {
    for (const name of COMMAND_SOURCES) {
      const expected = expectedSources[name];
      const command = loadPackagedCommand(name);
      expect(command.name).toBe(name);
      expect(command.agent).toBe(expected.agent);
      expect(command.description).toBe(expected.description);
      expect(command.body).toBe(expected.body);
    }
  });

  test("loadPackagedCommand keeps close-session unpackaged (throws)", () => {
    expect(() => loadPackagedCommand("close-session")).toThrow();
  });

  test("registers all 9 kit skills with ids from the repo skill directories", () => {
    expect(repoSkillIds).toHaveLength(9);
    expect(skills).toHaveLength(9);
    expect(skills.map((skill) => skill.id).sort()).toEqual(repoSkillIds);
  });

  test("each skill add points at an existing packaged SKILL.md", () => {
    const packagedRoot = join(ROOT, "plugin", "assets", "skills");
    for (const skill of skills) {
      const path = skill.path as string;
      expect(typeof path).toBe("string");
      expect(isAbsolute(path)).toBe(true);
      expect(existsSync(path)).toBe(true);
      const packagedDir = relative(packagedRoot, dirname(path))
        .split(sep)
        .join("/");
      expect(packagedDir.startsWith("..")).toBe(false);
      expect(skill.id).toBe(packagedDir);
      expect(skill.name).toBe(skill.id);
    }
  });

  test("each skill content is exactly the packaged SKILL.md text", () => {
    for (const skill of skills) {
      expect(skill.content).toBe(readFileSync(skill.path as string, "utf-8"));
    }
  });

  test("registers exactly the two native tools with executable execute", () => {
    expect(tools).toHaveLength(2);
    expect(tools.map((tool) => tool.name)).toEqual(["plan_board", "comprehension_telemetry"]);
    for (const tool of tools) {
      expect(typeof tool.execute).toBe("function");
    }
  });
});
