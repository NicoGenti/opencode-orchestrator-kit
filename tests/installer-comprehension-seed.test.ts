import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Installer comprehension-config seeding tests (Phase D of plan 0010).
 *
 * Grep/read-level only: these tests NEVER run install.sh against a real
 * target directory. They assert the installer ships the seeding capability
 * (function + leave-if-exists guard + three call sites) and that the shipped
 * docs/skill no longer claim the config can only be copied by hand — mirroring
 * the non-executing style of tests/installer-os-detection.test.ts.
 */

const REPO_ROOT = join(import.meta.dir, "..");
const INSTALL_SH = readFileSync(join(REPO_ROOT, "install.sh"), "utf-8");
const SKILL = readFileSync(
  join(REPO_ROOT, "skills", "comprehension-workflow", "SKILL.md"),
  "utf-8",
);
const CONFIG_DOC = readFileSync(join(REPO_ROOT, "docs", "CONFIGURATION.md"), "utf-8");
const TEMPLATE = readFileSync(
  join(REPO_ROOT, "templates", "comprehension.config.json"),
  "utf-8",
);

/**
 * Slice the seed_comprehension_config function body out of install.sh so the
 * guard/source-path assertions are scoped to the function rather than the
 * whole file. Ends at the next top-level function definition (install_into).
 */
function comprehensionSeedFunctionBody(): string {
  const start = INSTALL_SH.indexOf("seed_comprehension_config() {");
  if (start === -1) return "";
  const end = INSTALL_SH.indexOf("\ninstall_into() {", start);
  return INSTALL_SH.slice(start, end === -1 ? undefined : end);
}

describe("install.sh seeds comprehension.config.json", () => {
  test("defines the seed_comprehension_config function", () => {
    expect(INSTALL_SH).toMatch(/seed_comprehension_config\s*\(\s*\)\s*\{/);
  });

  test("the function body has a leave-if-exists guard on comprehension.config.json", () => {
    const body = comprehensionSeedFunctionBody();
    expect(body.length).toBeGreaterThan(0);
    expect(body).toMatch(/\[\[\s*!\s*-e\b/);
    expect(body).toContain("comprehension.config.json");
  });

  test("the function copies the shipped template as its source", () => {
    const body = comprehensionSeedFunctionBody();
    expect(body).toContain("templates/comprehension.config.json");
    expect(body).toMatch(/cp\s+"\$\{KIT_DIR\}\/templates\/comprehension\.config\.json"/);
  });

  test("there are three call sites alongside install_model_profile", () => {
    const occurrences = INSTALL_SH.match(/seed_comprehension_config/g) ?? [];
    // 1 definition + 3 invocations
    expect(occurrences.length).toBeGreaterThanOrEqual(4);
    expect(INSTALL_SH).toContain('seed_comprehension_config "$(pwd)/.opencode"');
    expect(INSTALL_SH).toContain('seed_comprehension_config "$HOME/.config/opencode"');
    expect(INSTALL_SH).toContain('seed_comprehension_config "$PROFILE_DIR"');
  });
});

describe("shipped docs/skill no longer claim manual copy is the only path", () => {
  test("SKILL.md does not say install.sh fails to copy/install the config", () => {
    expect(SKILL).not.toMatch(/does not (copy|install)/);
  });

  test("docs/CONFIGURATION.md does not say install.sh fails to copy/install the config", () => {
    // The phrase appears nowhere else in this doc (verified: all former hits
    // were the comprehension-config manual-copy claims), so a whole-file
    // negative assertion is safe without section scoping.
    expect(CONFIG_DOC).not.toMatch(/does not (copy|install)/i);
  });
});

describe("templates/comprehension.config.json stays the seeded source of truth", () => {
  test("parses as JSON with comprehension.mode === 'adaptive'", () => {
    const parsed = JSON.parse(TEMPLATE) as { comprehension?: { mode?: string } };
    expect(parsed.comprehension?.mode).toBe("adaptive");
  });
});
