import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Cache entry interface
 */
interface CacheEntry {
  value: string[];
  timestamp: number;
  key: string;
}

/**
 * PromptCache — In-memory cache for prompt assembly.
 *
 * Caches the result of extractStablePrefix() based on file paths and
 * modification timestamps. Cache is invalidated when any file in the
 * stable prefix changes.
 *
 * Features:
 * - In-memory storage (simple, fast, no external dependencies)
 * - Cache key based on file paths + modification timestamps
 * - Graceful error handling (cache failures don't crash the app)
 * - Transparent to users (no configuration required)
 */
export class PromptCache {
  private cache: Map<string, CacheEntry> = new Map();
  private enabled: boolean = true;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  /**
   * Generate a cache key based on file paths and modification timestamps.
   * The key incorporates both the file paths and their mtimes so that
   * any change to a file invalidates the cache.
   *
   * @param rootDir - Root directory to scan
   * @param modelConfigPath - Optional path to model config file (included in key for invalidation)
   * @returns Cache key string, or null if key generation fails
   */
  private async generateKey(rootDir: string, modelConfigPath?: string): Promise<string | null> {
    try {
      const agentsDir = join(rootDir, 'agents');
      const extrasDir = join(rootDir, 'extras');
      const agentsFile = join(rootDir, 'AGENTS.md');

      const keyParts: string[] = [];

      // AGENTS.md
      try {
        const stat = await fs.stat(agentsFile);
        keyParts.push(`AGENTS.md:${stat.mtimeMs}`);
      } catch {
        // If AGENTS.md doesn't exist, use a placeholder
        keyParts.push('AGENTS.md:missing');
      }

      // agents/ directory
      try {
        const agentFiles = await fs.readdir(agentsDir);
        const mdFiles = agentFiles.filter(f => f.endsWith('.md')).sort();
        for (const file of mdFiles) {
          const stat = await fs.stat(join(agentsDir, file));
          keyParts.push(`agents/${file}:${stat.mtimeMs}`);
        }
      } catch {
        // agents/ directory doesn't exist or is empty
      }

      // extras/ directory
      try {
        const extrasExists = await fs.stat(extrasDir).then(() => true).catch(() => false);
        if (extrasExists) {
          const extrasFiles = await fs.readdir(extrasDir);
          const mdFiles = extrasFiles.filter(f => f.endsWith('.md')).sort();
          for (const file of mdFiles) {
            const stat = await fs.stat(join(extrasDir, file));
            keyParts.push(`extras/${file}:${stat.mtimeMs}`);
          }
        }
      } catch {
        // extras/ directory doesn't exist or is empty
      }

      // Model config file (if specified) — changes to this invalidate the cache
      if (modelConfigPath) {
        try {
          const configStat = await fs.stat(modelConfigPath);
          keyParts.push(`model-config:${modelConfigPath}:${configStat.mtimeMs}`);
        } catch {
          keyParts.push(`model-config:${modelConfigPath}:missing`);
        }
      }

      return keyParts.join('|');
    } catch (err) {
      // If key generation fails, return null to indicate cache miss
      console.error(`Cache key generation failed: ${err}`);
      return null;
    }
  }

  /**
   * Get a cached value for the given root directory.
   * Returns null if cache miss or cache disabled.
   *
   * @param rootDir - Root directory to scan
   * @param modelConfigPath - Optional path to model config file
   * @returns Cached value or null
   */
  async get(rootDir: string, modelConfigPath?: string): Promise<string[] | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const key = await this.generateKey(rootDir, modelConfigPath);
      if (!key) {
        return null;
      }

      const entry = this.cache.get(key);
      if (entry) {
        return entry.value;
      }

      return null;
    } catch (err) {
      console.error(`Cache get failed: ${err}`);
      return null;
    }
  }

  /**
   * Set a cached value for the given root directory.
   * No-op if cache disabled.
   *
   * @param rootDir - Root directory to scan
   * @param value - The value to cache
   * @param modelConfigPath - Optional path to model config file
   */
  async set(rootDir: string, value: string[], modelConfigPath?: string): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const key = await this.generateKey(rootDir, modelConfigPath);
      if (!key) {
        return;
      }

      this.cache.set(key, {
        value,
        timestamp: Date.now(),
        key,
      });
    } catch (err) {
      console.error(`Cache set failed: ${err}`);
    }
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of cached entries.
   */
  size(): number {
    return this.cache.size;
  }
}