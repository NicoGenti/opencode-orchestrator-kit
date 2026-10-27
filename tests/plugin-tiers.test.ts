import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  BUNDLED_MODEL_CONFIG,
  REQUIRED_TIERS,
  TIER_FALLBACKS,
  TIER_TOKENS,
  TierConfigError,
  collectAvailabilityWarnings,
  resolveTierMap,
  resolveTierMapForConfig,
} from "../plugin/src/tiers.ts";

// Cross-implementation parity source: the repo-root resolver stays the
// source of truth for tier semantics; the plugin module mirrors it
// self-contained (scripts/ is not in the plugin package files).
const { applyTierFallbacks, resolvePreset } = await import(
  "../scripts/resolve-model-preset.ts"
);

const ROOT = join(import.meta.dir, "..");
const TEMPLATE_CONFIG = JSON.parse(
  readFileSync(join(ROOT, "templates", "models.config.json"), "utf-8"),
) as Record<string, unknown>;

describe("plugin tier vocabulary", () => {
  test("exposes exactly the five canonical tiers in canonical order", () => {
    expect([...TIER_TOKENS]).toEqual([
      "TIER_ROUTER",
      "TIER_REASONING",
      "TIER_CODE",
      "TIER_FAST",
      "TIER_REVIEW",
    ]);
  });

  test("required tiers are exactly TIER_REASONING, TIER_CODE, TIER_FAST", () => {
    expect([...REQUIRED_TIERS]).toEqual([
      "TIER_REASONING",
      "TIER_CODE",
      "TIER_FAST",
    ]);
  });

  test("fallbacks are exactly one-hop: ROUTER→REASONING, REVIEW→CODE", () => {
    expect({ ...TIER_FALLBACKS }).toEqual({
      TIER_ROUTER: "TIER_REASONING",
      TIER_REVIEW: "TIER_CODE",
    });
  });
});

