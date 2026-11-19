import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

/**
 * apply-model-preset.py — resolution of {{TIER_*}} model tokens.
 *
 * Guards the installer contract: the script must be able to resolve the
 * active preset WITHOUT --preset, falling back to the config's
 * `default_preset` (matching resolve-model-preset.ts and validate-models.sh).
 */

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPT = join(REPO_ROOT, "scripts", "apply-model-preset.py");

function hasPython(): boolean {
  for (const cmd of ["python3", "python"]) {
    if (spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0)
      return true;
  }
  return false;
}
const maybe = hasPython() ? describe : describe.skip;

function pythonBin(): string {
  for (const cmd of ["python3", "python"]) {
    if (spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0)
      return cmd;
  }
  throw new Error("no python");
}

let tmp: string;
let empty: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "amp-"));
  empty = mkdtempSync(join(tmpdir(), "amp-empty-"));
  mkdirSync(join(tmp, "agents"), { recursive: true });
  writeFileSync(
    join(tmp, "models.config.json"),
    JSON.stringify({
      version: 2,
      default_preset: "mine",
      presets: {
        mine: {
          models: {
            TIER_ROUTER: "prov/router",
            TIER_REASONING: "prov/reason",
            TIER_CODE: "prov/code",
            TIER_FAST: "prov/fast",
            TIER_REVIEW: "prov/review",
          },
        },
      },
    }),
  );
  writeFileSync(
    join(tmp, "agents", "a.md"),
    "---\ndescription: x\nmode: subagent\nmodel: {{TIER_FAST}}\n---\n# A\n",
  );
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
});

maybe("apply-model-preset.py — default preset", () => {
  test("resolves tokens using default_preset when --preset is omitted", () => {
    const r = spawnSync(
      pythonBin(),
      [
        SCRIPT,
        "--config",
        join(tmp, "models.config.json"),
        "--agents-dir",
        join(tmp, "agents"),
      ],
      { encoding: "utf-8" },
    );
    expect(r.status).toBe(0);
    const out = readFileSync(join(tmp, "agents", "a.md"), "utf-8");
    expect(out).toContain("model: prov/fast");
    expect(out).not.toContain("{{TIER_");
  });
});

maybe("apply-model-preset.py — path traversal guard", () => {
  function runWithConfig(cfg: string, extra: string[] = []) {
    return spawnSync(pythonBin(), [SCRIPT, "--config", cfg, ...extra], {
      encoding: "utf-8",
    });
  }

  test("rejects a --config with a '..' segment (forward slash)", () => {
    const r = runWithConfig("x/../../evil", ["--list"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refusing");
  });

  test("rejects a --config with backslash separators", () => {
    const r = runWithConfig("..\\..\\evil", ["--list"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refusing");
  });

  test("rejects a --config with mid-path and trailing '..'", () => {
    const r = runWithConfig("a/../..", ["--list"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refusing");
  });

  test("passes a clean absolute --config through", () => {
    const r = runWithConfig(join(tmp, "models.config.json"), ["--list"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("mine:");
  });

  // AC3 matrix (Phase H2, #146): `load_config` is the single read sink, and
  // every row below exercises the one `--config` path contained before it
  // reaches the filesystem.
  function runInCwd(cfg: string, extra: string[] = []) {
    return spawnSync(pythonBin(), [SCRIPT, "--config", cfg, ...extra], {
      encoding: "utf-8",
      cwd: tmp,
    });
  }

  test("assente: default mancante -> errore invariato, nessun accesso", () => {
    const r = spawnSync(pythonBin(), [SCRIPT, "--list"], {
      encoding: "utf-8",
      cwd: empty,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("config file not found");
  });

  test("vuoto: --config '' rifiutato prima di ogni accesso fs", () => {
    const r = runWithConfig("", ["--list"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refusing");
    expect(r.stderr).toContain("empty");
  });

  test("relativo legittimo: --list legge il config dalla cwd", () => {
    const r = runInCwd("models.config.json", ["--list"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("mine:");
    expect(r.stdout).toContain("TIER_FAST -> prov/fast");
  });

  test("assoluto con '..': rifiutato prima dell'accesso", () => {
    // Built by concatenation, not `join`: `join` would normalize the `..` away.
    const r = runWithConfig(`${tmp}/../evil.json`, ["--list"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refusing");
  });

  test("relativo '..' con separatori misti (\\ e /): rifiutato", () => {
    const r = runInCwd("a/..\\..\\evil", ["--list"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("refusing");
  });

  test("path che risolve fuori dalla root che dichiara: rifiutato", () => {
    const r = runInCwd(join(tmp, "sub", "dir") + "/", ["--list"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("config root");
  });

  test("regressione: --preset/--dry-run/--restore su path legittimo invariati", () => {
    const regDir = join(tmp, "agents-reg");
    mkdirSync(regDir, { recursive: true });
    const agent = join(regDir, "r.md");
    writeFileSync(
      agent,
      "---\ndescription: r\nmode: subagent\nmodel: {{TIER_CODE}}\n---\n# R\n",
    );

    const dry = runInCwd("models.config.json", [
      "--preset",
      "mine",
      "--agents-dir",
      regDir,
      "--dry-run",
    ]);
    expect(dry.status).toBe(0);
    expect(readFileSync(agent, "utf-8")).toContain("model: {{TIER_CODE}}");

    const applied = runInCwd("models.config.json", [
      "--preset",
      "mine",
      "--agents-dir",
      regDir,
    ]);
    expect(applied.status).toBe(0);
    expect(readFileSync(agent, "utf-8")).toContain("model: prov/code");

    const restored = runInCwd("models.config.json", [
      "--restore",
      "--agents-dir",
      regDir,
    ]);
    expect(restored.status).toBe(0);
    expect(readFileSync(agent, "utf-8")).toContain("model: {{TIER_CODE}}");
  });
});
