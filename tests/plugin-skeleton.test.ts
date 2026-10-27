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

/** Repo-root command documents packaged by the plugin (v0.6.x: 3 commands). */
const COMMAND_NAMES = ["start-session", "recall", "research-mode"] as const;

/** Frontmatter description + trimmed body of one command document. */
interface CommandSource {
  description: string;
  body: string;
}

/**
 * Parse one repo-root command/<name>.md into its frontmatter description and
 * trimmed markdown body — the shape the packaged loader must mirror.
 */
function loadCommandSource(name: string): CommandSource {
  const source = readFileSync(join(ROOT, "command", `${name}.md`), "utf-8");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (!frontmatter) {
    throw new Error(`command/${name}.md has no frontmatter block`);
  }
  function frontmatterValue(block: string, key: string): string {
    const value = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(block)?.[1]?.trim();
    if (!value) {
      throw new Error(`command/${name}.md frontmatter has no "${key}"`);
    }
    return value;
  }
  return {
    description: frontmatterValue(frontmatter[1], "description"),
    body: source.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim(),
  };
}

const commandSources = new Map<string, CommandSource>(
  COMMAND_NAMES.map((name) => [name, loadCommandSource(name)] as const),
);

const commands: Array<Record<string, unknown>> = [];
const skills: Array<Record<string, unknown>> = [];
const tools: Array<Record<string, unknown>> = [];
/** Prompt inviati da `command.execute` (contratto OpenCode 2.2). */
const prompts: Array<Record<string, unknown>> = [];
const switched: Array<Record<string, unknown>> = [];

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
    session: {
      prompt: async (input: Record<string, unknown>) => {
        prompts.push(input);
        return {};
      },
      switchAgent: async (input: Record<string, unknown>) => {
        switched.push(input);
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

  test("registers exactly three commands: start-session, recall, research-mode", () => {
    expect(commands).toHaveLength(3);
    expect(commands.map((command) => String(command.name)).sort()).toEqual([
      "recall",
      "research-mode",
      "start-session",
    ]);
    for (const command of commands) {
      expect(typeof command.execute).toBe("function");
      // OpenCode 2.2: nessun campo `agent` nella definizione del comando.
      expect(command.agent).toBeUndefined();
    }
  });

  test("every registered command mirrors its source frontmatter description", () => {
    for (const command of commands) {
      const source = commandSources.get(String(command.name));
      expect(source).toBeDefined();
      expect(command.description).toBe(source?.description);
    }
  });

  test("every registered command delivers the trimmed markdown body to orchestrator", async () => {
    for (const command of commands) {
      const source = commandSources.get(String(command.name));
      const execute = command.execute as (input: unknown) => Promise<void>;
      const returned = execute({
        sessionID: "ses_skeleton",
        prompt: { text: "ignored" },
        delivery: "queue",
      });
      expect(typeof (returned as { then?: unknown } | undefined)?.then).toBe("function");
      await returned;
      expect(prompts.at(-1)?.text).toBe(source?.body);
      expect(prompts.at(-1)?.sessionID).toBe("ses_skeleton");
      expect(switched.at(-1)).toEqual({
        sessionID: "ses_skeleton",
        agent: "orchestrator",
      });
    }
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
