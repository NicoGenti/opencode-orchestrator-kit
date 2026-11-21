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
 * - agents/orchestrator-quick.md — NEW agent: a second router with
 *   `edit`/`write`/`patch` denied and `subagent` allowed.
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
 * - Two per-tool CRG allows on top of that family deny:
 *   `build_or_update_graph_tool` (allow) for agents/code-reviewer.md only —
 *   the sole refresh owner since issue #153 P0; agents/explorer.md is a
 *   non-owner that falls back instead — plus `get_minimal_context_tool`
 *   (allow) for agents/orchestrator.md, the read-only entry point. The write
 *   tool `apply_refactor_tool` stays deny.
 * - agents/developer-fixer.md — two read-only per-tool CRG allows on top of
 *   that family deny: `get_impact_radius_tool` and `get_review_context_tool`
 *   (issue #153 phase 1). Both are read-only; every other tool of the family
 *   (including the mutation tools) stays denied by the family default.
 * - agents/test-engineer.md — the same two read-only per-tool CRG allows on
 *   top of that family deny: `get_impact_radius_tool` and
 *   `get_review_context_tool` (issue #153 phase 2). Both are read-only; the
 *   mutation tools stay denied by the family default.
 * - agents/test-engineer.md — one added rule, shell `git *` deny, followed by
 *   five read-only git allows: `git status *`, `git diff *`, `git log *`,
 *   `git show *`, `git ls-tree *` (issue #203 phase A). Every mutating git
 *   command resolves to deny instead of the previous `*` ask. Issue #203
 *   review closes the `--output` write hole: each read-only allow is followed
 *   by its own `*--output*` deny, plus one general `git *--output*` deny — six
 *   git denies in total.
 * - agents/planner.md — three read-only per-tool CRG allows on top of that
 *   family deny: `get_architecture_overview_tool`, `get_impact_radius_tool`
 *   and `semantic_search_nodes_tool` (issue #153 phase 3). All three are
 *   MAY-level accelerators; the mutation tools stay denied by the family
 *   default.
 * - agents/security.md — one added rule,
 *   `{ action: "execute", resource: "*", effect: "allow" }` (issue #172
 *   phase 2). Its three declared read-only CRG tools are reached only inside
 *   `execute` (Code Mode), which the global `"*": deny` fallback otherwise
 *   blocked: the per-tool allows were unreachable. The global fallback and
 *   the CRG family default still bound the agent; `execute` is a known V1
 *   action and not one of the catch-alls the invariant guard polices.
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
    expect(
      has("agents/code-reviewer.md", {
        action: "code-review-graph_build_or_update_graph_tool",
        resource: "*",
        effect: "allow",
      }),
    ).toBe(true);
    expect(
      has("agents/orchestrator.md", {
        action: "code-review-graph_get_minimal_context_tool",
        resource: "*",
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
    // Issue #172 phase 2 — security declares `execute: allow` so its read-only
    // CRG tools are reachable inside Code Mode. The global `"*": deny`
    // fallback and the CRG family default keep every undeclared action and
    // tool denied.
    expect(
      has("agents/security.md", {
        action: "execute",
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
    // Issue #153 phase 1 — developer-fixer read-only CRG allowlist. The
    // mutation tools are not separate deny entries: the family default
    // `{ action: "code-review-graph_*", effect: "deny" }` denies every
    // undeclared tool of the family, so the pins below assert the family
    // deny is present and that no per-tool mutation allow exists.
    for (const resource of [
      "code-review-graph_get_impact_radius_tool",
      "code-review-graph_get_review_context_tool",
    ]) {
      expect(
        has("agents/developer-fixer.md", {
          action: resource,
          resource: "*",
          effect: "allow",
        }),
      ).toBe(true);
    }
    expect(
      has("agents/developer-fixer.md", {
        action: "code-review-graph_*",
        resource: "*",
        effect: "deny",
      }),
    ).toBe(true);
    for (const resource of [
      "code-review-graph_apply_refactor_tool",
      "code-review-graph_build_or_update_graph_tool",
    ]) {
      expect(
        has("agents/developer-fixer.md", {
          action: resource,
          resource: "*",
          effect: "allow",
        }),
      ).toBe(false);
    }
    // Issue #153 phase 2 — test-engineer read-only CRG allowlist. Same shape
    // as phase 1: the family default denies every undeclared tool of the
    // family, so the pins assert the family deny is present and that no
    // per-tool mutation allow exists.
    for (const resource of [
      "code-review-graph_get_impact_radius_tool",
      "code-review-graph_get_review_context_tool",
    ]) {
      expect(
        has("agents/test-engineer.md", {
          action: resource,
          resource: "*",
          effect: "allow",
        }),
      ).toBe(true);
    }
    expect(
      has("agents/test-engineer.md", {
        action: "code-review-graph_*",
        resource: "*",
        effect: "deny",
      }),
    ).toBe(true);
    for (const resource of [
      "code-review-graph_apply_refactor_tool",
      "code-review-graph_build_or_update_graph_tool",
    ]) {
      expect(
        has("agents/test-engineer.md", {
          action: resource,
          resource: "*",
          effect: "allow",
        }),
      ).toBe(false);
    }
    // Issue #203 phase A — test-engineer denies every mutating git command
    // through `git *` deny and re-allows only the five read-only forms.
    for (const resource of [
      "git status *",
      "git diff *",
      "git log *",
      "git show *",
      "git ls-tree *",
    ]) {
      expect(
        has("agents/test-engineer.md", {
          action: "shell",
          resource,
          effect: "allow",
        }),
      ).toBe(true);
    }
    // Issue #203 review — the `--output` write hole: the four read-only forms
    // that accept `--output` each carry their own deny, plus a general deny.
    for (const resource of [
      "git *",
      "git status *--output*",
      "git diff *--output*",
      "git log *--output*",
      "git show *--output*",
      "git *--output*",
    ]) {
      expect(
        has("agents/test-engineer.md", {
          action: "shell",
          resource,
          effect: "deny",
        }),
      ).toBe(true);
    }
    // Issue #153 phase 3 — planner MAY-level CRG allowlist. Same shape as
    // phases 1-2: the family default denies every undeclared tool of the
    // family, so the pins assert the family deny is present and that no
    // per-tool mutation allow exists.
    for (const resource of [
      "code-review-graph_get_architecture_overview_tool",
      "code-review-graph_get_impact_radius_tool",
      "code-review-graph_semantic_search_nodes_tool",
    ]) {
      expect(
        has("agents/planner.md", {
          action: resource,
          resource: "*",
          effect: "allow",
        }),
      ).toBe(true);
    }
    expect(
      has("agents/planner.md", {
        action: "code-review-graph_*",
        resource: "*",
        effect: "deny",
      }),
    ).toBe(true);
    for (const resource of [
      "code-review-graph_apply_refactor_tool",
      "code-review-graph_build_or_update_graph_tool",
    ]) {
      expect(
        has("agents/planner.md", {
          action: resource,
          resource: "*",
          effect: "allow",
        }),
      ).toBe(false);
    }
  });
});
