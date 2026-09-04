import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Phase 3 documentation-consistency tests.
 *
 * These tests lock the Phase 3 acceptance criteria that are documentation-only
 * (no code behavior change required). The criteria they enforce:
 *
 *   1. README must contain one responsibility table covering all six required
 *      concerns: exploration, planning, implementation, testing, review,
 *      and security. The table must live under the "Agent roster" section
 *      so the README has a single canonical place a user can look up "who
 *      handles X".
 *
 *   2. README, QUICKSTART.md, and docs/SETUP-NATIVE.md MUST NOT tell users
 *      to copy `extras/` by default. The default install path (scripted or
 *      manual) must omit `extras/`. The `--with-extras` flag must be
 *      mentioned in every install-path document so users know how to opt
 *      in if they want it.
 *
 *   3. README must direct users to .opencode/models.config.json for
 *      provider/model customization, and MUST NOT tell users to edit the
 *      `model:` field of any agent's frontmatter directly. The same rule
 *      must hold for QUICKSTART.md and docs/SETUP-NATIVE.md.
 *
 *   4. README must explicitly mention the editable `generic` profile in
 *      templates/models.config.json and explain that the `default` profile
 *      references the kit's known-good provider IDs (so users without
 *      those provider accounts understand why they must edit the profile
 *      before their first /start-session).
 *
 *   5. pc-doctor, writer, and librarian MUST be described as opt-in by the
 *      README's roster text (not as default-installed).
 *
 * The tests are intentionally strict on regex phrases to make Phase 3
 * regressions loud and easy to diagnose.
 */

const REPO_ROOT = join(import.meta.dir, "..");
const README = readFileSync(join(REPO_ROOT, "README.md"), "utf-8");
const QUICKSTART = readFileSync(join(REPO_ROOT, "QUICKSTART.md"), "utf-8");
const SETUP_NATIVE = readFileSync(join(REPO_ROOT, "docs", "SETUP-NATIVE.md"), "utf-8");

