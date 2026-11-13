import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  checkContextBudget,
  parseBudgetManifest,
  resolveRoleLimits,
} from "../scripts/context-budget.ts";
import {
  BUDGET_REPORT_FIELDS,
  ROLE_DEFAULTS,
  validateBudgetReport,
} from "../scripts/lib/check-common.ts";
import type {
  BudgetManifest,
  BudgetManifestFile,
} from "../scripts/lib/check-common.ts";

const REPO_ROOT = join(import.meta.dir, "..");
const CLI = join(REPO_ROOT, "scripts", "context-budget.ts");

function makeFile(
  path: string,
  lines: number,
  extras: Partial<BudgetManifestFile> = {},
): BudgetManifestFile {
  return { path, lines, ...extras };
}

function makeManifest(overrides: Partial<BudgetManifest> = {}): BudgetManifest {
  return {
    role: "explorer",
    mode: "input",
    spec: "",
    files: [],
    ...overrides,
  };
}

function tempWorkspace(): string {
  return mkdtempSync(join(tmpdir(), "context-budget-"));
}

interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], input?: string): CliResult {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    input,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function writeManifest(root: string, manifest: unknown): void {
  writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest));
}

describe("checkContextBudget — pass", () => {
  test("an explorer manifest inside every limit passes with an empty report", () => {
    const report = checkContextBudget(
      makeManifest({
        files: [
          makeFile("src/a.ts", 10, { chars: 4, extractedLines: 5 }),
          makeFile("src/b.ts", 20, { chars: 8, extractedLines: 10 }),
          makeFile("src/c.ts", 30, { chars: 12, extractedLines: 15 }),
        ],
      }),
      ROLE_DEFAULTS.explorer,
    );

    expect(report).toEqual({
      role: "explorer",
      verdict: "pass",
      input_tokens_estimate: 6,
      output_tokens_estimate: 0,
      file_count: 3,
      oversized_files: [],
      blocking_issues: [],
    });
    expect(Object.keys(report)).toEqual([...BUDGET_REPORT_FIELDS]);
    expect(validateBudgetReport(report).valid).toBe(true);
  });

  test("counts declared chars and falls back to lines × 40", () => {
    const withFallback = checkContextBudget(
      makeManifest({ spec: "abcd", files: [makeFile("src/a.ts", 2)] }),
      ROLE_DEFAULTS.explorer,
    );
    expect(withFallback.input_tokens_estimate).toBe(21); // (4 + 80) / 4

    const withChars = checkContextBudget(
      makeManifest({
        spec: "abcd",
        files: [makeFile("src/a.ts", 200, { chars: 3 })],
      }),
      ROLE_DEFAULTS.explorer,
    );
    expect(withChars.input_tokens_estimate).toBe(2); // ceil(7 / 4)
  });
});

describe("checkContextBudget — oversized context", () => {
  test("a file over maxFileLines lands in oversized_files and fails", () => {
    const report = checkContextBudget(
      makeManifest({
        files: [makeFile("src/service.ts", 820, { extractedLines: 120 })],
      }),
      ROLE_DEFAULTS.explorer,
    );

    expect(report.verdict).toBe("fail");
    expect(report.oversized_files).toEqual([
      { path: "src/service.ts", lines: 820, reason: "exceeds_max_lines" },
    ]);
    expect(report.blocking_issues).toEqual([]);
    expect(validateBudgetReport(report).valid).toBe(true);
  });
});

describe("checkContextBudget — limit breaches", () => {
  function files(count: number): BudgetManifestFile[] {
    return Array.from({ length: count }, (_unused, index) =>
      makeFile(`src/file-${index}.ts`, 10, { extractedLines: 1 }),
    );
  }

  test("more files than maxFiles reports too_many_files", () => {
    const report = checkContextBudget(
      makeManifest({ files: files(9) }),
      ROLE_DEFAULTS.explorer,
    );

    expect(report.verdict).toBe("fail");
    expect(report.file_count).toBe(9);
    expect(report.blocking_issues).toHaveLength(1);
    expect(report.blocking_issues[0]).toContain("too_many_files");
  });

  test("exactly maxFiles still passes", () => {
    const report = checkContextBudget(
      makeManifest({ files: files(8) }),
      ROLE_DEFAULTS.explorer,
    );
    expect(report.verdict).toBe("pass");
    expect(report.blocking_issues).toEqual([]);
  });

  test("summed extracted lines over maxExtractedLines report the breach", () => {
    const report = checkContextBudget(
      makeManifest({
        files: [
          makeFile("src/a.ts", 10, { extractedLines: 200 }),
          makeFile("src/b.ts", 10, { extractedLines: 150 }),
        ],
      }),
      ROLE_DEFAULTS.explorer,
    );

    expect(report.verdict).toBe("fail");
    expect(report.oversized_files).toEqual([]);
    expect(report.blocking_issues[0]).toContain("extracted_lines_exceeded");
  });

  test("more ### Phase headings than maxPhases reports phase_count_exceeded", () => {
    const twoPhases = makeManifest({
      role: "planner",
      spec: "### Phase 1: a\n\nbody\n\n### Phase 2: b\n",
      files: [makeFile("plan.md", 10)],
    });
    const report = checkContextBudget(twoPhases, ROLE_DEFAULTS.planner);
    expect(report.verdict).toBe("fail");
    expect(report.blocking_issues[0]).toContain("phase_count_exceeded");

    const onePhase = checkContextBudget(
      { ...twoPhases, spec: "### Phase 1: a\n\nbody\n" },
      ROLE_DEFAULTS.planner,
    );
    expect(onePhase.verdict).toBe("pass");
  });
});

