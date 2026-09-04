import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

/**
 * Validator tests for scripts/validate-models.sh.
 *
 * Spawns the bash script with controlled fixture configs and agent
 * directories, and asserts on exit codes and on key diagnostic strings.
 * No real OpenCode state is touched.
 *
 * The validator uses Python 3 (via scripts/apply-model-preset.py's
 * documented dependency) to parse JSON. These tests are skipped on hosts
 * where neither `python3` nor `python` is on PATH; on CI and developer
 * macOS/Linux/Windows one of the two is required by the kit already.
 */

const VALIDATOR_RAW = resolve(import.meta.dir, "..", "scripts", "validate-models.sh");
const VALIDATOR = toBashPath(VALIDATOR_RAW);

/**
 * Convert a Node-style absolute path into a path bash can resolve.
 *
 * On Windows, Git Bash (msys) treats `\` as an escape character in argv, and
 * WSL bash cannot parse `E:\foo\bar` (it sees `E:` as a relative-path
 * prefix). Both Git Bash (modern installs) and WSL accept `/mnt/<drive>/...`
 * paths, so we translate `E:\foo\bar` → `/mnt/e/foo/bar` when a drive
 * prefix is present. POSIX systems are unaffected: drive-prefixed paths do
 * not appear there, so the path is returned unchanged.
 */
function toBashPath(p: string): string {
  const m = p.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!m) return p.replaceAll("\\", "/");
  return "/mnt/" + m[1].toLowerCase() + "/" + m[2].replaceAll("\\", "/");
}

/**
 * Returns true if any usable Python 3 interpreter is on PATH.
 *
 * Probes `python3` first (matches the validator's documented dependency and
 * macOS/Linux/CI behavior), then falls back to `python` for Windows hosts
 * where the launcher is installed only as `python.exe`. The validator itself
 * still invokes `python3`; this resolver only governs whether the test
 * suite is allowed to run on a given host. No skip guard is broadened —
 * the fallback only relaxes the executable-name check, not the assertions.
 */
function hasPython(): boolean {
  for (const cmd of ["python3", "python"]) {
    const probe = spawnSync(cmd, ["--version"], { stdio: "ignore" });
    if (probe.status === 0) return true;
  }
  return false;
}

function bashAvailable(): boolean {
  const probe = spawnSync("bash", ["--version"], { stdio: "ignore" });
  return probe.status === 0;
}

function runValidator(args: string[], cwd: string): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  // Translate Windows-style arg paths so bash can resolve them. cwd stays a
  // Windows path because Node's spawnSync uses Windows APIs for the cwd.
  const bashArgs = args.map((a) => (/^[A-Za-z]:[\\/]/.test(a) ? toBashPath(a) : a));
  const result = spawnSync("bash", [VALIDATOR, ...bashArgs], {
    cwd,
    env: { ...process.env },
    encoding: "utf-8",
  });
  return {
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

/**
 * Recursively remove a temp directory, retrying on Windows EBUSY.
 *
 * On Windows the spawned bash keeps the cwd open for a brief window after
 * the child exits. If `cwd` is the fixture's temp dir the afterAll cleanup
 * races with the kernel's handle release and the rmSync fails with EBUSY.
 * Retrying a few times lets the handle release without changing the test's
 * functional semantics; the directory is still removed.
 */
function safeRmSync(path: string): void {
  const maxAttempts = 10;
  const delayMs = 50;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (err: any) {
      const isBusy = err && (err.code === "EBUSY" || err.code === "EPERM");
      if (!isBusy || attempt === maxAttempts) throw err;
      // Synchronous sleep — small enough not to slow the suite noticeably.
      const until = Date.now() + delayMs;
      while (Date.now() < until) { /* spin briefly */ }
    }
  }
}

describe("validate-models.sh — preflight", () => {
  test("script exists and is a regular file", () => {
    expect(existsSync(VALIDATOR_RAW)).toBe(true);
  });
});

const skipIfNoBashOrPython = !bashAvailable() || !hasPython() ? describe.skip : describe;

skipIfNoBashOrPython("validate-models.sh — known-good default preset", () => {
  let tempDir: string;
  let configPath: string;
  let agentsDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "validate-models-good-"));
    configPath = join(tempDir, "models.config.json");
    agentsDir = join(tempDir, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      default_preset: "default",
      presets: {
        default: {
          label: "default",
          models: {
            TIER_ROUTER: "opencode-go/gpt-5.6-luna",
            TIER_REASONING: "opencode-go/kimi-k3",
            TIER_CODE: "opencode-go/minimax-m3",
            TIER_REVIEW: "opencode-go/minimax-m3",
            TIER_FAST: "ollama/deepseek-v4-flash:cloud",
          },
        },
      },
    }, null, 2));
    // Plant a couple of agent files with the canonical tokens.
    writeFileSync(join(agentsDir, "orchestrator.md"), "---\nmodel: {{TIER_ROUTER}}\n---\n");
    writeFileSync(join(agentsDir, "developer-fixer.md"), "---\nmodel: {{TIER_CODE}}\n---\n");
  });

  afterAll(() => {
    if (tempDir) safeRmSync(tempDir);
  });

  test("exit 0 on the known-good default profile", () => {
    const r = runValidator(["--config", configPath, "--preset", "default"], tempDir);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/OK:/);
    expect(r.stdout).toMatch(/default/);
  });

  test("exit 0 even when --preset is omitted (uses default_preset)", () => {
    const r = runValidator(["--config", configPath, "--skip-agents"], tempDir);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/OK:/);
  });
});

