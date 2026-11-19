import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const REPO = join(import.meta.dir, "..");
const SCRIPT = join(REPO, "scripts", "apply-freellmapi-profile.py");
let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fm-profile-"));
  mkdirSync(join(dir, ".opencode", "agents"), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function writeAgent(id: string, model: string) {
  writeFileSync(
    join(dir, ".opencode", "agents", `${id}.md`),
    `---\r\ndescription: ${id} agent\r\nmode: subagent\r\nmodel: ${model}\r\ntemperature: 0.1\r\n---\r\n\r\nBody of ${id}.\r\n`,
  );
}
function run(extra: string[] = []) {
  return spawnSync(
    "python",
    [
      SCRIPT,
      "--config",
      join(dir, ".opencode", "opencode.jsonc"),
      "--agents-dir",
      join(dir, ".opencode", "agents"),
      "--key",
      "k-test",
      ...extra,
    ],
    { encoding: "utf-8" },
  );
}

function runWithConfig(cfg: string, extra: string[] = []) {
  return spawnSync(
    "python",
    [
      SCRIPT,
      "--config",
      cfg,
      "--agents-dir",
      join(dir, ".opencode", "agents"),
      "--key",
      "k-test",
      ...extra,
    ],
    { encoding: "utf-8" },
  );
}

// Relative `--config` values are exercised from inside the temp root so the
// "expected root" of the containment check is the profile dir, as in a real install.
function runIn(cfg: string, extra: string[] = []) {
  return spawnSync(
    "python",
    [
      SCRIPT,
      "--config",
      cfg,
      "--agents-dir",
      join(dir, ".opencode", "agents"),
      "--key",
      "k-test",
      ...extra,
    ],
    { encoding: "utf-8", cwd: dir },
  );
}

function runWithoutConfig() {
  return spawnSync(
    "python",
    [
      SCRIPT,
      "--agents-dir",
      join(dir, ".opencode", "agents"),
      "--key",
      "k-test",
    ],
    { encoding: "utf-8" },
  );
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
    const r = run([
      "--strip-frontmatter",
      "--root-model",
      "freellmapi/auto:smart",
      "--small-model",
      "freellmapi/auto:fast",
    ]);
    expect(r.status).toBe(0);
    const cfg = JSON.parse(
      readFileSync(join(dir, ".opencode", "opencode.jsonc"), "utf-8"),
    );
    expect(cfg.provider.freellmapi.options.baseURL).toBe(
      "http://127.0.0.1:31415/v1",
    );
    expect(cfg.provider.freellmapi.options.apiKey).toBe("k-test");
    expect(cfg.enabled_providers).toContain("freellmapi");
    expect(cfg.default_agent).toBe("orchestrator");
    expect(cfg.model).toBe("freellmapi/auto:smart");
    expect(cfg.agent.orchestrator.model).toBe("freellmapi/auto:smart");
    expect(cfg.agent.explorer.model).toBe("freellmapi/auto:fast");
    for (const id of ["orchestrator", "explorer"]) {
      const t = readFileSync(
        join(dir, ".opencode", "agents", `${id}.md`),
        "utf-8",
      );
      expect(t).not.toMatch(/^model:/m);
      expect(t).toContain(`Body of ${id}`);
      expect(t).toContain("\r\n");
    }
  });

  test("fonde in un config JSON esistente senza perdere chiavi", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    writeFileSync(
      join(dir, ".opencode", "opencode.jsonc"),
      JSON.stringify(
        {
          provider: {
            ollama: { options: { baseURL: "http://localhost:11434/v1" } },
          },
          agent: { keeper: { model: "ollama/x:cloud" } },
          plugin: [],
        },
        null,
        2,
      ),
    );
    expect(run().status).toBe(0);
    const cfg = JSON.parse(
      readFileSync(join(dir, ".opencode", "opencode.jsonc"), "utf-8"),
    );
    expect(cfg.provider.ollama.options.baseURL).toBe(
      "http://localhost:11434/v1",
    );
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

describe("apply-freellmapi-profile.py - path traversal guard", () => {
  test("rifiuta --config con segmento '..' senza toccare il filesystem", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    const r = runWithConfig("x/../../evil");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refusing");
    expect(existsSync(join(dir, ".opencode", "opencode.jsonc"))).toBe(false);
  });

  test("rifiuta --config con separatori backslash", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    const r = runWithConfig("..\\..\\evil");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refusing");
  });

  test("rifiuta --config con '..' centrale e finale", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    const r = runWithConfig("a/../..");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refusing");
  });

  test("lascia passare un path assoluto pulito", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    const r = runWithConfig(join(dir, "clean-absolute.jsonc"), ["--dry-run"]);
    expect(r.status).toBe(0);
  });

  // AC3 matrix (Phase H1, #147-#150): every row below exercises the whole
  // config lifecycle, whose four sinks - read :93, backup copy :174, write :176
  // and json.dump :177 - consume the one path contained before any fs access.
  test("assente: --config mancante e' rifiutato senza scrivere", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    const r = runWithoutConfig();
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("--config");
    expect(existsSync(join(dir, ".opencode", "opencode.jsonc"))).toBe(false);
  });

  test("vuoto: --config '' e' rifiutato prima di ogni accesso fs", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    const r = runWithConfig("");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refusing");
  });

  test("relativo legittimo sotto la root attesa: scrive e non crea backup", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    const r = runIn(join(".opencode", "opencode.jsonc"));
    expect(r.status).toBe(0);
    const p = join(dir, ".opencode", "opencode.jsonc");
    expect(existsSync(p)).toBe(true);
    const cfg = JSON.parse(readFileSync(p, "utf-8"));
    expect(cfg.provider.freellmapi.options.apiKey).toBe("k-test");
    expect(
      readdirSync(join(dir, ".opencode")).some((n) => n.includes(".bak-")),
    ).toBe(false);
  });

  test("relativo annidato: crea i parent mancanti (regressione)", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    const p = join(dir, "deep", "nested", "opencode.jsonc");
    expect(runIn(join("deep", "nested", "opencode.jsonc")).status).toBe(0);
    expect(existsSync(p)).toBe(true);
  });

  test("assoluto legittimo: scrittura sul path risolto (regressione)", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    const p = join(dir, "abs-ok.jsonc");
    expect(runWithConfig(p).status).toBe(0);
    expect(JSON.parse(readFileSync(p, "utf-8")).default_agent).toBe(
      "orchestrator",
    );
  });

  test("--force-config: il backup nasce nella root del config e la riscrittura passa", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    const p = join(dir, ".opencode", "opencode.jsonc");
    writeFileSync(p, '{ // commento umano\n  "plugin": []\n}\n');
    const r = run(["--force-config"]);
    expect(r.status).toBe(0);
    expect(
      readdirSync(join(dir, ".opencode")).some((n) =>
        n.startsWith("opencode.jsonc.bak-"),
      ),
    ).toBe(true);
    const cfg = JSON.parse(readFileSync(p, "utf-8"));
    expect(cfg.provider.freellmapi.options.apiKey).toBe("k-test");
  });

  test("rifiuta '..' con separatori misti (\\ e /)", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    const r = runWithConfig("a/..\\..\\evil");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refusing");
  });

  test("rifiuta un path assoluto che contiene '..'", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    // Built by concatenation, not `join`: `join` would normalize the `..` away.
    const r = runWithConfig(`${dir}/../evil.jsonc`);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refusing");
  });

  test("rifiuta un path che risolve fuori dalla root che dichiara", () => {
    writeAgent("orchestrator", "freellmapi/auto:smart");
    const r = runWithConfig(join(dir, "sub", "dir") + "/");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("config root");
    expect(existsSync(join(dir, "sub"))).toBe(false);
  });
});
