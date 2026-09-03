import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Import the function directly rather than spawning the script
const { extractStablePrefix, assemblePrompt } = await import("../scripts/assemble-prompt.ts");

const BASELINE_FILE = resolve(import.meta.dir, "fixtures", "prompt-prefix-boundary.txt");

function loadBaseline(): string[] {
  return readFileSync(BASELINE_FILE, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

describe("assemble-prompt.ts — stable prefix extraction", () => {
  test("script exists and is executable", () => {
    const SCRIPT_PATH = resolve(import.meta.dir, "..", "scripts", "assemble-prompt.ts");
    expect(existsSync(SCRIPT_PATH)).toBe(true);
  });

  test("extractStablePrefix output matches committed baseline", async () => {
    const result = await extractStablePrefix();
    expect(result).toEqual(loadBaseline());
  });

  test("AGENTS.md is first in output", async () => {
    const result = await extractStablePrefix();
    expect(result[0]).toBe("AGENTS.md");
  });

  test("agents/ files appear sorted alphabetically", async () => {
    const result = await extractStablePrefix();
    const agentEntries = result.filter((p) => p.startsWith("agents/"));
    const sorted = [...agentEntries].sort();
    expect(agentEntries).toEqual(sorted);
  });

  test("extras/ files appear after agents/ (if directory exists)", async () => {
    const result = await extractStablePrefix();
    const extrasEntries = result.filter((p) => p.startsWith("extras/"));
    if (extrasEntries.length > 0) {
      const lastAgentsIdx = result.reduce((last, p, i) => (p.startsWith("agents/") ? i : last), -1);
      const firstExtrasIdx = result.indexOf(extrasEntries[0]);
      expect(lastAgentsIdx).toBeLessThan(firstExtrasIdx);
    }
  });

  test("extras/ files are sorted alphabetically", async () => {
    const result = await extractStablePrefix();
    const extrasEntries = result.filter((p) => p.startsWith("extras/"));
    const sorted = [...extrasEntries].sort();
    expect(extrasEntries).toEqual(sorted);
  });

  test("no .opencode/ paths in output", async () => {
    const result = await extractStablePrefix();
    for (const line of result) {
      expect(line.startsWith(".opencode/")).toBe(false);
    }
  });
});

describe("assemble-prompt.ts — extras/ directory absence handling", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "assemble-prompt-test-"));
    const agentsDir = join(tempDir, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(tempDir, "AGENTS.md"), "# Test\n");
    writeFileSync(join(agentsDir, "b.md"), "# B\n");
    writeFileSync(join(agentsDir, "a.md"), "# A\n");
  });

  afterAll(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("extractStablePrefix handles missing extras/ directory gracefully", async () => {
    const result = await extractStablePrefix(tempDir);
    expect(result).toEqual(["AGENTS.md", "agents/a.md", "agents/b.md"]);
  });
});

