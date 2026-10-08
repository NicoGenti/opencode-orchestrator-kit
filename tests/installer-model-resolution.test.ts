import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, SpawnSyncReturns } from "node:child_process";

/**
 * install.sh — model-token resolution.
 *
 * The installer must resolve every `{{TIER_*}}` model token to a concrete
 * provider/model ID, otherwise OpenCode rejects the config at startup
 * ("Configuration is invalid ... Expected string | undefined, got {...} model").
 * Runs `global` against a temp $HOME so the real user config is never touched.
 */

const REPO_ROOT = join(import.meta.dir, "..");
const INSTALL_SH = resolve(REPO_ROOT, "install.sh");

/**
 * Convert a Windows absolute path (C:\Users\x) to the MSYS form this host's
 * bash understands (/c/Users/x). Used only for the *script* argument.
 */
function toBashPath(p: string): string {
  const m = p.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!m) return p.replaceAll("\\", "/");
  return "/" + m[1].toLowerCase() + "/" + m[2].replaceAll("\\", "/");
}

/**
 * Convert a Windows absolute path to the native forward-slash form a native
 * Windows `python.exe` can open (C:/Users/x). On this host MSYS path
 * conversion is disabled, so `$HOME` must be native for the installer's
 * Python-based validator/resolver to read the config it just wrote.
 */
function toNativePath(p: string): string {
  return p.replaceAll("\\", "/");
}

function bashAvailable(): boolean {
  return spawnSync("bash", ["--version"], { stdio: "ignore" }).status === 0;
}
function shq(s: string): string {
  return `'` + s.replaceAll(`'`, `'\\''`) + `'`;
}
function runWithExports(
  script: string,
  exports: string[],
  args: string[] = [],
): SpawnSyncReturns<string> {
  const cmd = [shq(script), ...args].join(" ");
  const body = `${exports.join("\n")}\n${cmd}\nexit\n`;
  return spawnSync("bash", [], { encoding: "utf-8", input: body });
}
const maybe = bashAvailable() ? describe : describe.skip;

let tmpHome: string;
beforeAll(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "kit-home-"));
  try {
    chmodSync(INSTALL_SH, 0o755);
  } catch {
    // best-effort; chmod is unsupported on some filesystems
  }
});
afterAll(() => rmSync(tmpHome, { recursive: true, force: true }));

maybe("install.sh global — resolves {{TIER_*}} model tokens", () => {
  test("installed agents contain no literal tier tokens", () => {
    const r = runWithExports(
      toBashPath(INSTALL_SH),
      ["export KIT_FORCE_KIND=linux", `export HOME=${shq(toNativePath(tmpHome))}`],
      ["global"],
    );
    expect(r.status).toBe(0);

    const agentsDir = join(tmpHome, ".config", "opencode", "agents");
    const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    expect(files.length).toBeGreaterThan(0);

    for (const f of files) {
      const text = readFileSync(join(agentsDir, f), "utf-8");
      expect(text).not.toMatch(/\{\{TIER_/);
      const model = text.match(/^model:\s*(.+)$/m)?.[1]?.trim();
      expect(model).toBeTruthy();
      // resolved value is a concrete provider/model string, not a brace object
      expect(model).not.toContain("{");
    }
  });
});
