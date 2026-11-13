import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  BUDGET_REPORT_FIELDS,
  CLAIM_FIELDS,
  CLAIMS_MANIFEST_FIELDS,
  EVIDENCE_REPORT_FIELDS,
  OVERSIZED_FILE_FIELDS,
  ROLE_DEFAULTS,
  estimateTokens,
  hasTraversalSegment,
  loadGateConfig,
  mergeGateConfig,
  validateBudgetReport,
  validateEvidenceReport,
} from "../scripts/lib/check-common.ts";
import type {
  BudgetReport,
  EvidenceReport,
  GateConfig,
  RoleLimits,
} from "../scripts/lib/check-common.ts";

const REPO_ROOT = join(import.meta.dir, "..");
const TEMPLATE_PATH = join(REPO_ROOT, "templates/gates.config.json");

function templateRoles(): Record<string, RoleLimits> {
  const parsed = JSON.parse(readFileSync(TEMPLATE_PATH, "utf-8")) as {
    gates: { roles: Record<string, RoleLimits> };
  };
  return parsed.gates.roles;
}

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "gates-config-"));
  mkdirSync(join(root, ".opencode"));
  return root;
}

const VALID_BUDGET_REPORT: BudgetReport = {
  role: "explorer",
  verdict: "pass",
  input_tokens_estimate: 120,
  output_tokens_estimate: 0,
  file_count: 2,
  oversized_files: [],
  blocking_issues: [],
};

const VALID_EVIDENCE_REPORT: EvidenceReport = {
  verdict: "pass",
  claims: [
    {
      claim: "the loader rejects traversal",
      status: "verified",
      evidence: "scripts/lib/check-common.ts:169",
    },
  ],
  blocking_issues: [],
};

describe("ROLE_DEFAULTS is the template's canonical default set", () => {
  test("structural deep-equal of templates/gates.config.json gates.roles", () => {
    expect(ROLE_DEFAULTS).toEqual(templateRoles());
  });

  test("pins the issue #151 suggested limits and the default fallback", () => {
    expect(ROLE_DEFAULTS.explorer).toEqual({
      maxFiles: 8,
      maxExtractedLines: 300,
      maxFileLines: 400,
    });
    expect(ROLE_DEFAULTS.planner).toEqual({ maxFiles: 2, maxPhases: 1 });
    expect(ROLE_DEFAULTS["developer-fixer"]).toEqual({
      maxFiles: 5,
      maxPhases: 1,
    });
    expect(ROLE_DEFAULTS["code-reviewer"]).toEqual({ diffOnly: true });
    expect(ROLE_DEFAULTS.default).toEqual({
      maxFiles: 12,
      maxExtractedLines: 500,
      maxFileLines: 400,
    });
  });
});

describe("estimateTokens", () => {
  test("is the documented ceil(chars / 4) heuristic", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(estimateTokens("a".repeat(80))).toBe(20);
  });

  test("is deterministic for the same input", () => {
    const text = "deterministic estimate over the same characters";
    expect(estimateTokens(text)).toBe(estimateTokens(text));
  });
});

describe("hasTraversalSegment", () => {
  test("rejects any exact .. segment with either separator", () => {
    expect(hasTraversalSegment("x/../../evil")).toBe(true);
    expect(hasTraversalSegment("..\\..\\evil")).toBe(true);
    expect(hasTraversalSegment("a/../..")).toBe(true);
    expect(hasTraversalSegment("..")).toBe(true);
    expect(hasTraversalSegment("/abs/../etc/passwd")).toBe(true);
    expect(hasTraversalSegment("scripts\\..\\package.json")).toBe(true);
  });

  test("accepts clean paths, dot-prefixed names, and mid-name dots", () => {
    expect(hasTraversalSegment("scripts/lib/check-common.ts")).toBe(false);
    expect(hasTraversalSegment("/abs/path/to/file.ts")).toBe(false);
    expect(hasTraversalSegment("a/..b/c")).toBe(false);
    expect(hasTraversalSegment("..hidden/file.ts")).toBe(false);
    expect(hasTraversalSegment("")).toBe(false);
  });
});

