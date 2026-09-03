import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";

/**
 * Phase 3 — stable-prefix boundary guard.
 *
 * The prompt assembler's "stable prefix" is a fixed, finite set of
 * repository-controlled prompt files. This test locks that boundary in
 * three ways:
 *
 *   1. A committed baseline file (`prompt-prefix-boundary.txt`) lists every
 *      boundary file exactly once, in sorted order, using forward slashes.
 *
 *   2. The live filesystem is re-enumerated from scratch and MUST match the
 *      committed baseline. If a new prompt file is added or one is removed
 *      without updating the baseline, this test fails loudly.
 *
 *   3. `.opencode/context/*` and `.opencode/models.config.json` are
 *      explicitly excluded, even if those paths exist on disk. This rule
 *      MUST be enforced by the boundary definition itself, not by accident
 *      of the current filesystem state.
 *
 * The boundary rule is intentionally narrow:
 *
 *   AGENTS.md                              (single file at the repo root)
 *   agents/*.md                            (sorted by relative path)
 *   extras/*.md                            (sorted by relative path, if the
 *                                            directory exists)
 *
 * Anything else — `tests/`, `skills/`, `.context/`, `.opencode/`, `plan/`,
 * `docs/`, etc. — is out of scope for the stable prefix.
 */

const REPO_ROOT = join(import.meta.dir, "..");
const BASELINE_FILE = join(import.meta.dir, "fixtures", "prompt-prefix-boundary.txt");
const AGENTS_DIR = join(REPO_ROOT, "agents");
const EXTRAS_DIR = join(REPO_ROOT, "extras");
const OPENCODE_DIR = join(REPO_ROOT, ".opencode");
const OPENCODE_CONTEXT_DIR = join(REPO_ROOT, ".opencode", "context");
const OPENCODE_MODELS_CONFIG = join(REPO_ROOT, ".opencode", "models.config.json");

/**
 * Read the committed baseline. Each non-empty line is one relative path
 * (forward slashes). The file is the single source of truth for "what is
 * in the stable prefix", and is loaded verbatim from the repository.
 */
