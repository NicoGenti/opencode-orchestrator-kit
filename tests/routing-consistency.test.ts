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
  const nextHeading = rest.search(/\n##\s/);
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

const routingTableIds = extractBacktickIds(extractSection(orchestratorMd, /##\s+Agent Routing\n/));
const rosterTableIds = extractBacktickIds(extractSection(agentsMd, /##\s+Runtime Subagent Roster\n/));

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
