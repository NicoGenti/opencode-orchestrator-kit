import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Schema-validation tests for agents/*.md and extras/*.md frontmatter.
 *
 * Scope note (see issue #6 and its scoping comment): agent files are prompt
 * specs consumed by OpenCode at runtime, not executable code, so this suite
 * validates structure (required frontmatter keys, JSON-well-formedness of
 * inline tools/permission blocks) rather than routing *behavior*.
 *
 * `tools` is intentionally NOT in REQUIRED_KEYS: several agents (security,
 * writer, pc-doctor, npm-helper, build-helper, deploy-helper) omit it
 * entirely and rely on the default toolset, only declaring `tools` when
 * overriding it (e.g. orchestrator, profiler, explorer, test-engineer).
 *
 * The pc-doctor and writer specialists live under `extras/` rather than
 * `agents/`; this suite scans both directories and tags each file with the
 * directory it came from for clearer error messages.
 */

const REPO_ROOT = join(import.meta.dir, "..");
const AGENTS_DIR = join(REPO_ROOT, "agents");
const EXTRAS_DIR = join(REPO_ROOT, "extras");
const REQUIRED_KEYS = ["description", "mode", "model", "permission"] as const;
const OPTIONAL_JSON_KEYS = ["tools", "permission"] as const;

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

/** Returns the inline JSON string for `key:` when the value is single-line JSON
 * (e.g. `tools: {"webfetch":true}`), or null when the value is a multi-line
 * YAML block (e.g. `tools:\n  read: true`) or absent entirely. */
function inlineJsonValue(frontmatter: string, key: string): string | null {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(\\{.*\\})\\s*$`, "m"));
  return match ? match[1] : null;
}

const agentFiles = [
  ...readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md")).map((f) => ({ dir: "agents", file: f })),
  ...(existsSync(EXTRAS_DIR) ? readdirSync(EXTRAS_DIR).filter((f) => f.endsWith(".md")).map((f) => ({ dir: "extras", file: f })) : []),
];

describe("agent frontmatter schema", () => {
  test("agents/ (and optionally extras/) directory contains agent definitions", () => {
    expect(agentFiles.length).toBeGreaterThan(0);
  });

  for (const { dir, file } of agentFiles) {
    const label = `${dir}/${file}`;
    describe(label, () => {
      const raw = readFileSync(join(REPO_ROOT, dir, file), "utf-8");

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

      test("tools/permission inline JSON (if single-line) parses as valid JSON", () => {
        const fm = extractFrontmatter(raw);
        for (const key of OPTIONAL_JSON_KEYS) {
          const inline = inlineJsonValue(fm, key);
          if (inline !== null) {
            expect(() => JSON.parse(inline)).not.toThrow();
          }
        }
      });
    });
  }
});

describe("agent frontmatter schema — negative case (proves the check has teeth)", () => {
  test("a fixture missing required keys fails validation", () => {
    const badFixture = [
      "---",
      "description: incomplete agent fixture",
      "mode: subagent",
      "model: test/model",
      "---",
      "",
      "# Incomplete",
    ].join("\n");

    const fm = extractFrontmatter(badFixture);
    expect(hasTopLevelKey(fm, "permission")).toBe(false);
  });

  test("a fixture with no frontmatter block throws", () => {
    expect(() => extractFrontmatter("# No frontmatter here\n\nJust prose.")).toThrow();
  });
});
