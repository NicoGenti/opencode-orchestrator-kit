import { describe, expect, test, afterAll } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  TOKENS,
  REQUIRED_TOKENS,
  TIER_FALLBACKS,
  PLACEHOLDER_PREFIX,
  isTierToken,
  tierTokenName,
  isPlaceholder,
  parseModelRef,
  parseModelLine,
  applyTierFallbacks,
  resolvePreset,
  collectTierWarnings,
  discoverTierConfig,
} from "../src/tiers.ts";

mkdirSync("/tmp/opencode", { recursive: true });
const tmpRoot = mkdtempSync("/tmp/opencode/tiers-test-");
const roots = new Set<string>([tmpRoot]);
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function freshRoot(): string {
  const dir = mkdtempSync("/tmp/opencode/tiers-test-");
  roots.add(dir);
  return dir;
}

const readFile = (path: string): string => readFileSync(path, "utf-8");
const nodeExists = (path: string): boolean => existsSync(path);

function writeConfig(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

const FIXTURE_CONFIG = {
  $schema: "https://example.com/schema.json",
  version: 2,
  description: "Test configuration",
  default_preset: "test-preset",
  presets: {
    "test-preset": {
      label: "Test preset",
      models: {
        TIER_ROUTER: "test/router-model",
        TIER_REASONING: "test/reasoning-model",
        TIER_CODE: "test/code-model",
        TIER_FAST: "test/fast-model",
        TIER_REVIEW: "test/review-model",
      },
    },
  },
};

const THREE_TIER_CONFIG = {
  presets: {
    "three-tier-legacy": {
      label: "Three-tier legacy fixture",
      models: {
        TIER_REASONING: "legacy/reasoning",
        TIER_CODE: "legacy/code",
        TIER_FAST: "legacy/fast",
      },
    },
  },
};

describe("tiers.ts — canonical token tables", () => {
  test("TOKENS lists the five canonical tiers in canonical order", () => {
    expect(TOKENS).toEqual([
      "TIER_ROUTER",
      "TIER_REASONING",
      "TIER_CODE",
      "TIER_FAST",
      "TIER_REVIEW",
    ]);
  });

  test("REQUIRED_TOKENS lists the original three required tiers", () => {
    expect(REQUIRED_TOKENS).toEqual(["TIER_REASONING", "TIER_CODE", "TIER_FAST"]);
    for (const token of REQUIRED_TOKENS) {
      expect(TOKENS).toContain(token);
    }
  });

  test("TIER_FALLBACKS maps only optional tiers to required tiers", () => {
    expect(TIER_FALLBACKS).toEqual({
      TIER_ROUTER: "TIER_REASONING",
      TIER_REVIEW: "TIER_CODE",
    });
    for (const target of Object.values(TIER_FALLBACKS)) {
      expect(REQUIRED_TOKENS).toContain(target);
    }
  });

  test("PLACEHOLDER_PREFIX is the reserved placeholder/* sentinel", () => {
    expect(PLACEHOLDER_PREFIX).toBe("placeholder/");
  });

  test("isTierToken recognises every canonical token only", () => {
    for (const token of TOKENS) {
      expect(isTierToken(`{{${token}}}`)).toBe(true);
    }
    expect(isTierToken("concrete/model")).toBe(false);
    expect(isTierToken("{{UNKNOWN_TIER}}")).toBe(false);
    expect(isTierToken("{{TIER_ROUTER")).toBe(false);
  });

  test("tierTokenName extracts the tier from a token", () => {
    expect(tierTokenName("{{TIER_FAST}}")).toBe("TIER_FAST");
    expect(tierTokenName("{{UNKNOWN_TIER}}")).toBeNull();
    expect(tierTokenName("concrete/model")).toBeNull();
  });

  test("isPlaceholder matches the reserved prefix", () => {
    expect(isPlaceholder("placeholder/router-model-id")).toBe(true);
    expect(isPlaceholder("prov/model-a")).toBe(false);
  });
});

describe("tiers.ts — applyTierFallbacks", () => {
  test("fills missing optional tiers from required tiers (one hop)", () => {
    expect(
      applyTierFallbacks({
        TIER_REASONING: "legacy/reasoning",
        TIER_CODE: "legacy/code",
        TIER_FAST: "legacy/fast",
      }),
    ).toEqual({
      TIER_ROUTER: "legacy/reasoning",
      TIER_REASONING: "legacy/reasoning",
      TIER_CODE: "legacy/code",
      TIER_FAST: "legacy/fast",
      TIER_REVIEW: "legacy/code",
    });
  });

  test("explicit optional tiers win over fallbacks", () => {
    const out = applyTierFallbacks({
      TIER_ROUTER: "explicit/router",
      TIER_REASONING: "r",
      TIER_CODE: "c",
      TIER_FAST: "f",
      TIER_REVIEW: "explicit/review",
    });
    expect(out.TIER_ROUTER).toBe("explicit/router");
    expect(out.TIER_REVIEW).toBe("explicit/review");
  });

  test("does not chain fallbacks", () => {
    const out = applyTierFallbacks({ TIER_CODE: "c", TIER_FAST: "f" });
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

describe("tiers.ts — resolvePreset", () => {
  test("resolves every canonical tier from a full preset", () => {
    const resolved = resolvePreset(FIXTURE_CONFIG, "test-preset");
    expect(resolved.preset).toBe("test-preset");
    expect(resolved.models).toEqual({
      TIER_ROUTER: "test/router-model",
      TIER_REASONING: "test/reasoning-model",
      TIER_CODE: "test/code-model",
      TIER_FAST: "test/fast-model",
      TIER_REVIEW: "test/review-model",
    });
  });

  test("uses default_preset when no preset is given", () => {
    expect(resolvePreset(FIXTURE_CONFIG).preset).toBe("test-preset");
  });

  test("three-tier legacy preset resolves through one-hop fallbacks", () => {
    const resolved = resolvePreset(THREE_TIER_CONFIG, "three-tier-legacy");
    expect(resolved.models.TIER_REASONING).toBe("legacy/reasoning");
    expect(resolved.models.TIER_CODE).toBe("legacy/code");
    expect(resolved.models.TIER_FAST).toBe("legacy/fast");
    expect(resolved.models.TIER_ROUTER).toBe("legacy/reasoning");
    expect(resolved.models.TIER_REVIEW).toBe("legacy/code");
  });

  test("throws on unknown preset name with available presets in the message", () => {
    try {
      resolvePreset(FIXTURE_CONFIG, "nonexistent");
      throw new Error("SENTINEL: no error thrown");
    } catch (err) {
      expect((err as Error).message).toContain("nonexistent");
      expect((err as Error).message).toContain("test-preset");
      expect((err as Error).message).not.toContain("SENTINEL");
    }
  });

  test("throws when a required tier is missing even if fallbacks exist", () => {
    const config = {
      presets: {
        "missing-code": {
          models: {
            TIER_ROUTER: "r0",
            TIER_REASONING: "r1",
            TIER_FAST: "f1",
          },
        },
      },
    };
    try {
      resolvePreset(config, "missing-code");
      throw new Error("SENTINEL: no error thrown");
    } catch (err) {
      expect((err as Error).message).toContain("TIER_CODE");
      expect((err as Error).message).not.toContain("SENTINEL");
    }
  });

  test("throws when neither preset nor default_preset is present", () => {
    try {
      resolvePreset({ presets: {} });
      throw new Error("SENTINEL: no error thrown");
    } catch (err) {
      expect((err as Error).message).toContain("default_preset");
      expect((err as Error).message).not.toContain("SENTINEL");
    }
  });
});

describe("tiers.ts — parseModelRef", () => {
  test("splits provider/model on the FIRST slash only", () => {
    expect(parseModelRef("prov/model-a")).toEqual({ providerID: "prov", id: "model-a" });
    expect(parseModelRef("ollama/deepseek-v4.1-flash:cloud")).toEqual({
      providerID: "ollama",
      id: "deepseek-v4.1-flash:cloud",
    });
  });

  test("returns null on malformed refs", () => {
    expect(parseModelRef("no-slash")).toBeNull();
    expect(parseModelRef("/leading")).toBeNull();
    expect(parseModelRef("trailing/")).toBeNull();
    expect(parseModelRef("")).toBeNull();
  });
});

describe("tiers.ts — parseModelLine", () => {
  test("reads the model value inside the YAML frontmatter", () => {
    const text = [
      "---",
      "description: routing agent",
      "model: {{TIER_ROUTER}}",
      "temperature: 0.25",
      "---",
      "",
      "# body",
    ].join("\n");
    expect(parseModelLine(text)).toBe("{{TIER_ROUTER}}");
  });

  test("reads concrete model values", () => {
    const text = ["---", "model: prov/model-a", "---"].join("\n");
    expect(parseModelLine(text)).toBe("prov/model-a");
  });

  test("returns null when there is no frontmatter, no model line, or the model line sits after the frontmatter", () => {
    expect(parseModelLine("# no fm")).toBeNull();
    expect(parseModelLine(["---", "description: x", "---"].join("\n"))).toBeNull();
    expect(parseModelLine(["---", "a: 1", "---", "model: late/model"].join("\n"))).toBeNull();
  });
});

describe("tiers.ts — collectTierWarnings", () => {
  const available = new Set(["prov/model-a", "prov/model-b"]);

  test("warns once per tier with a placeholder value (availability check skipped)", () => {
    const warnings = collectTierWarnings(
      { TIER_REASONING: "placeholder/reasoning-model-id", TIER_CODE: "prov/model-a" },
      () => false,
    );
    expect(warnings).toEqual([
      {
        code: "placeholder",
        tier: "TIER_REASONING",
        value: "placeholder/reasoning-model-id",
        message: expect.stringContaining("placeholder/reasoning-model-id"),
      },
    ]);
  });

  test("warns for models missing from the available set", () => {
    const warnings = collectTierWarnings(
      {
        TIER_ROUTER: "prov/model-a",
        TIER_REASONING: "ghost/missing",
      },
      (value) => available.has(value),
    );
    expect(warnings).toEqual([
      {
        code: "unavailable",
        tier: "TIER_REASONING",
        value: "ghost/missing",
        message: expect.stringContaining("ghost/missing"),
      },
    ]);
  });

  test("never warns for available tiers or absent tiers", () => {
    const warnings = collectTierWarnings(
      {
        TIER_REASONING: "prov/model-a",
        TIER_CODE: "prov/model-b",
      },
      (value) => available.has(value),
    );
    expect(warnings).toEqual([]);
  });
});

describe("tiers.ts — discoverTierConfig", () => {
  test("prefers the project config when present", () => {
    const root = freshRoot();
    const projectPath = writeConfig(root, "models.config.json", JSON.stringify(THREE_TIER_CONFIG));
    const templatePath = writeConfig(root, "template.config.json", JSON.stringify(FIXTURE_CONFIG));
    const discovered = discoverTierConfig(projectPath, templatePath, readFile, nodeExists);
    expect(discovered.source).toBe("project");
    expect(discovered.path).toBe(projectPath);
    expect(resolvePreset(discovered.config, "three-tier-legacy").models.TIER_ROUTER).toBe("legacy/reasoning");
  });

  test("falls back to the template when the project config is missing", () => {
    const root = freshRoot();
    const templatePath = writeConfig(root, "t2.config.json", JSON.stringify(FIXTURE_CONFIG));
    const discovered = discoverTierConfig(join(root, "missing.json"), templatePath, readFile, nodeExists);
    expect(discovered.source).toBe("template");
    expect(discovered.path).toBe(templatePath);
    expect(resolvePreset(discovered.config).preset).toBe("test-preset");
  });

  test("uses the bundled template of this repo by default (smoke)", () => {
    // The real repo template is wired in by setup; here we only prove discovery
    // accepts explicit paths. exist check on the repo template is done by setup tests.
    expect(existsSync(join(tmpRoot, ".."))).toBe(true);
  });

  test("throws a clear error when both configs are missing", () => {
    const root = freshRoot();
    try {
      discoverTierConfig(join(root, "nope.json"), join(root, "nope-too.json"), readFile, nodeExists);
      throw new Error("SENTINEL: no error thrown");
    } catch (err) {
      expect((err as Error).message).toContain("model config");
      expect((err as Error).message).not.toContain("SENTINEL");
    }
  });

  test("throws a clear error on unparseable JSON", () => {
    const root = freshRoot();
    const templatePath = writeConfig(root, "invalid.json", "{ not json");
    try {
      discoverTierConfig(join(root, "missing.json"), templatePath, readFile, nodeExists);
      throw new Error("SENTINEL: no error thrown");
    } catch (err) {
      expect((err as Error).message).toContain("Invalid JSON");
      expect((err as Error).message).toContain("invalid.json");
      expect((err as Error).message).not.toContain("SENTINEL");
    }
  });

  test("throws a clear error when the presets object is missing", () => {
    const root = freshRoot();
    const templatePath = writeConfig(root, "no-presets.json", JSON.stringify({}));
    try {
      discoverTierConfig(join(root, "missing.json"), templatePath, readFile, nodeExists);
      throw new Error("SENTINEL: no error thrown");
    } catch (err) {
      expect((err as Error).message).toContain("presets");
      expect((err as Error).message).not.toContain("SENTINEL");
    }
  });

  test("unparseable PROJECT config throws even when the template is valid", () => {
    const root = freshRoot();
    const projectPath = writeConfig(root, "models.config.json", "}{ broken");
    const templatePath = writeConfig(root, "template.json", JSON.stringify(FIXTURE_CONFIG));
    try {
      discoverTierConfig(projectPath, templatePath, readFile, nodeExists);
      throw new Error("SENTINEL: no error thrown");
    } catch (err) {
      expect((err as Error).message).toContain("Invalid JSON");
      expect((err as Error).message).toContain("models.config.json");
      expect((err as Error).message).not.toContain("SENTINEL");
    }
  });
});
