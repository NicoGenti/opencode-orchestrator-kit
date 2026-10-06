import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const CONFIG_PATH = join(REPO_ROOT, "templates/comprehension.config.json");
const ORCHESTRATOR_PATH = join(REPO_ROOT, "agents/orchestrator.md");

/** Returns the content of the "Configuration and precedence" subsection. */
function extractConfigSection(raw: string): string {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex(l => l.trim() === "### Configuration and precedence");
  if (start === -1) throw new Error("Configuration and precedence section not found");
  const end = lines.findIndex((l, i) => i > start && /^## /.test(l.trim()));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

/** Tiny validator matching the spec described in orchestrator.md. */
interface ComprehensionConfig {
  comprehension?: {
    enabled?: boolean;
    mode?: string;
    light?: { questions?: number; modelTier?: string };
    deep?: { questions?: number; modelTier?: string; escalationTier?: string };
    context?: { maxDiffLines?: number; unifiedContextLines?: number; maxRelatedSymbols?: number };
    evaluation?: { maxRetries?: number; escalateOnAmbiguity?: boolean };
  };
}

function validate(cfg: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (typeof cfg !== "object" || cfg === null) return { valid: false, errors: ["not an object"] };
  const c = (cfg as ComprehensionConfig).comprehension;
  if (!c) return { valid: false, errors: ["missing comprehension key"] };

  if (c.enabled !== undefined && typeof c.enabled !== "boolean") errors.push("enabled must be boolean");
  if (c.mode !== undefined && typeof c.mode !== "string") errors.push("mode must be string");
  if (c.light) {
    if (c.light.questions !== undefined) {
      if (!Number.isInteger(c.light.questions) || c.light.questions < 0)
        errors.push("light.questions must be non-negative integer");
    }
    if (c.light.modelTier !== undefined && typeof c.light.modelTier !== "string")
      errors.push("light.modelTier must be string");
  }
  if (c.deep) {
    if (c.deep.questions !== undefined) {
      if (!Number.isInteger(c.deep.questions) || c.deep.questions < 0)
        errors.push("deep.questions must be non-negative integer");
    }
    if (c.deep.modelTier !== undefined && typeof c.deep.modelTier !== "string")
      errors.push("deep.modelTier must be string");
    if (c.deep.escalationTier !== undefined && typeof c.deep.escalationTier !== "string")
      errors.push("deep.escalationTier must be string");
  }
  if (c.context) {
    if (c.context.maxDiffLines !== undefined) {
      if (!Number.isInteger(c.context.maxDiffLines) || c.context.maxDiffLines < 0)
        errors.push("context.maxDiffLines must be non-negative integer");
    }
    if (c.context.unifiedContextLines !== undefined) {
      if (!Number.isInteger(c.context.unifiedContextLines) || c.context.unifiedContextLines < 0)
        errors.push("context.unifiedContextLines must be non-negative integer");
    }
    if (c.context.maxRelatedSymbols !== undefined) {
      if (!Number.isInteger(c.context.maxRelatedSymbols) || c.context.maxRelatedSymbols < 0)
        errors.push("context.maxRelatedSymbols must be non-negative integer");
    }
  }
  if (c.evaluation) {
    if (c.evaluation.maxRetries !== undefined) {
      if (!Number.isInteger(c.Evaluation?.maxRetries) || c.evaluation.maxRetries < 0)
        errors.push("evaluation.maxRetries must be non-negative integer");
    }
    if (c.evaluation.escalateOnAmbiguity !== undefined && typeof c.evaluation.escalateOnAmbiguity !== "boolean")
      errors.push("evaluation.escalateOnAmbiguity must be boolean");
  }

  return { valid: errors.length === 0, errors };
}

// ── Group A: Template existence + schema ───────────────────────────────────────

describe("comprehension-config — Group A: template", () => {
  test("templates/comprehension.config.json exists", () => {
    expect(existsSync(CONFIG_PATH)).toBe(true);
  });

  test("parses as valid JSON", () => {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  test("top-level key is 'comprehension'", () => {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    expect(Object.keys(parsed)).toEqual(["comprehension"]);
  });

  test("light.questions is 2", () => {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.comprehension.light.questions).toBe(2);
  });

  test("deep.questions is 4", () => {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.comprehension.deep.questions).toBe(4);
  });

  test("deep.escalationTier is TIER_REVIEW", () => {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.comprehension.deep.escalationTier).toBe("TIER_REVIEW");
  });

  test("context.maxDiffLines is 300", () => {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.comprehension.context.maxDiffLines).toBe(300);
  });

  test("context.unifiedContextLines is 3", () => {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.comprehension.context.unifiedContextLines).toBe(3);
  });

  test("context.maxRelatedSymbols is 3", () => {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.comprehension.context.maxRelatedSymbols).toBe(3);
  });

  test("evaluation.maxRetries is 1", () => {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.comprehension.evaluation.maxRetries).toBe(1);
  });

  test("evaluation.escalateOnAmbiguity is true", () => {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.comprehension.evaluation.escalateOnAmbiguity).toBe(true);
  });

  test("key order matches the canonical schema exactly", () => {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const c = parsed.comprehension;
    expect(Object.keys(c.light)).toEqual(["questions", "modelTier"]);
    expect(Object.keys(c.deep)).toEqual(["questions", "modelTier", "escalationTier"]);
    expect(Object.keys(c.context)).toEqual(["maxDiffLines", "unifiedContextLines", "maxRelatedSymbols"]);
    expect(Object.keys(c.evaluation)).toEqual(["maxRetries", "escalateOnAmbiguity"]);
  });
});

