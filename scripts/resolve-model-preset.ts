import { promises as fs } from 'fs';
import { join, resolve, isAbsolute, normalize, sep } from 'path';

/**
 * Model-preset resolution module.
 *
 * Resolves logical model tiers ({{TIER_ROUTER}}, {{TIER_REASONING}}, {{TIER_CODE}},
 * {{TIER_FAST}}, {{TIER_REVIEW}}) to concrete provider/model IDs based on a
 * preset defined in .opencode/models.config.json.
 *
 * Tier roles (canonical, in canonical order):
 *   TIER_ROUTER    — orchestrator / routing agent
 *   TIER_REASONING — deep reasoning, architecture, security, planning
 *   TIER_CODE      — implementation, tests, code authoring
 *   TIER_FAST      — lightweight utility / high-throughput tasks
 *   TIER_REVIEW    — general correctness / quality review
 *
 * Backward compatibility:
 *   The original three required tokens (TIER_REASONING, TIER_CODE, TIER_FAST)
 *   remain required. The two new tokens (TIER_ROUTER, TIER_REVIEW) fall back
 *   to TIER_REASONING and TIER_CODE respectively when omitted from a preset.
 *   A preset that only declares the original three tiers therefore still
 *   resolves router and review through the fallback chain.
 *
 * Security:
 * - Only reads from the configured path (no path traversal)
 * - Validates config structure before use
 * - No code injection (pure data resolution)
 * - Handles missing/invalid config gracefully
 */

/** Canonical five-token list, in canonical order. */
export const TOKENS = [
  'TIER_ROUTER',
  'TIER_REASONING',
  'TIER_CODE',
  'TIER_FAST',
  'TIER_REVIEW',
] as const;

/** Original three tiers that MUST be present in every valid preset. */
export const REQUIRED_TOKENS = ['TIER_REASONING', 'TIER_CODE', 'TIER_FAST'] as const;

/**
 * Optional fallback chain used when an optional tier is missing from a preset.
 * Each key is a tier that may be omitted; the value is the tier to substitute
 * when resolving. Fallbacks are one-hop only and never chained.
 */
export const TIER_FALLBACKS: Readonly<Record<string, (typeof TOKENS)[number]>> = {
  TIER_ROUTER: 'TIER_REASONING',
  TIER_REVIEW: 'TIER_CODE',
};

export type TierName = (typeof TOKENS)[number];

export interface ModelConfig {
  description?: string;
  version?: number;
  tiers?: Record<string, string>;
  default_preset?: string;
  presets?: Record<string, Preset>;
}

export interface Preset {
  label?: string;
  description?: string;
  requires?: string[];
  models: Record<string, string>;
}

export interface ResolvedConfig {
  preset: string;
  models: Record<string, string>;
}

/**
 * Safely resolve and validate a path relative to rootDir.
 * Prevents path traversal by normalizing and checking the result stays within rootDir.
 */
function safeResolvePath(rootDir: string, relativePath: string): string {
  const resolved = resolve(rootDir, relativePath);
  const normalizedRoot = normalize(rootDir);
  // Use platform-appropriate separator for the prefix check
  const rootPrefix = normalizedRoot + sep;
  if (!resolved.startsWith(rootPrefix) && resolved !== normalizedRoot) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  return resolved;
}

/**
 * Load and validate the model configuration from a JSON file.
 *
 * @param configPath - Absolute or relative path to models.config.json
 * @param rootDir - Root directory for path resolution (defaults to process.cwd())
 * @returns Validated ModelConfig
 */
export async function loadModelConfig(
  configPath: string,
  rootDir: string = process.cwd()
): Promise<ModelConfig> {
  // Security: resolve and validate path
  const absoluteConfigPath = isAbsolute(configPath)
    ? configPath
    : safeResolvePath(rootDir, configPath);

  let raw: string;
  try {
    raw = await fs.readFile(absoluteConfigPath, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to read model config at ${absoluteConfigPath}: ${err}`);
  }

  let config: any;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in model config at ${absoluteConfigPath}: ${err}`);
  }

  // Validate structure
  if (typeof config !== 'object' || config === null) {
    throw new Error('Model config must be a JSON object');
  }

  if (!config.presets || typeof config.presets !== 'object') {
    throw new Error('Model config must contain a "presets" object');
  }

  return config as ModelConfig;
}

/**
 * Apply one-hop fallbacks to a raw preset model map.
 *
 * Given a preset's `models` record (which may omit TIER_ROUTER and/or
 * TIER_REVIEW), returns a fully-populated tier map where every canonical
 * token has a concrete model ID. Falls back exactly once; no chained
 * fallbacks. If a required tier is missing, the original record is
 * returned untouched (the required-tier error is raised separately by
 * `resolvePreset`).
 */
export function applyTierFallbacks(
  presetModels: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = { ...presetModels };
  for (const token of TOKENS) {
    if (out[token]) continue;
    const fallback = TIER_FALLBACKS[token];
    if (fallback && out[fallback]) {
      out[token] = out[fallback];
    }
  }
  return out;
}

