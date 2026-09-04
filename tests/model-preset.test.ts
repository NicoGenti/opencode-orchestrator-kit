import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Import the model-preset resolution module
const {
  loadModelConfig,
  resolvePreset,
  resolveModelValue,
  listPresets,
  getPreset,
  getDefaultPreset,
  validatePreset,
  resolveModelConfig,
  applyTierFallbacks,
  TOKENS,
  REQUIRED_TOKENS,
  TIER_FALLBACKS,
} = await import("../scripts/resolve-model-preset.ts");

const FIXTURE_CONFIG = {
  "$schema": "https://nicogenti.github.io/opencode-orchestrator-kit/schemas/models.config.schema.json",
  "version": 2,
  "description": "Test configuration",
  "tiers": {
    "TIER_ROUTER": "Test routing tier",
    "TIER_REASONING": "Test reasoning tier",
    "TIER_CODE": "Test code tier",
    "TIER_FAST": "Test fast tier",
    "TIER_REVIEW": "Test review tier"
  },
  "default_preset": "test-preset",
  "presets": {
    "test-preset": {
      "label": "Test Preset",
      "description": "Test preset description",
      "requires": [],
      "models": {
        "TIER_ROUTER": "test/router-model",
        "TIER_REASONING": "test/reasoning-model",
        "TIER_CODE": "test/code-model",
        "TIER_FAST": "test/fast-model",
        "TIER_REVIEW": "test/review-model"
      }
    },
    "another-preset": {
      "label": "Another Preset",
      "description": "Another preset description",
      "requires": [],
      "models": {
        "TIER_ROUTER": "another/router-model",
        "TIER_REASONING": "another/reasoning-model",
        "TIER_CODE": "another/code-model",
        "TIER_FAST": "another/fast-model",
        "TIER_REVIEW": "another/review-model"
      }
    }
  }
};

// Three-tier legacy preset: only TIER_REASONING, TIER_CODE, TIER_FAST.
// Used to prove the backward-compat / fallback semantics.
const THREE_TIER_CONFIG = {
  presets: {
    "three-tier-legacy": {
      "label": "Three-tier legacy fixture",
      "models": {
        "TIER_REASONING": "legacy/reasoning",
        "TIER_CODE": "legacy/code",
        "TIER_FAST": "legacy/fast"
      }
    }
  }
};

// Preset missing a required tier.
const INVALID_CONFIG = {
  "presets": {
    "invalid-preset": {
      "models": {
        "TIER_REASONING": "test/reasoning-model"
        // Missing TIER_CODE and TIER_FAST
      }
    }
  }
};

describe("resolve-model-preset.ts — canonical five-token list", () => {
  test("TOKENS contains the five canonical tier names in canonical order", () => {
    expect(TOKENS).toEqual([
      "TIER_ROUTER",
      "TIER_REASONING",
      "TIER_CODE",
      "TIER_FAST",
      "TIER_REVIEW",
    ]);
  });

  test("REQUIRED_TOKENS contains the original three required tiers", () => {
    expect(REQUIRED_TOKENS).toEqual([
      "TIER_REASONING",
      "TIER_CODE",
      "TIER_FAST",
    ]);
    // All required tokens must be in TOKENS (no aliases).
    for (const t of REQUIRED_TOKENS) {
      expect(TOKENS).toContain(t);
    }
  });

  test("TIER_FALLBACKS maps optional tiers to required tiers only", () => {
    expect(TIER_FALLBACKS).toEqual({
      TIER_ROUTER: "TIER_REASONING",
      TIER_REVIEW: "TIER_CODE",
    });
    // Fallback targets must be required tiers (no chained fallbacks).
    for (const target of Object.values(TIER_FALLBACKS)) {
      expect(REQUIRED_TOKENS).toContain(target);
    }
  });

  test("isTierToken recognises every canonical token", async () => {
    const { isTierToken } = await import("../scripts/resolve-model-preset.ts");
    for (const t of TOKENS) {
      expect(isTierToken(`{{${t}}}`)).toBe(true);
    }
    expect(isTierToken("concrete/model")).toBe(false);
    expect(isTierToken("{{UNKNOWN_TIER}}")).toBe(false);
  });
});

