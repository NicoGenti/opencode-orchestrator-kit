import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const WORKFLOWS = join(REPO_ROOT, ".github", "workflows");

// The pre-existing set. `tests/no-github-automation.test.ts` owns the strict
// allowlist; this guard only proves #171 did not add a workflow file.
const WORKFLOW_FILES = [
  "dependabot-lockfile.yml",
  "deploy.yml",
  "release.yml",
  "security-alert-issues.yml",
  "snyk-code.yml",
  "test.yml",
];

describe("GitHub Pages deploys on release tags", () => {
  test("deploy.yml triggers on main, release/v*, tags and dispatch", () => {
    const deploy = readFileSync(join(WORKFLOWS, "deploy.yml"), "utf8");
    const trigger = deploy.split(/^jobs:/m)[0];

    expect(trigger).toMatch(/^on:\s*$/m);
    expect(trigger).toMatch(/^ {2}push:\s*$/m);
    expect(trigger).toMatch(/^ {4}branches:\s*$/m);
    expect(trigger).toContain("- main");
    expect(trigger).toContain('- "release/v*"');
    expect(trigger).toMatch(/^ {4}tags:\s*$/m);
    expect(trigger).toContain('- "v*"');
    expect(trigger).toMatch(/^ {2}workflow_dispatch:\s*$/m);
  });

  test("no workflow was added beyond the pre-existing set", () => {
    const files = readdirSync(WORKFLOWS)
      .filter((name) => /\.ya?ml$/.test(name))
      .sort();
    expect(files).toEqual(WORKFLOW_FILES);
  });
});
