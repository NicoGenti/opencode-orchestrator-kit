import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Phase 2 — deterministic assembly-order guard for repository prompt sources.
 *
 * The prompt assembler concatenates a fixed, finite set of repository-controlled
 * prompt files. To stay cache-stable and review-stable, the enumeration order
 * MUST be deterministic and MUST follow this canonical rule:
 *
 *   1. <root>/AGENTS.md                                        (single file)
 *   2. <root>/agents/*.md                                      (sorted by relative path)
 *   3. <root>/extras/*.md                                      (sorted by relative path, if the directory exists)
 *
 * Where "<root>/..." is the repository root for the real-filesystem check, and
 * an arbitrary root for the in-memory fixture checks. Both `agents/` and
 * `extras/` are enumerated by relative path/name (which for these flat
 * directories is equivalent to sorting the filenames themselves).
 *
 * `.opencode/context/` is intentionally excluded — it is out of scope for the
 * stable prefix — and model-preset ordering is out of scope here.
 */

const REPO_ROOT = join(import.meta.dir, "..");
const AGENTS_DIR = join(REPO_ROOT, "agents");
const EXTRAS_DIR = join(REPO_ROOT, "extras");

/**
 * Returns the canonical prompt-source list, given a list of inputs in each
 * bucket. The three buckets correspond to the three rules above and MUST be
 * passed in that exact conceptual order. The result is a flat string list of
 * repository-relative paths using forward slashes.
 */
function canonicalize(buckets: {
  agentsFile: string | null;
  agents: readonly string[];
  extras: readonly string[];
}): string[] {
  const out: string[] = [];
  if (buckets.agentsFile !== null) {
    out.push(buckets.agentsFile);
  }
  // [...].sort() is stable in V8/JSC and required to be per ECMA-262.
  out.push(...[...buckets.agents].sort());
  out.push(...[...buckets.extras].sort());
  return out;
}

/**
 * Reads the repository filesystem and returns the canonical assembly order
 * using the same rules as `canonicalize`. This is the function the production
 * assembler would call. It is intentionally read-only.
 */
function computeRepoAssemblyOrder(): string[] {
  const agentsMd = existsSync(join(REPO_ROOT, "AGENTS.md"))
    ? "AGENTS.md"
    : null;
  const agents = existsSync(AGENTS_DIR)
    ? readdirSync(AGENTS_DIR)
        .filter((f) => f.endsWith(".md"))
        .map((f) => `agents/${f}`)
    : [];
  const extras = existsSync(EXTRAS_DIR)
    ? readdirSync(EXTRAS_DIR)
        .filter((f) => f.endsWith(".md"))
        .map((f) => `extras/${f}`)
    : [];
  return canonicalize({ agentsFile: agentsMd, agents, extras });
}

describe("assembly order (Phase 2) — repository enumeration", () => {
  test("AGENTS.md exists at the repository root and is included", () => {
    expect(existsSync(join(REPO_ROOT, "AGENTS.md"))).toBe(true);
    const order = computeRepoAssemblyOrder();
    expect(order[0]).toBe("AGENTS.md");
  });

  test("agents/ files all appear before any extras/ file", () => {
    const order = computeRepoAssemblyOrder();
    const lastAgentsIdx = order.reduce(
      (last, p, i) => (p.startsWith("agents/") ? i : last),
      -1,
    );
    const firstExtrasIdx = order.findIndex((p) => p.startsWith("extras/"));
    if (firstExtrasIdx === -1) {
      // extras/ not present in tree — nothing to compare against.
      expect(lastAgentsIdx).toBeGreaterThanOrEqual(0);
      return;
    }
    expect(lastAgentsIdx).toBeGreaterThanOrEqual(0);
    expect(lastAgentsIdx).toBeLessThan(firstExtrasIdx);
  });

  test("within agents/ and within extras/ filenames are sorted ascending", () => {
    const order = computeRepoAssemblyOrder();
    const agentsEntries = order.filter((p) => p.startsWith("agents/"));
    const extrasEntries = order.filter((p) => p.startsWith("extras/"));
    expect(agentsEntries).toEqual([...agentsEntries].sort());
    expect(extrasEntries).toEqual([...extrasEntries].sort());
  });

  test("two independent computations produce identical results (determinism)", () => {
    const a = computeRepoAssemblyOrder();
    const b = computeRepoAssemblyOrder();
    expect(a).toEqual(b);
    // Also cross-check against a freshly-constructed canonical list built from
    // a raw readdir (no shared cache), proving determinism is not an artefact
    // of memoization.
    const agents = existsSync(AGENTS_DIR)
      ? readdirSync(AGENTS_DIR)
          .filter((f) => f.endsWith(".md"))
          .map((f) => `agents/${f}`)
      : [];
    const extras = existsSync(EXTRAS_DIR)
      ? readdirSync(EXTRAS_DIR)
          .filter((f) => f.endsWith(".md"))
          .map((f) => `extras/${f}`)
      : [];
    const c = canonicalize({
      agentsFile: "AGENTS.md",
      agents,
      extras,
    });
    expect(a).toEqual(c);
  });

  test("matches the explicitly-built expected canonical ordering for this repo", () => {
    const expected = canonicalize({
      agentsFile: "AGENTS.md",
      agents: [
        "agents/build-helper.md",
        "agents/code-reviewer.md",
        "agents/deploy-helper.md",
        "agents/developer-fixer.md",
        "agents/explorer.md",
        "agents/librarian.md",
        "agents/npm-helper.md",
        "agents/oracle.md",
        "agents/orchestrator.md",
        "agents/planner.md",
        "agents/profiler.md",
        "agents/security.md",
        "agents/test-engineer.md",
      ],
      extras: ["extras/pc-doctor.md", "extras/writer.md"],
    });
    expect(computeRepoAssemblyOrder()).toEqual(expected);
  });
});