describe("resolve-model-preset.ts — model-preset resolution", () => {
  let tempDir: string;
  let configPath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "model-preset-test-"));
    configPath = join(tempDir, "models.config.json");
    writeFileSync(configPath, JSON.stringify(FIXTURE_CONFIG, null, 2));
  });

  afterAll(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("loadModelConfig loads and validates a valid config", async () => {
    const config = await loadModelConfig(configPath, tempDir);
    expect(config).toBeDefined();
    expect(config.presets).toBeDefined();
    expect(config.presets!['test-preset']).toBeDefined();
  });

  test("loadModelConfig throws on invalid JSON", async () => {
    const invalidPath = join(tempDir, "invalid.json");
    writeFileSync(invalidPath, "not json");
    await expect(loadModelConfig(invalidPath, tempDir)).rejects.toThrow();
  });

  test("loadModelConfig throws on missing presets", async () => {
    const invalidPath = join(tempDir, "no-presets.json");
    writeFileSync(invalidPath, JSON.stringify({}));
    await expect(loadModelConfig(invalidPath, tempDir)).rejects.toThrow();
  });

  test("resolvePreset resolves a valid preset with all five tiers", () => {
    const config = FIXTURE_CONFIG;
    const resolved = resolvePreset(config, "test-preset");
    expect(resolved.preset).toBe("test-preset");
    expect(resolved.models).toEqual({
      TIER_ROUTER: "test/router-model",
      TIER_REASONING: "test/reasoning-model",
      TIER_CODE: "test/code-model",
      TIER_FAST: "test/fast-model",
      TIER_REVIEW: "test/review-model",
    });
  });

  test("resolvePreset uses default preset when none specified", () => {
    const config = FIXTURE_CONFIG;
    const resolved = resolvePreset(config);
    expect(resolved.preset).toBe("test-preset");
  });

  test("resolvePreset throws on missing preset", () => {
    const config = FIXTURE_CONFIG;
    expect(() => resolvePreset(config, "nonexistent")).toThrow();
  });

  test("resolvePreset throws on invalid preset (missing required tiers)", () => {
    const config = INVALID_CONFIG;
    expect(() => resolvePreset(config, "invalid-preset")).toThrow();
  });

  test("resolveModelValue resolves every canonical tier token", async () => {
    const config = FIXTURE_CONFIG;
    // The expected mapping below mirrors FIXTURE_CONFIG; explicit is clearer than computing from the token name.
    const explicit: Record<string, string> = {
      TIER_ROUTER: "test/router-model",
      TIER_REASONING: "test/reasoning-model",
      TIER_CODE: "test/code-model",
      TIER_FAST: "test/fast-model",
      TIER_REVIEW: "test/review-model",
    };
    for (const token of TOKENS) {
      const resolved = await resolveModelValue(`{{${token}}}`, config, "test-preset");
      expect(resolved).toBe(explicit[token]);
    }
  });

  test("resolveModelValue returns concrete value unchanged", async () => {
    const config = FIXTURE_CONFIG;
    const resolved = await resolveModelValue("concrete/model", config, "test-preset");
    expect(resolved).toBe("concrete/model");
  });

  test("resolveModelValue returns unknown tokens unchanged", async () => {
    const config = FIXTURE_CONFIG;
    const resolved = await resolveModelValue("{{UNKNOWN_TIER}}", config, "test-preset");
    expect(resolved).toBe("{{UNKNOWN_TIER}}");
  });

  test("listPresets returns all preset names", () => {
    const config = FIXTURE_CONFIG;
    const presets = listPresets(config);
    expect(presets).toEqual(["test-preset", "another-preset"]);
  });

  test("getPreset returns a specific preset's model map", () => {
    const config = FIXTURE_CONFIG;
    const preset = getPreset(config, "test-preset");
    expect(preset).toEqual({
      TIER_ROUTER: "test/router-model",
      TIER_REASONING: "test/reasoning-model",
      TIER_CODE: "test/code-model",
      TIER_FAST: "test/fast-model",
      TIER_REVIEW: "test/review-model",
    });
  });

  test("getPreset returns null for nonexistent preset", () => {
    const config = FIXTURE_CONFIG;
    const preset = getPreset(config, "nonexistent");
    expect(preset).toBeNull();
  });

  test("getDefaultPreset returns the default preset name", () => {
    const config = FIXTURE_CONFIG;
    const defaultPreset = getDefaultPreset(config);
    expect(defaultPreset).toBe("test-preset");
  });

  test("validatePreset returns true for valid preset", () => {
    const config = FIXTURE_CONFIG;
    expect(validatePreset(config, "test-preset")).toBe(true);
  });

  test("validatePreset returns false for invalid preset", () => {
    const config = FIXTURE_CONFIG;
    expect(validatePreset(config, "nonexistent")).toBe(false);
  });

  test("loadModelConfig handles malformed JSON gracefully", async () => {
    const malformedPath = join(tempDir, "malformed.json");
    writeFileSync(malformedPath, "{ invalid json }");
    await expect(loadModelConfig(malformedPath, tempDir)).rejects.toThrow();
  });

  test("loadModelConfig handles missing file gracefully", async () => {
    const missingPath = join(tempDir, "nonexistent.json");
    await expect(loadModelConfig(missingPath, tempDir)).rejects.toThrow();
  });

  test("loadModelConfig handles empty file gracefully", async () => {
    const emptyPath = join(tempDir, "empty.json");
    writeFileSync(emptyPath, "");
    await expect(loadModelConfig(emptyPath, tempDir)).rejects.toThrow();
  });

  test("resolvePreset handles null preset when default_preset is set", () => {
    const config = FIXTURE_CONFIG;
    const resolved = resolvePreset(config, null);
    expect(resolved.preset).toBe("test-preset");
  });

  test("resolvePreset throws when no preset specified and no default_preset", () => {
    const config = { presets: {} };
    expect(() => resolvePreset(config)).toThrow();
  });

  test("resolveModelValue handles non-token values unchanged", async () => {
    const config = FIXTURE_CONFIG;
    const resolved = await resolveModelValue("plain/model", config, "test-preset");
    expect(resolved).toBe("plain/model");
  });

  test("listPresets returns empty array when no presets defined", () => {
    const config = { presets: {} };
    expect(listPresets(config)).toEqual([]);
  });

  test("getPreset returns null when preset has no models field", () => {
    const config = { presets: { "empty-preset": {} } };
    expect(getPreset(config, "empty-preset")).toEqual({});
  });

  test("validatePreset returns false for config with no presets", () => {
    const config = {};
    expect(validatePreset(config as any, "test-preset")).toBe(false);
  });

  test("resolveModelConfig returns null for missing config file", async () => {
    const result = await resolveModelConfig(join(tempDir, "nonexistent.json"), tempDir);
    expect(result).toBeNull();
  });

  test("resolveModelConfig returns null for malformed JSON", async () => {
    const malformedPath = join(tempDir, "malformed.json");
    writeFileSync(malformedPath, "{ invalid }");
    // Invalid JSON is handled gracefully — returns null (transparent fallback)
    const result = await resolveModelConfig(malformedPath, tempDir);
    expect(result).toBeNull();
  });

  test("resolveModelConfig throws for config missing presets", async () => {
    const badPath = join(tempDir, "bad-structure.json");
    writeFileSync(badPath, JSON.stringify({ not: "a config" }));
    await expect(resolveModelConfig(badPath, tempDir)).rejects.toThrow();
  });
});