describe("checkContextBudget — diff-only scope", () => {
  test("a code-reviewer manifest must declare scope diff", () => {
    const manifest = makeManifest({
      role: "code-reviewer",
      files: [makeFile("src/a.ts", 10)],
    });
    const wholeFile = checkContextBudget(
      manifest,
      ROLE_DEFAULTS["code-reviewer"],
    );
    expect(wholeFile.verdict).toBe("fail");
    expect(wholeFile.blocking_issues[0]).toContain("not_diff_scoped");

    const diffScoped = checkContextBudget(
      { ...manifest, scope: "diff" },
      ROLE_DEFAULTS["code-reviewer"],
    );
    expect(diffScoped.verdict).toBe("pass");
    expect(diffScoped.blocking_issues).toEqual([]);
  });
});

describe("checkContextBudget — output mode", () => {
  test("output_tokens_estimate counts the output text only in output mode", () => {
    const output = checkContextBudget(
      makeManifest({ mode: "output", output: "a".repeat(400) }),
      ROLE_DEFAULTS.explorer,
    );
    expect(output.output_tokens_estimate).toBe(100);

    const input = checkContextBudget(
      makeManifest({ mode: "input", output: "a".repeat(400) }),
      ROLE_DEFAULTS.explorer,
    );
    expect(input.output_tokens_estimate).toBe(0);
  });
});

describe("resolveRoleLimits — default fallback", () => {
  const config = { roles: structuredClone(ROLE_DEFAULTS) };

  test("roles without pinned limits fall back to the default entry", () => {
    expect(resolveRoleLimits(config, "oracle")).toEqual(ROLE_DEFAULTS.default);
    expect(resolveRoleLimits(config, "not-a-role")).toEqual(
      ROLE_DEFAULTS.default,
    );
  });

  test("the default entry allows 12 files and rejects 13", () => {
    const files = (count: number) =>
      Array.from({ length: count }, (_unused, index) =>
        makeFile(`src/file-${index}.ts`, 10),
      );
    const limits = resolveRoleLimits(config, "oracle");

    expect(
      checkContextBudget(
        makeManifest({ role: "oracle", files: files(12) }),
        limits,
      ).verdict,
    ).toBe("pass");
    const report = checkContextBudget(
      makeManifest({ role: "oracle", files: files(13) }),
      limits,
    );
    expect(report.verdict).toBe("fail");
    expect(report.blocking_issues[0]).toContain("too_many_files");
  });
});

describe("parseBudgetManifest", () => {
  test("rejects a non-object, a missing field, and an unknown field", () => {
    expect(parseBudgetManifest("nope").manifest).toBeNull();
    expect(
      parseBudgetManifest({ mode: "input", spec: "", files: [] }).errors,
    ).toContain("missing field: role");
    expect(
      parseBudgetManifest({ ...makeManifest(), extra: true }).errors,
    ).toContain("unknown field: extra");
  });

  test("rejects an unknown mode and malformed file entries", () => {
    const errors = parseBudgetManifest({
      role: "explorer",
      mode: "both",
      spec: "",
      files: [{ path: 1, lines: -1 }],
    }).errors;
    expect(errors).toContain("mode must be input|output");
    expect(errors).toContain("files[0].path must be a string");
  });

  test("reconstructs the manifest with the optional fields", () => {
    const parsed = parseBudgetManifest({
      role: "planner",
      mode: "output",
      spec: "### Phase 1",
      files: [{ path: "plan.md", lines: 5, chars: 20, extractedLines: 2 }],
      output: "done",
      scope: "diff",
    });
    expect(parsed.errors).toEqual([]);
    expect(parsed.manifest).toEqual({
      role: "planner",
      mode: "output",
      spec: "### Phase 1",
      files: [{ path: "plan.md", lines: 5, chars: 20, extractedLines: 2 }],
      output: "done",
      scope: "diff",
    });
  });
});

