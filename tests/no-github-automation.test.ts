/**
 * Regression guard: this repository has no GitHub automation beyond CI.
 * The `/agent` issue workflow, its runner prompt/preset, the plan-board issue
 * mirror (`plan-adopt`, `plan-sync`, `scripts/issue_bridge.py`) and the
 * `plan:*` labels were removed on purpose; work arrives through a normal pull
 * request. Extend ALLOWED_WORKFLOWS deliberately if a new workflow is truly
 * needed — never by deleting an assertion.
 * Deliberate extension (PR #127): `snyk-code.yml` and `security-alert-issues.yml`
 * were approved as security tooling; the second opens issues from code-scanning
 * alerts, so `ALLOWED_ISSUE_WRITERS` documents that single, scoped exception.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const WORKFLOWS = join(REPO_ROOT, ".github", "workflows");
// `dependabot-lockfile.yml` only re-runs `bun install` for Dependabot pull
// requests and commits the resulting `bun.lock`: no issue reaction, no
// `opencode run`, no model key. The loops below still cover it.
// `snyk-code.yml` only uploads Snyk SARIF to code scanning.
const ALLOWED_WORKFLOWS = [
  "dependabot-lockfile.yml",
  "deploy.yml",
  "release.yml",
  "security-alert-issues.yml",
  "snyk-code.yml",
  "test.yml",
];

// Deliberate exception approved in PR #127: this workflow creates GitHub
// issues from code-scanning alerts. It is the only file allowed to call
// `gh issue`; the `opencode run` and model-key guards still apply to it.
const ALLOWED_ISSUE_WRITERS = ["security-alert-issues.yml"];

/** Returns the top-level `on:` block only, so an `issues: write` entry under
 * `permissions:` is never mistaken for an `issues:` trigger. */
function triggerBlock(text: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^on:\s*$/.test(line));
  if (start === -1) return "";
  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    block.push(line);
  }
  return block.join("\n");
}

const workflowFiles = readdirSync(WORKFLOWS)
  .filter((f) => /\.ya?ml$/.test(f))
  .sort() as string[];
const workflows = Object.fromEntries(
  workflowFiles.map((f) => [f, readFileSync(join(WORKFLOWS, f), "utf-8")]),
);

describe("no GitHub automation beyond CI", () => {
  test("the only workflows are dependabot-lockfile, deploy, release, security-alert-issues, snyk-code and test", () => {
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
      // Only the trigger block counts: `permissions: issues: write` is not a
      // reaction, while `on:\n  issues:` is and must still be caught.
      const triggers = triggerBlock(text);
      expect(triggers, `${file} must not trigger on issues`).not.toMatch(
        /^\s{2}issues:/m,
      );
      expect(triggers, `${file} must not trigger on issue_comment`).not.toMatch(
        /^\s{2}issue_comment:/m,
      );
    }
  });

  test("no workflow runs opencode, touches issues, or reads a model key", () => {
    for (const [file, text] of Object.entries(workflows)) {
      expect(text, `${file} must not run opencode`).not.toMatch(
        /\bopencode run\b/,
      );
      if (!ALLOWED_ISSUE_WRITERS.includes(file)) {
        expect(text, `${file} must not call gh issue`).not.toMatch(
          /\bgh issue\b/,
        );
      }
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