/**
 * Resolve a single tier token to its concrete model ID.
 *
 * Honors the optional fallback chain. If `value` is one of the canonical
 * `{{TIER_*}}` placeholders, returns the corresponding entry from
 * `tierMap`. The tierMap is assumed to already have fallbacks applied.
 *
 * @param value - The current value (may be a token like {{TIER_REASONING}} or a concrete model ID)
 * @param tierMap - Map of tier names to concrete model IDs (with fallbacks applied)
 * @returns Resolved model ID, or null if value is not a known token
 */
export function resolveValue(value: string, tierMap: Record<string, string>): string | null {
  for (const token of TOKENS) {
    const placeholder = `{{${token}}}`;
    if (value === placeholder) {
      return tierMap[token] || null;
    }
  }
  return null;
}

/**
 * Check if a value is a tier token.
 */
export function isTierToken(value: string): boolean {
  for (const token of TOKENS) {
    if (value === `{{${token}}}`) {
      return true;
    }
  }
  return false;
}

/**
 * List available presets from the model config.
 *
 * @param config - The model configuration
 * @returns Array of preset names
 */
export function listPresets(config: ModelConfig): string[] {
  return Object.keys(config.presets || {});
}

/**
 * Get a specific preset's model map.
 *
 * @param config - The model configuration
 * @param presetName - Name of the preset
 * @returns Model tier map, or null if preset not found
 */
export function getPreset(config: ModelConfig, presetName: string): Record<string, string> | null {
  const preset = config.presets?.[presetName];
  if (!preset) {
    return null;
  }
  return preset.models || {};
}

/**
 * Resolve a preset name to its model configuration.
 *
 * Validation rule: every entry in `REQUIRED_TOKENS` must be present in the
 * preset's raw model map. Optional tiers (TIER_ROUTER, TIER_REVIEW) are
 * filled in through the one-hop fallback chain by `applyTierFallbacks`.
 *
 * @param config - The model configuration
 * @param presetName - Name of the preset (or null to use default_preset)
 * @returns ResolvedConfig with preset name and full tier map
 * @throws Error if preset is not found or required tiers are missing
 */
export function resolvePreset(config: ModelConfig, presetName: string | null = null): ResolvedConfig {
  const targetPreset = presetName || config.default_preset;
  if (!targetPreset) {
    throw new Error('No preset specified and no default_preset in config');
  }

  const rawModels = getPreset(config, targetPreset);
  if (!rawModels) {
    const available = listPresets(config).join(', ');
    throw new Error(
      `Preset '${targetPreset}' not found. Available presets: ${available}`
    );
  }

  // Validate all required tiers are present in the raw preset map.
  // Optional tiers (TIER_ROUTER, TIER_REVIEW) are filled in by
  // applyTierFallbacks below — their absence is not an error.
  const missing: string[] = [];
  for (const token of REQUIRED_TOKENS) {
    if (!rawModels[token]) {
      missing.push(token);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Preset '${targetPreset}' is missing required tier(s): ${missing.join(', ')}`
    );
  }

  const models = applyTierFallbacks(rawModels);

  return { preset: targetPreset, models };
}

/**
 * Resolve all tier tokens in a model value to concrete IDs.
 * If the value is not a token, returns the value unchanged.
 *
 * @param value - The model value to resolve
 * @param config - The model configuration
 * @param presetName - Optional preset name (uses default if not provided)
 * @returns Resolved model ID (or original value if not a token)
 */
export async function resolveModelValue(
  value: string,
  config: ModelConfig,
  presetName: string | null = null
): Promise<string> {
  if (!isTierToken(value)) {
    return value;
  }

  const resolved = resolvePreset(config, presetName);
  const result = resolveValue(value, resolved.models);
  if (result === null) {
    throw new Error(`Cannot resolve token ${value} with preset '${resolved.preset}'`);
  }
  return result;
}

/**
 * Get the default preset name from config.
 */
export function getDefaultPreset(config: ModelConfig): string | null {
  return config.default_preset || null;
}

/**
 * Validate that a preset exists and has all required tiers.
 */
export function validatePreset(config: ModelConfig, presetName: string): boolean {
  try {
    resolvePreset(config, presetName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve model configuration for the prompt assembler.
 * This is the main entry point used by assemble-prompt.ts.
 *
 * @param configPath - Path to models.config.json
 * @param rootDir - Root directory
 * @param presetName - Optional preset name override
 * @returns ResolvedConfig or null if resolution should be skipped
 */
export async function resolveModelConfig(
  configPath: string = '.opencode/models.config.json',
  rootDir: string = process.cwd(),
  presetName: string | null = null
): Promise<ResolvedConfig | null> {
  try {
    const config = await loadModelConfig(configPath, rootDir);
    return resolvePreset(config, presetName);
  } catch (err) {
    // If config doesn't exist or is invalid, return null (transparent fallback)
    if (err instanceof Error && (err.message.includes('Failed to read') || err.message.includes('Invalid JSON'))) {
      return null;
    }
    throw err;
  }
}