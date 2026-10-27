import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = join(import.meta.dir, "..");
const TPL = join(REPO, "templates", "models.config.json");

/**
 * I cinque modelli confermati dall'utente e verificati il 2026-10-27 con
 * `opencode2 run --model <provider>/<id>`: tutti rispondono sul provider
 * `ollama` definito in opencode.jsonc; il provider `ollama-cloud` del catalogo
 * built-in risponde `Model unavailable` per gli stessi id.
 */
const EXPECTED = {
  TIER_ROUTER: "ollama/glm-5.3-flash:cloud",
  TIER_REASONING: "ollama/beam:cloud",
  TIER_CODE: "ollama/deepseek-v4.1-flash:cloud",
  TIER_REVIEW: "ollama/glm-5.3:cloud",
  TIER_FAST: "ollama/minimax-m3.1-flash:cloud",
} as const;

describe("templates/models.config.json — preset ollama", () => {
  test("esiste con i cinque tier sui modelli ollama confermati", () => {
    const cfg = JSON.parse(readFileSync(TPL, "utf-8"));
    const preset = cfg.presets.ollama;
    expect(preset).toBeDefined();
    expect(preset.models).toEqual(EXPECTED);
    for (const value of Object.values<string>(preset.models)) {
      expect(value).toMatch(/^ollama\/.+:cloud$/);
    }
  });

  test("dichiara la dipendenza dal provider ollama", () => {
    const cfg = JSON.parse(readFileSync(TPL, "utf-8"));
    expect(cfg.presets.ollama.requires).toEqual(["ollama"]);
  });

  test("validate-models.sh accetta ollama", () => {
    const r = spawnSync(
      "bash",
      [
        join(REPO, "scripts", "validate-models.sh"),
        "--config",
        TPL,
        "--preset",
        "ollama",
        "--skip-agents",
      ],
      { encoding: "utf-8" },
    );
    const out = r.stdout.replace(/[\r']/g, "");
    expect(out).toContain("OK: preset ollama passed all checks.");
    expect(r.status).toBe(0);
  });
});
