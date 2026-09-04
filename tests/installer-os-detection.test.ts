import { beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync } from "node:fs";
import { spawnSync, SpawnSyncReturns } from "node:child_process";
import { join, resolve } from "node:path";

/**
 * OS-detection tests for scripts/detect-os.sh and the install.sh OS gate.
 *
 * Phase 3 acceptance criterion 2 requires the installer to produce a clear,
 * non-zero diagnostic for unsupported operating-system environments, while
 * keeping Linux, macOS, and Windows Git Bash / MSYS / Cygwin supported.
 *
 * These tests are "safe" in the sense that they never modify the
 * filesystem or invoke the real installer against a real target directory.
 * They only:
 *   - exec the detector script with controlled env overrides, and
 *   - spawn install.sh in a no-args mode that prints usage and exits 1
 *     (the OS gate runs first, before any argument parsing).
 *
 * The script exposes two documented test-only overrides:
 *   KIT_FORCE_KIND=<kind>     — forces a specific supported branch
 *   KIT_FORCE_UNSUPPORTED=1   — forces the unsupported branch
 *
 * Why interactive (no `-c`) and stdin? On the WSL/Linux bash available to
 * this test suite, argv-supplied env vars do not propagate from Node's
 * `spawnSync({ env })` into the bash subprocess — bash only sees the WSL
 * default env, ignoring overrides. The workaround is to spawn bash without
 * `-c`, pass the env-override `export` lines on stdin, and then the actual
 * script path as the only argv entry. Bash interprets stdin line-by-line,
 * the export takes effect, and the script runs in the same shell that
 * consumed the export. The detector script's `BASH_SOURCE[0]` guard still
 * runs the body when invoked this way.
 */

const REPO_ROOT = join(import.meta.dir, "..");
const DETECT_OS_RAW = resolve(REPO_ROOT, "scripts", "detect-os.sh");
const INSTALL_SH_RAW = resolve(REPO_ROOT, "install.sh");

function toBashPath(p: string): string {
  const m = p.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!m) return p.replaceAll("\\", "/");
  return "/mnt/" + m[1].toLowerCase() + "/" + m[2].replaceAll("\\", "/");
}

const DETECT_OS = toBashPath(DETECT_OS_RAW);
const INSTALL_SH = toBashPath(INSTALL_SH_RAW);

function bashAvailable(): boolean {
  const probe = spawnSync("bash", ["--version"], { stdio: "ignore" });
  return probe.status === 0;
}

/**
 * Run `bash <scriptPath>` with optional export lines on stdin.
 * Each export line is `KEY=value` or `export KEY=value`; the script runs
 * after the exports so the variables are visible to it.
 */
function runWithExports(
  scriptPath: string,
  exportLines: string[],
): SpawnSyncReturns<string> {
  const body = exportLines.length > 0
    ? `${exportLines.join("\n")}\n${scriptPath}\nexit\n`
    : `${scriptPath}\nexit\n`;
  return spawnSync("bash", [], {
    encoding: "utf-8",
    input: body,
  });
}

const skipIfNoBash = bashAvailable() ? describe : describe.skip;

// CI-only hermeticity: ensure the spawned scripts have the execute bit set
// before any test invokes them. Both files are committed with mode 100644;
// on strict POSIX filesystems (e.g. GitHub Actions `actions/checkout`),
// the missing `+x` causes the stdin-driven spawn to fail with
// `Permission denied` (exit 126). Local WSL's permissive mount masked
// the issue. The chmod is wrapped in try/catch so platforms without
// POSIX semantics (e.g. Windows) don't crash the suite.
beforeAll(() => {
  for (const p of [DETECT_OS_RAW, INSTALL_SH_RAW]) {
    try {
      chmodSync(p, 0o755);
    } catch {
      // best-effort; chmod is unsupported on some filesystems
    }
  }
});

