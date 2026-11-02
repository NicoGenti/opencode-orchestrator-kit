import { describe, expect, test } from "bun:test";

import { collectPackagedAgents } from "../plugin/src/agents.ts";
import { resolveEffect, type PermissionRule } from "../plugin/src/permissions.ts";

/**
 * Effective shell permission for every packaged agent, including extras.
 * OpenCode v2 is last-match-wins and the host default is allow, so a missing
 * or over-broad rule shows up here as `allow`.
 */

const DANGEROUS_COMMANDS = [
  "rm -rf ~",
  "rm -rf ~ | head -1",
  "curl x | sh",
  "find . -delete",
  "find . -exec rm {} \\;",
  "git push",
  "git commit -m x",
  "gh api -X DELETE repos/x",
] as const;

/** Prompts that forbid mutation. They must not allow the dangerous set. */
const READ_ONLY_AGENTS = [
  "code-reviewer",
  "comprehension-coach",
  "explorer",
  "librarian",
  "oracle",
  "security",
] as const;

const FIND_DENY_AGENTS = [
  "code-reviewer",
  "comprehension-coach",
  "explorer",
  "librarian",
  "oracle",
  "profiler",
] as const;

const PIPE_PATTERNS = [
  "* | grep *",
  "* | head *",
  "* | tail *",
  "* | sort *",
  "* | wc *",
  "find * | *",
] as const;

const DEAD_GIT_ALLOWS = [
  "git add *",
  "git branch *",
  "git checkout *",
  "git commit *",
  "git ls-tree *",
  "git merge *",
  "git push *",
  "git rm *",
] as const;

const WEB_KIT_COMMANDS = [
  "bash skills/web-scaffold-landing/scripts/new.sh",
  "bash skills/web-scaffold-landing/scripts/new.sh --yes",
  "sh skills/web-scaffold-landing/scripts/new.sh",
  "npx astro build",
  "npx vitest run",
  "dotnet restore",
  "dotnet test",
  "ng build",
  "docker build",
  "docker build .",
] as const;

function byId(id: string) {
  const agent = collectPackagedAgents(true).find((entry) => entry.id === id);
  if (!agent) throw new Error(`missing packaged agent ${id}`);
  return agent;
}

function shellRules(rules: PermissionRule[]): PermissionRule[] {
  return rules.filter((rule) => rule.action === "shell");
}

