import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Schema-validation tests for skills/<name>/SKILL.md frontmatter.
 *
 * Skill files use a simpler two-key frontmatter (`name`, `description`) than
 * agent files — see tests/agent-schema.test.ts for the richer agent schema.
 */

const SKILLS_DIR = join(import.meta.dir, "..", "skills");
const REQUIRED_KEYS = ["name", "description"] as const;

function extractFrontmatter(raw: string): string {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("No YAML frontmatter block found (expected leading '---' ... '---').");
  }
  return match[1];
}

function hasTopLevelKey(frontmatter: string, key: string): boolean {
  return new RegExp(`^${key}:`, "m").test(frontmatter);
}

function topLevelValue(frontmatter: string, key: string): string | null {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return match ? match[1].trim() : null;
}

const skillDirs = readdirSync(SKILLS_DIR).filter((name) =>
  statSync(join(SKILLS_DIR, name)).isDirectory(),
);

describe("skill frontmatter schema", () => {
  test("skills/ directory contains skill definitions", () => {
    expect(skillDirs.length).toBeGreaterThan(0);
  });

  for (const dir of skillDirs) {
    describe(`${dir}/SKILL.md`, () => {
      const path = join(SKILLS_DIR, dir, "SKILL.md");
      const raw = readFileSync(path, "utf-8");

      test("has a parseable frontmatter block", () => {
        const fm = extractFrontmatter(raw);
        expect(fm.length).toBeGreaterThan(0);
      });

      for (const key of REQUIRED_KEYS) {
        test(`declares required key "${key}"`, () => {
          const fm = extractFrontmatter(raw);
          expect(hasTopLevelKey(fm, key)).toBe(true);
        });
      }

      test("\"name\" matches the containing folder name", () => {
        const fm = extractFrontmatter(raw);
        expect(topLevelValue(fm, "name")).toBe(dir);
      });

      test("has content beyond the frontmatter block", () => {
        const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim();
        expect(body.length).toBeGreaterThan(0);
      });
    });
  }
});

describe("skill frontmatter schema — negative case (proves the check has teeth)", () => {
  test("a fixture missing \"name\" fails validation", () => {
    const badFixture = ["---", "description: a skill with no name", "---", "", "# Body"].join("\n");
    const fm = extractFrontmatter(badFixture);
    expect(hasTopLevelKey(fm, "name")).toBe(false);
  });

  test("a fixture whose name does not match its folder would fail the folder-match check", () => {
    const fixture = ["---", "name: wrong-name", "description: mismatched", "---", "", "# Body"].join("\n");
    const fm = extractFrontmatter(fixture);
    expect(topLevelValue(fm, "name")).not.toBe("expected-folder-name");
  });
});
