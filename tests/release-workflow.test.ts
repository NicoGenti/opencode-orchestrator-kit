import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const RELEASE = readFileSync(
  join(REPO_ROOT, ".github", "workflows", "release.yml"),
  "utf-8",
);

const PUBLISH_JOB = RELEASE.slice(
  RELEASE.indexOf("\n  publish:\n"),
  RELEASE.indexOf("\n  release:\n"),
);
const RELEASE_JOB = RELEASE.slice(RELEASE.indexOf("\n  release:\n"));

function awkNotesProgram(): string {
  const match = RELEASE.match(
    /awk -v heading="[^"]*" '([\s\S]*?)' CHANGELOG\.md/,
  );
  if (!match) {
    throw new Error("release.yml carries no awk release-notes program");
  }
  return match[1];
}

const HAS_AWK = (() => {
  const probe = spawnSync("awk", ['BEGIN { print "ok" }'], {
    encoding: "utf8",
  });
  return probe.status === 0 && probe.stdout.trim() === "ok";
})();

function runAwkNotes(heading: string, changelog: string): string {
  const result = spawnSync(
    "awk",
    ["-v", `heading=${heading}`, awkNotesProgram()],
    { input: changelog, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`awk failed: ${String(result.stderr)}`);
  }
  return String(result.stdout);
}

