import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

// Import the cache module (will fail until implemented)
const { PromptCache } = await import("../scripts/cache.ts");

describe("cache.ts — PromptCache", () => {
  let tempDir: string;
  let cache: PromptCache;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cache-test-"));
    mkdirSync(join(tempDir, "agents"), { recursive: true });
    writeFileSync(join(tempDir, "AGENTS.md"), "# Test\n");
    writeFileSync(join(tempDir, "agents", "b.md"), "# B\n");
    writeFileSync(join(tempDir, "agents", "a.md"), "# A\n");
    cache = new PromptCache();
  });

  afterAll(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("cache miss on first access", async () => {
    const result = await cache.get(tempDir);
    expect(result).toBeNull();
  });

  test("cache hit after setting", async () => {
    const value = ["AGENTS.md", "agents/a.md", "agents/b.md"];
    await cache.set(tempDir, value);
    const result = await cache.get(tempDir);
    expect(result).toEqual(value);
  });

  test("cache invalidation when file changes", async () => {
    const value = ["AGENTS.md", "agents/a.md", "agents/b.md"];
    await cache.set(tempDir, value);

    // Touch a file to change its mtime
    const filePath = join(tempDir, "agents", "a.md");
    const newTime = new Date(Date.now() + 1000);
    utimesSync(filePath, newTime, newTime);

    const result = await cache.get(tempDir);
    expect(result).toBeNull();
  });

  test("cache handles missing extras/ directory gracefully", async () => {
    const value = ["AGENTS.md", "agents/a.md", "agents/b.md"];
    await cache.set(tempDir, value);
    const result = await cache.get(tempDir);
    expect(result).toEqual(value);
  });

  test("cache key incorporates file paths and modification timestamps", async () => {
    const value = ["AGENTS.md", "agents/a.md", "agents/b.md"];
    await cache.set(tempDir, value);

    // Change a file's mtime
    const filePath = join(tempDir, "agents", "a.md");
    const newTime = new Date(Date.now() + 2000);
    utimesSync(filePath, newTime, newTime);

    const result = await cache.get(tempDir);
    expect(result).toBeNull();
  });

  test("cache key includes model config path for invalidation", async () => {
    const modelConfigPath = join(tempDir, "models.config.json");
    writeFileSync(modelConfigPath, '{"presets":{}}');

    const value = ["AGENTS.md", "agents/a.md", "agents/b.md"];
    await cache.set(tempDir, value, modelConfigPath);

    // Should hit cache (same config)
    let result = await cache.get(tempDir, modelConfigPath);
    expect(result).toEqual(value);

    // Change model config — should invalidate
    const newTime = new Date(Date.now() + 1000);
    utimesSync(modelConfigPath, newTime, newTime);

    result = await cache.get(tempDir, modelConfigPath);
    expect(result).toBeNull();
  });

  test("cache without model config path works independently", async () => {
    const value = ["AGENTS.md", "agents/a.md", "agents/b.md"];
    await cache.set(tempDir, value);

    // With model config path (different key) — should miss
    const result = await cache.get(tempDir, join(tempDir, "nonexistent.json"));
    expect(result).toBeNull();
  });

  test("concurrent cache access returns consistent results", async () => {
    const value = ["AGENTS.md", "agents/a.md", "agents/b.md"];
    await cache.set(tempDir, value);

    // Simulate concurrent access with multiple parallel gets
    const results = await Promise.all([
      cache.get(tempDir),
      cache.get(tempDir),
      cache.get(tempDir),
      cache.get(tempDir),
      cache.get(tempDir),
    ]);

    // All concurrent reads should return the same cached value
    for (const result of results) {
      expect(result).toEqual(value);
    }
  });

  test("concurrent cache sets do not corrupt the cache", async () => {
    const value1 = ["AGENTS.md", "agents/a.md", "agents/b.md"];
    const value2 = ["AGENTS.md", "agents/a.md", "agents/b.md", "agents/c.md"];

    // Simulate concurrent writes
    await Promise.all([
      cache.set(tempDir, value1),
      cache.set(tempDir, value2),
      cache.set(tempDir, value1),
      cache.set(tempDir, value2),
    ]);

    // The final value should be one of the two (not corrupted)
    const result = await cache.get(tempDir);
    expect([value1, value2].includes(result!)).toBe(true);
  });

  test("cache handles empty agents/ directory gracefully", async () => {
    const emptyAgentsDir = mkdtempSync(join(tmpdir(), "cache-empty-agents-"));
    mkdirSync(join(emptyAgentsDir, "agents"), { recursive: true });
    writeFileSync(join(emptyAgentsDir, "AGENTS.md"), "# Test\n");

    try {
      const value = ["AGENTS.md"];
      await cache.set(emptyAgentsDir, value);
      const result = await cache.get(emptyAgentsDir);
      expect(result).toEqual(value);
    } finally {
      rmSync(emptyAgentsDir, { recursive: true, force: true });
    }
  });

  test("cache handles missing .opencode/context/ directory gracefully", async () => {
    // The cache should not care about .opencode/context/ — it's excluded
    // from the stable prefix. This test verifies the cache works regardless.
    const value = ["AGENTS.md", "agents/a.md", "agents/b.md"];
    await cache.set(tempDir, value);
    const result = await cache.get(tempDir);
    expect(result).toEqual(value);
  });

  test("cache disabled constructor option prevents caching", async () => {
    const disabledCache = new PromptCache(false);
    const value = ["AGENTS.md", "agents/a.md", "agents/b.md"];

    await disabledCache.set(tempDir, value);
    const result = await disabledCache.get(tempDir);
    expect(result).toBeNull();
    expect(disabledCache.size()).toBe(0);
  });

  test("cache clear removes all entries", async () => {
    const value = ["AGENTS.md", "agents/a.md", "agents/b.md"];
    await cache.set(tempDir, value);
    expect(cache.size()).toBeGreaterThan(0);

    cache.clear();
    expect(cache.size()).toBe(0);

    const result = await cache.get(tempDir);
    expect(result).toBeNull();
  });

  test("cache size returns correct count", async () => {
    const value = ["AGENTS.md", "agents/a.md", "agents/b.md"];
    expect(cache.size()).toBeGreaterThanOrEqual(0);

    await cache.set(tempDir, value);
    const sizeAfterSet = cache.size();
    expect(sizeAfterSet).toBeGreaterThanOrEqual(1);
  });
});