/**
 * Dependabot is the only automated maintenance left: it must cover the bun
 * toolchain that builds the site and the GitHub Actions that run the tests.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONFIG = readFileSync(
  join(import.meta.dir, "..", ".github", "dependabot.yml"),
  "utf-8",
);

describe("dependabot", () => {
  test("monitors the bun toolchain at the repo root, weekly", () => {
    expect(CONFIG).toContain('package-ecosystem: "bun"');
    expect(CONFIG).toContain('directory: "/"');
    expect(CONFIG).toContain('interval: "weekly"');
    expect(CONFIG).toContain("bun.lock");
  });

  test("monitors GitHub Actions so pinned action versions do not rot", () => {
    expect(CONFIG).toContain('package-ecosystem: "github-actions"');
  });
});
