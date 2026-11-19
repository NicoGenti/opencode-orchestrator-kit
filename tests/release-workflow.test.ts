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
});
