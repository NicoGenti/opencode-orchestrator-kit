import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const REPO = join(import.meta.dir, "..");
const SCRIPT = join(REPO, "scripts", "apply-freellmapi-profile.py");
let dir = "";
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "fm-profile-")); mkdirSync(join(dir, ".opencode", "agents"), { recursive: true }); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function writeAgent(id: string, model: string) {
  writeFileSync(join(dir, ".opencode", "agents", `${id}.md`),
    `---\r\ndescription: ${id} agent\r\nmode: subagent\r\nmodel: ${model}\r\ntemperature: 0.1\r\n---\r\n\r\nBody of ${id}.\r\n`);
}
function run(extra: string[] = []) {
  return spawnSync("python", [SCRIPT,
    "--config", join(dir, ".opencode", "opencode.jsonc"),
    "--agents-dir", join(dir, ".opencode", "agents"),
    "--key", "k-test", ...extra], { encoding: "utf-8" });
}

describe("apply-freellmapi-profile.py", () => {
  test("--dry-run non scrive", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    expect(run(["--dry-run"]).status).toBe(0);
    expect(existsSync(join(dir, ".opencode", "opencode.jsonc"))).toBe(false);
  });

  test("scrive provider+mappa e con --strip-frontmatter toglie model:", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    writeAgent("explorer", "freellmapi/auto:fast");
    const r = run(["--strip-frontmatter", "--root-model", "freellmapi/auto:smart", "--small-model", "freellmapi/auto:fast"]);
    expect(r.status).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, ".opencode", "opencode.jsonc"), "utf-8"));
    expect(cfg.provider.freellmapi.options.baseURL).toBe("http://127.0.0.1:31415/v1");
    expect(cfg.provider.freellmapi.options.apiKey).toBe("k-test");
    expect(cfg.enabled_providers).toContain("freellmapi");
    expect(cfg.default_agent).toBe("orchestrator");
    expect(cfg.model).toBe("freellmapi/auto:smart");
    expect(cfg.agent.orchestrator.model).toBe("freellmapi/auto:smart");
    expect(cfg.agent.explorer.model).toBe("freellmapi/auto:fast");
    for (const id of ["orchestrator", "explorer"]) {
      const t = readFileSync(join(dir, ".opencode", "agents", `${id}.md`), "utf-8");
      expect(t).not.toMatch(/^model:/m);
      expect(t).toContain(`Body of ${id}`);
      expect(t).toContain("\r\n");
    }
  });

  test("fonde in un config JSON esistente senza perdere chiavi", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    writeFileSync(join(dir, ".opencode", "opencode.jsonc"),
      JSON.stringify({ provider: { ollama: { options: { baseURL: "http://localhost:11434/v1" } } },
                       agent: { keeper: { model: "ollama/x:cloud" } }, plugin: [] }, null, 2));
    expect(run().status).toBe(0);
    const cfg = JSON.parse(readFileSync(join(dir, ".opencode", "opencode.jsonc"), "utf-8"));
    expect(cfg.provider.ollama.options.baseURL).toBe("http://localhost:11434/v1");
    expect(cfg.agent.keeper.model).toBe("ollama/x:cloud");
    expect(cfg.agent.orchestrator.model).toBe("freellmapi/auto:smart");
  });

  test("rifiuta (2) un config con commenti senza toccarlo", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    const p = join(dir, ".opencode", "opencode.jsonc");
    writeFileSync(p, '{\n  // commento umano\n  "plugin": []\n}\n');
    const before = readFileSync(p, "utf-8");
    const r = run();
    expect(r.status).toBe(2);
    expect(readFileSync(p, "utf-8")).toBe(before);
  });

  test("rifiuta i token non risolti", () => {
    writeAgent("explorer", "{{TIER_FAST}}");
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("non risolti");
  });
});