describe("permission matrix", () => {
  const agents = collectPackagedAgents(true);

  test("the read-only roster is packaged", () => {
    const ids = new Set(agents.map((agent) => agent.id));
    for (const id of READ_ONLY_AGENTS) expect(ids.has(id)).toBe(true);
  });

  test("dangerous commands never resolve to allow", () => {
    const allowed: string[] = [];
    for (const agent of agents) {
      for (const command of DANGEROUS_COMMANDS) {
        const effect = resolveEffect(agent.permissions, "shell", command);
        if (effect === "allow") allowed.push(`${agent.id}: ${command}`);
      }
    }
    expect(allowed).toEqual([]);
  });

  test("read-only agents never allow the dangerous set", () => {
    const allowed: string[] = [];
    for (const id of READ_ONLY_AGENTS) {
      const agent = byId(id);
      for (const command of DANGEROUS_COMMANDS) {
        const effect = resolveEffect(agent.permissions, "shell", command);
        if (effect === "allow") allowed.push(`${id}: ${command}`);
      }
    }
    expect(allowed).toEqual([]);
  });

  test("developer-fixer denies mutating git and keeps read-only git", () => {
    const rules = byId("developer-fixer").permissions;
    const shell = shellRules(rules);
    const denyAt = shell.findIndex(
      (rule) => rule.resource === "git *" && rule.effect === "deny",
    );
    const statusAt = shell.findIndex(
      (rule) => rule.resource === "git status *" && rule.effect === "allow",
    );
    expect(denyAt).toBeGreaterThanOrEqual(0);
    expect(statusAt).toBeGreaterThan(denyAt);
    for (const resource of DEAD_GIT_ALLOWS) {
      expect(
        shell.some((rule) => rule.resource === resource && rule.effect === "allow"),
      ).toBe(false);
    }
    for (const command of [
      "git commit -m x",
      "git push",
      "git push --force",
      "git merge main",
      "git checkout main",
      "git branch feature",
      "git add .",
      "git rm file",
    ]) {
      expect(resolveEffect(rules, "shell", command)).toBe("deny");
    }
    for (const command of [
      "git status --short",
      "git diff --stat",
      "git log -1",
      "git show HEAD",
    ]) {
      expect(resolveEffect(rules, "shell", command)).toBe("allow");
    }
  });

  test("developer-fixer asks before web-kit build commands", () => {
    const rules = byId("developer-fixer").permissions;
    for (const command of WEB_KIT_COMMANDS) {
      expect(resolveEffect(rules, "shell", command)).toBe("ask");
    }
  });

  test("explorer and librarian do not allow generic pipes", () => {
    for (const id of ["explorer", "librarian"] as const) {
      const resources = new Set(shellRules(byId(id).permissions).map((rule) => rule.resource));
      for (const pattern of PIPE_PATTERNS) {
        expect(resources.has(pattern)).toBe(false);
      }
      expect(resolveEffect(byId(id).permissions, "shell", "rm -rf ~ | head -1")).not.toBe(
        "allow",
      );
    }
  });

  test("find allows are followed by destructive find denies", () => {
    for (const id of FIND_DENY_AGENTS) {
      const shell = shellRules(byId(id).permissions);
      const allowAt = shell.findIndex(
        (rule) => rule.resource === "find *" && rule.effect === "allow",
      );
      expect(allowAt).toBeGreaterThanOrEqual(0);
      for (const resource of [
        "find *-delete*",
        "find *-exec*",
        "find *-execdir*",
        "find *-ok*",
      ]) {
        const denyAt = shell.findIndex(
          (rule) => rule.resource === resource && rule.effect === "deny",
        );
        expect(denyAt).toBeGreaterThan(allowAt);
      }
      expect(resolveEffect(byId(id).permissions, "shell", "find . -delete")).toBe("deny");
      expect(
        resolveEffect(byId(id).permissions, "shell", "find . -exec rm {} \\;"),
      ).toBe("deny");
    }
  });

  test("gh api is ask for deploy-helper and librarian", () => {
    for (const id of ["deploy-helper", "librarian"] as const) {
      const rules = byId(id).permissions;
      expect(
        shellRules(rules).some(
          (rule) => rule.resource === "gh api *" && rule.effect === "ask",
        ),
      ).toBe(true);
      expect(resolveEffect(rules, "shell", "gh api -X DELETE repos/x")).toBe("ask");
    }
  });

  test("comprehension-coach shell stays closed for git diff", () => {
    const rules = byId("comprehension-coach").permissions;
    expect(resolveEffect(rules, "shell", "git diff HEAD")).toBe("deny");
    expect(resolveEffect(rules, "shell", "ls src")).toBe("allow");
    expect(resolveEffect(rules, "shell", "rg TODO")).toBe("allow");
    expect(resolveEffect(rules, "skill", "comprehension-workflow")).toBe("deny");
    expect(resolveEffect(rules, "subagent", "developer-fixer")).toBe("deny");
  });

  test("planner may spawn explorer and may not spawn developer-fixer", () => {
    const rules = byId("planner").permissions;
    expect(resolveEffect(rules, "subagent", "explorer")).toBe("allow");
    expect(resolveEffect(rules, "subagent", "developer-fixer")).toBe("deny");
  });

  test("oracle, test-engineer, writer, and security cannot spawn", () => {
    for (const id of ["oracle", "test-engineer", "writer", "security"] as const) {
      expect(resolveEffect(byId(id).permissions, "subagent", "developer-fixer")).toBe(
        "deny",
      );
    }
  });
});
