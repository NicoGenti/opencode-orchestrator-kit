import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseFrontmatterMap,
  type FrontmatterMap,
} from "../plugin/src/frontmatter-map.ts";

/**
 * Every agent's `permission.skill` allowlist (agents/*.md, extras/*.md, and
 * the plugin/assets mirrors) may name only a skill that ships in skills/
 * — the `name:` frontmatter of each SKILL.md, including skills/examples/ —
 * plus the `*` catch-all and glob patterns such as `web-*`.
 */

const ROOT = join(import.meta.dir, "..");

const AGENT_DIRS = [
  "agents",
  "plugin/assets/agents",
  "extras",
  "plugin/assets/extras",
] as const;

function frontmatterOf(relPath: string): string {
  const raw = readFileSync(join(ROOT, relPath), "utf-8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`${relPath} has no frontmatter`);
  return match[1];
}

function skillMapOf(relPath: string): FrontmatterMap | undefined {
  const permission = parseFrontmatterMap(frontmatterOf(relPath), "permission");
  if (!permission || permission.skill === undefined) return undefined;
  const skill = permission.skill;
  if (typeof skill !== "object") {
    throw new Error(`${relPath}: permission.skill must be a map`);
  }
  return skill;
}

function collectShippedSkillNames(): Set<string> {
  const names = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name !== "SKILL.md") continue;
      const raw = readFileSync(full, "utf-8");
      const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!fm) throw new Error(`${full} has no frontmatter`);
      const name = fm[1].match(/^name:\s*(.+)\s*$/m);
      if (!name) throw new Error(`${full} has no name`);
      names.add(name[1].trim().replace(/^["']|["']$/g, ""));
    }
  };
  walk(join(ROOT, "skills"));
  return names;
}

/** `web-*` is a glob. The bare `*` catch-all is not a skill-name glob. */
function isGlobPattern(name: string): boolean {
  return name !== "*" && (name.includes("*") || name.includes("?"));
}

/**
 * Skill names granted with anything other than `deny` that are neither a
 * shipped skill nor a glob pattern.
 */
function unshippedAllows(
  skill: FrontmatterMap,
  shipped: ReadonlySet<string>,
): string[] {
  const unknown: string[] = [];
  for (const [name, effect] of Object.entries(skill)) {
    if (name === "*" || effect === "deny" || isGlobPattern(name)) continue;
    if (!shipped.has(name)) unknown.push(name);
  }
  return unknown;
}

function agentRelPaths(): string[] {
  const out: string[] = [];
  for (const dir of AGENT_DIRS) {
    for (const name of readdirSync(join(ROOT, dir))
      .filter((file) => file.endsWith(".md"))
      .sort()) {
      out.push(`${dir}/${name}`);
    }
  }
  return out;
}

const shipped = collectShippedSkillNames();

describe("shipped skill names", () => {
  test("skills/ frontmatter includes the example conventions and the kit skills", () => {
    for (const name of [
      "angular-patterns",
      "dotnet-conventions",
      "python-conventions",
      "build-debug",
      "npm-debug",
      "dev-cleanup",
      "structural-search",
      "comprehension-workflow",
      "github-actions-cicd",
    ]) {
      expect(shipped.has(name)).toBe(true);
    }
  });
});

