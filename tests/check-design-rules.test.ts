import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  UPSTREAM_RAW_URL,
  diffDesignRules,
  extractDesignRules,
} from "../scripts/check-design-rules.ts";

const ROOT = join(import.meta.dir, "..");

const LOCAL = readFileSync(join(ROOT, "templates", "design-rules.md"), "utf-8");

describe("design-rules drift check (no network)", () => {
  test("the local template carries DR-UI-1 through DR-UI-13 in order", () => {
    const rules = extractDesignRules(LOCAL);
    expect(rules.map((rule) => rule.id)).toEqual(
      Array.from({ length: 13 }, (_, index) => `DR-UI-${index + 1}`),
    );
  });

  test("an identical upstream copy is not drift", () => {
    const rules = extractDesignRules(LOCAL);
    expect(diffDesignRules(rules, rules)).toEqual([]);
  });

  test("a changed rule and a missing rule are both reported", () => {
    const rules = extractDesignRules(LOCAL);
    const mutated = rules.map((rule, index) =>
      index === 0 ? { ...rule, text: `${rule.text}\nextra sentence` } : rule,
    );
    const problems = diffDesignRules(mutated, rules.slice(0, 12));
    expect(problems.map((problem) => problem.message)).toEqual([
      "rule 1 differs (local DR-UI-1, upstream DR-UI-1)",
      "local has extra DR-UI-13",
    ]);
  });

  test("HTML comments that mention a rule id are not rules", () => {
    const markdown = [
      "<!-- copied from DR-UI-1 upstream -->",
      "",
      "- **DR-UI-1 — Token.** Only tokens.",
      "",
      "## Decision Log",
      "",
      "Not a rule.",
    ].join("\n");
    const rules = extractDesignRules(markdown);
    expect(rules).toHaveLength(1);
    expect(rules[0]?.text).toBe("- **DR-UI-1 — Token.** Only tokens.");
  });

  test("the fetch URL is web-kit main and the test workflow does not run it", () => {
    expect(UPSTREAM_RAW_URL).toBe(
      "https://raw.githubusercontent.com/NicoGenti/web-kit/main/docs/design-rules-ui.md",
    );
    const testWorkflow = readFileSync(
      join(ROOT, ".github", "workflows", "test.yml"),
      "utf-8",
    );
    expect(testWorkflow).not.toContain("check-design-rules");
    const scheduled = readFileSync(
      join(ROOT, ".github", "workflows", "check-design-rules.yml"),
      "utf-8",
    );
    expect(scheduled).toContain("workflow_dispatch:");
    expect(scheduled).toMatch(/cron:\s*"0 6 \* \* 1"/);
    expect(scheduled).toContain("bun run check-design-rules");
    expect(scheduled).not.toContain("pull_request:");
    const header = LOCAL.slice(0, LOCAL.indexOf("# Design Rules"));
    expect(header).toContain(
      "https://github.com/NicoGenti/web-kit/blob/main/docs/design-rules-ui.md",
    );
    expect(header).toContain("docs/design-rules-ui.md");
  });
});
