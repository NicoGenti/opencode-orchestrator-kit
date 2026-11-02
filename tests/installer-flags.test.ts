import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  chmodSync,
  appendFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

/**
 * install.sh — examples exclusion, non-destructive copy, and extras target.
 *
 * Runs `global` against a temp $HOME. --skip-validation keeps the test about
 * the copy flags; model-token resolution still runs and is asserted where the
 * installed agent files would otherwise keep {{TIER_*}}.
 */

const REPO_ROOT = join(import.meta.dir, "..");
const INSTALL_SH = resolve(REPO_ROOT, "install.sh");

function toBashPath(p: string): string {
  const m = p.match(/^([A-Za-z]):[\\/](.*)$/);
  if (!m) return p.replaceAll("\\", "/");
  return "/" + m[1].toLowerCase() + "/" + m[2].replaceAll("\\", "/");
}

function toNativePath(p: string): string {
  return p.replaceAll("\\", "/");
}

function bashAvailable(): boolean {
  return spawnSync("bash", ["--version"], { stdio: "ignore" }).status === 0;
}

function shq(s: string): string {
  return `'` + s.replaceAll(`'`, `'\\''`) + `'`;
}

function runInstall(home: string, args: string[]): SpawnSyncReturns<string> {
  const cmd = [shq(toBashPath(INSTALL_SH)), ...args].join(" ");
  const body = [
    "export KIT_FORCE_KIND=linux",
    `export HOME=${shq(toNativePath(home))}`,
    cmd,
    "exit",
    "",
  ].join("\n");
  return spawnSync("bash", [], { encoding: "utf-8", input: body });
}

const maybe = bashAvailable() ? describe : describe.skip;

function opencode(home: string): string {
  return join(home, ".config", "opencode");
}

beforeAll(() => {
  try {
    chmodSync(INSTALL_SH, 0o755);
  } catch {
    // best-effort; chmod is unsupported on some filesystems
  }
});

maybe("install.sh — examples, upgrade, and extras target", () => {
  let homes: string[] = [];

  beforeAll(() => {
    homes = [];
  });
  afterAll(() => {
    for (const home of homes) rmSync(home, { recursive: true, force: true });
  });

  function freshHome(): string {
    const home = mkdtempSync(join(tmpdir(), "kit-install-"));
    homes.push(home);
    return home;
  }

  test("base copy omits skills/examples and extras until the flags are set", () => {
    const home = freshHome();
    const r = runInstall(home, ["--skip-validation", "global"]);
    expect(r.status).toBe(0);
    const root = opencode(home);
    expect(
      existsSync(join(root, "skills", "comprehension-workflow", "SKILL.md")),
    ).toBe(true);
    expect(existsSync(join(root, "skills", "examples"))).toBe(false);
    expect(r.stdout).toMatch(/Skipping skills\/examples\//);
    expect(existsSync(join(root, "agents", "orchestrator.md"))).toBe(true);
    expect(existsSync(join(root, "agents", "pc-doctor.md"))).toBe(false);
    expect(existsSync(join(root, "agents", "writer.md"))).toBe(false);
    expect(existsSync(join(root, "extras"))).toBe(false);
  });

  test("--with-examples installs skills/examples", () => {
    const home = freshHome();
    const r = runInstall(home, [
      "--skip-validation",
      "--with-examples",
      "global",
    ]);
    expect(r.status).toBe(0);
    expect(
      existsSync(
        join(
          opencode(home),
          "skills",
          "examples",
          "python-conventions",
          "SKILL.md",
        ),
      ),
    ).toBe(true);
  });

  test("--with-extras installs pc-doctor and writer into agents/", () => {
    const home = freshHome();
    const r = runInstall(home, [
      "--skip-validation",
      "--with-extras",
      "global",
    ]);
    expect(r.status).toBe(0);
    const root = opencode(home);
    expect(existsSync(join(root, "extras"))).toBe(false);
    for (const name of ["pc-doctor.md", "writer.md"]) {
      const text = readFileSync(join(root, "agents", name), "utf-8");
      expect(text).not.toMatch(/\{\{TIER_/);
      expect(text).toMatch(/^model:\s*\S+/m);
    }
    expect(r.stdout).toMatch(/OpenCode loads agents\//);
  });

  test("a second copy skips existing files; --upgrade overwrites and keeps a backup", () => {
    const home = freshHome();
    const first = runInstall(home, ["--skip-validation", "global"]);
    expect(first.status).toBe(0);
    const agent = join(opencode(home), "agents", "orchestrator.md");
    appendFileSync(agent, "\nUSER_EDIT_MARKER\n");

    const second = runInstall(home, ["--skip-validation", "global"]);
    expect(second.status).toBe(0);
    expect(second.stdout).toMatch(/Skipping existing:/);
    expect(readFileSync(agent, "utf-8")).toContain("USER_EDIT_MARKER");

    const third = runInstall(home, [
      "--skip-validation",
      "--upgrade",
      "global",
    ]);
    expect(third.status).toBe(0);
    const upgraded = readFileSync(agent, "utf-8");
    expect(upgraded).not.toContain("USER_EDIT_MARKER");
    expect(upgraded).not.toMatch(/\{\{TIER_/);
    const backup = readFileSync(`${agent}.kit-backup`, "utf-8");
    expect(backup).toContain("USER_EDIT_MARKER");
    expect(third.stdout).toMatch(/backed up/);
  });

  test("--force is an alias of --upgrade", () => {
    const home = freshHome();
    expect(runInstall(home, ["--skip-validation", "global"]).status).toBe(0);
    const agent = join(opencode(home), "agents", "explorer.md");
    appendFileSync(agent, "\nFORCE_MARKER\n");
    const forced = runInstall(home, ["--skip-validation", "--force", "global"]);
    expect(forced.status).toBe(0);
    expect(readFileSync(agent, "utf-8")).not.toContain("FORCE_MARKER");
    expect(readFileSync(`${agent}.kit-backup`, "utf-8")).toContain(
      "FORCE_MARKER",
    );
  });
});
