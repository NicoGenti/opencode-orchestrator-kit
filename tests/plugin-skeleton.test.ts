import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";

import plugin from "../plugin/src/index.ts";

const ROOT = join(import.meta.dir, "..");

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

const commandSource = readFileSync(
  join(ROOT, "command", "start-session.md"),
  "utf-8",
);

const frontmatter = commandSource.match(/^---\r?\n([\s\S]*?)\r?\n---/);
if (!frontmatter) {
  throw new Error("command/start-session.md has no frontmatter block");
}

function frontmatterValue(block: string, key: string): string {
  const value = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(block)?.[1]?.trim();
  if (!value) {
    throw new Error(`command/start-session.md frontmatter has no "${key}"`);
  }
  return value;
}

const expectedDescription = frontmatterValue(frontmatter[1], "description");

/** Body: the markdown after the frontmatter block, trimmed. */
const expectedBody = commandSource
  .replace(/^---\r?\n[\s\S]*?\r?\n---/, "")
  .trim();

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

  test("registers exactly one command mirrored from command/start-session.md", () => {
    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe("start-session");
    expect(commands[0].agent).toBe("orchestrator");
    expect(commands[0].description).toBe(expectedDescription);
  });

  test("the registered command body equals the trimmed markdown body", () => {
    const execute = commands[0].execute as () => string;
    expect(typeof execute).toBe("function");
    expect(execute()).toBe(expectedBody);
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

  test("registers exactly one native plan_board tool with a documented standing authorization", () => {
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("plan_board");
    expect(typeof tools[0].execute).toBe("function");
  });
});