describe("mergeGateConfig", () => {
  test("overrides one key of one role and leaves every other role untouched", () => {
    const defaults: GateConfig = { roles: structuredClone(ROLE_DEFAULTS) };
    const merged = mergeGateConfig(defaults, {
      roles: { explorer: { maxFiles: 3 } },
    });

    expect(merged.roles.explorer).toEqual({
      maxFiles: 3,
      maxExtractedLines: 300,
      maxFileLines: 400,
    });
    expect(merged.roles.planner).toEqual(ROLE_DEFAULTS.planner);
    expect(merged.roles.default).toEqual(ROLE_DEFAULTS.default);
  });

  test("does not mutate the defaults it receives", () => {
    const defaults: GateConfig = { roles: structuredClone(ROLE_DEFAULTS) };
    mergeGateConfig(defaults, { roles: { explorer: { maxFiles: 3 } } });
    expect(defaults.roles.explorer.maxFiles).toBe(8);
  });
});

describe("loadGateConfig", () => {
  test("missing user config yields the built-in defaults with no warning", () => {
    const root = fixtureRoot();
    try {
      const result = loadGateConfig(root);
      expect(result.config.roles).toEqual(ROLE_DEFAULTS);
      expect(result.configWarning).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a valid override file merges per role entry", () => {
    const root = fixtureRoot();
    try {
      writeFileSync(
        join(root, ".opencode", "gates.config.json"),
        JSON.stringify({
          gates: { roles: { explorer: { maxFiles: 3 } } },
        }),
      );
      const result = loadGateConfig(root);
      expect(result.configWarning).toBeUndefined();
      expect(result.config.roles.explorer).toEqual({
        maxFiles: 3,
        maxExtractedLines: 300,
        maxFileLines: 400,
      });
      expect(result.config.roles["developer-fixer"]).toEqual(
        ROLE_DEFAULTS["developer-fixer"],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("malformed JSON falls back to defaults with invalid-config", () => {
    const root = fixtureRoot();
    try {
      writeFileSync(join(root, ".opencode", "gates.config.json"), "{ nope");
      const result = loadGateConfig(root);
      expect(result.config.roles).toEqual(ROLE_DEFAULTS);
      expect(result.configWarning).toBe("invalid-config");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an invalid shape falls back to defaults with invalid-config", () => {
    const root = fixtureRoot();
    try {
      writeFileSync(
        join(root, ".opencode", "gates.config.json"),
        JSON.stringify({ gates: { roles: { explorer: { maxFiles: "8" } } } }),
      );
      const result = loadGateConfig(root);
      expect(result.config.roles).toEqual(ROLE_DEFAULTS);
      expect(result.configWarning).toBe("invalid-config");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects a traversing explicit path before any filesystem access", () => {
    const missingRoot = join(tmpdir(), "gates-config-does-not-exist");
    expect(() => loadGateConfig(missingRoot, "x/../../evil.json")).toThrow(
      /Path traversal detected/,
    );
    expect(() => loadGateConfig(".", "..\\..\\evil.json")).toThrow(
      /Path traversal detected/,
    );
  });

  test("an explicit config path is read when it is not traversing", () => {
    const root = mkdtempSync(join(tmpdir(), "gates-config-explicit-"));
    try {
      const configPath = join(root, "custom.json");
      writeFileSync(
        configPath,
        JSON.stringify({ gates: { roles: { planner: { maxPhases: 2 } } } }),
      );
      const result = loadGateConfig(root, configPath);
      expect(result.configWarning).toBeUndefined();
      expect(result.config.roles.planner).toEqual({
        maxFiles: 2,
        maxPhases: 2,
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("pinned canonical field lists", () => {
  test("budget report, oversized file, evidence report, and claim fields", () => {
    expect(BUDGET_REPORT_FIELDS).toEqual([
      "role",
      "verdict",
      "input_tokens_estimate",
      "output_tokens_estimate",
      "file_count",
      "oversized_files",
      "blocking_issues",
    ]);
    expect(OVERSIZED_FILE_FIELDS).toEqual(["path", "lines", "reason"]);
    expect(EVIDENCE_REPORT_FIELDS).toEqual([
      "verdict",
      "claims",
      "blocking_issues",
    ]);
    expect(CLAIM_FIELDS).toEqual(["claim", "status", "evidence"]);
    expect(CLAIMS_MANIFEST_FIELDS).toEqual(["claims"]);
  });
});

describe("validateBudgetReport", () => {
  test("accepts a canonical valid report", () => {
    expect(validateBudgetReport(VALID_BUDGET_REPORT)).toEqual({
      valid: true,
      errors: [],
    });
  });

  test("rejects a missing field", () => {
    const withoutRole: Partial<BudgetReport> = { ...VALID_BUDGET_REPORT };
    delete withoutRole.role;
    const result = validateBudgetReport(withoutRole);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("missing field: role");
  });

  test("rejects an unknown field", () => {
    const result = validateBudgetReport({
      ...VALID_BUDGET_REPORT,
      extra: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("unknown field: extra");
  });

  test("rejects an enum-violating verdict", () => {
    const result = validateBudgetReport({
      ...VALID_BUDGET_REPORT,
      verdict: "maybe",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("verdict must be pass|fail");
  });

  test("rejects a malformed oversized_files entry", () => {
    const result = validateBudgetReport({
      ...VALID_BUDGET_REPORT,
      oversized_files: [{ path: "src/service.ts", lines: 820 }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("oversized_files[0] missing field: reason");
  });

  test("accepts the documented oversized-context report shape", () => {
    const report: BudgetReport = {
      role: "explorer",
      verdict: "fail",
      input_tokens_estimate: 4000,
      output_tokens_estimate: 0,
      file_count: 1,
      oversized_files: [
        { path: "src/service.ts", lines: 820, reason: "exceeds_max_lines" },
      ],
      blocking_issues: ["src/service.ts has 820 lines (max 400)"],
    };
    expect(validateBudgetReport(report).valid).toBe(true);
  });
});

describe("validateEvidenceReport", () => {
  test("accepts a canonical valid report", () => {
    expect(validateEvidenceReport(VALID_EVIDENCE_REPORT)).toEqual({
      valid: true,
      errors: [],
    });
  });

  test("accepts resolved_evidence and note as optional claim keys", () => {
    const report: EvidenceReport = {
      verdict: "pass",
      claims: [
        {
          claim: "sync-assets regenerates the mirror",
          status: "verified",
          evidence: "scripts/sync-assets.ts:100",
          resolved_evidence: "scripts/sync-assets.ts:183",
          note: "citation-imprecise",
        },
      ],
      blocking_issues: [],
    };
    expect(validateEvidenceReport(report).valid).toBe(true);
  });

  test("rejects an enum-violating claim status", () => {
    const result = validateEvidenceReport({
      ...VALID_EVIDENCE_REPORT,
      claims: [{ claim: "x", status: "probably", evidence: null }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "claims[0].status must be verified|unverified|contradicted",
    );
  });

  test("rejects a missing claim field and an unknown report field", () => {
    const missing = validateEvidenceReport({
      ...VALID_EVIDENCE_REPORT,
      claims: [{ claim: "x", status: "verified" }],
    });
    expect(missing.errors).toContain("claims[0] missing field: evidence");
    const extra = validateEvidenceReport({
      ...VALID_EVIDENCE_REPORT,
      extra: 1,
    });
    expect(extra.errors).toContain("unknown field: extra");
  });
});
