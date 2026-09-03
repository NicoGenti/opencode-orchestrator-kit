import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Top-level frontmatter ordering tests for agents/*.md and extras/*.md.
 *
 * Phase 1 of the prompt-assembly optimization. The canonical subsequence for
 * top-level frontmatter keys is:
 *
 *   [description, mode, model, temperature, tools, permission]
 *
 * Each present key in a file's frontmatter MUST appear in this order, but
 * absent keys are skipped (subsequence, not strict permutation). Nested keys
 * inside `tools` and `permission` blocks are out of scope — this suite does
 * not touch them.
 *
 * The single `mode: primary` invariant is also asserted here so a future
 * reorder cannot accidentally promote or duplicate a primary agent.
 */

const REPO_ROOT = join(import.meta.dir, "..");
const AGENTS_DIR = join(REPO_ROOT, "agents");
const EXTRAS_DIR = join(REPO_ROOT, "extras");

const CANONICAL_ORDER = [
  "description",
  "mode",
  "model",
  "temperature",
  "tools",
  "permission",
] as const;

type CanonicalKey = (typeof CANONICAL_ORDER)[number];

/** Returns the frontmatter block body (between the first `---` delimiters). */
function extractFrontmatter(raw: string): string {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error("No YAML frontmatter block found (expected leading '---' ... '---').");
  }
  return match[1];
}

/**
 * Returns the ordered list of top-level frontmatter keys (those that begin
 * a line at column 0 with `key:`). Nested keys (indented) are ignored.
 *
 * Only known canonical keys are reported. Unknown top-level keys fail the
 * test on the per-file assertion below so future additions are intentional.
 */
function topLevelKeys(frontmatter: string): string[] {
  const keys: string[] = [];
  const lines = frontmatter.split(/\r?\n/);
  for (const line of lines) {
    // Match "<word>:" at column 0, not inside nested content.
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/);
    if (match) {
      keys.push(match[1]);
    }
  }
  return keys;
}

/**
 * Verifies that `keys` (the top-level frontmatter keys actually present) form
 * a subsequence of `CANONICAL_ORDER`. Returns null on success, or a
 * human-readable explanation on failure.
 */
function checkSubsequence(
  keys: readonly string[],
  canonical: readonly CanonicalKey[],
): string | null {
  let cursor = 0;
  for (const key of keys) {
    const expected = canonical[cursor];
    if (key === expected) {
      cursor++;
      continue;
    }
    const expectedIdx = canonical.indexOf(key as CanonicalKey);
    if (expectedIdx === -1) {
      return `unknown top-level key "${key}" (not in canonical order); canonical: [${canonical.join(", ")}]`;
    }
    if (expectedIdx < cursor) {
      return `key "${key}" appears after a later canonical key "${canonical[expectedIdx]}" (expected order [${canonical.join(", ")}]; got [${keys.join(", ")}])`;
    }
    // Skip ahead to match — this is exactly the "subsequence" semantics:
    // present keys are a non-contiguous subsequence of the canonical list.
    cursor = expectedIdx + 1;
  }
  return null;
}

const agentFiles = [
  ...readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md")).map((f) => ({ dir: "agents", file: f })),
  ...(existsSync(EXTRAS_DIR) ? readdirSync(EXTRAS_DIR).filter((f) => f.endsWith(".md")).map((f) => ({ dir: "extras", file: f })) : []),
];

describe("frontmatter top-level ordering (Phase 1)", () => {
  test("agents/ (and optionally extras/) directory contains agent definitions", () => {
    expect(agentFiles.length).toBeGreaterThan(0);
  });

  for (const { dir, file } of agentFiles) {
    const label = `${dir}/${file}`;
    describe(label, () => {
      const raw = readFileSync(join(REPO_ROOT, dir, file), "utf-8");

      test("top-level frontmatter keys appear in canonical order", () => {
        const fm = extractFrontmatter(raw);
        const keys = topLevelKeys(fm);
        const problem = checkSubsequence(keys, CANONICAL_ORDER);
        if (problem !== null) {
          throw new Error(problem);
        }
        expect(keys.length).toBeGreaterThan(0);
      });

      test("contains only keys known to the canonical order", () => {
        const fm = extractFrontmatter(raw);
        const keys = topLevelKeys(fm);
        const known = new Set<string>(CANONICAL_ORDER);
        const unknown = keys.filter((k) => !known.has(k));
        expect(unknown).toEqual([]);
      });
    });
  }
});