// ── Group B: Cross-check orchestrator defaults ─────────────────────────────────

describe("comprehension-config — Group B: orchestrator cross-check", () => {
  test("Configuration and precedence section exists in orchestrator", () => {
    const raw = readFileSync(ORCHESTRATOR_PATH, "utf-8");
    expect(raw).toMatch(/### Configuration and precedence/);
  });

  // Table cells are written "| `key` | `value` |"; allow arbitrary spacing.
  test("defaults table lists enabled true", () => {
    const raw = readFileSync(ORCHESTRATOR_PATH, "utf-8");
    expect(raw).toMatch(/\|\s*`enabled`\s*\|\s*`true`\s*\|/);
  });

  test("defaults table lists light.questions 2", () => {
    const raw = readFileSync(ORCHESTRATOR_PATH, "utf-8");
    expect(raw).toMatch(/\|\s*`light\.questions`\s*\|\s*`2`\s*\|/);
  });

  test("defaults table lists deep.questions 4", () => {
    const raw = readFileSync(ORCHESTRATOR_PATH, "utf-8");
    expect(raw).toMatch(/\|\s*`deep\.questions`\s*\|\s*`4`\s*\|/);
  });

  test("defaults table lists deep.escalationTier TIER_REVIEW", () => {
    const raw = readFileSync(ORCHESTRATOR_PATH, "utf-8");
    expect(raw).toMatch(/\|\s*`deep\.escalationTier`\s*\|\s*`TIER_REVIEW`\s*\|/);
  });

  test("defaults table lists context.maxDiffLines 300", () => {
    const raw = readFileSync(ORCHESTRATOR_PATH, "utf-8");
    expect(raw).toMatch(/\|\s*`context\.maxDiffLines`\s*\|\s*`300`\s*\|/);
  });

  test("defaults table lists context.unifiedContextLines 3", () => {
    const raw = readFileSync(ORCHESTRATOR_PATH, "utf-8");
    expect(raw).toMatch(/\|\s*`context\.unifiedContextLines`\s*\|\s*`3`\s*\|/);
  });

  test("defaults table lists context.maxRelatedSymbols 3", () => {
    const raw = readFileSync(ORCHESTRATOR_PATH, "utf-8");
    expect(raw).toMatch(/\|\s*`context\.maxRelatedSymbols`\s*\|\s*`3`\s*\|/);
  });

  test("defaults table lists evaluation.maxRetries 1", () => {
    const raw = readFileSync(ORCHESTRATOR_PATH, "utf-8");
    expect(raw).toMatch(/\|\s*`evaluation\.maxRetries`\s*\|\s*`1`\s*\|/);
  });

  test("defaults table lists evaluation.escalateOnAmbiguity true", () => {
    const raw = readFileSync(ORCHESTRATOR_PATH, "utf-8");
    expect(raw).toMatch(/\|\s*`evaluation\.escalateOnAmbiguity`\s*\|\s*`true`\s*\|/);
  });
});

// ── Group C: Negative validation ───────────────────────────────────────────────

describe("comprehension-config — Group C: negative validation", () => {
  test("missing context.maxDiffLines is invalid", () => {
    const base = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    const mutated = { comprehension: { ...base.comprehension, context: { unifiedContextLines: 3, maxRelatedSymbols: 3 } } };
    const result = validate(mutated);
    expect(result.valid).toBe(false);
  });

  test("negative questions is invalid", () => {
    const base = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    const mutated = { comprehension: { ...base.comprehension, deep: { questions: -5, modelTier: "TIER_FAST", escalationTier: "TIER_REVIEW" } } };
    const result = validate(mutated);
    expect(result.valid).toBe(false);
  });

  test("negative context.maxDiffLines is invalid", () => {
    const base = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    const mutated = { comprehension: { ...base.comprehension, context: { maxDiffLines: -1, unifiedContextLines: 3, maxRelatedSymbols: 3 } } };
    const result = validate(mutated);
    expect(result.valid).toBe(false);
  });
});

// ── Group D: unknown-tier sweep ───────────────────────────────────────────────
// The orchestrator deliberately names the forbidden token once, inside a
// prohibition sentence; that exact line is the only permitted match outside
// git-local plan prose. The token is assembled from parts so this test file
// never contains the literal string it sweeps for.

describe("comprehension-config — Group D: unknown-tier sweep", () => {
  test("no unknown comprehension tier token appears in shipped files", async () => {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);
    const tier = ["TIER", "COMPREHENSION"].join("_");
    const { stdout } = await execAsync(
      `grep -rn "${tier}" --include="*.md" --include="*.ts" --include="*.json" --include="*.yml" --include="*.yaml" --include="*.txt" --exclude-dir=node_modules --exclude-dir=.git . 2>/dev/null || true`,
      { cwd: REPO_ROOT }
    );
    const hits = stdout.trim().split("\n").filter(Boolean).map(h => h.replace(/^\.\//, ""));
    const prohibitionLine =
      "No new tier token is introduced (no `" + tier +
      "`); tier resolution stays on the existing `TIER_FAST` / `TIER_REVIEW` mapping via the preset resolver.";
    const allowed = hits.filter(h => {
      if (h.startsWith("plan/")) return true; // git-local plan prose, never shipped
      const m = h.match(/^([^:]+):(\d+):(.*)$/);
      return !!m && m[1] === "agents/orchestrator.md" && m[3] === prohibitionLine;
    });
    expect(allowed.length).toBe(hits.length);
    expect(hits.length).toBeGreaterThan(0); // the prohibition line itself must still be found
  });
});

// ── Group E: slicing & asymmetric evaluation ──────────────────────────────────

describe("comprehension-config — Group E: slicing & asymmetric evaluation", () => {
  const orchestratorContent = readFileSync(join(REPO_ROOT, "agents/orchestrator.md"), "utf-8");
  const coachContent = readFileSync(join(REPO_ROOT, "agents/comprehension-coach.md"), "utf-8");

  test("orchestrator.md contains the slicing pipeline wording", () => {
    expect(orchestratorContent).toContain("git diff");
    expect(orchestratorContent).toContain("changed symbols");
    expect(orchestratorContent).toContain("surrounding context");
    expect(orchestratorContent).toContain("comprehension-coach");
  });

  test("orchestrator.md contains the hotspot cap (maxDiffLines / focused lines)", () => {
    expect(orchestratorContent).toMatch(/maxDiffLines.*focused lines|focused lines.*maxDiffLines/);
    expect(orchestratorContent).toContain("≤ `maxDiffLines`");
  });

  test("orchestrator.md contains asymmetric evaluation wording", () => {
    expect(orchestratorContent).toContain("Asymmetric context");
  });

  test("orchestrator.md contains the Slicer delegation to explorer", () => {
    expect(orchestratorContent).toContain("delegates to `explorer`");
    expect(orchestratorContent).toContain("TIER_FAST");
  });

  test("orchestrator.md contains the no-whole-file-in-EVALUATE rule", () => {
    expect(orchestratorContent).toContain("whole-file re-read in EVALUATE");
  });

  test("comprehension-coach.md contains the Q→symbol map consumption rule", () => {
    expect(coachContent).toMatch(/Q\d+.*→.*[`\w.]+\(\)/);
    expect(coachContent).toContain("Q→symbol map");
  });

  test("comprehension-coach.md contains the whole-file re-read prohibition in EVALUATE", () => {
    expect(coachContent).toMatch(/whole.file re.read.*EVALUATE|EVALUATE.*whole.file re.read/i);
  });

  test("comprehension-coach.md describes that CHALLENGE context may extend to the slice", () => {
    expect(coachContent).toContain("CHALLENGE context may extend up to the slice");
    expect(coachContent).toContain("Slicer");
  });
});


// ── Group F: escalation routing & docs ──────────────────────────────────────

describe("comprehension-config — Group F: escalation routing & docs", () => {
  const orchestratorContent = readFileSync(join(REPO_ROOT, "agents/orchestrator.md"), "utf-8");
  const configDocContent = readFileSync(join(REPO_ROOT, "docs/CONFIGURATION.md"), "utf-8");

  test("orchestrator.md contains single escalation wording (never chained, never on PASS)", () => {
    expect(orchestratorContent).toContain("exactly ONE escalation per task evaluation");
    expect(orchestratorContent).toMatch(/never \w+ on a verdict of PASS/i);
  });

  test("orchestrator.md contains all three escalation trigger conditions", () => {
    expect(orchestratorContent).toContain("the evaluation result is ambiguous");
    expect(orchestratorContent).toContain("security-critical");
    expect(orchestratorContent).toContain("architectural decision cannot be confidently judged");
  });

  test("orchestrator.md contains tier-not-name mapping rule", () => {
    expect(orchestratorContent).toContain("follows the tier, not the fixed name");
    expect(orchestratorContent).toMatch(/code-reviewer.*TIER_REVIEW|TIER_REVIEW.*code-reviewer/);
  });

  test("orchestrator.md contains final verdict wording (no second evaluation, no second retry)", () => {
    expect(orchestratorContent).toMatch(/verdict is FINAL/i);
    expect(orchestratorContent).toMatch(/no second evaluation/i);
  });

  test("docs/CONFIGURATION.md contains the Comprehension section title", () => {
    expect(configDocContent).toContain("## Comprehension configuration");
  });

  test("docs/CONFIGURATION.md contains the default limits table", () => {
    expect(configDocContent).toMatch(/\|\s*`enabled`\s*\|\s*`true`\s*\|/);
    expect(configDocContent).toMatch(/\|\s*`light\.questions`\s*\|\s*`2`\s*\|/);
    expect(configDocContent).toMatch(/\|\s*`deep\.escalationTier`\s*\|\s*`TIER_REVIEW`\s*\|/);
  });

  test("docs/CONFIGURATION.md contains the manual copy note", () => {
    expect(configDocContent).toMatch(/`install\.sh` does not copy/);
    expect(configDocContent).toMatch(/cp templates\/comprehension\.config\.json/);
  });
});
