import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseFrontmatterMap } from "../plugin/src/frontmatter-map.ts";
import {
  assertKitPermissionInvariants,
  kitInvariantRules,
  mapAction,
  mcpDefaultDenies,
  matchesPattern,
  normalizeResource,
  resolveEffect,
  toV2Permissions,
} from "../plugin/src/permissions.ts";
import type { PermissionRule } from "../plugin/src/permissions.ts";
import { collectPackagedAgents } from "../plugin/src/agents.ts";

const ROOT = join(import.meta.dir, "..");

/** Frontmatter block (text between the --- markers) of a repo file. */
function frontmatterOf(relPath: string): string {
  const raw = readFileSync(join(ROOT, relPath), "utf-8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`${relPath} has no frontmatter`);
  return match[1];
}

function rulesOf(relPath: string): PermissionRule[] {
  const fm = frontmatterOf(relPath);
  return toV2Permissions(
    parseFrontmatterMap(fm, "permission"),
    parseFrontmatterMap(fm, "tools"),
  );
}

const FM_INLINE = [
  "description: x",
  "mode: primary",
  'permission: {"subagent":"allow","read":"allow","patch":"deny","bash":{"*":"deny","ls *":"allow"},"write":{".context/progress.md":"allow","*":"deny"}}',
].join("\n");

describe("frontmatter map reader (YAML subset + inline JSON)", () => {
  test("reads an inline JSON map", () => {
    expect(parseFrontmatterMap(FM_INLINE, "permission")).toEqual({
      subagent: "allow",
      read: "allow",
      patch: "deny",
      bash: { "*": "deny", "ls *": "allow" },
      write: { ".context/progress.md": "allow", "*": "deny" },
    });
  });

  test("reads a nested block map and coerces booleans", () => {
    const fm = [
      "tools:",
      "  read: true",
      "  write: false",
      "permission:",
      "  bash:",
      '    "*": deny',
      "    ls *: allow",
    ].join("\n");
    expect(parseFrontmatterMap(fm, "tools")).toEqual({
      read: true,
      write: false,
    });
    expect(parseFrontmatterMap(fm, "permission")).toEqual({
      bash: { "*": "deny", "ls *": "allow" },
    });
  });

  test("keeps a colon inside a shell pattern key", () => {
    const fm = [
      "permission:",
      "  bash:",
      '    "*": deny',
      "    pnpm test:*: allow",
    ].join("\n");
    expect(parseFrontmatterMap(fm, "permission")).toEqual({
      bash: { "*": "deny", "pnpm test:*": "allow" },
    });
  });

  test("rejects an unparsable block line", () => {
    const fm = ["permission:", "  this is not yaml"].join("\n");
    expect(() => parseFrontmatterMap(fm, "permission")).toThrow(/cannot parse/);
  });

  test("returns undefined when the key is absent", () => {
    expect(parseFrontmatterMap("mode: primary", "permission")).toBeUndefined();
  });
});

describe("V1 -> V2 translation", () => {
  test("orchestrator (YAML, V1 task name) translates to exactly the expected rule list", () => {
    expect(rulesOf("agents/orchestrator.md")).toEqual([
      { action: "code-review-graph_*", resource: "*", effect: "deny" },
      { action: "subagent", resource: "*", effect: "allow" },
      { action: "todowrite", resource: "*", effect: "allow" },
      { action: "read", resource: "*", effect: "allow" },
      { action: "glob", resource: "*", effect: "allow" },
      { action: "grep", resource: "*", effect: "allow" },
      {
        action: "code-review-graph_get_minimal_context_tool",
        resource: "*",
        effect: "allow",
      },
      { action: "webfetch", resource: "*", effect: "deny" },
      { action: "edit", resource: "*", effect: "deny" },
      { action: "edit", resource: ".context/progress.md", effect: "allow" },
      {
        action: "edit",
        resource: ".context/comprehension/*.md",
        effect: "allow",
      },
      {
        action: "edit",
        resource: ".context/comprehension-log.md",
        effect: "allow",
      },
      {
        action: "edit",
        resource: ".context/research-dataset.jsonl",
        effect: "allow",
      },
      { action: "edit", resource: "plan/*.md", effect: "deny" },
      { action: "edit", resource: ".context/decisions.md", effect: "allow" },
      { action: "edit", resource: ".context/issues.md", effect: "allow" },
      { action: "shell", resource: "*", effect: "deny" },
      { action: "shell", resource: "git status *", effect: "allow" },
      { action: "shell", resource: "git diff *", effect: "allow" },
      { action: "shell", resource: "git log *", effect: "allow" },
      { action: "shell", resource: "git show *", effect: "allow" },
      { action: "shell", resource: "ls *", effect: "allow" },
      { action: "shell", resource: "cat *", effect: "allow" },
      { action: "skill", resource: "*", effect: "deny" },
      { action: "skill", resource: "comprehension-workflow", effect: "allow" },
      { action: "skill", resource: "web-*", effect: "allow" },
      { action: "skill", resource: "project-*", effect: "allow" },
    ]);
  });

  test("plan-writer (block YAML) folds write+edit into one edit bucket", () => {
    expect(rulesOf("agents/plan-writer.md")).toEqual([
      { action: "code-review-graph_*", resource: "*", effect: "deny" },
      { action: "edit", resource: "*", effect: "deny" },
      { action: "edit", resource: "plan/*.md", effect: "allow" },
      { action: "webfetch", resource: "*", effect: "deny" },
      { action: "shell", resource: "*", effect: "deny" },
      {
        action: "shell",
        resource: "python *plan-board.py *",
        effect: "allow",
      },
      {
        action: "shell",
        resource: "python3 *plan-board.py *",
        effect: "allow",
      },
      {
        action: "shell",
        resource: "py -3 *plan-board.py *",
        effect: "allow",
      },
      { action: "shell", resource: "ls *", effect: "allow" },
      { action: "shell", resource: "cat *", effect: "allow" },
      {
        action: "shell",
        resource: "rm .context/plan-body-*.md",
        effect: "allow",
      },
      { action: "subagent", resource: "*", effect: "deny" },
      { action: "skill", resource: "*", effect: "deny" },
    ]);
  });

  test("a top-level `*` key becomes the global fallback emitted first", () => {
    const rules = rulesOf("agents/security.md");
    expect(rules[0]).toEqual({
      action: "code-review-graph_*",
      resource: "*",
      effect: "deny",
    });
    expect(rules[1]).toEqual({ action: "*", resource: "*", effect: "deny" });
    expect(rules[2]).toEqual({
      action: "read",
      resource: "*",
      effect: "allow",
    });
  });

  test("`tools: {x: false}` becomes a blanket deny emitted before permission rules", () => {
    const rules = toV2Permissions(
      { read: "allow", bash: { "*": "deny", "ls *": "allow" } },
      { write: false, read: true },
    );
    expect(rules[0]).toEqual({
      action: "code-review-graph_*",
      resource: "*",
      effect: "deny",
    });
    expect(rules[1]).toEqual({
      action: "edit",
      resource: "*",
      effect: "deny",
    });
    expect(rules[2]).toEqual({
      action: "read",
      resource: "*",
      effect: "allow",
    });
    expect(rules).toHaveLength(5);
  });

  test("collapses V1 globstar segments (V2 `*` already crosses `/`)", () => {
    expect(normalizeResource("plan/**/*.md")).toBe("plan/*.md");
    expect(normalizeResource(".context/comprehension/**/*.md")).toBe(
      ".context/comprehension/*.md",
    );
    expect(normalizeResource("**/*.env")).toBe("*.env");
    expect(normalizeResource("pnpm test:*")).toBe("pnpm test:*");
  });

  test("rejects a non-effect permission value", () => {
    expect(() => toV2Permissions({ read: "yes" }, undefined)).toThrow(
      /allow\|ask\|deny/,
    );
  });
});

describe("V2 wildcard matcher", () => {
  test("`*` matches across slashes and `?` matches one character", () => {
    expect(matchesPattern("plan/*.md", "plan/x.md")).toBe(true);
    expect(matchesPattern("plan/*.md", "plan/qa/deep/x.md")).toBe(true);
    expect(matchesPattern("plan/*.md", "plans/x.md")).toBe(false);
    expect(matchesPattern("g?t status *", "git status --short")).toBe(true);
  });

  test("matching is case-insensitive", () => {
    expect(matchesPattern("plan/*.md", "Plan/Draft/X.MD")).toBe(true);
  });

  test("resolveEffect is last-match-wins with an `allow` default", () => {
    const rules: PermissionRule[] = [
      { action: "edit", resource: "*", effect: "deny" },
      { action: "edit", resource: ".context/*.md", effect: "allow" },
    ];
    expect(resolveEffect(rules, "edit", "src/app.ts")).toBe("deny");
    expect(resolveEffect(rules, "edit", ".context/progress.md")).toBe("allow");
    expect(resolveEffect(rules, "read", "src/app.ts")).toBe("allow");
  });
});

describe("kit permission invariants", () => {
  test("kitInvariantRules denies the board root to every agent but plan-writer", () => {
    expect(kitInvariantRules("plan-writer")).toEqual([]);
    expect(kitInvariantRules("developer-fixer")).toEqual([
      { action: "edit", resource: "plan/*.md", effect: "deny" },
    ]);
  });

  test("the composed orchestrator rules deny application code", () => {
    const rules = [
      ...rulesOf("agents/orchestrator.md"),
      ...kitInvariantRules("orchestrator"),
    ];
    expect(() =>
      assertKitPermissionInvariants("orchestrator", rules),
    ).not.toThrow();
    expect(resolveEffect(rules, "edit", "src/app.ts")).toBe("deny");
    expect(resolveEffect(rules, "edit", "plan/qa/13-example.md")).toBe("deny");
    expect(resolveEffect(rules, "edit", ".context/progress.md")).toBe("allow");
  });

  test("assertKitPermissionInvariants throws when the board deny is missing", () => {
    const rules = [
      ...rulesOf("agents/developer-fixer.md"),
      ...kitInvariantRules("developer-fixer"),
    ];
    expect(() =>
      assertKitPermissionInvariants("developer-fixer", rules),
    ).not.toThrow();
    expect(() =>
      assertKitPermissionInvariants(
        "developer-fixer",
        rules.filter((r) => r.resource !== "plan/*.md"),
      ),
    ).toThrow(/permission invariant violated/);
  });

  test("plan-writer keeps the board root and denies application code", () => {
    const rules = [
      ...rulesOf("agents/plan-writer.md"),
      ...kitInvariantRules("plan-writer"),
    ];
    expect(() =>
      assertKitPermissionInvariants("plan-writer", rules),
    ).not.toThrow();
    expect(resolveEffect(rules, "edit", "plan/qa/13-example.md")).toBe("allow");
    expect(resolveEffect(rules, "edit", "src/app.ts")).toBe("deny");
  });

  test("a missing shell, skill, or subagent catch-all is rejected", () => {
    const base: PermissionRule[] = [
      ...mcpDefaultDenies(),
      { action: "edit", resource: "plan/*.md", effect: "deny" },
      { action: "shell", resource: "*", effect: "deny" },
      { action: "skill", resource: "*", effect: "deny" },
      { action: "subagent", resource: "*", effect: "deny" },
    ];
    expect(() =>
      assertKitPermissionInvariants("developer-fixer", base),
    ).not.toThrow();
    for (const action of ["shell", "skill", "subagent"] as const) {
      const stripped = base.filter((rule) => rule.action !== action);
      expect(() =>
        assertKitPermissionInvariants("developer-fixer", stripped),
      ).toThrow(new RegExp(`no catch-all rule for '${action}'`));
    }
  });

  test("a global deny counts as the catch-all for shell, skill, and subagent", () => {
    const rules: PermissionRule[] = [
      { action: "*", resource: "*", effect: "deny" },
      { action: "edit", resource: "plan/*.md", effect: "deny" },
    ];
    expect(() =>
      assertKitPermissionInvariants("security", rules),
    ).not.toThrow();
  });

  test("an allow catch-all for shell is rejected", () => {
    const rules: PermissionRule[] = [
      { action: "edit", resource: "plan/*.md", effect: "deny" },
      { action: "shell", resource: "*", effect: "allow" },
      { action: "skill", resource: "*", effect: "deny" },
      { action: "subagent", resource: "*", effect: "deny" },
    ];
    expect(() => assertKitPermissionInvariants("explorer", rules)).toThrow(
      /catch-all is 'allow'/,
    );
  });

  test("only the orchestrator may spawn developer-fixer", () => {
    const denied: PermissionRule[] = [
      ...mcpDefaultDenies(),
      { action: "edit", resource: "*", effect: "deny" },
      { action: "shell", resource: "*", effect: "deny" },
      { action: "skill", resource: "*", effect: "deny" },
      { action: "subagent", resource: "*", effect: "deny" },
      { action: "subagent", resource: "developer-fixer", effect: "allow" },
    ];
    expect(() => assertKitPermissionInvariants("oracle", denied)).toThrow(
      /developer-fixer/,
    );
    const router: PermissionRule[] = [
      ...mcpDefaultDenies(),
      { action: "edit", resource: "*", effect: "deny" },
      { action: "shell", resource: "*", effect: "deny" },
      { action: "skill", resource: "*", effect: "deny" },
      { action: "subagent", resource: "*", effect: "allow" },
    ];
    expect(() =>
      assertKitPermissionInvariants("orchestrator", router),
    ).not.toThrow();
    expect(resolveEffect(router, "subagent", "developer-fixer")).toBe("allow");
  });
});

describe("packaged agent manifest permissions", () => {
  test("every packaged agent carries composed V2 rules and passes the invariants", () => {
    const agents = collectPackagedAgents(true);
    expect(agents).toHaveLength(18);
    for (const agent of agents) {
      expect(agent.permissions.length).toBeGreaterThan(0);
      expect(() =>
        assertKitPermissionInvariants(agent.id, agent.permissions),
      ).not.toThrow();
    }
  });

  test("orchestrator ends with the board-root deny and cannot edit application code", () => {
    const orchestrator = collectPackagedAgents(false).find(
      (a) => a.id === "orchestrator",
    );
    expect(orchestrator).toBeDefined();
    const rules = orchestrator!.permissions;
    expect(rules).toHaveLength(28);
    expect(rules[rules.length - 1]).toEqual({
      action: "edit",
      resource: "plan/*.md",
      effect: "deny",
    });
    expect(resolveEffect(rules, "edit", "src/app.ts")).toBe("deny");
    expect(resolveEffect(rules, "edit", ".context/progress.md")).toBe("allow");
  });

  test("orchestrator-quick is a router: subagent allow, application edit deny, plan board deny", () => {
    const rules = [
      ...rulesOf("agents/orchestrator-quick.md"),
      ...kitInvariantRules("orchestrator-quick"),
    ];
    expect(() =>
      assertKitPermissionInvariants("orchestrator-quick", rules),
    ).not.toThrow();
    expect(resolveEffect(rules, "subagent", "developer-fixer")).toBe("allow");
    expect(resolveEffect(rules, "edit", "src/app.ts")).toBe("deny");
    expect(resolveEffect(rules, "edit", "plan/qa/13-example.md")).toBe("deny");
    // V1 `write` is translated to the V2 `edit` action by the translator.
    expect(resolveEffect(rules, mapAction("write"), "anything.ts")).toBe("deny");
  });

  test("source frontmatter alone denies the plan board except for plan-writer", () => {
    const dirs = ["agents", "extras"] as const;
    const files = dirs.flatMap((dir) =>
      readdirSync(join(ROOT, dir))
        .filter((name) => name.endsWith(".md"))
        .map((name) => `${dir}/${name}`),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const rel of files) {
      const id = rel.slice(rel.lastIndexOf("/") + 1, -3);
      const effect = resolveEffect(
        rulesOf(rel),
        "edit",
        "plan/qa/13-example.md",
      );
      expect(`${id}=${effect}`).toBe(
        id === "plan-writer" ? "plan-writer=allow" : `${id}=deny`,
      );
    }
  });

  test("plan-writer is the only agent allowed to edit plan files", () => {
    for (const agent of collectPackagedAgents(true)) {
      const effect = resolveEffect(
        agent.permissions,
        "edit",
        "plan/qa/13-example.md",
      );
      expect(`${agent.id}=${effect}`).toBe(
        agent.id === "plan-writer" ? "plan-writer=allow" : `${agent.id}=deny`,
      );
    }
  });
});

describe("MCP default deny — le allowlist dichiarate sono reali", () => {
  const CRG = "code-review-graph";
  const declared = (rel: string, tool: string, expected: "allow" | "deny") => {
    expect(resolveEffect(rulesOf(rel), `${CRG}_${tool}`, "*")).toBe(expected);
  };
  test("ogni agente nega i tool CRG non dichiarati", () => {
    for (const rel of ["agents/orchestrator.md", "agents/planner.md", "agents/developer-fixer.md", "agents/profiler.md"]) {
      declared(rel, "apply_refactor_tool", "deny");
      declared(rel, "get_review_context_tool", "deny");
    }
  });
  test("explorer: allow solo i quattro dichiarati, deny il resto", () => {
    for (const t of ["get_minimal_context_tool", "query_graph_tool", "semantic_search_nodes_tool", "get_architecture_overview_tool"]) declared("agents/explorer.md", t, "allow");
    declared("agents/explorer.md", "build_or_update_graph_tool", "allow");
    declared("agents/explorer.md", "apply_refactor_tool", "deny");
  });
  test("code-reviewer: allow i tre dichiarati, deny il resto", () => {
    for (const t of ["detect_changes_tool", "get_review_context_tool", "get_impact_radius_tool"]) declared("agents/code-reviewer.md", t, "allow");
    declared("agents/code-reviewer.md", "build_or_update_graph_tool", "allow");
    declared("agents/code-reviewer.md", "apply_refactor_tool", "deny");
  });
  test("security: allow i tre dichiarati, deny apply_refactor", () => {
    for (const t of ["get_impact_radius_tool", "get_hub_nodes_tool", "get_bridge_nodes_tool"]) declared("agents/security.md", t, "allow");
    declared("agents/security.md", "apply_refactor_tool", "deny");
  });
  test("orchestrator: solo get_minimal_context_tool, nessun tool che scrive", () => {
    declared("agents/orchestrator.md", "get_minimal_context_tool", "allow");
    declared("agents/orchestrator.md", "build_or_update_graph_tool", "deny");
    declared("agents/orchestrator.md", "apply_refactor_tool", "deny");
  });
  test("i tre agenti CRG dichiarano il catalogo come fonte di verita'", () => {
    for (const rel of ["agents/explorer.md", "agents/code-reviewer.md", "agents/security.md"]) {
      expect(readFileSync(join(ROOT, rel), "utf-8")).toContain("Your tool catalog is the source of truth");
    }
  });
});

describe("tool surface documentata per explorer e planner", () => {
  const body = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");
  test("explorer: il grafo e' la PRIMA chiamata e la mappa tools e' documentata", () => {
    const t = body("agents/explorer.md");
    expect(t).toContain("it is the FIRST tool call of any exploration");
    expect(t).toContain('tools["code-review-graph"].get_minimal_context_tool');
    expect(t).toContain('"Unknown tool \'shell\'"');
  });
  test("planner: dichiara l'assenza di ls/sed nativi e i limiti di shell", () => {
    const t = body("agents/planner.md");
    expect(t).toContain("You have no native `ls` and no `sed`");
    expect(t).toContain("restricted to `ls`, `cat` and read-only git commands");
  });
});
