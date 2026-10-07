import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Routing-consistency tests.
 *
 * agents/*.md (and extras/*.md for pc-doctor and writer) files are prompt
 * specs, not executable code, so there is no runtime `route()` function to
 * unit test directly. The closest useful equivalent: cross-check the two
 * places routing IDs are declared (agents/orchestrator.md's "Agent Routing"
 * table and AGENTS.md's "Runtime Subagent Roster" table) against each other
 * and against the actual files in agents/ and extras/. This is exactly the
 * kind of drift AGENTS.md's own naming note warns about (retired taxonomy
 * names like `sisyphus`/`metis`/`momus`).
 */

const REPO_ROOT = join(import.meta.dir, "..");
const AGENTS_DIR = join(REPO_ROOT, "agents");
const EXTRAS_DIR = join(REPO_ROOT, "extras");

function extractSection(markdown: string, headingRegex: RegExp): string {
  const startMatch = markdown.match(headingRegex);
  if (!startMatch || startMatch.index === undefined) {
    throw new Error(`Section matching ${headingRegex} not found.`);
  }
  const start = startMatch.index + startMatch[0].length;
  const rest = markdown.slice(start);
  const nextHeading = rest.search(/\r?\n##\s/);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

function extractBacktickIds(tableSection: string): Set<string> {
  const ids = new Set<string>();
  const rowRegex = /^\|\s*`([a-z0-9-]+)`\s*\|/gm;
  let match: RegExpExecArray | null;
  while ((match = rowRegex.exec(tableSection)) !== null) {
    ids.add(match[1]);
  }
  return ids;
}

const orchestratorMd = readFileSync(join(AGENTS_DIR, "orchestrator.md"), "utf-8");
const agentsMd = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf-8");

const routingTableIds = extractBacktickIds(extractSection(orchestratorMd, /##\s+Agent Routing\r?\n/));
const rosterTableIds = extractBacktickIds(extractSection(agentsMd, /##\s+Runtime Subagent Roster\r?\n/));

const agentIdsInAgents = readdirSync(AGENTS_DIR)
  .filter((f) => f.endsWith(".md") && f !== "orchestrator.md")
  .map((f) => f.replace(/\.md$/, ""));
const agentIdsInExtras = existsSync(EXTRAS_DIR)
  ? readdirSync(EXTRAS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
  : [];
const agentFiles = Array.from(new Set([...agentIdsInAgents, ...agentIdsInExtras])).sort();

function agentFileExists(id: string): boolean {
  return (
    (existsSync(join(AGENTS_DIR, `${id}.md`)) && id !== "orchestrator") ||
    existsSync(join(EXTRAS_DIR, `${id}.md`))
  );
}

describe("routing consistency: agents/orchestrator.md routing table", () => {
  test("routing table is not empty", () => {
    expect(routingTableIds.size).toBeGreaterThan(0);
  });

  for (const id of Array.from(routingTableIds)) {
    test(`"${id}" has a matching agents/${id}.md or extras/${id}.md file`, () => {
      expect(agentFileExists(id)).toBe(true);
    });
  }
});

describe("routing consistency: AGENTS.md runtime subagent roster", () => {
  test("roster table is not empty", () => {
    expect(rosterTableIds.size).toBeGreaterThan(0);
  });

  for (const id of Array.from(rosterTableIds)) {
    test(`"${id}" has a matching agents/${id}.md or extras/${id}.md file`, () => {
      expect(agentFileExists(id)).toBe(true);
    });
  }
});

describe("routing consistency: no orphan agent files", () => {
  for (const id of agentFiles) {
    test(`${id}.md (in agents/ or extras/) is referenced in orchestrator.md's routing table`, () => {
      expect(routingTableIds.has(id)).toBe(true);
    });

    test(`${id}.md (in agents/ or extras/) is referenced in AGENTS.md's roster`, () => {
      expect(rosterTableIds.has(id)).toBe(true);
    });
  }
});

describe("routing consistency: the two tables agree with each other", () => {
  test("routing table and roster table list the same set of runtime IDs", () => {
    expect(Array.from(routingTableIds).sort()).toEqual(Array.from(rosterTableIds).sort());
  });
});

describe("routing consistency — negative case (proves the check has teeth)", () => {
  test("retired taxonomy-only names have no corresponding runtime agent file", () => {
    const retiredNames = ["sisyphus", "metis", "momus", "explore", "fixer", "hephaestus"];
    for (const name of retiredNames) {
      expect(agentFiles).not.toContain(name);
    }
  });
});

// ---------------------------------------------------------------------------
// v0.6.6 — prose-level routing consistency + anti-tier pin (B6)
// ---------------------------------------------------------------------------

const orchBody = orchestratorMd.slice(orchestratorMd.indexOf("\n---", 4) + 4);

describe("routing consistency — orchestrator.md prose (v0.6.6)", () => {
  // NO pre-filtering: every backtick token in the prose body is a candidate.
  // A candidate resolves only if it is (a) a real runtime agent file in
  // agents/ or extras/, (b) the orchestrator self-reference, or (c) an
  // explicitly whitelisted non-agent token. Any invented runtime id fails.
  // The whitelist itself is verified: skill-like tokens must exist on disk.
  const NON_AGENT_TOKENS = new Map<string, "tool" | "skill" | "vocab">([
    // built-in tools exposed to the orchestrator (not runtime agents)
    ...["bash", "date", "glob", "grep", "list", "read", "edit", "todowrite", "src"].map(
      (t) => [t, "tool"] as const,
    ),
    // skill names referenced from prose (must exist as skills/<name>/SKILL.md)
    ["comprehension-workflow", "skill"] as const,
    // prose vocabulary / workflow-state words (not identifiers)
    ...["allow", "ask", "complete", "draft", "in-progress", "outcome", "plan", "qa", "questions", "status", "task", "dci"].map(
      (t) => [t, "vocab"] as const,
    ),
  ]);

  const proseCandidates = Array.from(orchBody.matchAll(/`([a-z0-9-]+)`/g)).map((m) => m[1]);
  const candidateSet = new Set(proseCandidates);

  test("prose contains at least one runtime id candidate", () => {
    expect(proseCandidates.length).toBeGreaterThan(0);
  });

  test("whitelisted skill-like prose tokens exist as real skills", () => {
    for (const [token, kind] of NON_AGENT_TOKENS) {
      if (kind === "skill") {
        expect(existsSync(join(REPO_ROOT, "skills", token, "SKILL.md"))).toBe(true);
      }
    }
  });

  test("every prose backtick token resolves to a real agent file, a real skill, or the whitelist", () => {
    const unresolved: string[] = [];
    for (const token of candidateSet) {
      if (token === "orchestrator") continue; // self-reference: agents/orchestrator.md
      if (NON_AGENT_TOKENS.has(token)) continue;
      if (agentFileExists(token)) continue;
      unresolved.push(token);
    }
    expect(unresolved).toEqual([]); // any invented runtime id fails here
  });

  test("runtime ids referenced by prose all exist (no pre-filter)", () => {
    const agentTokens = Array.from(candidateSet).filter(
      (t) => !NON_AGENT_TOKENS.has(t) && t !== "orchestrator",
    );
    expect(agentTokens.length).toBeGreaterThan(0);
    for (const t of agentTokens) expect(agentFileExists(t)).toBe(true);
  });

  test("no prose token names a retired runtime that is not an agent file", () => {
    const retiredNames = ["sisyphus", "metis", "momus", "explore", "fixer", "hephaestus"];
    for (const name of retiredNames) {
      // (?<![\w-]) / (?![\w-]): retired ids flagged only as standalone tokens —
      // a hyphenated compound like `developer-fixer` is not a retired name.
      expect(orchBody.toLowerCase()).not.toMatch(new RegExp(`(?<![\\w-])${name}(?![\\w-])`, "i"));
    }
  });

  test("prose names no Tier L/M/H classification (anti-tier pin)", () => {
    const lower = orchBody.toLowerCase();
    for (const tier of ["tier l", "tier m", "tier h"]) {
      expect(lower.includes(tier)).toBe(false);
    }
    expect(lower).not.toMatch(/\btier-(?:l|m|h)\b/);
    expect(lower).not.toMatch(/tier (?:l|m|h) (?:classification|model|escalation)/);
  });
});

describe("routing consistency — AGENTS.md roster prose (v0.6.5)", () => {
  const rosterBody = agentsMd.slice(agentsMd.indexOf("## Runtime Subagent Roster"));

  test("roster prose lists no Tier L/M/H tiers", () => {
    expect(rosterBody.toLowerCase()).not.toMatch(/\btier-[lmh]\b/);
    expect(rosterBody.toLowerCase()).not.toMatch(/\b(?:l|m|h)\s*tier\b/);
  });
});
