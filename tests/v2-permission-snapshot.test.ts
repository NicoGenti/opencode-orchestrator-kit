import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseFrontmatterMap } from "../plugin/src/frontmatter-map.ts";
import { toV2Permissions } from "../plugin/src/permissions.ts";
import type { PermissionRule } from "../plugin/src/permissions.ts";

/**
 * V2 translator output for every agent under agents/ and extras/.
 *
 * The snapshot is the output after this change. Against the translation of
 * the previous main, the only differences are:
 *
 * - agents/orchestrator.md — one added rule, skill `project-*` allow.
 *   Converting the frontmatter from inline JSON to YAML, dropping the
 *   `tools` entries that were `true`, and writing `task` instead of the V2
 *   name `subagent` do not change the translated rules.
 * - agents/developer-fixer.md — skill `project-*` allow.
 * - agents/code-reviewer.md — skill `project-*` allow.
 * - agents/plan-writer.md — shell patterns aligned to the real commands:
 *   `python *plan-board.py *`, `python3 *plan-board.py *`, `py -3 *plan-board.py *`
 *   (the previous glob form never matched `python scripts/plan-board.py`) plus
 *   `rm .context/plan-body-*.md` for the staging-body cleanup.
 * - agents/oracle.md — removed `{ action: "query", resource: "*", effect: "allow" }`.
 *   `query` is not a V1 or V2 permission action.
 * - agents/librarian.md — removed `{ action: "check_diagnostics", resource: "*", effect: "deny" }`.
 *   `check_diagnostics` is not a V1 or V2 permission action.
 * - Every agent/extra — one prepended rule `{ action: "code-review-graph_*",
 *   resource: "*", effect: "deny" }`: `mcpDefaultDenies()` denies the whole
 *   `code-review-graph` MCP family by default, so a declared per-tool allow
 *   still wins (last match) while any undeclared tool of the family (e.g.
 *   `apply_refactor_tool`) resolves to `deny` instead of the host default.
 *
 * Every other agent translates to the same rule list as before.
 */

const ROOT = join(import.meta.dir, "..");
const SNAPSHOT_PATH = join(
  ROOT,
  "tests",
  "fixtures",
  "v2-permissions.snapshot.json",
);

function translated(relPath: string): PermissionRule[] {
  const raw = readFileSync(join(ROOT, relPath), "utf-8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`${relPath} has no frontmatter`);
  return toV2Permissions(
    parseFrontmatterMap(match[1], "permission"),
    parseFrontmatterMap(match[1], "tools"),
  );
}

function sourceAgents(): string[] {
  const out: string[] = [];
  for (const dir of ["agents", "extras"] as const) {
    for (const name of readdirSync(join(ROOT, dir))
      .filter((file) => file.endsWith(".md"))
      .sort()) {
      out.push(`${dir}/${name}`);
    }
  }
  return out;
}

describe("V2 permission translation snapshot", () => {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8")) as Record<
    string,
    PermissionRule[]
  >;

  test("every agent and extra matches the snapshot, and the snapshot has no extra keys", () => {
    const paths = sourceAgents();
    expect(Object.keys(snapshot).sort()).toEqual(paths);
    for (const rel of paths) {
      expect(translated(rel)).toEqual(snapshot[rel]);
    }
  });

  test("the intended deltas are present in the snapshot", () => {
    const has = (rel: string, rule: PermissionRule) =>
      (snapshot[rel] ?? []).some(
        (entry) =>
          entry.action === rule.action &&
          entry.resource === rule.resource &&
          entry.effect === rule.effect,
      );
    expect(
      has("agents/orchestrator.md", {
        action: "code-review-graph_*",
        resource: "*",
        effect: "deny",
      }),
    ).toBe(true);
    expect(
      has("agents/orchestrator.md", {
        action: "skill",
        resource: "project-*",
        effect: "allow",
      }),
    ).toBe(true);
    expect(
      has("agents/developer-fixer.md", {
        action: "skill",
        resource: "project-*",
        effect: "allow",
      }),
    ).toBe(true);
    expect(
      has("agents/code-reviewer.md", {
        action: "skill",
        resource: "project-*",
        effect: "allow",
      }),
    ).toBe(true);
    for (const resource of [
      "python *plan-board.py *",
      "python3 *plan-board.py *",
      "py -3 *plan-board.py *",
      "rm .context/plan-body-*.md",
    ]) {
      expect(
        has("agents/plan-writer.md", {
          action: "shell",
          resource,
          effect: "allow",
        }),
      ).toBe(true);
    }
    expect(
      has("agents/orchestrator.md", {
        action: "subagent",
        resource: "*",
        effect: "allow",
      }),
    ).toBe(true);
    for (const rel of Object.keys(snapshot)) {
      for (const rule of snapshot[rel] ?? []) {
        expect(rule.action).not.toBe("query");
        expect(rule.action).not.toBe("check_diagnostics");
      }
    }
  });
});
