import { promises as fs } from 'fs';
import { join, resolve, isAbsolute, normalize, sep } from 'path';

/**
 * Model-preset resolution module.
 *
 * Resolves logical model tiers ({{TIER_REASONING}}, {{TIER_CODE}}, {{TIER_FAST}})
 * to concrete provider/model IDs based on a preset defined in
 * .opencode/models.config.json.
 *
 * Security:
 * - Only reads from the configured path (no path traversal)
 * - Validates config structure before use
 * - No code injection (pure data resolution)
 * - Handles missing/invalid config gracefully
 */

export const TOKENS = ['TIER_REASONING', 'TIER_CODE', 'TIER_FAST'] as const;
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
 * Resolve a single tier token to its concrete model ID.
 *
 * @param value - The current value (may be a token like {{TIER_REASONING}} or a concrete model ID)
 * @param tierMap - Map of tier names to concrete model IDs
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
 * @param config - The model configuration
 * @param presetName - Name of the preset (or null to use default_preset)
 * @returns ResolvedConfig with preset name and model map
 * @throws Error if preset is not found or invalid
 */
export function resolvePreset(config: ModelConfig, presetName: string | null = null): ResolvedConfig {
  const targetPreset = presetName || config.default_preset;
  if (!targetPreset) {
    throw new Error('No preset specified and no default_preset in config');
  }

  const models = getPreset(config, targetPreset);
  if (!models) {
    const available = listPresets(config).join(', ');
    throw new Error(
      `Preset '${targetPreset}' not found. Available presets: ${available}`
    );
  }

  // Validate all required tiers are present
  for (const token of TOKENS) {
    if (!models[token]) {
      throw new Error(
        `Preset '${targetPreset}' is missing required tier: ${token}`
      );
    }
  }

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