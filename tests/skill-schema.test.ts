import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

/**
 * Schema-validation tests for skills/<name>/SKILL.md frontmatter.
 *
 * Skill files use a simpler two-key frontmatter (`name`, `description`) than
 * agent files — see tests/agent-schema.test.ts for the richer agent schema.
 *
 * Recursively scans the entire skills/ tree (including skills/examples/) so
 * that example skills stored under subdirectories are also validated.
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

/**
 * Recursively collect all SKILL.md file paths under the skills/ tree.
 * The skill name (used for the "name" frontmatter assertion) is derived from
 * the immediate parent directory of each SKILL.md.
 */
function collectSkillFiles(dir: string): Array<{ path: string; skillName: string }> {
  const results: Array<{ path: string; skillName: string }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectSkillFiles(fullPath));
    } else if (entry.name === "SKILL.md") {
      results.push({ path: fullPath, skillName: basename(dir) });
    }
  }
  return results;
}

const skillFiles = collectSkillFiles(SKILLS_DIR);

describe("skill frontmatter schema", () => {
  test("skills/ directory contains skill definitions", () => {
    expect(skillFiles.length).toBeGreaterThan(0);
  });

  for (const { path, skillName } of skillFiles) {
    describe(`${skillName}/SKILL.md`, () => {
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
        expect(topLevelValue(fm, "name")).toBe(skillName);
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
