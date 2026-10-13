import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const REPO = join(import.meta.dir, "..");
const TPL = join(REPO, "templates", "models.config.json");

describe("templates/models.config.json — preset freellmapi", () => {
  test("esiste con i cinque tier e prefisso provider su ognuno", () => {
    const cfg = JSON.parse(readFileSync(TPL, "utf-8"));
    const p = cfg.presets.freellmapi;
    expect(p).toBeDefined();
    for (const t of ["TIER_ROUTER", "TIER_REASONING", "TIER_CODE", "TIER_FAST", "TIER_REVIEW"]) {
      expect(p.models[t]).toMatch(/^freellmapi\//);
    }
    expect(p.models.TIER_CODE).toBe("freellmapi/auto:smart");
    expect(p.models.TIER_REVIEW).toBe("freellmapi/auto:smart");
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

  test("validate-models.sh accetta freellmapi", () => {
    const r = spawnSync("bash", [join(REPO, "scripts", "validate-models.sh"),
      "--config", TPL, "--preset", "freellmapi", "--skip-agents"], { encoding: "utf-8" });
    // Deviazione dal piano (Windows host, autorizzata in oneshot): il validator
    // usa i repr python per gli env-value; su python.exe/pipe i valori escono
    // 'freellmapi'\r (quotes+CR), percio' la stringa esatta
    // "OK: preset 'freellmapi' passed all checks." non appare mai qui.
    // La tolleranza normalizza \r e le virgolette di repr; l'asserzione resta
    // stringente (exit 0 + messaggio OK riferito a QUESTO preset).
    const out = r.stdout.replace(/[\r']/g, "");
    expect(out).toContain("OK: preset freellmapi passed all checks.");
    expect(r.status).toBe(0);
  });
});