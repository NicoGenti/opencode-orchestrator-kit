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
  TOKENS,
} = await import("../scripts/resolve-model-preset.ts");

const FIXTURE_CONFIG = {
  "$schema": "https://nicogenti.github.io/opencode-orchestrator-kit/schemas/models.config.schema.json",
  "version": 1,
  "description": "Test configuration",
  "tiers": {
    "TIER_REASONING": "Test reasoning tier",
    "TIER_CODE": "Test code tier",
    "TIER_FAST": "Test fast tier"
  },
  "default_preset": "test-preset",
  "presets": {
    "test-preset": {
      "label": "Test Preset",
      "description": "Test preset description",
      "requires": [],
      "models": {
        "TIER_REASONING": "test/reasoning-model",
        "TIER_CODE": "test/code-model",
        "TIER_FAST": "test/fast-model"
      }
    },
    "another-preset": {
      "label": "Another Preset",
      "description": "Another preset description",
      "requires": [],
      "models": {
        "TIER_REASONING": "another/reasoning-model",
        "TIER_CODE": "another/code-model",
        "TIER_FAST": "another/fast-model"
      }
    }
  }
};

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

  test("resolvePreset resolves a valid preset", () => {
    const config = FIXTURE_CONFIG;
    const resolved = resolvePreset(config, "test-preset");
    expect(resolved.preset).toBe("test-preset");
    expect(resolved.models).toEqual({
      "TIER_REASONING": "test/reasoning-model",
      "TIER_CODE": "test/code-model",
      "TIER_FAST": "test/fast-model"
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

  test("resolvePreset throws on invalid preset (missing tiers)", () => {
    const config = INVALID_CONFIG;
    expect(() => resolvePreset(config, "invalid-preset")).toThrow();
  });

  test("resolveModelValue resolves a tier token", async () => {
    const config = FIXTURE_CONFIG;
    const resolved = await resolveModelValue("{{TIER_REASONING}}", config, "test-preset");
    expect(resolved).toBe("test/reasoning-model");
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
      "TIER_REASONING": "test/reasoning-model",
      "TIER_CODE": "test/code-model",
      "TIER_FAST": "test/fast-model"
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

  test("TOKENS contains all required tier names", () => {
    expect(TOKENS).toEqual(["TIER_REASONING", "TIER_CODE", "TIER_FAST"]);
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