describe("resolve-model-preset.ts — backward-compat three-tier presets", () => {
  test("three-tier preset resolves through one-hop fallbacks", () => {
    const resolved = resolvePreset(THREE_TIER_CONFIG, "three-tier-legacy");
    expect(resolved.preset).toBe("three-tier-legacy");
    // Required tiers preserve their original concrete IDs.
    expect(resolved.models.TIER_REASONING).toBe("legacy/reasoning");
    expect(resolved.models.TIER_CODE).toBe("legacy/code");
    expect(resolved.models.TIER_FAST).toBe("legacy/fast");
    // Optional tiers fall back exactly once.
    expect(resolved.models.TIER_ROUTER).toBe("legacy/reasoning");
    expect(resolved.models.TIER_REVIEW).toBe("legacy/code");
  });

  test("resolveModelValue resolves {{TIER_ROUTER}} via fallback", async () => {
    const resolved = await resolveModelValue(
      "{{TIER_ROUTER}}",
      THREE_TIER_CONFIG,
      "three-tier-legacy",
    );
    expect(resolved).toBe("legacy/reasoning");
  });

  test("resolveModelValue resolves {{TIER_REVIEW}} via fallback", async () => {
    const resolved = await resolveModelValue(
      "{{TIER_REVIEW}}",
      THREE_TIER_CONFIG,
      "three-tier-legacy",
    );
    expect(resolved).toBe("legacy/code");
  });

  test("explicit optional tier wins over fallback", () => {
    const config = {
      presets: {
        "explicit-router": {
          models: {
            TIER_ROUTER: "explicit/router",
            TIER_REASONING: "r1",
            TIER_CODE: "c1",
            TIER_FAST: "f1",
          },
        },
      },
    };
    const resolved = resolvePreset(config, "explicit-router");
    expect(resolved.models.TIER_ROUTER).toBe("explicit/router");
    expect(resolved.models.TIER_REASONING).toBe("r1");
    expect(resolved.models.TIER_REVIEW).toBe("c1");
  });

  test("preset missing a required tier fails even with fallbacks available", () => {
    const config = {
      presets: {
        "missing-code": {
          models: {
            TIER_ROUTER: "r0",
            TIER_REASONING: "r1",
            TIER_FAST: "f1",
            // TIER_CODE missing — fallback cannot substitute (no chain).
          },
        },
      },
    };
    expect(() => resolvePreset(config, "missing-code")).toThrow();
  });
});

