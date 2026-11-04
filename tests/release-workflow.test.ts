import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const RELEASE = readFileSync(
  join(REPO_ROOT, ".github", "workflows", "release.yml"),
  "utf-8",
);

describe("release workflow", () => {
  test("runs only on v* tags and publishes plugin/ with provenance", () => {
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
    expect(RELEASE).toMatch(/secrets\.NPM_TOKEN/);
    expect(RELEASE).toMatch(/safe to merge/);
  });
});
