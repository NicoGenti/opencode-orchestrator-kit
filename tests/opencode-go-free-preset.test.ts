import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = join(import.meta.dir, "..");
const TPL = join(REPO, "templates", "models.config.json");

describe("templates/models.config.json — preset opencode-go-free", () => {
  test("esiste con i cinque tier e solo modelli *-free di opencode-go", () => {
    const cfg = JSON.parse(readFileSync(TPL, "utf-8"));
    const p = cfg.presets["opencode-go-free"];
    expect(p).toBeDefined();
    for (const t of ["TIER_ROUTER", "TIER_REASONING", "TIER_CODE", "TIER_FAST", "TIER_REVIEW"]) {
      expect(p.models[t]).toMatch(/^opencode-go\/.+?-free$/);
    }
  });

  test("nessun preset risolto contiene id senza prefisso provider", () => {
    const cfg = JSON.parse(readFileSync(TPL, "utf-8"));
    for (const [preset, body] of Object.entries<any>(cfg.presets)) {
      if (preset === "generic") continue;
      for (const [tier, v] of Object.entries<any>(body.models)) {
        expect(v, `${preset}/${tier}`).toMatch(/^[A-Za-z0-9_.-]+\/.+/);
      }
    }
  });

  test("validate-models.sh accetta opencode-go-free", () => {
    const r = spawnSync("bash", [join(REPO, "scripts", "validate-models.sh"),
      "--config", TPL, "--preset", "opencode-go-free", "--skip-agents"], { encoding: "utf-8" });
    const out = r.stdout.replace(/[\r']/g, "");
    expect(out).toContain("OK: preset opencode-go-free passed all checks.");
    expect(r.status).toBe(0);
  });
});