describe("README — Phase 3 acceptance: single responsibility table for the six required concerns", () => {
  /**
   * The README must contain exactly one section, named "Agent roster" or
   * similar, that lists one primary agent for each of the six required
   * concerns: exploration, planning, implementation, testing, review,
   * and security. The table header should be the first table after that
   * section heading.
   */
  function readRosterSection(): string {
    // Pull the "Agent roster" / "👥 Agent roster" heading and everything
    // up to the next ## heading.
    const match = README.match(/^##\s+[^\n]*Agent roster[^\n]*\r?\n([\s\S]*?)(?=^##\s)/m);
    if (!match) {
      throw new Error('README missing an "Agent roster" section.');
    }
    return match[1];
  }

  test('"Agent roster" section exists in the README', () => {
    expect(readRosterSection().length).toBeGreaterThan(0);
  });

  test("responsibility table covers exploration (explorer)", () => {
    const section = readRosterSection();
    expect(section).toMatch(/exploration/i);
    expect(section).toMatch(/explorer/);
  });

  test("responsibility table covers planning (planner)", () => {
    const section = readRosterSection();
    expect(section).toMatch(/planning/i);
    expect(section).toMatch(/planner/);
  });

  test("responsibility table covers implementation (developer-fixer)", () => {
    const section = readRosterSection();
    expect(section).toMatch(/implementation/i);
    expect(section).toMatch(/developer-fixer/);
  });

  test("responsibility table covers testing (test-engineer)", () => {
    const section = readRosterSection();
    expect(section).toMatch(/testing/i);
    expect(section).toMatch(/test-engineer/);
  });

  test("responsibility table covers review (code-reviewer)", () => {
    const section = readRosterSection();
    expect(section).toMatch(/review/i);
    expect(section).toMatch(/code-reviewer/);
  });

  test("responsibility table covers security (security)", () => {
    const section = readRosterSection();
    expect(section).toMatch(/security/i);
    expect(section).toMatch(/agents\/security\.md|security/);
  });

  test("responsibility table mentions the orchestrator's role explicitly", () => {
    const section = readRosterSection();
    expect(section).toMatch(/orchestr(at|ation)/i);
  });
});

describe("README — Phase 3 acceptance: extras are opt-in", () => {
  test("README does NOT instruct copying extras/ by default", () => {
    // The previous README had a line like "copy `agents/`, `extras/`, ..."
    // in the quickstart. The replacement MUST NOT instruct users to copy
    // extras/ in the default path.
    const defaultCopyPattern = /copy\s+[`'\"]?[a-z\/\s,]*extras[`'\"]?/i;
    expect(README).not.toMatch(defaultCopyPattern);
  });

  test("README explicitly mentions --with-extras as the way to install extras/", () => {
    expect(README).toMatch(/--with-extras/);
    expect(README).toMatch(/extras\/.*pc-doctor|pc-doctor.*writer/i);
  });

  test("README describes pc-doctor and writer as opt-in (not default)", () => {
    // pc-doctor and writer should appear in an opt-in or explicit context.
    // Look across a generous window after each occurrence (1.5k chars is
    // enough to span the agent-roster tier table and the follow-up prose).
    const pcDoctorIdx = README.search(/pc-doctor/);
    const writerIdx = README.search(/writer/);
    expect(pcDoctorIdx).toBeGreaterThan(-1);
    expect(writerIdx).toBeGreaterThan(-1);
    const optInMarkers = /opt[- ]in|explicit|--with-extras|off by default/i;
    const afterPc = README.slice(pcDoctorIdx, pcDoctorIdx + 1500);
    const afterWriter = README.slice(writerIdx, writerIdx + 1500);
    expect(optInMarkers.test(afterPc) || optInMarkers.test(afterWriter)).toBe(true);
  });

  test("README describes librarian as opt-in", () => {
    expect(README).toMatch(/librarian/);
    const libIdx = README.search(/librarian/);
    const afterLib = README.slice(libIdx, libIdx + 1500);
    expect(afterLib).toMatch(/opt[- ]in|explicit/i);
  });
});

describe("README — Phase 3 acceptance: model setup points to .opencode/models.config.json, not agent frontmatter", () => {
  test("README mentions .opencode/models.config.json", () => {
    expect(README).toMatch(/\.opencode\/models\.config\.json/);
  });

  test("README mentions templates/models.config.json", () => {
    expect(README).toMatch(/templates\/models\.config\.json/);
  });

  test("README explains the editable generic profile", () => {
    expect(README).toMatch(/generic/i);
    expect(README).toMatch(/placeholder/);
  });

  test("README does NOT instruct users to edit each agent's `model:` frontmatter directly", () => {
    // The pre-Phase-3 line "Swap models per agent by editing the `model:`
    // field in each agent's frontmatter" MUST be gone. A positive framing
    // about .opencode/models.config.json must replace it.
    const prohibited = /edit(?:ing)?\s+the\s+`?model:`?\s+field\s+in\s+each\s+agent/i;
    expect(README).not.toMatch(prohibited);
  });

  test("README has an explicit prohibition against direct agent-frontmatter edits", () => {
    // Look for a "do not edit ... agent's ... model: ..." instruction,
    // which is how the README phrases the prohibition (the word
    // `frontmatter` may not appear in the same sentence as the prohibition).
    const prohibition = /do\s+\*\*?not\*\*?\s+edit[^\n]*agent[^\n]*model|do\s+\*\*?not\*\*?\s+edit[^\n]*model[^\n]*field[^\n]*agent/i;
    expect(README).toMatch(prohibition);
  });

  test("README mentions the five-tier abstraction (TIER_REASONING, TIER_CODE, TIER_FAST)", () => {
    expect(README).toMatch(/TIER_REASONING/);
    expect(README).toMatch(/TIER_CODE/);
    expect(README).toMatch(/TIER_FAST/);
  });
});

describe("QUICKSTART.md — Phase 3 acceptance: same constraints as README", () => {
  test("QUICKSTART mentions .opencode/models.config.json", () => {
    expect(QUICKSTART).toMatch(/\.opencode\/models\.config\.json/);
  });

  test("QUICKSTART mentions --with-extras", () => {
    expect(QUICKSTART).toMatch(/--with-extras/);
  });

  test("QUICKSTART does NOT instruct copying extras/ by default", () => {
    const defaultCopyPattern = /copy\s+[`'\"]?[a-z\/\s,]*extras[`'\"]?/i;
    expect(QUICKSTART).not.toMatch(defaultCopyPattern);
  });

  test("QUICKSTART does NOT instruct direct agent-frontmatter model edits", () => {
    const prohibited = /edit(?:ing)?\s+the\s+`?model:`?\s+field\s+in\s+each\s+agent/i;
    expect(QUICKSTART).not.toMatch(prohibited);
  });

  test("QUICKSTART explicitly requires the user to configure at least one provider", () => {
    // The pre-Phase-3 QUICKSTART said nothing about needing a provider
    // mapping of your own. The replacement must mention it.
    expect(QUICKSTART).toMatch(/provider/i);
    expect(QUICKSTART).toMatch(/your own|of your own/i);
  });
});

describe("docs/SETUP-NATIVE.md — Phase 3 acceptance: same constraints as README", () => {
  test("SETUP-NATIVE mentions .opencode/models.config.json", () => {
    expect(SETUP_NATIVE).toMatch(/\.opencode\/models\.config\.json/);
  });

  test("SETUP-NATIVE mentions --with-extras", () => {
    expect(SETUP_NATIVE).toMatch(/--with-extras/);
  });

  test("SETUP-NATIVE does NOT instruct copying extras/ by default", () => {
    const defaultCopyPattern = /copy\s+[`'\"]?[a-z\/\s,]*extras[`'\"]?/i;
    expect(SETUP_NATIVE).not.toMatch(defaultCopyPattern);
  });

  test("SETUP-NATIVE does NOT instruct direct agent-frontmatter model edits", () => {
    const prohibited = /edit(?:ing)?\s+the\s+`?model:`?\s+field\s+in\s+each\s+agent/i;
    expect(SETUP_NATIVE).not.toMatch(prohibited);
  });

  test("SETUP-NATIVE has an explicit prohibition against direct agent-frontmatter edits", () => {
    const prohibition = /do\s+\*\*?not\*\*?\s+edit[^\n]*agent[^\n]*model|do\s+\*\*?not\*\*?\s+edit[^\n]*model[^\n]*field[^\n]*agent/i;
    expect(SETUP_NATIVE).toMatch(prohibition);
  });

  test("SETUP-NATIVE explains the generic profile and placeholders", () => {
    expect(SETUP_NATIVE).toMatch(/generic/i);
    expect(SETUP_NATIVE).toMatch(/placeholder/);
  });

  test("SETUP-NATIVE documents the OS allowlist behavior", () => {
    // Phase 3 criterion 2 says the installer must produce a clear error
    // for unsupported OS environments. SETUP-NATIVE must at least mention
    // that the installer refuses unsupported OS and how to interpret the
    // resulting message.
    expect(SETUP_NATIVE).toMatch(/supported (operating system|environment|shell)/i);
    expect(SETUP_NATIVE).toMatch(/Git Bash|MSYS|Cygwin/);
    expect(SETUP_NATIVE).toMatch(/Linux/);
    expect(SETUP_NATIVE).toMatch(/macOS/);
  });
});

describe("Documentation — Phase 3 acceptance: cross-file consistency", () => {
  test("all three documents agree the default install omits extras/", () => {
    // The three docs should each state extras/ is off by default. We check
    // for a consistent phrase in each.
    const pattern = /off by default/i;
    expect(README).toMatch(pattern);
    expect(QUICKSTART).toMatch(pattern);
    expect(SETUP_NATIVE).toMatch(pattern);
  });

  test("all three documents agree to point at .opencode/models.config.json", () => {
    const pattern = /\.opencode\/models\.config\.json/;
    expect(README).toMatch(pattern);
    expect(QUICKSTART).toMatch(pattern);
    expect(SETUP_NATIVE).toMatch(pattern);
  });

  test("all three documents forbid direct agent-frontmatter edits", () => {
    // README and SETUP-NATIVE both state the prohibition explicitly (the
    // prohibition uses the "do not edit ... model: ... agent" phrasing,
    // not necessarily containing the literal word `frontmatter` in the
    // same sentence); QUICKSTART at minimum does not contradict them.
    expect(README).toMatch(/do\s+\*\*?not\*\*?\s+edit[^\n]*model[^\n]*agent/i);
    expect(SETUP_NATIVE).toMatch(/do\s+\*\*?not\*\*?\s+edit[^\n]*model[^\n]*agent/i);
    expect(QUICKSTART).not.toMatch(/edit(?:ing)?\s+the\s+`?model:`?\s+field\s+in\s+each\s+agent/i);
  });
});