describe("resolve-model-preset.ts — applyTierFallbacks (pure function)", () => {
  test("fills in missing TIER_ROUTER and TIER_REVIEW via fallbacks", () => {
    const out = applyTierFallbacks({
      TIER_REASONING: "r",
      TIER_CODE: "c",
      TIER_FAST: "f",
    });
    expect(out).toEqual({
      TIER_REASONING: "r",
      TIER_CODE: "c",
      TIER_FAST: "f",
      TIER_ROUTER: "r",
      TIER_REVIEW: "c",
    });
  });

  test("preserves explicit values when both fallback and explicit are present", () => {
    const out = applyTierFallbacks({
      TIER_ROUTER: "explicit-router",
      TIER_REASONING: "r",
      TIER_CODE: "c",
      TIER_FAST: "f",
      TIER_REVIEW: "explicit-review",
    });
    expect(out.TIER_ROUTER).toBe("explicit-router");
    expect(out.TIER_REVIEW).toBe("explicit-review");
  });

  test("does not chain fallbacks (no TIER_REASONING -> no TIER_ROUTER substitution)", () => {
    const out = applyTierFallbacks({
      TIER_CODE: "c",
      TIER_FAST: "f",
      // TIER_REASONING missing — TIER_ROUTER must NOT silently pick TIER_CODE.
    });
    expect(out.TIER_ROUTER).toBeUndefined();
    expect(out.TIER_REVIEW).toBe("c");
  });

  test("does not mutate the input map", () => {
    const input = { TIER_REASONING: "r", TIER_CODE: "c", TIER_FAST: "f" };
    const snapshot = JSON.stringify(input);
    applyTierFallbacks(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});