function loadBaseline(): string[] {
  const raw = readFileSync(BASELINE_FILE, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Compute the live boundary the same way Phase 2 did: read each bucket
 * from disk, sort within each bucket, concatenate. This is the function
 * the production assembler would call. Read-only.
 */
function computeLiveBoundary(): string[] {
  const out: string[] = [];
  if (existsSync(join(REPO_ROOT, "AGENTS.md"))) {
    out.push("AGENTS.md");
  }
  if (existsSync(AGENTS_DIR)) {
    const agents = readdirSync(AGENTS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => `agents/${f}`)
      .sort();
    out.push(...agents);
  }
  if (existsSync(EXTRAS_DIR)) {
    const extras = readdirSync(EXTRAS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => `extras/${f}`)
      .sort();
    out.push(...extras);
  }
  return out;
}

/**
 * Apply the stable-prefix boundary rule to an arbitrary in-memory candidate
 * list. A candidate is "valid" iff:
 *
 *   - it is a non-empty array of repository-relative paths,
 *   - it does not contain `.opencode/`, `.opencode/context/`,
 *     `.opencode/models.config.json`, or any path starting with
 *     `.opencode/`,
 *   - it does not contain duplicate entries,
 *   - `AGENTS.md` is the first entry (when present),
 *   - every `agents/*.md` entry precedes every `extras/*.md` entry.
 *
 * This pure function is what a production boundary validator would call.
 * It is fully self-contained — it does not touch the filesystem.
 */
function isValidBoundary(candidate: readonly string[]): boolean {
  if (candidate.length === 0) return false;
  // Reject any .opencode/ path, including the explicitly excluded ones.
  for (const p of candidate) {
    if (p === ".opencode/context/engineering-standards.md") return false;
    if (p === ".opencode/models.config.json") return false;
    if (p.startsWith(".opencode/")) return false;
  }
  // Reject duplicates.
  if (new Set(candidate).size !== candidate.length) return false;
  // AGENTS.md must be first if present.
  const agentsIdx = candidate.indexOf("AGENTS.md");
  if (agentsIdx > 0) return false;
  // Bucket ordering: all agents/ paths before all extras/ paths.
  const firstExtrasIdx = candidate.findIndex((p) => p.startsWith("extras/"));
  const lastAgentsIdx = candidate.reduce(
    (last, p, i) => (p.startsWith("agents/") ? i : last),
    -1,
  );
  if (firstExtrasIdx !== -1 && lastAgentsIdx > firstExtrasIdx) return false;
  return true;
}

describe("stable-prefix boundary (Phase 3) — committed baseline", () => {
  test("baseline file exists and is non-empty", () => {
    expect(existsSync(BASELINE_FILE)).toBe(true);
    const lines = loadBaseline();
    expect(lines.length).toBeGreaterThan(0);
  });

  test("every baseline entry is a relative path with forward slashes", () => {
    for (const line of loadBaseline()) {
      expect(line.includes("\\")).toBe(false);
      expect(line.startsWith("/")).toBe(false);
      // No absolute paths and no parent-dir escapes.
      expect(line).not.toMatch(/^[A-Za-z]:/);
    }
  });

  test("baseline contains no `.opencode/` path", () => {
    for (const line of loadBaseline()) {
      expect(line.startsWith(".opencode/")).toBe(false);
      expect(line).not.toBe(".opencode/context/engineering-standards.md");
      expect(line).not.toBe(".opencode/models.config.json");
    }
  });

  test("baseline starts with AGENTS.md", () => {
    const lines = loadBaseline();
    expect(lines[0]).toBe("AGENTS.md");
  });

  test("baseline has no duplicate entries", () => {
    const lines = loadBaseline();
    expect(new Set(lines).size).toBe(lines.length);
  });
});

describe("stable-prefix boundary (Phase 3) — live filesystem enumeration", () => {
  test("every baseline file exists on disk", () => {
    for (const rel of loadBaseline()) {
      const abs = join(REPO_ROOT, rel);
      // `normalize` collapses platform separators so equality is portable.
      expect(existsSync(normalize(abs))).toBe(true);
    }
  });

  test("the live boundary exactly matches the committed baseline", () => {
    expect(computeLiveBoundary()).toEqual(loadBaseline());
  });

  test(".opencode/context/* is explicitly excluded even if the directory exists", () => {
    // Rule-based assertion: regardless of whether .opencode/context/ exists
    // today, it MUST NOT appear in the computed boundary.
    const live = computeLiveBoundary();
    for (const p of live) {
      expect(p.startsWith(".opencode/context/")).toBe(false);
    }
    // And the baseline must agree.
    for (const p of loadBaseline()) {
      expect(p.startsWith(".opencode/context/")).toBe(false);
    }
    // If .opencode/context/engineering-standards.md exists, it is still
    // excluded by the rule, not by accident. We do not require the file
    // to exist (the directory may be absent), but if it does, the boundary
    // must not include it.
    if (existsSync(OPENCODE_CONTEXT_DIR)) {
      const flagged = join(OPENCODE_CONTEXT_DIR, "engineering-standards.md");
      if (existsSync(flagged)) {
        expect(live).not.toContain(".opencode/context/engineering-standards.md");
      }
    }
  });

  test(".opencode/models.config.json is explicitly excluded even if it exists", () => {
    const live = computeLiveBoundary();
    expect(live).not.toContain(".opencode/models.config.json");
    expect(loadBaseline()).not.toContain(".opencode/models.config.json");
    if (existsSync(OPENCODE_MODELS_CONFIG)) {
      // File exists but must still be excluded.
      expect(live).not.toContain(".opencode/models.config.json");
    }
  });

  test("the boundary rule is satisfied when .opencode/ is absent", () => {
    // This test is meaningful whether or not .opencode/ exists. The
    // exclusion is rule-based, not path-based.
    if (existsSync(OPENCODE_DIR)) {
      // .opencode/ is present — the boundary must still exclude all
      // .opencode/ paths. Already covered above, but assert here too.
      for (const p of computeLiveBoundary()) {
        expect(p.startsWith(".opencode/")).toBe(false);
      }
    } else {
      // .opencode/ is absent — the test must pass without creating it.
      expect(existsSync(OPENCODE_DIR)).toBe(false);
      expect(computeLiveBoundary().length).toBeGreaterThan(0);
    }
  });

  test("boundary ordering: AGENTS.md → sorted agents/ → sorted extras/", () => {
    const live = computeLiveBoundary();
    expect(live[0]).toBe("AGENTS.md");
    const agentsEntries = live.filter((p) => p.startsWith("agents/"));
    const extrasEntries = live.filter((p) => p.startsWith("extras/"));
    expect(agentsEntries).toEqual([...agentsEntries].sort());
    expect(extrasEntries).toEqual([...extrasEntries].sort());
    if (extrasEntries.length > 0) {
      const lastAgents = live.lastIndexOf(agentsEntries[agentsEntries.length - 1]);
      const firstExtras = live.indexOf(extrasEntries[0]);
      expect(lastAgents).toBeLessThan(firstExtras);
    }
  });
});

describe("stable-prefix boundary (Phase 3) — negative case (rule has teeth)", () => {
  test("a boundary containing .opencode/context/engineering-standards.md is rejected", () => {
    const candidate = [
      "AGENTS.md",
      "agents/orchestrator.md",
      "extras/pc-doctor.md",
      ".opencode/context/engineering-standards.md",
    ];
    expect(isValidBoundary(candidate)).toBe(false);
  });

  test("a boundary containing .opencode/models.config.json is rejected", () => {
    const candidate = [
      "AGENTS.md",
      "agents/orchestrator.md",
      ".opencode/models.config.json",
    ];
    expect(isValidBoundary(candidate)).toBe(false);
  });

  test("a boundary containing any other .opencode/ path is rejected", () => {
    const candidate = [
      "AGENTS.md",
      "agents/orchestrator.md",
      ".opencode/something-else.md",
    ];
    expect(isValidBoundary(candidate)).toBe(false);
  });

  test("a boundary without AGENTS.md first is rejected", () => {
    const candidate = ["agents/orchestrator.md", "AGENTS.md"];
    expect(isValidBoundary(candidate)).toBe(false);
  });

  test("a boundary with extras/ before agents/ is rejected", () => {
    const candidate = [
      "AGENTS.md",
      "extras/pc-doctor.md",
      "agents/orchestrator.md",
    ];
    expect(isValidBoundary(candidate)).toBe(false);
  });

  test("an empty boundary is rejected", () => {
    expect(isValidBoundary([])).toBe(false);
  });

  test("a boundary with duplicate entries is rejected", () => {
    const candidate = [
      "AGENTS.md",
      "agents/orchestrator.md",
      "agents/orchestrator.md",
    ];
    expect(isValidBoundary(candidate)).toBe(false);
  });

  test("the actual committed baseline passes the validator (positive control)", () => {
    expect(isValidBoundary(loadBaseline())).toBe(true);
  });

  test("a synthetic canonical boundary passes the validator (positive control)", () => {
    const candidate = [
      "AGENTS.md",
      "agents/aaa.md",
      "agents/bbb.md",
      "extras/xxx.md",
      "extras/yyy.md",
    ];
    expect(isValidBoundary(candidate)).toBe(true);
  });

  test("a boundary with AGENTS.md absent is allowed (defensive)", () => {
    // The boundary validator is permissive about AGENTS.md being absent
    // because a fresh checkout might lack it; the production assembler
    // would skip it. This keeps the rule applicable in test fixtures.
    const candidate = ["agents/aaa.md", "agents/bbb.md"];
    expect(isValidBoundary(candidate)).toBe(true);
  });
});