skipIfNoBashOrPython("validate-models.sh — generic preset with unresolved placeholders", () => {
  let tempDir: string;
  let configPath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "validate-models-generic-"));
    configPath = join(tempDir, "models.config.json");
    writeFileSync(configPath, JSON.stringify({
      default_preset: "generic",
      presets: {
        generic: {
          label: "generic",
          models: {
            TIER_ROUTER: "placeholder/router-model-id",
            TIER_REASONING: "placeholder/reasoning-model-id",
            TIER_CODE: "placeholder/code-model-id",
            TIER_REVIEW: "placeholder/review-model-id",
            TIER_FAST: "placeholder/fast-model-id",
          },
        },
      },
    }, null, 2));
  });

  afterAll(() => {
    if (tempDir) safeRmSync(tempDir);
  });

  test("exit non-zero with placeholder diagnostics", () => {
    const r = runValidator(["--config", configPath, "--skip-agents"], tempDir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/unresolved placeholder/);
    expect(r.stdout).toMatch(/placeholder\/reasoning-model-id/);
  });

  test("exit non-zero when --preset is unknown", () => {
    const r = runValidator(
      ["--config", configPath, "--preset", "does-not-exist", "--skip-agents"],
      tempDir,
    );
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/not found/);
  });
});

skipIfNoBashOrPython("validate-models.sh — preset missing a required tier", () => {
  let tempDir: string;
  let configPath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "validate-models-missing-"));
    configPath = join(tempDir, "models.config.json");
    writeFileSync(configPath, JSON.stringify({
      default_preset: "broken",
      presets: {
        broken: {
          label: "broken",
          models: {
            TIER_REASONING: "x/r",
            // TIER_CODE missing — required, no fallback available.
            TIER_FAST: "x/f",
          },
        },
      },
    }, null, 2));
  });

  afterAll(() => {
    if (tempDir) safeRmSync(tempDir);
  });

  test("exit non-zero and names the missing required tier", () => {
    const r = runValidator(["--config", configPath, "--skip-agents"], tempDir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/missing required tier/);
    expect(r.stdout).toMatch(/TIER_CODE/);
  });
});

skipIfNoBashOrPython("validate-models.sh — three-tier legacy preset (backward-compat)", () => {
  let tempDir: string;
  let configPath: string;
  let agentsDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "validate-models-legacy-"));
    configPath = join(tempDir, "models.config.json");
    agentsDir = join(tempDir, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      default_preset: "three-tier-legacy",
      presets: {
        "three-tier-legacy": {
          label: "three-tier-legacy",
          models: {
            TIER_REASONING: "legacy/reasoning",
            TIER_CODE: "legacy/code",
            TIER_FAST: "legacy/fast",
          },
        },
      },
    }, null, 2));
    // Agents exercising the optional tiers — these must resolve via fallback.
    writeFileSync(join(agentsDir, "orchestrator.md"), "---\nmodel: {{TIER_ROUTER}}\n---\n");
    writeFileSync(join(agentsDir, "code-reviewer.md"), "---\nmodel: {{TIER_REVIEW}}\n---\n");
  });

  afterAll(() => {
    if (tempDir) safeRmSync(tempDir);
  });

  test("exit 0 with fallback notes printed", () => {
    const r = runValidator(["--config", configPath], tempDir);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/falling back to TIER_REASONING/);
    expect(r.stdout).toMatch(/falling back to TIER_CODE/);
    expect(r.stdout).toMatch(/OK:/);
  });
});

skipIfNoBashOrPython("validate-models.sh — agent files contain unresolved {{TIER_*}} literals", () => {
  let tempDir: string;
  let configPath: string;
  let agentsDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "validate-models-unresolved-"));
    configPath = join(tempDir, "models.config.json");
    agentsDir = join(tempDir, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      default_preset: "default",
      presets: {
        default: {
          label: "default",
          models: {
            TIER_ROUTER: "opencode-go/gpt-5.6-luna",
            TIER_REASONING: "opencode-go/kimi-k3",
            TIER_CODE: "opencode-go/minimax-m3",
            TIER_REVIEW: "opencode-go/minimax-m3",
            TIER_FAST: "ollama/deepseek-v4-flash:cloud",
          },
        },
      },
    }, null, 2));
    // Unknown tier — must fail token-resolution check.
    writeFileSync(join(agentsDir, "weird.md"), "---\nmodel: {{TIER_UNKNOWN}}\n---\n");
  });

  afterAll(() => {
    if (tempDir) safeRmSync(tempDir);
  });

  test("exit non-zero when an agent uses an unrecognised {{TIER_*}} token", () => {
    const r = runValidator(["--config", configPath], tempDir);
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/preset cannot resolve/);
    expect(r.stdout).toMatch(/TIER_UNKNOWN/);
  });
});

skipIfNoBashOrPython("validate-models.sh — missing config file", () => {
  test("exit non-zero with a clear diagnostic", () => {
    const r = runValidator(["--config", "/nonexistent/path/models.config.json"], process.cwd());
    expect(r.status).not.toBe(0);
    expect(r.stdout).toMatch(/config not found/);
  });
});