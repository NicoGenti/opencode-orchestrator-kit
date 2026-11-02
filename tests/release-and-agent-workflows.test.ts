import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const RELEASE = readFileSync(
  join(REPO_ROOT, ".github", "workflows", "release.yml"),
  "utf-8",
);
const AGENT = readFileSync(
  join(REPO_ROOT, ".github", "workflows", "agent-issue.yml"),
  "utf-8",
);

describe("release workflow", () => {
  test("runs only on v* tags and publishes plugin/ with provenance", () => {
    expect(RELEASE).toMatch(/tags:\s*\n\s+- "v\*"/);
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

describe("agent issue workflow pins", () => {
  test("kit sha defaults to this checkout and the model comes from a repository variable", () => {
    expect(AGENT).not.toContain("dbd41c7");
    expect(AGENT).toContain(
      "KIT_SHA: ${{ vars.AGENT_KIT_SHA != '' && vars.AGENT_KIT_SHA || github.sha }}",
    );
    expect(AGENT).toContain(
      "MODEL: ${{ vars.AGENT_MODEL != '' && vars.AGENT_MODEL || 'opencode/mimo-v2.6-flash-free' }}",
    );
    expect(AGENT).toMatch(/AGENT_KIT_SHA/);
    expect(AGENT).toMatch(/AGENT_MODEL/);
    expect(AGENT).toMatch(/if \[ "\$KIT_SHA" = "\$GITHUB_SHA" \]/);
    expect(AGENT).toMatch(/KIT_SRC="\$GITHUB_WORKSPACE"/);
    expect(AGENT).toMatch(/repository variable AGENT_KIT_SHA/);
  });
});