describe("determinism", () => {
  test("two runs over the same manifest serialise byte-identically", () => {
    const manifest = makeManifest({
      mode: "output",
      spec: "### Phase 1: ship\n\nbody\n",
      output: "the assembled answer",
      files: [
        makeFile("src/a.ts", 10, { chars: 20, extractedLines: 3 }),
        makeFile("src/b.ts", 900),
      ],
    });
    const first = checkContextBudget(manifest, ROLE_DEFAULTS.explorer);
    const second = checkContextBudget(manifest, ROLE_DEFAULTS.explorer);

    expect(JSON.stringify(first, null, 2)).toBe(
      JSON.stringify(second, null, 2),
    );
    expect(JSON.parse(JSON.stringify(first))).toEqual(second);
  });
});

describe("config override through the CLI", () => {
  test("the user config lowers explorer maxFiles from 8 to 3", () => {
    const root = tempWorkspace();
    try {
      writeManifest(
        root,
        makeManifest({
          files: [1, 2, 3, 4].map((index) =>
            makeFile(`src/file-${index}.ts`, 10),
          ),
        }),
      );

      const withDefaults = runCli([
        "--root",
        root,
        "--manifest",
        "manifest.json",
      ]);
      expect(withDefaults.status).toBe(0);
      expect(JSON.parse(withDefaults.stdout).verdict).toBe("pass");

      mkdirSync(join(root, ".opencode"));
      writeFileSync(
        join(root, ".opencode", "gates.config.json"),
        JSON.stringify({ gates: { roles: { explorer: { maxFiles: 3 } } } }),
      );

      const withOverride = runCli([
        "--root",
        root,
        "--manifest",
        "manifest.json",
      ]);
      expect(withOverride.status).toBe(1);
      const report = JSON.parse(withOverride.stdout) as {
        verdict: string;
        blocking_issues: string[];
      };
      expect(report.verdict).toBe("fail");
      expect(report.blocking_issues[0]).toContain("too_many_files");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("CLI envelope", () => {
  test("a passing manifest exits 0 with one valid JSON report", () => {
    const root = tempWorkspace();
    try {
      writeManifest(
        root,
        makeManifest({
          files: [
            makeFile("src/a.ts", 10, { extractedLines: 4 }),
            makeFile("src/b.ts", 10, { extractedLines: 6 }),
          ],
        }),
      );
      const result = runCli(["--root", root, "--manifest", "manifest.json"]);

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const report = JSON.parse(result.stdout);
      expect(report.verdict).toBe("pass");
      expect(Object.keys(report)).toEqual([...BUDGET_REPORT_FIELDS]);
      expect(validateBudgetReport(report).valid).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a failing manifest exits 1 and still prints the report", () => {
    const root = tempWorkspace();
    try {
      writeManifest(
        root,
        makeManifest({ files: [makeFile("src/service.ts", 820)] }),
      );
      const result = runCli(["--root", root, "--manifest", "manifest.json"]);

      expect(result.status).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.verdict).toBe("fail");
      expect(report.oversized_files).toEqual([
        { path: "src/service.ts", lines: 820, reason: "exceeds_max_lines" },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("--manifest - reads the manifest from stdin", () => {
    const result = runCli(
      ["--manifest", "-"],
      JSON.stringify(makeManifest({ files: [] })),
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).verdict).toBe("pass");
  });

  test("a traversing --root is rejected before any filesystem access", () => {
    const result = runCli([
      "--root",
      "x/../../evil",
      "--manifest",
      "does-not-exist.json",
    ]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/traversal/i);
  });

  test("a traversing --manifest is rejected", () => {
    const result = runCli(["--manifest", "..\\..\\evil.json"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/traversal/i);
  });

  test("missing arguments print Usage and exit 1", () => {
    const result = runCli([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });
});

/**
 * SC4: the gate scripts are offline and LLM-free. Comments are stripped first
 * because the shared lib's doc comment names the forbidden modules in prose;
 * the assertion is about imports and calls, not about documentation. The third
 * path joins the scan automatically once plan 0008 Phase 3 lands it.
 */
describe("static no-network scan", () => {
  const GATE_SCRIPTS = [
    "scripts/lib/check-common.ts",
    "scripts/context-budget.ts",
    "scripts/evidence-check.ts",
  ];

  function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  }

  test("no gate script imports or calls a network/process API", () => {
    const scanned = GATE_SCRIPTS.filter((relative) =>
      existsSync(join(REPO_ROOT, relative)),
    );
    expect(scanned.length).toBeGreaterThanOrEqual(2);

    for (const relative of scanned) {
      const source = stripComments(
        readFileSync(join(REPO_ROOT, relative), "utf-8"),
      );
      expect(source).not.toMatch(/fetch\(|node:http|node:https|child_process/);
    }
  });
});
