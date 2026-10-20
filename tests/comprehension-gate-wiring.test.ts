/**
 * tests/comprehension-gate-wiring.test.ts — plan 0010 Phase A
 *
 * Guards the operational wiring of the comprehension gate into the
 * orchestrator's close cycle:
 *   - step 6 Close classifies + announces before the progress.md overwrite
 *   - the classification trigger no longer depends on reviewer routing
 *   - the closing-rule outcome set matches docs/ARCHITECTURE.md
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const ORCH = readFileSync(join(REPO_ROOT, "agents/orchestrator.md"), "utf-8");
const ARCH = readFileSync(join(REPO_ROOT, "docs/ARCHITECTURE.md"), "utf-8");
const AGENTS = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf-8");
const CHANGELOG = readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf-8");
const QUICKSTART = readFileSync(join(REPO_ROOT, "QUICKSTART.md"), "utf-8");

describe("comprehension-gate-wiring — Phase A close cycle", () => {
  test("step 6 Close classifies and announces before the progress.md overwrite", () => {
    const close = ORCH.slice(ORCH.indexOf("6. **Close**"), ORCH.indexOf("## Core Rules"));
    expect(close).toMatch(/classify/i);
    expect(close).toMatch(/announce/);
    expect(close.indexOf("classify")).toBeLessThan(close.indexOf("progress.md"));
    expect(close).toMatch(/Slot A/);
    expect(close).toMatch(/enabled: false/);
  });

  test("classification trigger no longer depends on reviewer routing", () => {
    expect(ORCH).toContain(
      "Before closing any completed task — whether or not code-reviewer/security was routed"
    );
    expect(ORCH).not.toContain(
      "After technical validation (code-reviewer and/or security pass) is complete"
    );
  });

  test("closing rule and ARCHITECTURE.md agree on the HUMAN_OWNED outcome set", () => {
    const rule = ORCH.slice(ORCH.indexOf("### Closing rule"), ORCH.indexOf("### Configuration"));
    expect(rule).toContain("TECHNICALLY_DONE");
    expect(rule).toContain("HUMAN_OWNED");
    expect(rule).toMatch(/NONE \(announced\)[\s\S]*PASS[\s\S]*SKIPPED[\s\S]*DISABLED/);

    expect(ARCH).toContain("NONE (announced)");
    const archSentence = ARCH.split(/\r?\n/).find((l) => l.includes("NONE (announced)"));
    expect(archSentence).toBeDefined();
    expect(archSentence).toMatch(/NONE \(announced\)[\s\S]*PASS[\s\S]*SKIPPED[\s\S]*DISABLED/);
  });
});

describe("session/docs surfaces (Phase C)", () => {
  test("AGENTS.md workflow examples classify before updating session memory", () => {
    // Split at heading boundaries so each Example section is its own slice.
    const examples = AGENTS.split(/\r?\n(?=#{1,3} )/).filter((c) => /^### Example\b/i.test(c));
    expect(examples.length).toBeGreaterThanOrEqual(2);

    for (const slice of examples) {
      const classify = slice.search(/classify/i);
      const memory = slice.search(/progress\.md/i);
      expect(classify).toBeGreaterThanOrEqual(0);
      expect(memory).toBeGreaterThanOrEqual(0);
      expect(classify).toBeLessThan(memory);
    }
  });

  test("CHANGELOG budget claim matches the live cap", () => {
    expect(CHANGELOG).not.toContain("27,000");
    expect(CHANGELOG).toContain("24,000");
  });

  test("QUICKSTART.md mentions the comprehension gate", () => {
    expect(QUICKSTART).toMatch(/comprehension/i);
  });
});