describe("agent skill allowlists name only shipped skills", () => {
  test('both copies of every agent start with "*": deny and allow no unknown skill', () => {
    const problems: string[] = [];
    for (const rel of agentRelPaths()) {
      const skill = skillMapOf(rel);
      if (!skill) continue;
      const keys = Object.keys(skill);
      if (keys[0] !== "*" || skill["*"] !== "deny") {
        problems.push(
          `${rel}: skill allowlist must start with "*": deny (got ${JSON.stringify(keys)})`,
        );
      }
      for (const name of unshippedAllows(skill, shipped)) {
        problems.push(
          `${rel}: allows "${name}", which is not a shipped skill and is not a glob`,
        );
      }
    }
    expect(problems).toEqual([]);
  });

  test("developer-fixer tools.skill and permission.skill are distinct keys", () => {
    for (const rel of [
      "agents/developer-fixer.md",
      "plugin/assets/agents/developer-fixer.md",
    ]) {
      const fm = frontmatterOf(rel);
      expect(parseFrontmatterMap(fm, "tools")?.skill).toBe(true);
      const skill = parseFrontmatterMap(fm, "permission")?.skill;
      expect(typeof skill).toBe("object");
      expect(skill).not.toBe(true);
    }
  });

  const pinned: Array<{
    file: string;
    dirs: readonly string[];
    keys: string[];
  }> = [
    {
      file: "developer-fixer.md",
      dirs: ["agents", "plugin/assets/agents"],
      keys: [
        "*",
        "build-debug",
        "npm-debug",
        "dev-cleanup",
        "structural-search",
        "angular-patterns",
        "dotnet-conventions",
        "python-conventions",
        "web-*",
      ],
    },
    {
      file: "orchestrator.md",
      dirs: ["agents", "plugin/assets/agents"],
      keys: ["*", "comprehension-workflow", "web-*"],
    },
    {
      file: "code-reviewer.md",
      dirs: ["agents", "plugin/assets/agents"],
      keys: [
        "*",
        "angular-patterns",
        "dotnet-conventions",
        "python-conventions",
        "web-*",
      ],
    },
    {
      file: "oracle.md",
      dirs: ["agents", "plugin/assets/agents"],
      keys: [
        "*",
        "angular-patterns",
        "dotnet-conventions",
        "python-conventions",
        "web-*",
      ],
    },
    {
      file: "security.md",
      dirs: ["agents", "plugin/assets/agents"],
      keys: [
        "*",
        "angular-patterns",
        "dotnet-conventions",
        "python-conventions",
      ],
    },
    {
      file: "test-engineer.md",
      dirs: ["agents", "plugin/assets/agents"],
      keys: [
        "*",
        "angular-patterns",
        "dotnet-conventions",
        "python-conventions",
      ],
    },
    {
      file: "deploy-helper.md",
      dirs: ["agents", "plugin/assets/agents"],
      keys: ["*", "github-actions-cicd", "npm-debug", "dev-cleanup", "web-*"],
    },
    {
      file: "writer.md",
      dirs: ["extras", "plugin/assets/extras"],
      keys: ["*"],
    },
    {
      file: "comprehension-coach.md",
      dirs: ["agents", "plugin/assets/agents"],
      keys: ["*"],
    },
    {
      file: "plan-writer.md",
      dirs: ["agents", "plugin/assets/agents"],
      keys: ["*"],
    },
    {
      file: "pc-doctor.md",
      dirs: ["extras", "plugin/assets/extras"],
      keys: ["*", "dev-cleanup"],
    },
  ];

  for (const { file, dirs, keys } of pinned) {
    for (const dir of dirs) {
      test(`${dir}/${file} skill allowlist`, () => {
        expect(Object.keys(skillMapOf(`${dir}/${file}`) ?? {})).toEqual(keys);
      });
    }
  }
});

describe("skill allowlist check — negative case (proves the check has teeth)", () => {
  test("an allow of a skill that does not ship is reported", () => {
    expect(
      unshippedAllows(
        {
          "*": "deny",
          "build-debug": "allow",
          "web-*": "allow",
          nope: "allow",
        },
        shipped,
      ),
    ).toEqual(["nope"]);
  });

  test("deny entries, the * catch-all, and globs are not required to ship", () => {
    expect(
      unshippedAllows(
        { "*": "deny", ghost: "deny", "web-*": "allow", "build-debug": "ask" },
        shipped,
      ),
    ).toEqual([]);
  });

  test("a specific web-kit skill name is not a glob and does not ship here", () => {
    expect(isGlobPattern("web-*")).toBe(true);
    expect(isGlobPattern("web-theme")).toBe(false);
    expect(shipped.has("web-theme")).toBe(false);
    expect(
      unshippedAllows({ "*": "deny", "web-theme": "allow" }, shipped),
    ).toEqual(["web-theme"]);
  });
});
