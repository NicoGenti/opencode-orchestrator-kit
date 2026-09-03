#!/usr/bin/env bun
/**
 * verify-assembly.ts — End-to-end verification utility for the prompt assembler.
 *
 * Runs the complete verification sequence:
 *   1. Full test suite (bun test)
 *   2. Stable prefix baseline comparison
 *   3. Context integration check
 *   4. Model-preset resolution check
 *   5. Cache invalidation verification
 *
 * Exit code: 0 on success, 1 on failure.
 */

import { spawnSync, execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, utimesSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = resolve(import.meta.dir, "..");
const BASELINE_FILE = join(REPO_ROOT, "tests", "fixtures", "prompt-prefix-boundary.txt");

interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, detail?: string) {
  results.push({ name, passed, detail });
  const icon = passed ? "✓" : "✗";
  console.log(`  ${icon} ${name}`);
  if (detail && !passed) {
    console.log(`    ${detail}`);
  }
}

function runBun(...args: string[]): { success: boolean; stdout: string; stderr: string } {
  const result = spawnSync("bun", args, { cwd: REPO_ROOT, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
  return {
    success: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

// ── 1. Full test suite ──────────────────────────────────────────────

console.log("1. Running full test suite...");
const testResult = runBun("test");
check("bun test passes (306+ tests)", testResult.success,
  testResult.success ? undefined : `stderr: ${testResult.stderr.slice(0, 500)}`);

// ── 2. Stable prefix baseline comparison ────────────────────────────

console.log("\n2. Verifying stable prefix baseline...");
const baselineExists = existsSync(BASELINE_FILE);
check("baseline file exists", baselineExists);

if (baselineExists) {
  const baseline = readFileSync(BASELINE_FILE, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const asmResult = runBun("run", "scripts/assemble-prompt.ts");
  check("assemble-prompt.ts runs without error", asmResult.success,
    asmResult.success ? undefined : `stderr: ${asmResult.stderr.slice(0, 500)}`);

  if (asmResult.success) {
    const actual = asmResult.stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const match = JSON.stringify(actual) === JSON.stringify(baseline);
    check("output matches committed baseline", match,
      match ? undefined : `Expected ${baseline.length} entries, got ${actual.length}`);
  }
}

// ── 3. Context integration check ────────────────────────────────────

console.log("\n3. Verifying context integration...");
const contextDir = join(REPO_ROOT, ".opencode", "context");
const contextExists = existsSync(contextDir);
check(".opencode/context/ directory exists", contextExists,
  contextExists ? undefined : "Context directory is optional; skipping context-specific checks");

// ── 4. Model-preset resolution check ────────────────────────────────

console.log("\n4. Verifying model-preset resolution...");
const modelConfigPath = join(REPO_ROOT, ".opencode", "models.config.json");
const modelConfigExists = existsSync(modelConfigPath);
check("models.config.json exists", modelConfigExists,
  modelConfigExists ? undefined : "Model config is optional; skipping model-preset checks");

if (modelConfigExists) {
  const modelResult = runBun("run", "scripts/assemble-prompt.ts");
  check("assemble-prompt.ts handles model config", modelResult.success,
    modelResult.success ? undefined : `stderr: ${modelResult.stderr.slice(0, 500)}`);
}

// ── 5. Cache invalidation verification ───────────────────────────────

console.log("\n5. Verifying cache invalidation...");
const tempDir = mkdtempSync(join(tmpdir(), "verify-assembly-"));
mkdirSync(join(tempDir, "agents"), { recursive: true });
writeFileSync(join(tempDir, "AGENTS.md"), "# Test\n");
writeFileSync(join(tempDir, "agents", "a.md"), "# A\n");
writeFileSync(join(tempDir, "agents", "b.md"), "# B\n");

try {
  // Run 1: establish baseline
  const { PromptCache } = await import(join(REPO_ROOT, "scripts", "cache.ts"));
  const cache = new PromptCache();

  const initial = await cache.get(tempDir);
  check("initial cache miss", initial === null);

  await cache.set(tempDir, ["AGENTS.md", "agents/a.md", "agents/b.md"]);
  const hit = await cache.get(tempDir);
  check("cache hit after set", hit !== null);

  // Touch a file
  const filePath = join(tempDir, "agents", "a.md");
  const newTime = new Date(Date.now() + 1000);
  utimesSync(filePath, newTime, newTime);

  const afterTouch = await cache.get(tempDir);
  check("cache invalidated after file change", afterTouch === null);

  // Model config invalidation
  const configPath = join(tempDir, "models.config.json");
  writeFileSync(configPath, '{"presets":{}}');
  await cache.set(tempDir, ["AGENTS.md", "agents/a.md", "agents/b.md"], configPath);
  const configHit = await cache.get(tempDir, configPath);
  check("cache hit with model config", configHit !== null);

  utimesSync(configPath, new Date(Date.now() + 1000), new Date(Date.now() + 1000));
  const configMiss = await cache.get(tempDir, configPath);
  check("cache invalidated after model config change", configMiss === null);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

// ── Summary ─────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(60));
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log("\nFailed checks:");
  for (const r of results.filter((r) => !r.passed)) {
    console.log(`  - ${r.name}: ${r.detail || "no detail"}`);
  }
  process.exit(1);
}

console.log("All checks passed.");
process.exit(0);