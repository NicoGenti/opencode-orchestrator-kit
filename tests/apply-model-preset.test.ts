import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
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
    if (spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0) return true;
  }
  return false;
}
const maybe = hasPython() ? describe : describe.skip;

function pythonBin(): string {
  for (const cmd of ["python3", "python"]) {
    if (spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0) return cmd;
  }
  throw new Error("no python");
}

let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "amp-"));
  mkdirSync(join(tmp, "agents"), { recursive: true });
  writeFileSync(join(tmp, "models.config.json"), JSON.stringify({
    version: 2,
    default_preset: "mine",
    presets: {
      mine: { models: {
        TIER_ROUTER: "prov/router", TIER_REASONING: "prov/reason",
        TIER_CODE: "prov/code", TIER_FAST: "prov/fast", TIER_REVIEW: "prov/review",
      } },
    },
  }));
  writeFileSync(join(tmp, "agents", "a.md"),
    "---\ndescription: x\nmode: subagent\nmodel: {{TIER_FAST}}\n---\n# A\n");
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

maybe("apply-model-preset.py — default preset", () => {
  test("resolves tokens using default_preset when --preset is omitted", () => {
    const r = spawnSync(pythonBin(), [
      SCRIPT, "--config", join(tmp, "models.config.json"),
      "--agents-dir", join(tmp, "agents"),
    ], { encoding: "utf-8" });
    expect(r.status).toBe(0);
    const out = readFileSync(join(tmp, "agents", "a.md"), "utf-8");
    expect(out).toContain("model: prov/fast");
    expect(out).not.toContain("{{TIER_");
  });
});
