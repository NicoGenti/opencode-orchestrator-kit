import { promises as fs } from 'fs';
import { join } from 'path';
import { PromptCache } from './cache';
import {
  loadModelConfig,
  resolvePreset,
  ResolvedConfig,
  resolveModelValue,
} from './resolve-model-preset';

/**
 * Stable Prefix Extractor
 *
 * Implements the "Prompt-Assembly Stable-Prefix Contract" defined in AGENTS.md.
 *
 * The repository-controlled stable prefix is a fixed, finite set of
 * repository-controlled prompt files. This function enumerates them in
 * deterministic order and returns the list of relative paths.
 *
 * Boundary rule:
 *   AGENTS.md                              (single file at the repo root)
 *   agents/*.md                            (sorted by relative path)
 *   extras/*.md                            (sorted by relative path, if the
 *                                           directory exists)
 *
 * Anything else — `tests/`, `skills/`, `.context/`, `plan/`, `docs/`, etc. —
 * is out of scope for the stable prefix.
 *
 * Explicit exclusions (rule-based, not path-based):
 *   - `.opencode/context/` — user-local; not a repository-controlled prompt source.
 *   - `.opencode/models.config.json` — user-local configuration; not a prompt source.
 *   - OpenCode-native cache internals — owned by the runtime, not by this repository.
 *
 * Deterministic enumeration order:
 *   1. AGENTS.md (first, when present).
 *   2. agents/*.md paths, sorted ascending by relative path (lexicographic, forward slashes).
 *   3. extras/*.md paths, sorted ascending by relative path (when the directory exists).
 *
 * Within each bucket the order is strictly sorted; across buckets the order is
 * strictly AGENTS.md → agents/ → extras/. No bucket may interleave with another.
 * Two independent enumerations of the same repository MUST produce identical lists;
 * the sort is the source of determinism.
 *
 * @param rootDir - Root directory to scan (defaults to process.cwd())
 * @param useCache - Whether to use caching (defaults to true)
 * @param modelConfigPath - Optional path to model config file for cache invalidation
 * @returns {Promise<string[]>} The list of file paths in the stable prefix, in order
 */

// Singleton cache instance
const cache = new PromptCache();

export async function extractStablePrefix(
  rootDir: string = process.cwd(),
  useCache: boolean = true,
  modelConfigPath?: string
): Promise<string[]> {
  // Try cache first (include model config in cache key for invalidation)
  if (useCache) {
    const cached = await cache.get(rootDir, modelConfigPath);
    if (cached) {
      return cached;
    }
  }

  const agentsDir = join(rootDir, 'agents');
  const extrasDir = join(rootDir, 'extras');
  const agentsFile = join(rootDir, 'AGENTS.md');

  const result: string[] = [];

  // AGENTS.md first (when present)
  try {
    await fs.access(agentsFile);
    result.push('AGENTS.md');
  } catch (err) {
    console.error(`Error: AGENTS.md not found at ${agentsFile}`);
    throw err;
  }

  // agents/ directory, sorted ascending
  try {
    const agentFiles = (await fs.readdir(agentsDir))
      .filter(file => file.endsWith('.md'))
      .sort()
      .map(file => `agents/${file}`);
    result.push(...agentFiles);
  } catch (err) {
    console.error(`Error reading agents/ directory: ${err}`);
    throw err;
  }

  // extras/ directory, sorted ascending (if exists)
  try {
    const extrasExists = await fs.stat(extrasDir).then(() => true).catch(() => false);
    if (extrasExists) {
      const extrasFiles = (await fs.readdir(extrasDir))
        .filter(file => file.endsWith('.md'))
        .sort()
        .map(file => `extras/${file}`);
      result.push(...extrasFiles);
    }
  } catch (err) {
    console.error(`Error reading extras/ directory: ${err}`);
    throw err;
  }

  // Store in cache (include model config path for invalidation)
  if (useCache) {
    await cache.set(rootDir, result, modelConfigPath);
  }

  return result;
}

/**
 * Assemble the full prompt with model-preset resolution.
 *
 * @param rootDir - Root directory
 * @param options - Assembly options
 * @returns Object containing stable prefix paths and resolved model config
 */
export interface AssembleOptions {
  useCache?: boolean;
  modelConfigPath?: string;
  preset?: string | null;
}

export interface AssembleResult {
  stablePrefix: string[];
  modelConfig: ResolvedConfig | null;
}

export async function assemblePrompt(
  rootDir: string = process.cwd(),
  options: AssembleOptions = {}
): Promise<AssembleResult> {
  const { useCache = true, modelConfigPath = '.opencode/models.config.json', preset = null } = options;

  // Resolve model config (transparent fallback if config missing or invalid)
  let modelConfig: ResolvedConfig | null = null;
  try {
    const config = await loadModelConfig(modelConfigPath, rootDir);
    modelConfig = resolvePreset(config, preset);
  } catch (err) {
    // If config doesn't exist or is invalid, that's OK — transparent fallback
    if (err instanceof Error && (err.message.includes('Failed to read') || err.message.includes('Invalid JSON'))) {
      modelConfig = null;
    } else {
      // Re-throw unexpected errors
      throw err;
    }
  }

  // Extract stable prefix (with model config in cache key)
  const stablePrefix = await extractStablePrefix(rootDir, useCache, modelConfigPath);

  return { stablePrefix, modelConfig };
}

// Execute the function and output the result when run directly
if (import.meta.main) {
  try {
    const result = await assemblePrompt();
    console.log(result.stablePrefix.join('\n'));
    if (result.modelConfig) {
      console.error(`[model-preset] Using preset: ${result.modelConfig.preset}`);
    }
  } catch (err) {
    console.error(`Failed to extract stable prefix: ${err}`);
    process.exit(1);
  }
}