skipIfNoBash("detect-os.sh — preflight", () => {
  test("script exists", () => {
    expect(existsSync(DETECT_OS_RAW)).toBe(true);
  });

  test("KIT_FORCE_KIND overrides for each supported kind exit 0 with the right kind", () => {
    const supported = [
      "linux",
      "macos",
      "windows-gitbash",
      "windows-msys",
      "windows-cygwin",
    ];
    for (const kind of supported) {
      const r = runWithExports(DETECT_OS, [`export KIT_FORCE_KIND=${kind}`]);
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toMatch(new RegExp(`^KIND:${kind}\\b`));
    }
  });

  test("KIT_FORCE_KIND with an unknown kind exits non-zero", () => {
    const r = runWithExports(DETECT_OS, [`export KIT_FORCE_KIND=plan9`]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/UNSUPPORTED/);
  });

  test("KIT_FORCE_UNSUPPORTED=1 exits non-zero with a diagnostic", () => {
    const r = runWithExports(DETECT_OS, [`export KIT_FORCE_UNSUPPORTED=1`]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/UNSUPPORTED/);
    expect(r.stderr).toMatch(/Linux/);
    expect(r.stderr).toMatch(/macOS/);
    expect(r.stderr).toMatch(/Git Bash/);
  });
});

skipIfNoBash("detect-os.sh — natural detection on the active shell", () => {
  test("active bash classifies as a supported kind (or reports unsupported)", () => {
    const r = runWithExports(DETECT_OS, []);
    // Either exit 0 with a supported kind, or exit non-zero with an
    // UNSUPPORTED diagnostic. Both outcomes are acceptable as long as the
    // response is self-consistent. The natural-detection logic must NEVER
    // silently fall through with exit 0 + no KIND: line.
    if (r.status === 0) {
      expect(r.stdout.trim()).toMatch(
        /^KIND:(linux|macos|windows-gitbash|windows-msys|windows-cygwin)\b/,
      );
    } else {
      expect(r.stderr).toMatch(/UNSUPPORTED/);
    }
  });
});

skipIfNoBash("install.sh — OS gate runs before argument parsing", () => {
  test("no-args invocation on a supported shell prints usage and exits 1", () => {
    // The OS gate is the first thing install.sh does, before arg parsing.
    // On a supported shell (or with KIT_FORCE_KIND=linux) the gate passes,
    // the script falls through to arg parsing, prints usage, and exits 1.
    const r = runWithExports(INSTALL_SH, [`export KIT_FORCE_KIND=linux`]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/Detected shell kind: linux/);
    // The path in the usage line is whatever bash resolved (likely the
    // /mnt/<drive>/... translation), so match a flexible shape.
    expect(r.stdout).toMatch(/Usage: .*install\.sh/);
    expect(r.stdout).toMatch(/--with-extras/);
  });

  test("KIT_FORCE_UNSUPPORTED=1 makes install.sh exit non-zero with a clear diagnostic", () => {
    const r = runWithExports(INSTALL_SH, [`export KIT_FORCE_UNSUPPORTED=1`]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Error: this installer requires a supported/);
    expect(r.stderr).toMatch(/Linux/);
    expect(r.stderr).toMatch(/macOS/);
    expect(r.stderr).toMatch(/Git Bash/);
    expect(r.stderr).toMatch(/detector:/);
    expect(r.stdout).not.toMatch(/Installing OpenCode Orchestrator Kit into:/);
  });

  test("KIT_SKIP_OS_CHECK=1 bypasses the OS gate", () => {
    const r = runWithExports(INSTALL_SH, [
      `export KIT_SKIP_OS_CHECK=1`,
      `export KIT_FORCE_UNSUPPORTED=1`,
    ]);
    expect(r.status).toBe(1); // usage() exits 1, not the gate
    expect(r.stdout).toMatch(/Usage: .*install\.sh/);
    expect(r.stderr).not.toMatch(/Error: this installer requires a supported/);
  });

  test("each supported kind passes the gate and proceeds to arg parsing", () => {
    const supported = [
      "linux",
      "macos",
      "windows-gitbash",
      "windows-msys",
      "windows-cygwin",
    ];
    for (const kind of supported) {
      const r = runWithExports(INSTALL_SH, [`export KIT_FORCE_KIND=${kind}`]);
      expect(r.status).toBe(1); // usage() exits 1, not the gate
      expect(r.stdout).toMatch(new RegExp(`Detected shell kind: ${kind}\\b`));
      expect(r.stdout).toMatch(/Usage: .*install\.sh/);
    }
  });
});