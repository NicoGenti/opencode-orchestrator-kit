import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const REPO = join(import.meta.dir, "..");
const SH = join(REPO, "scripts", "setup-oc2-fm-profile.sh");
// Profilo privato V2 dell'utente, se presente su questo host (gate host-agnostico:
// nessun path personale nel repository).
const OC2_REAL = join(homedir(), ".opencode2").replaceAll("\\", "/");
const hasBash = spawnSync("bash", ["--version"], { stdio: "ignore" }).status === 0;
const maybe = hasBash && existsSync(join(OC2_REAL, "node_modules", "@opencode", "cli")) ? describe : describe.skip;

maybe("setup-oc2-fm-profile.sh (oc2-home usa-e-getta)", () => {
  test("crea il profilo, la mappa completa e gli shim", () => {
    const home = mkdtempSync(join(tmpdir(), "oc2fm-")).replaceAll("\\", "/");
    const bin = join(home, "bin").replaceAll("\\", "/");
    mkdirSync(join(home, ".opencode2", "node_modules", "@opencode", "cli"), { recursive: true });

    const r = spawnSync("bash", [SH.replaceAll("\\", "/"),
      "--oc2-home", join(home, ".opencode2").replaceAll("\\", "/"),
      "--bin-dir", bin,
      "--with-extras", "--no-preflight", "--no-service-start", "--no-smoke",
      "--key", "k-test", "--port", "49999"], { encoding: "utf-8" });
    expect(r.status).toBe(0);

    const cfgDir = join(home, ".opencode2", "config-fm", "opencode");
    const countMd = (d: string) => readdirSync(join(cfgDir, d)).filter((f) => f.endsWith(".md")).length;
    for (const d of ["agents", "extras"]) {
      for (const f of readdirSync(join(cfgDir, d)).filter((x) => x.endsWith(".md"))) {
        const t = readFileSync(join(cfgDir, d, f), "utf-8");
        expect(t).not.toMatch(/\{\{TIER_/);
        expect(t).not.toMatch(/^model:/m);
      }
    }
    const cfg = JSON.parse(readFileSync(join(cfgDir, "opencode.jsonc"), "utf-8"));
    expect(cfg.enabled_providers).toEqual(["freellmapi"]);
    expect(cfg.model).toBe("freellmapi/auto:smart");
    expect(cfg.small_model).toBe("freellmapi/auto:fast");
    expect(Object.keys(cfg.agent).length).toBe(countMd("agents") + countMd("extras"));
    expect(cfg.provider.freellmapi.options.apiKey).toBe("k-test");
    expect(JSON.parse(readFileSync(join(cfgDir, "service.json"), "utf-8")).port).toBe(49999);
    const shim = readFileSync(join(bin, "oc2-fm"), "utf-8");
    expect(shim).toContain('XDG_CONFIG_HOME="$OC2_HOME/config-fm"');
    expect(existsSync(join(bin, "oc2-fm.cmd"))).toBe(true);
    rmSync(home, { recursive: true, force: true });
  });
});