describe("assembly order (Phase 2) — negative case (proves the check has teeth)", () => {
  test("an unsorted in-memory fixture is NOT already in canonical order", () => {
    // The raw, untransformed list — what an assembler would produce if it
    // forgot to sort. This must NOT equal the canonical result.
    const unsortedFixture = {
      agentsFile: "AGENTS.md" as string | null,
      agents: [
        "agents/orchestrator.md",
        "agents/developer-fixer.md",
        "agents/build-helper.md",
        "agents/code-reviewer.md",
      ],
      extras: ["extras/writer.md", "extras/pc-doctor.md"],
    };
    const rawUnsorted = [
      unsortedFixture.agentsFile as string,
      ...unsortedFixture.agents,
      ...unsortedFixture.extras,
    ];
    const canonical = canonicalize(unsortedFixture);
    expect(rawUnsorted).not.toEqual(canonical);
    // Sanity: confirm canonical really is sorted so the diff is meaningful.
    expect(canonical).toEqual([
      "AGENTS.md",
      "agents/build-helper.md",
      "agents/code-reviewer.md",
      "agents/developer-fixer.md",
      "agents/orchestrator.md",
      "extras/pc-doctor.md",
      "extras/writer.md",
    ]);
  });

  test("an in-memory fixture with extras/ listed before agents/ is rejected", () => {
    // The canonical rule says agents/ precedes extras/. If the assembler
    // produced them in the wrong order, the canonical list must reorder them.
    const wrongOrder = {
      agentsFile: "AGENTS.md",
      agents: ["agents/zzz-late.md", "agents/aaa-early.md"],
      extras: ["extras/late.md", "extras/early.md"],
    };
    const raw = [
      wrongOrder.agentsFile,
      ...wrongOrder.extras,
      ...wrongOrder.agents,
    ];
    const canonical = canonicalize(wrongOrder);
    expect(raw).not.toEqual(canonical);
    expect(canonical).toEqual([
      "AGENTS.md",
      "agents/aaa-early.md",
      "agents/zzz-late.md",
      "extras/early.md",
      "extras/late.md",
    ]);
  });

  test("a canonical fixture passes unchanged (positive control)", () => {
    const canonicalFixture = {
      agentsFile: "AGENTS.md",
      agents: ["agents/aaa.md", "agents/bbb.md", "agents/ccc.md"],
      extras: ["extras/xxx.md", "extras/yyy.md"],
    };
    const canonical = canonicalize(canonicalFixture);
    expect(canonical).toEqual([
      "AGENTS.md",
      "agents/aaa.md",
      "agents/bbb.md",
      "agents/ccc.md",
      "extras/xxx.md",
      "extras/yyy.md",
    ]);
  });

  test("a fixture with an absent agents/ directory is handled conservatively", () => {
    // Mirrors the spec: if a directory is missing, do not invent files.
    expect(
      canonicalize({
        agentsFile: "AGENTS.md",
        agents: [],
        extras: ["extras/only.md"],
      }),
    ).toEqual(["AGENTS.md", "extras/only.md"]);
  });

  test("a fixture with no extras/ directory is handled conservatively", () => {
    expect(
      canonicalize({
        agentsFile: "AGENTS.md",
        agents: ["agents/a.md", "agents/b.md"],
        extras: [],
      }),
    ).toEqual(["AGENTS.md", "agents/a.md", "agents/b.md"]);
  });
});
