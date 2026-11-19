import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const RELEASE = readFileSync(
  join(REPO_ROOT, ".github", "workflows", "release.yml"),
  "utf-8",
);

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
    expect(gateBody).toContain('git rev-parse "${GITHUB_REF_NAME}^{commit}"');
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

  test("creates the GitHub Release from the CHANGELOG section after the publish", () => {
    const publish = RELEASE.indexOf("npm publish --provenance");
    const release = RELEASE.indexOf("Create the GitHub Release from the CHANGELOG section");
    const create = RELEASE.indexOf("gh release create", publish);
    expect(release).toBeGreaterThan(publish);
    expect(create).toBeGreaterThan(release);
    expect(RELEASE).toContain('gh release create "${GITHUB_REF_NAME}"');
    expect(RELEASE).toContain('--title "${GITHUB_REF_NAME}"');
    expect(RELEASE).toContain('--notes-file "${NOTES}"');
    expect(RELEASE).toContain('## [${VERSION}]');
    expect(RELEASE).toContain("CHANGELOG.md");
    // Built-in token, no stored secret.
    expect(RELEASE).toContain("GH_TOKEN: ${{ github.token }}");
    expect(RELEASE).not.toMatch(/secrets\./);
  });

  test("grants the release job exactly the permissions it needs", () => {
    expect(RELEASE).toMatch(
      /^ {4}permissions:\n {6}contents: write\n {6}id-token: write$/m,
    );
    // The top-level block stays read-only for contents (job-level replaces it).
    expect(RELEASE).toMatch(
      /^permissions:\n {2}contents: read\n {2}id-token: write$/m,
    );
  });

  test("orders checkout, branch gate, tag check, npm upgrade, publish and release", () => {
    const steps = [
      "actions/checkout@",
      "Verify the release branch matches the tag",
      "does not match plugin/package.json version",
      "npm install -g npm@latest",
      "npm publish --provenance",
      "gh release create",
    ].map((needle) => RELEASE.indexOf(needle));
    expect(steps.every((index) => index > -1)).toBe(true);
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i - 1]).toBeLessThan(steps[i] as number);
    }
  });
});
