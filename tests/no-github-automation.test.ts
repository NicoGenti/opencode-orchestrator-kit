/**
 * Regression guard: this repository has no GitHub automation beyond CI.
 * The `/agent` issue workflow, its runner prompt/preset, the plan-board issue
 * mirror (`plan-adopt`, `plan-sync`, `scripts/issue_bridge.py`) and the
 * `plan:*` labels were removed on purpose; work arrives through a normal pull
 * request. Extend ALLOWED_WORKFLOWS deliberately if a new workflow is truly
 * needed — never by deleting an assertion.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const WORKFLOWS = join(REPO_ROOT, ".github", "workflows");
const ALLOWED_WORKFLOWS = ["deploy.yml", "release.yml", "test.yml"];

const workflowFiles = readdirSync(WORKFLOWS)
  .filter((f) => /\.ya?ml$/.test(f))
  .sort() as string[];
const workflows = Object.fromEntries(
  workflowFiles.map((f) => [f, readFileSync(join(WORKFLOWS, f), "utf-8")]),
);

describe("no GitHub automation beyond CI", () => {
  test("the only workflows are deploy, release and test", () => {
    expect(workflowFiles).toEqual(ALLOWED_WORKFLOWS);
  });

  test("the /agent workflow and its prompt/preset are gone", () => {
    expect(existsSync(join(WORKFLOWS, "agent-issue.yml"))).toBe(false);
    expect(existsSync(join(REPO_ROOT, ".github", "agent"))).toBe(false);
  });

  test("the plan-board issue mirror is gone", () => {
    expect(existsSync(join(WORKFLOWS, "plan-adopt.yml"))).toBe(false);
    expect(existsSync(join(WORKFLOWS, "plan-sync.yml"))).toBe(false);
    expect(existsSync(join(REPO_ROOT, "scripts", "issue_bridge.py"))).toBe(
      false,
    );
  });

  test("VENDOR.json vendors only the plan board", () => {
    const vendor = JSON.parse(
      readFileSync(join(REPO_ROOT, "scripts", "VENDOR.json"), "utf-8"),
    );
    expect(Object.keys(vendor)).toEqual(["plan-board.py"]);
  });

  test("no workflow reacts to issues or issue comments", () => {
    for (const [file, text] of Object.entries(workflows)) {
      expect(text, `${file} must not trigger on issues`).not.toMatch(
        /^\s{2}issues:/m,
      );
      expect(text, `${file} must not trigger on issue_comment`).not.toMatch(
        /^\s{2}issue_comment:/m,
      );
    }
  });

  test("no workflow runs opencode, touches issues, or reads a model key", () => {
    for (const [file, text] of Object.entries(workflows)) {
      expect(text, `${file} must not run opencode`).not.toMatch(
        /\bopencode run\b/,
      );
      expect(text, `${file} must not call gh issue`).not.toMatch(
        /\bgh issue\b/,
      );
      expect(text, `${file} must not use OPENCODE_API_KEY`).not.toContain(
        "OPENCODE_API_KEY",
      );
      expect(text, `${file} must not use a plan:* label`).not.toMatch(
        /plan:(mirror|divergence|draft|in-progress|qa|complete)/,
      );
    }
  });

  test("CONTRIBUTING documents only the CI gate", () => {
    const contributing = readFileSync(
      join(REPO_ROOT, "CONTRIBUTING.md"),
      "utf-8",
    );
    expect(contributing).not.toMatch(/^## Agent issue workflow$/m);
    expect(contributing).not.toContain("AGENT_KIT_SHA");
    expect(contributing).not.toContain("AGENT_MODEL");
    expect(contributing).not.toContain("issue_bridge.py");
    expect(contributing).not.toContain("plan:mirror");
  });
});