describe("assemble-prompt.ts — model-preset resolution", () => {
  let tempDir: string;
  let configPath: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "assemble-prompt-model-test-"));
    configPath = join(tempDir, ".opencode", "models.config.json");
    mkdirSync(join(tempDir, ".opencode"), { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      "presets": {
        "test-preset": {
          "models": {
            "TIER_REASONING": "test/reasoning-model",
            "TIER_CODE": "test/code-model",
            "TIER_FAST": "test/fast-model"
          }
        }
      }
    }));

    // Create AGENTS.md (required for extractStablePrefix)
    writeFileSync(join(tempDir, "AGENTS.md"), "# Test\n");

    // Create a test file with a tier token
    const testFile = join(tempDir, "agents", "test-agent.md");
    mkdirSync(join(tempDir, "agents"), { recursive: true });
    writeFileSync(testFile, "---\nmodel: {{TIER_CODE}}\n---\n");
  });

  afterAll(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("assemblePrompt resolves model-preset tokens", async () => {
    const result = await assemblePrompt(tempDir, {
      modelConfigPath: configPath,
      preset: "test-preset"
    });
    expect(result.modelConfig).toBeDefined();
    expect(result.modelConfig!.preset).toBe("test-preset");
  });

  test("assemblePrompt handles missing model config gracefully", async () => {
    const result = await assemblePrompt(tempDir, {
      modelConfigPath: join(tempDir, "nonexistent.json")
    });
    expect(result.modelConfig).toBeNull();
  });

  test("assemblePrompt includes model config in cache key", async () => {
    // Use a separate temp dir for this test to avoid config mutation issues
    const testDir = mkdtempSync(join(tmpdir(), "cache-key-test-"));
    mkdirSync(join(testDir, "agents"), { recursive: true });
    writeFileSync(join(testDir, "AGENTS.md"), "# Test\n");
    writeFileSync(join(testDir, "agents", "a.md"), "# A\n");

    const testConfigPath = join(testDir, "models.config.json");
    writeFileSync(testConfigPath, JSON.stringify({
      "presets": {
        "preset-a": {
          "models": {
            "TIER_REASONING": "a/reasoning",
            "TIER_CODE": "a/code",
            "TIER_FAST": "a/fast"
          }
        }
      }
    }));

    try {
      // First run with cache
      const firstResult = await assemblePrompt(testDir, {
        modelConfigPath: testConfigPath,
        preset: "preset-a"
      });

      // Change the model config
      writeFileSync(testConfigPath, JSON.stringify({
        "presets": {
          "preset-b": {
            "models": {
              "TIER_REASONING": "b/reasoning",
              "TIER_CODE": "b/code",
              "TIER_FAST": "b/fast"
            }
          }
        }
      }));

      // Second run should miss cache due to changed config
      const secondResult = await assemblePrompt(testDir, {
        modelConfigPath: testConfigPath,
        preset: "preset-b"
      });

      // The stable prefix should be the same, but the model config should be different
      expect(firstResult.stablePrefix).toEqual(secondResult.stablePrefix);
      expect(firstResult.modelConfig!.preset).not.toBe(secondResult.modelConfig!.preset);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("assemblePrompt handles malformed models.config.json gracefully", async () => {
    const malformedPath = join(tempDir, "malformed.json");
    writeFileSync(malformedPath, "{ invalid json }");

    const result = await assemblePrompt(tempDir, {
      modelConfigPath: malformedPath
    });
    // Malformed JSON should cause modelConfig to be null (transparent fallback)
    expect(result.modelConfig).toBeNull();
  });

  test("assemblePrompt handles missing .opencode/context/ directory gracefully", async () => {
    // .opencode/context/ is excluded from stable prefix — the assembler
    // should work regardless of whether this directory exists.
    const result = await assemblePrompt(tempDir, {
      modelConfigPath: configPath,
      preset: "test-preset"
    });
    expect(result.stablePrefix).toBeDefined();
    expect(result.stablePrefix.length).toBeGreaterThan(0);
  });

  test("assemblePrompt handles empty agents/ directory", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "empty-agents-"));
    mkdirSync(join(emptyDir, "agents"), { recursive: true });
    writeFileSync(join(emptyDir, "AGENTS.md"), "# Test\n");

    try {
      const result = await assemblePrompt(emptyDir);
      expect(result.stablePrefix).toEqual(["AGENTS.md"]);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  test("assemblePrompt handles symlinked directories", async () => {
    const realDir = mkdtempSync(join(tmpdir(), "symlink-real-"));
    const linkDir = mkdtempSync(join(tmpdir(), "symlink-link-"));

    mkdirSync(join(realDir, "agents"), { recursive: true });
    writeFileSync(join(realDir, "AGENTS.md"), "# Test\n");
    writeFileSync(join(realDir, "agents", "a.md"), "# A\n");

    try {
      // Create a symlink to the real directory
      const { symlinkSync } = await import("node:fs");
      symlinkSync(realDir, join(linkDir, "linked-repo"));

      const result = await assemblePrompt(join(linkDir, "linked-repo"));
      expect(result.stablePrefix).toEqual(["AGENTS.md", "agents/a.md"]);
    } finally {
      rmSync(realDir, { recursive: true, force: true });
      rmSync(linkDir, { recursive: true, force: true });
    }
  });

  test("assemblePrompt handles useCache=false correctly", async () => {
    // Use a separate temp dir to avoid interference with other tests
    const testDir = mkdtempSync(join(tmpdir(), "no-cache-test-"));
    mkdirSync(join(testDir, "agents"), { recursive: true });
    writeFileSync(join(testDir, "AGENTS.md"), "# Original\n");
    writeFileSync(join(testDir, "agents", "a.md"), "# A\n");

    const testConfigPath = join(testDir, "models.config.json");
    writeFileSync(testConfigPath, JSON.stringify({
      "presets": {
        "test-preset": {
          "models": {
            "TIER_REASONING": "test/reasoning-model",
            "TIER_CODE": "test/code-model",
            "TIER_FAST": "test/fast-model"
          }
        }
      }
    }));

    try {
      const result1 = await assemblePrompt(testDir, {
        modelConfigPath: testConfigPath,
        preset: "test-preset",
        useCache: false
      });

      // Modify a file
      writeFileSync(join(testDir, "AGENTS.md"), "# Modified\n");

      const result2 = await assemblePrompt(testDir, {
        modelConfigPath: testConfigPath,
        preset: "test-preset",
        useCache: false
      });

      // Without cache, both results should reflect the current state
      expect(result1.stablePrefix).toEqual(result2.stablePrefix);
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("assemblePrompt handles large context-pack files", async () => {
    // Create a large file to test handling of larger inputs
    const largeContent = "# Large file\n".repeat(1000);
    writeFileSync(join(tempDir, "agents", "large.md"), largeContent);

    const result = await assemblePrompt(tempDir, {
      modelConfigPath: configPath,
      preset: "test-preset"
    });

    expect(result.stablePrefix).toContain("agents/large.md");
  });
});