describe("resolveTierMap", () => {
  test("default preset resolves from the bundled default_preset", () => {
    const resolved = resolveTierMap();
    expect(resolved.preset).toBe("default");
    expect(resolved.models).toEqual({
      TIER_ROUTER: "opencode-go/gpt-5.6-luna",
      TIER_REASONING: "opencode-go/kimi-k3",
      TIER_CODE: "opencode-go/minimax-m3",
      TIER_REVIEW: "opencode-go/minimax-m3",
      TIER_FAST: "ollama/deepseek-v4.1-flash:cloud",
    });
  });

  test("optional tier omitted from a preset falls back exactly one hop", () => {
    const config = {
      ...BUNDLED_MODEL_CONFIG,
      default_preset: "bare-required",
      presets: {
        "bare-required": {
          models: {
            TIER_REASONING: "bare/reasoning",
            TIER_CODE: "bare/code",
            TIER_FAST: "bare/fast",
          },
        },
      },
    };
    const resolved = resolveTierMapForConfig(config, undefined);
    expect(resolved.preset).toBe("bare-required");
    expect(resolved.models.TIER_ROUTER).toBe("bare/reasoning");
    expect(resolved.models.TIER_REVIEW).toBe("bare/code");
    expect(resolved.models.TIER_REASONING).toBe("bare/reasoning");
    expect(resolved.models.TIER_CODE).toBe("bare/code");
    expect(resolved.models.TIER_FAST).toBe("bare/fast");
  });

  test("fallbacks are never chained into synthetic required values", () => {
    // TIER_ROUTER is missing and its one-hop target (TIER_REASONING) is
    // missing too: resolution must fail on the missing required tier,
    // never synthesize ROUTER from a longer chain.
    const config = {
      ...BUNDLED_MODEL_CONFIG,
      default_preset: "orphan-router",
      presets: {
        "orphan-router": {
          models: {
            TIER_CODE: "orphan/code",
            TIER_FAST: "orphan/fast",
          },
        },
      },
    };
    let error: unknown;
    try {
      resolveTierMapForConfig(config, undefined);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(TierConfigError);
    expect((error as TierConfigError).message).toContain("TIER_REASONING");
    expect((error as TierConfigError).message).toContain("orphan-router");
  });

  test("explicit preset name overrides the bundled default_preset", () => {
    expect(resolveTierMap("freellmapi").preset).toBe("freellmapi");
    expect(resolveTierMap("freellmapi").models.TIER_FAST).toBe(
      "freellmapi/auto:fast",
    );
  });
});

describe("TierConfigError: missing required tiers", () => {
  test("names the missing tier and the failing preset", () => {
    const config = {
      ...BUNDLED_MODEL_CONFIG,
      default_preset: "no-fast",
      presets: {
        "no-fast": {
          models: {
            TIER_ROUTER: "nf/router",
            TIER_REASONING: "nf/reasoning",
            TIER_CODE: "nf/code",
          },
        },
      },
    };
    let error: unknown;
    try {
      resolveTierMapForConfig(config, undefined);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(TierConfigError);
    expect((error as TierConfigError).message).toContain("TIER_FAST");
    expect((error as TierConfigError).message).toContain("no-fast");
  });

  test("missing required tier in the default preset names 'default'", () => {
    const corrupted = {
      ...BUNDLED_MODEL_CONFIG,
      default_preset: "custom",
      presets: {
        custom: {
          models: { TIER_ROUTER: "x/y" },
        },
      },
    };
    let error: unknown;
    try {
      resolveTierMapForConfig(corrupted, undefined);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(TierConfigError);
    expect((error as TierConfigError).message).toContain("TIER_CODE");
    expect((error as TierConfigError).message).toContain("TIER_FAST");
    expect((error as TierConfigError).message).toContain("custom");
  });
});

describe("TierConfigError: placeholder/* values", () => {
  test("selecting 'generic' throws naming the tier and the value", () => {
    // generic ships placeholder sentinels BY DESIGN; selecting it is the
    // signal the user must edit the config before use.
    let error: unknown;
    try {
      resolveTierMap("generic");
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(TierConfigError);
    expect((error as TierConfigError).message).toContain("generic");
    expect((error as TierConfigError).message).toContain("TIER_ROUTER");
    expect((error as TierConfigError).message).toContain(
      "placeholder/router-model-id",
    );
  });

  test("placeholder in an optional tier value still throws", () => {
    const config = {
      ...BUNDLED_MODEL_CONFIG,
      default_preset: "ph",
      presets: {
        ph: {
          models: {
            TIER_REASONING: "real/reasoning",
            TIER_CODE: "real/code",
            TIER_FAST: "real/fast",
            TIER_REVIEW: "placeholder/review-id",
          },
        },
      },
    };
    let error: unknown;
    try {
      resolveTierMapForConfig(config, undefined);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(TierConfigError);
    expect((error as TierConfigError).message).toContain("TIER_REVIEW");
    expect((error as TierConfigError).message).toContain("ph");
    expect((error as TierConfigError).message).toContain(
      "placeholder/review-id",
    );
  });

  test("a leftover {{TIER_*}} token value is an unresolved-token error", () => {
    const config = {
      ...BUNDLED_MODEL_CONFIG,
      default_preset: "tokened",
      presets: {
        tokened: {
          models: {
            TIER_ROUTER: "real/router",
            TIER_REASONING: "real/reasoning",
            TIER_CODE: "{{TIER_FAST}}",
            TIER_FAST: "real/fast",
          },
        },
      },
    };
    let error: unknown;
    try {
      resolveTierMapForConfig(config, undefined);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(TierConfigError);
    expect((error as TierConfigError).message).toContain("TIER_CODE");
    expect((error as TierConfigError).message).toContain("{{TIER_FAST}}");
  });
});

describe("TierConfigError: unknown preset", () => {
  test("lists the available preset names", () => {
    let error: unknown;
    try {
      resolveTierMap("definitely-not-a-preset");
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(TierConfigError);
    expect((error as TierConfigError).message).toContain(
      "definitely-not-a-preset",
    );
    for (const preset of [
      "default",
      "freellmapi",
      "generic",
      "opencode-go-free",
      "ollama",
    ]) {
      expect((error as TierConfigError).message).toContain(preset);
    }
  });
});

describe("bundled config parity", () => {
  test("the bundled config deep-equals templates/models.config.json", () => {
    expect(BUNDLED_MODEL_CONFIG).toEqual(TEMPLATE_CONFIG);
  });

  test("resolveTierMap equals resolvePreset for the resolvable presets", () => {
    for (const preset of ["default", "freellmapi", "opencode-go-free", "ollama"]) {
      const expected = resolvePreset(TEMPLATE_CONFIG as never, preset);
      const actual = resolveTierMap(preset);
      expect(actual.preset).toBe(expected.preset);
      expect(actual.models).toEqual(expected.models);
    }
  });

  test("fallback application order matches applyTierFallbacks", () => {
    const raw = {
      TIER_REASONING: "r/x",
      TIER_CODE: "r/y",
      TIER_FAST: "r/z",
    };
    const expected = applyTierFallbacks(raw);
    const config = {
      ...BUNDLED_MODEL_CONFIG,
      default_preset: "parity-fallbacks",
      presets: { "parity-fallbacks": { models: raw } },
    };
    expect(resolveTierMapForConfig(config, undefined)).toEqual({
      preset: "parity-fallbacks",
      models: expected,
    });
  });
});

describe("collectAvailabilityWarnings", () => {
  const resolvedModels = {
    TIER_ROUTER: "go/a",
    TIER_REASONING: "go/b",
    TIER_CODE: "go/c",
    TIER_REVIEW: "go/c",
    TIER_FAST: "fast/d",
  };
  const presetName = "default";

  test("missing provider/model produces one entry per offending tier", () => {
    const warnings = collectAvailabilityWarnings(resolvedModels, presetName, [
      { providerID: "go", id: "a" },
      { providerID: "go", id: "b" },
    ]);
    expect(warnings.map((warning) => warning.tier)).toEqual([
      "TIER_CODE",
      "TIER_FAST",
      "TIER_REVIEW",
    ]);
  });

  test("fully available registry produces no warnings", () => {
    const warnings = collectAvailabilityWarnings(resolvedModels, presetName, [
      { providerID: "go", id: "a" },
      { providerID: "go", id: "b" },
      { providerID: "go", id: "c" },
      { providerID: "fast", id: "d" },
    ]);
    expect(warnings).toHaveLength(0);
  });

  test("entries carry prefix, tier, model value and preset", () => {
    const warnings = collectAvailabilityWarnings(
      resolvedModels,
      presetName,
      [],
    );
    for (const warning of warnings) {
      expect(warning.message).toContain("[opencode-orchestrator-kit]");
      expect(warning.message).toContain(warning.tier);
      expect(warning.message).toContain(warning.model);
      expect(warning.message).toContain(presetName);
    }
  });
});
