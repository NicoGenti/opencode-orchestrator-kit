/**
 * The frontmatter `description:` is the only part of an agent file that every
 * request pays for: the roster shows it to the primary model for routing. So it
 * stays short, keeps the terms that distinguish the role and, where two agents
 * compete for the same work, states what it is NOT for. The detail lives in
 * `agents/orchestrator.md` (`## Agent Routing`), not here.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseFrontmatterScalar } from "../plugin/src/frontmatter-map.ts";

const ROOT = join(import.meta.dir, "..");
const MAX_CHARS = 260;
const MAX_TOTAL = 3_300;

const FILES = [
  "agents/build-helper.md",
  "agents/code-reviewer.md",
  "agents/comprehension-coach.md",
  "agents/deploy-helper.md",
  "agents/developer-fixer.md",
  "agents/explorer.md",
  "agents/librarian.md",
  "agents/npm-helper.md",
  "agents/oracle.md",
  "agents/orchestrator-quick.md",
  "agents/orchestrator.md",
  "agents/plan-writer.md",
  "agents/planner.md",
  "agents/profiler.md",
  "agents/security.md",
  "agents/test-engineer.md",
  "extras/pc-doctor.md",
  "extras/writer.md",
];

const id = (file: string) =>
  file.replace(/^(agents|extras)\//, "").replace(/\.md$/, "");

const DESCRIPTIONS = new Map<string, string>(
  FILES.map((file) => {
    const value = parseFrontmatterScalar(
      readFileSync(join(ROOT, file), "utf-8"),
      "description",
    );
    if (!value) throw new Error(`${file}: description missing`);
    return [file, value.replace(/\s+/g, " ").trim()] as const;
  }),
);

/** Routing terms that must survive any compression. */
const REQUIRED: Record<string, string[]> = {
  profiler: ["PROJECT-PROFILE.md", "repo map"],
  explorer: ["symbol"],
  oracle: ["architecture"],
  planner: ["9-section", "plan/draft/"],
  "developer-fixer": ["TDD", "commit"],
  "test-engineer": ["coverage", "reproduc"],
  "code-reviewer": ["Read-only"],
  security: ["threat", "severity"],
  "comprehension-coach": ["CHALLENGE", "PREDICTION"],
  "build-helper": ["TypeScript", "native modules"],
  "npm-helper": ["peer-dep", "local dev folder"],
  "deploy-helper": ["GitHub Actions", "PROJECT-PROFILE.md"],
  "plan-writer": ["plan_board", "plan-board.py"],
  librarian: ["documentation", "Read-only"],
  "pc-doctor": ["PATH"],
  writer: ["READMEs"],
  orchestrator: ["specialist"],
  "orchestrator-quick": ["no plan board"],
};

/** Pairs that compete for the same work: without a negative clause the model
 *  picks at random (build/npm/deploy, review/security, profiler/librarian,
 *  fixer/test-engineer). */
const DISCRIMINATED = [
  "agents/build-helper.md",
  "agents/npm-helper.md",
  "agents/deploy-helper.md",
  "agents/code-reviewer.md",
  "agents/security.md",
  "agents/profiler.md",
  "agents/librarian.md",
  "agents/developer-fixer.md",
  "agents/test-engineer.md",
];

const FILLER = [
  "systematic",
  "comprehensive",
  "robust",
  "seamless",
  "world-class",
  "best practices",
  "leverage",
];

describe("agent descriptions", () => {
  for (const [file, text] of DESCRIPTIONS) {
    test(`${id(file)}: at most ${MAX_CHARS} characters`, () => {
      expect(text.length).toBeLessThanOrEqual(MAX_CHARS);
    });

    test(`${id(file)}: keeps its routing terms`, () => {
      for (const term of REQUIRED[id(file)] ?? []) {
        expect(text.toLowerCase()).toContain(term.toLowerCase());
      }
    });

    test(`${id(file)}: no sentence glued to the next word`, () => {
      expect(text).not.toMatch(/[a-z]\.[A-Z]/);
    });

    test(`${id(file)}: no marketing filler`, () => {
      for (const word of FILLER) {
        expect(text.toLowerCase()).not.toContain(word);
      }
    });
  }

  test(`total stays under ${MAX_TOTAL} characters`, () => {
    const total = [...DESCRIPTIONS.values()].reduce((n, t) => n + t.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL);
  });

  for (const file of DISCRIMINATED) {
    test(`${id(file)}: states what it is not for`, () => {
      expect(DESCRIPTIONS.get(file)).toMatch(/Not for\b/);
    });
  }
});