describe("release workflow", () => {
  test("runs only on v* tags and publishes plugin/ via trusted publishing", () => {
    expect(RELEASE).toMatch(/tags:\s*\n\s +- "v\*"/);
    expect(RELEASE).not.toMatch(/pull_request:/);
    expect(RELEASE).toMatch(/id-token:\s*write/);
    expect(RELEASE).toMatch(/bun test/);
    expect(RELEASE).toMatch(/bun run typecheck/);
    expect(RELEASE).toMatch(/bun run lint/);
    expect(RELEASE).toMatch(/bun run format:check/);
    expect(RELEASE).toMatch(/bun run sync-assets --check/);
    expect(RELEASE).toMatch(/plugin\/package\.json/);
    expect(RELEASE).toMatch(/working-directory: plugin/);
    expect(RELEASE).toMatch(/npm publish --provenance --access public/);
    expect(RELEASE).toMatch(/^ {4}environment: npm$/m);
    expect(RELEASE).toMatch(/npm install -g npm@latest/);
    expect(RELEASE).toMatch(/npm --version/);
    expect(RELEASE).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN/);
    expect(RELEASE).not.toMatch(/registry-url/);
    expect(RELEASE).toMatch(/safe to merge/);
  });

  test("pins the exact top-level permissions", () => {
    expect(RELEASE).toMatch(
      /^permissions:\n {2}contents: read\n {2}id-token: write$/m,
    );
  });

  test("keeps the tag check and npm upgrade before the publish step", () => {
    const publish = RELEASE.indexOf("npm publish --provenance");
    const tag = RELEASE.indexOf("does not match plugin/package.json version");
    const upgrade = RELEASE.indexOf("npm install -g npm@latest");
    expect(tag).toBeLessThan(publish);
    expect(upgrade).toBeLessThan(publish);
  });

  test("gates the tag on the release branch head before any publish-path step", () => {
    const gate = RELEASE.indexOf("Verify the release branch matches the tag");
    const gateBody = RELEASE.slice(
      gate,
      RELEASE.indexOf("- name: Setup Bun", gate),
    );
    expect(gate).toBeGreaterThan(-1);
    // The branch name is derived from the tag, never hard-coded.
    expect(gateBody).toContain('BRANCH="release/${GITHUB_REF_NAME}"');
    expect(gateBody).toMatch(/git ls-remote --heads origin/);
    expect(gateBody).toContain("refs/heads/${BRANCH}");
    // Peeling: annotated-tag commits are compared, not github.sha.
    expect(gateBody).toContain(
      'git rev-parse "refs/tags/${GITHUB_REF_NAME}^{commit}"',
    );
    expect(gateBody).not.toMatch(/GITHUB_SHA|github\.sha/);
    expect(gateBody).toContain("::error::");
    expect(gateBody).toMatch(/exit 1/);
    // The failure message names both SHAs.
    expect(gateBody).toContain("head is ${REMOTE_HEAD}");
    expect(gateBody).toContain("points at ${TAG_COMMIT}");

    // Runs after the checkout and before every other step of the job.
    const checkout = RELEASE.indexOf("actions/checkout@");
    const bunSetup = RELEASE.indexOf("- name: Setup Bun");
    const tag = RELEASE.indexOf("does not match plugin/package.json version");
    const publish = RELEASE.indexOf("npm publish --provenance");
    expect(checkout).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(checkout);
    expect(gate).toBeLessThan(bunSetup);
    expect(gate).toBeLessThan(tag);
    expect(gate).toBeLessThan(publish);
    // Full history so the annotated tag object can be peeled locally.
    expect(RELEASE).toMatch(/fetch-depth: 0/);
  });

  test("runs the branch gate immediately after the checkout", () => {
    const checkout = RELEASE.indexOf("actions/checkout@");
    const gate = RELEASE.indexOf(
      "- name: Verify the release branch matches the tag",
    );
    expect(checkout).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(checkout);
    // No other step may sit between the end of the checkout block and the
    // gate: the gate owns the very first `- name:` after the checkout.
    expect(RELEASE.slice(checkout, gate)).not.toMatch(/^\s*- name:/m);
  });

  test("extracts the release notes before the publish", () => {
    const publish = RELEASE.indexOf("npm publish --provenance");
    const extract = RELEASE.indexOf("Extract release notes from CHANGELOG");
    const upload = RELEASE.indexOf("actions/upload-artifact@v4");
    expect(extract).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(extract);
    // A missing or empty CHANGELOG section fails the run before npm runs.
    expect(extract).toBeLessThan(publish);
    expect(upload).toBeLessThan(publish);
    expect(RELEASE).toContain("## [${VERSION}]");
    expect(RELEASE).toContain("CHANGELOG.md");
    expect(RELEASE).toContain("release-notes");
    expect(RELEASE).toContain("grep -q '[^[:space:]]' \"${NOTES}\"");
  });

  test("creates or updates the GitHub Release in a separate job", () => {
    const publish = RELEASE.indexOf("npm publish --provenance");
    const releaseJob = RELEASE.indexOf("\n  release:\n");
    const view = RELEASE.indexOf("gh release view");
    const edit = RELEASE.indexOf("gh release edit");
    const create = RELEASE.indexOf("gh release create");
    expect(releaseJob).toBeGreaterThan(publish);
    expect(view).toBeGreaterThan(releaseJob);
    expect(edit).toBeGreaterThan(view);
    expect(create).toBeGreaterThan(releaseJob);
    expect(RELEASE).toContain("needs: publish");
    // Idempotent: an existing release is edited, a new one is created.
    expect(RELEASE).toContain('gh release edit "${GITHUB_REF_NAME}"');
    expect(RELEASE).toContain('gh release create "${GITHUB_REF_NAME}"');
    expect(RELEASE).toContain("--verify-tag");
    expect(RELEASE).toContain('--title "${GITHUB_REF_NAME}"');
    expect(RELEASE).toContain('--notes-file "${NOTES}"');
    expect(RELEASE).toContain("actions/download-artifact@v4");
    // Built-in token, no stored secret.
    expect(RELEASE).toContain("GH_TOKEN: ${{ github.token }}");
    expect(RELEASE).not.toMatch(/secrets\./);
  });

  test("grants each job exactly the permissions it needs", () => {
    // The publish job keeps contents: read because it runs `bun install`.
    expect(PUBLISH_JOB).toMatch(
      /^ {4}permissions:\n {6}contents: read\n {6}id-token: write$/m,
    );
    expect(PUBLISH_JOB).toContain("bun install --frozen-lockfile");
    // Only the release job may write contents, and it writes nothing else.
    expect(RELEASE_JOB).toMatch(/^ {4}permissions:\n {6}contents: write$/m);
    expect(RELEASE_JOB).not.toMatch(/id-token/);
    expect(RELEASE_JOB).not.toContain("bun install");
    // The top-level block stays read-only for contents (job-level replaces it).
    expect(RELEASE).toMatch(
      /^permissions:\n {2}contents: read\n {2}id-token: write$/m,
    );
  });

  test("orders checkout, gate, tag check, npm upgrade, publish and release", () => {
    const steps = [
      "actions/checkout@",
      "Verify the release branch matches the tag",
      "does not match plugin/package.json version",
      "npm install -g npm@latest",
      "Extract release notes from CHANGELOG",
      "npm publish --provenance",
      "gh release create",
    ].map((needle) => RELEASE.indexOf(needle));
    expect(steps.every((index) => index > -1)).toBe(true);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i - 1]).toBeLessThan(steps[i] as number);
    }
  });

  // The extractor is executed, not just pinned: awk is present on the Linux
  // CI runner and on macOS, and the test skips on a Windows dev box that
  // ships no awk instead of failing there.
  test.skipIf(!HAS_AWK)("extracts only the target CHANGELOG section", () => {
    const changelog = [
      "# Changelog",
      "",
      "## [2.0.0] — 2026-01-02",
      "",
      "- first bullet",
      "- second bullet",
      "",
      "## [1.9.0] — 2025-12-01",
      "",
      "- older bullet",
      "",
    ].join("\n");
    const notes = runAwkNotes("## [2.0.0]", changelog);
    // The regex captured the step's own program, not a lookalike.
    expect(awkNotesProgram()).toContain("index($0, heading) == 1");
    expect(notes).toContain("- first bullet");
    expect(notes).toContain("- second bullet");
    // The heading is dropped and the next section is not part of the notes.
    expect(notes).not.toContain("## [2.0.0]");
    expect(notes).not.toContain("## [1.9.0]");
    expect(notes).not.toContain("older bullet");
  });

  test.skipIf(!HAS_AWK)(
    "yields no notes for a missing CHANGELOG section",
    () => {
      const changelog = [
        "# Changelog",
        "",
        "## [2.0.0] — 2026-01-02",
        "",
        "- first bullet",
        "",
      ].join("\n");
      expect(runAwkNotes("## [9.9.9]", changelog).trim()).toBe("");
    },
  );
});
