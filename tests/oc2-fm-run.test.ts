import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const REPO = join(import.meta.dir, "..");
const SH = join(REPO, "scripts", "oc2-fm-run.sh").replaceAll("\\", "/");
const hasBash = spawnSync("bash", ["--version"], { stdio: "ignore" }).status === 0;
const maybe = hasBash ? describe : describe.skip;

maybe("scripts/oc2-fm-run.sh (profilo fm, headless)", () => {
  test("esiste e usa i root del profilo fm con PWD neutralizzato", () => {
    expect(existsSync(SH)).toBe(true);
    const t = readFileSync(SH, "utf-8");
    expect(t).toMatch(/XDG_DATA_HOME="\$OC2\/data-fm"/);
    expect(t).toMatch(/XDG_CONFIG_HOME="\$OC2\/config-fm"/);
    expect(t).toMatch(/XDG_STATE_HOME="\$OC2\/state-fm"/);
    expect(t).toMatch(/XDG_CACHE_HOME="\$OC2\/cache-fm"/);
    expect(t).toContain("env -u PWD");
  });

  test("senza OC2_HOME esce non-zero con messaggio chiaro", () => {
    const env = { ...process.env };
    delete env.OC2_HOME;
    const r = spawnSync("bash", [SH], { encoding: "utf-8", env });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("OC2_HOME");
  });

  test("OC2_HOME senza binario V2 -> 127", () => {
    const home = mkdtempSync(join(tmpdir(), "oc2fmrun-")).replaceAll("\\", "/");
    const r = spawnSync("bash", [SH, "debug", "paths"],
      { encoding: "utf-8", env: { ...process.env, OC2_HOME: home } });
    expect(r.status).toBe(127);
    expect(r.stderr).toContain("no V2 binary");
    rmSync(home, { recursive: true, force: true });
  });
});