describe("frontmatter top-level ordering — `mode: primary` invariant", () => {
  /**
   * The original Phase 1 spec assumed a single `mode: primary` and required
   * it to live in agents/orchestrator.md. The repository currently has two
   * primary agents — agents/orchestrator.md and agents/security.md — and
   * Phase 1's "preserve existing schema/routing behavior" and "no frontmatter
   * value changes" rules forbid touching either value. The test below
   * therefore asserts the *current* repository state. Reconciling the spec's
   * "single primary" wording with the existing two-primary reality is left
   * to the orchestrator / user.
   */
  test("`mode: primary` files match the current repository state (orchestrator + security)", () => {
    const primaryMatches: string[] = [];
    for (const file of readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md"))) {
      const raw = readFileSync(join(AGENTS_DIR, file), "utf-8");
      // Match `mode: primary` only at the top level of the frontmatter block
      // (column 0, between the first pair of `---` delimiters).
      const lines = raw.split(/\r?\n/);
      const inFm = (() => {
        let open = false;
        for (const line of lines) {
          if (line === "---") {
            if (!open) {
              open = true;
              continue;
            }
            return false;
          }
          if (open) {
            if (/^mode:\s*primary\b/.test(line)) return true;
          }
        }
        return false;
      })();
      if (inFm) primaryMatches.push(`agents/${file}`);
    }
    primaryMatches.sort();
    expect(primaryMatches).toEqual(["agents/orchestrator.md", "agents/security.md"]);
  });
});

describe("frontmatter top-level ordering — negative case (proves the check has teeth)", () => {
  test("an in-memory fixture with reversed key order fails the subsequence check", () => {
    // Reversed canonical order: permission, tools, temperature, model, mode, description.
    // Every present key is a valid canonical key, so the "unknown key" check
    // would not catch this — the order check is what must fail.
    const reversedFixture = [
      "---",
      "permission:",
      "  task: deny",
      "tools:",
      "  read: true",
      "temperature: 0.2",
      "model: test/model",
      "mode: subagent",
      "description: reversed-order fixture",
      "---",
      "",
      "# Reversed",
    ].join("\n");

    const fm = extractFrontmatter(reversedFixture);
    const keys = topLevelKeys(fm);
    expect(keys).toEqual([
      "permission",
      "tools",
      "temperature",
      "model",
      "mode",
      "description",
    ]);
    const problem = checkSubsequence(keys, CANONICAL_ORDER);
    expect(problem).not.toBeNull();
  });

  test("a fixture with a valid permutation but out-of-order pair also fails", () => {
    // description, mode, temperature, model — `temperature` appears before
    // `model`, violating the canonical subsequence.
    const swappedFixture = [
      "---",
      "description: temperature-before-model fixture",
      "mode: subagent",
      "temperature: 0.1",
      "model: test/model",
      "permission:",
      "  task: deny",
      "---",
      "",
      "# Swapped",
    ].join("\n");

    const fm = extractFrontmatter(swappedFixture);
    const keys = topLevelKeys(fm);
    const problem = checkSubsequence(keys, CANONICAL_ORDER);
    expect(problem).not.toBeNull();
    // The error must mention temperature so the failure is actionable.
    expect(problem).toMatch(/temperature/);
  });

  test("a fixture matching canonical order exactly passes the subsequence check", () => {
    const canonicalFixture = [
      "---",
      "description: exact-canonical fixture",
      "mode: subagent",
      "model: test/model",
      "temperature: 0.1",
      "permission:",
      "  task: deny",
      "---",
      "",
      "# Canonical",
    ].join("\n");

    const fm = extractFrontmatter(canonicalFixture);
    const keys = topLevelKeys(fm);
    expect(checkSubsequence(keys, CANONICAL_ORDER)).toBeNull();
  });
});
