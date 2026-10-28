import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseFrontmatterMap } from "../plugin/src/frontmatter-map.ts";
import {
  assertKitPermissionInvariants,
  kitInvariantRules,
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
  return toV2Permissions(parseFrontmatterMap(fm, "permission"), parseFrontmatterMap(fm, "tools"));
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
    expect(parseFrontmatterMap(fm, "tools")).toEqual({ read: true, write: false });
    expect(parseFrontmatterMap(fm, "permission")).toEqual({
      bash: { "*": "deny", "ls *": "allow" },
    });
  });

  test("keeps a colon inside a shell pattern key", () => {
    const fm = ["permission:", "  bash:", '    "*": deny', "    pnpm test:*: allow"].join("\n");
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
  test("orchestrator (inline JSON) translates to exactly the expected rule list", () => {
    expect(rulesOf("agents/orchestrator.md")).toEqual([
      { action: "subagent", resource: "*", effect: "allow" },
      { action: "todowrite", resource: "*", effect: "allow" },
      { action: "read", resource: "*", effect: "allow" },
      { action: "glob", resource: "*", effect: "allow" },
      { action: "grep", resource: "*", effect: "allow" },
      { action: "webfetch", resource: "*", effect: "deny" },
      { action: "edit", resource: "*", effect: "deny" },
      { action: "edit", resource: ".context/progress.md", effect: "allow" },
      { action: "edit", resource: ".context/comprehension/*.md", effect: "allow" },
      { action: "edit", resource: ".context/comprehension-log.md", effect: "allow" },
      { action: "edit", resource: ".context/research-dataset.jsonl", effect: "allow" },
      { action: "edit", resource: "plan/*.md", effect: "allow" },
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
      { action: "skill", resource: "conductor", effect: "allow" },
      { action: "skill", resource: "comprehension-workflow", effect: "allow" },
      { action: "skill", resource: "design-rules-workflow", effect: "allow" },
    ]);
  });

  test("plan-writer (block YAML) folds write+edit into one edit bucket", () => {
    expect(rulesOf("agents/plan-writer.md")).toEqual([
      { action: "edit", resource: "*", effect: "deny" },
      { action: "edit", resource: "plan/*.md", effect: "allow" },
      { action: "webfetch", resource: "*", effect: "deny" },
      { action: "shell", resource: "*", effect: "deny" },
      { action: "shell", resource: "python */plan-board.py *", effect: "allow" },
      { action: "shell", resource: "ls *", effect: "allow" },
      { action: "shell", resource: "cat *", effect: "allow" },
      { action: "subagent", resource: "*", effect: "deny" },
    ]);
  });

  test("a top-level `*` key becomes the global fallback emitted first", () => {
    const rules = rulesOf("agents/security.md");
    expect(rules[0]).toEqual({ action: "*", resource: "*", effect: "deny" });
    expect(rules[1]).toEqual({ action: "read", resource: "*", effect: "allow" });
  });

  test("`tools: {x: false}` becomes a blanket deny emitted before permission rules", () => {
    const rules = toV2Permissions(
      { read: "allow", bash: { "*": "deny", "ls *": "allow" } },
      { write: false, read: true },
    );
    expect(rules[0]).toEqual({ action: "edit", resource: "*", effect: "deny" });
    expect(rules[1]).toEqual({ action: "read", resource: "*", effect: "allow" });
    expect(rules).toHaveLength(4);
  });

  test("collapses V1 globstar segments (V2 `*` already crosses `/`)", () => {
    expect(normalizeResource("plan/**/*.md")).toBe("plan/*.md");
    expect(normalizeResource(".context/comprehension/**/*.md")).toBe(".context/comprehension/*.md");
    expect(normalizeResource("**/*.env")).toBe("*.env");
    expect(normalizeResource("pnpm test:*")).toBe("pnpm test:*");
  });

  test("rejects a non-effect permission value", () => {
    expect(() => toV2Permissions({ read: "yes" }, undefined)).toThrow(/allow\|ask\|deny/);
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
    const rules = [...rulesOf("agents/orchestrator.md"), ...kitInvariantRules("orchestrator")];
    expect(() => assertKitPermissionInvariants("orchestrator", rules)).not.toThrow();
    expect(resolveEffect(rules, "edit", "src/app.ts")).toBe("deny");
    expect(resolveEffect(rules, "edit", "plan/qa/13-example.md")).toBe("deny");
    expect(resolveEffect(rules, "edit", ".context/progress.md")).toBe("allow");
  });

  test("assertKitPermissionInvariants throws when the board deny is missing", () => {
    const rules = [...rulesOf("agents/developer-fixer.md"), ...kitInvariantRules("developer-fixer")];
    expect(() => assertKitPermissionInvariants("developer-fixer", rules)).not.toThrow();
    expect(() =>
      assertKitPermissionInvariants("developer-fixer", rules.filter((r) => r.resource !== "plan/*.md")),
    ).toThrow(/permission invariant violated/);
  });

  test("plan-writer keeps the board root and denies application code", () => {
    const rules = [...rulesOf("agents/plan-writer.md"), ...kitInvariantRules("plan-writer")];
    expect(() => assertKitPermissionInvariants("plan-writer", rules)).not.toThrow();
    expect(resolveEffect(rules, "edit", "plan/qa/13-example.md")).toBe("allow");
    expect(resolveEffect(rules, "edit", "src/app.ts")).toBe("deny");
  });
});

describe("packaged agent manifest permissions", () => {
  test("every packaged agent carries composed V2 rules and passes the invariants", () => {
    const agents = collectPackagedAgents(true);
    expect(agents).toHaveLength(17);
    for (const agent of agents) {
      expect(agent.permissions.length).toBeGreaterThan(0);
      expect(() => assertKitPermissionInvariants(agent.id, agent.permissions)).not.toThrow();
    }
  });

  test("orchestrator ends with the board-root deny and cannot edit application code", () => {
    const orchestrator = collectPackagedAgents(false).find((a) => a.id === "orchestrator");
    expect(orchestrator).toBeDefined();
    const rules = orchestrator!.permissions;
    expect(rules).toHaveLength(26);
    expect(rules[rules.length - 1]).toEqual({
      action: "edit",
      resource: "plan/*.md",
      effect: "deny",
    });
    expect(resolveEffect(rules, "edit", "src/app.ts")).toBe("deny");
    expect(resolveEffect(rules, "edit", ".context/progress.md")).toBe("allow");
  });

  test("plan-writer is the only agent allowed to edit plan files", () => {
    for (const agent of collectPackagedAgents(true)) {
      const effect = resolveEffect(agent.permissions, "edit", "plan/qa/13-example.md");
      expect(`${agent.id}=${effect}`).toBe(
        agent.id === "plan-writer" ? "plan-writer=allow" : `${agent.id}=deny`,
      );
    }
  });
});
