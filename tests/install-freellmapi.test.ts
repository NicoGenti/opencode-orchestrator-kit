import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const REPO = join(import.meta.dir, "..");
const SH = join(REPO, "scripts", "install-freellmapi.sh");
const hasBash = spawnSync("bash", ["--version"], { stdio: "ignore" }).status === 0;
const maybe = hasBash ? describe : describe.skip;

// Offline puro: OC2_SHIM punta a un percorso inesistente cosi' lo script salta
// (SKIP) i contatti con opencode2 e la suite non dipende da nessun servizio.
const NO_OC2 = "Z:/nonexistent/oc2/shim";
const OFFLINE_ENV = { ...process.env, OC2_SHIM: NO_OC2, FREELLMAPI_BASE_URL: "http://127.0.0.1:31415/v1" };

let dir = "";
let failDir = "";
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "fm-install-")).replaceAll("\\", "/");
  failDir = mkdtempSync(join(tmpdir(), "fm-install-fail-")).replaceAll("\\", "/");
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  rmSync(failDir, { recursive: true, force: true });
});

maybe("install-freellmapi.sh", () => {
  test("installa il kit e cabla il profilo freellmapi (offline)", () => {
    const r = spawnSync("bash", [SH.replaceAll("\\", "/"), "--with-extras",
      "--no-preflight", "--no-smoke", "--no-gitignore", "--key", "k-test", dir],
      { encoding: "utf-8", env: OFFLINE_ENV });
    expect(r.status).toBe(0);

    const opencode = join(dir, ".opencode");
    const agents = readdirSync(join(opencode, "agents")).filter((f) => f.endsWith(".md"));
    expect(agents.length).toBeGreaterThan(10);
    for (const f of agents) {
      const t = readFileSync(join(opencode, "agents", f), "utf-8");
      expect(t).not.toMatch(/\{\{TIER_/);
      expect(t).not.toMatch(/^model:/m);
    }
    const extras = readdirSync(join(opencode, "extras")).filter((f) => f.endsWith(".md"));
    for (const f of extras) {
      const t = readFileSync(join(opencode, "extras", f), "utf-8");
      expect(t).not.toMatch(/\{\{TIER_/);
      expect(t).not.toMatch(/^model:/m);
    }
    const cfg = JSON.parse(readFileSync(join(opencode, "opencode.jsonc"), "utf-8"));
    expect(cfg.provider.freellmapi.options.baseURL).toBe("http://127.0.0.1:31415/v1");
    expect(cfg.provider.freellmapi.options.apiKey).toBe("k-test");
    expect(cfg.agent.orchestrator.model).toBe("freellmapi/auto:smart");
    expect(Object.keys(cfg.agent).length).toBeGreaterThan(10);
    expect(cfg.enabled_providers).toContain("freellmapi");
    const prof = JSON.parse(readFileSync(join(opencode, "models.config.json"), "utf-8"));
    expect(prof.default_preset).toBe("freellmapi");
    expect(existsSync(join(dir, "AGENTS.md"))).toBe(true);
  });

  test("la preflight fallisce con messaggio chiaro se il server e' irraggiungibile", () => {
    const r = spawnSync("bash", [SH.replaceAll("\\", "/"), "--no-smoke",
      "--key", "k-test", "--base-url", "http://127.0.0.1:1/v1", failDir],
      { encoding: "utf-8", env: OFFLINE_ENV });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("FreeLLMAPI non raggiungibile");
  });
});