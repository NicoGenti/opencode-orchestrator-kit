/**
 * tiers.ts — model-tier resolution for opencode-orchestrator-kit.
 *
 * Port of the V1 install-time contract (`scripts/resolve-model-preset.ts` +
 * `scripts/apply-model-preset.py` + `templates/models.config.json`) to the
 * OpenCode 2 plugin runtime, with two semantic changes:
 *
 *   1. Resolution happens at plugin-setup time (not install time) against the
 *      models available in the current session (`ctx.model.list()`).
 *   2. Placeholder or unavailable values are WARNINGS, never fatal errors:
 *      the plugin must degrade gracefully and signal clearly instead of
 *      blocking a project whose providers are not reachable yet.
 *
 * Kept invariant from the V1 scripts (source of truth):
 *   - canonical token order: TIER_ROUTER, TIER_REASONING, TIER_CODE, TIER_FAST, TIER_REVIEW;
 *   - required tiers: TIER_REASONING, TIER_CODE, TIER_FAST;
 *   - one-hop fallbacks: TIER_ROUTER -> TIER_REASONING, TIER_REVIEW -> TIER_CODE
 *     (legacy three-tier presets still resolve);
 *   - the reserved `placeholder/*` value prefix marks a tier the user must edit.
 */

export const TOKENS = ["TIER_ROUTER", "TIER_REASONING", "TIER_CODE", "TIER_FAST", "TIER_REVIEW"] as const;

export const REQUIRED_TOKENS = ["TIER_REASONING", "TIER_CODE", "TIER_FAST"] as const;

export const TIER_FALLBACKS: Readonly<Record<string, (typeof TOKENS)[number]>> = {
  TIER_ROUTER: "TIER_REASONING",
  TIER_REVIEW: "TIER_CODE",
};

export const PLACEHOLDER_PREFIX = "placeholder/";

export type TierName = (typeof TOKENS)[number];

export interface TierConfig {
  readonly description?: string;
  readonly version?: number;
  readonly tiers?: Record<string, string>;
  readonly default_preset?: string;
  readonly presets: Record<string, TierPreset>;
}

export interface TierPreset {
  readonly label?: string;
  readonly description?: string;
  readonly requires?: string[];
  readonly models: Record<string, string>;
}

export interface ResolvedTiers {
  readonly preset: string;
  readonly models: Record<string, string>;
}

/** A `provider/model` reference (split on the FIRST slash). */
export interface ModelRef {
  readonly providerID: string;
  readonly id: string;
}

/** Pure tier warning (setup adds the `[opencode-orchestrator-kit]` prefix). */
export interface RawTierWarning {
  readonly code: "placeholder" | "unavailable";
  readonly tier: string;
  readonly value: string;
  readonly message: string;
}

export function isTierToken(value: string): boolean {
  for (const token of TOKENS) {
    if (value === `{{${token}}}`) {
      return true;
    }
  }
  return false;
}

/** Returns the tier name inside a `{{TIER_*}}` token, or null. */
export function tierTokenName(value: string): TierName | null {
  if (!value.startsWith("{{") || !value.endsWith("}}")) {
    return null;
  }
  const inner = value.slice(2, -2);
  for (const token of TOKENS) {
    if (inner === token) {
      return token;
    }
  }
  return null;
}

export function isPlaceholder(value: string): boolean {
  return typeof value === "string" && value.startsWith(PLACEHOLDER_PREFIX);
}

/** Split a `provider/model` value on the first `/`. Returns null for malformed refs. */
export function parseModelRef(value: string): ModelRef | null {
  const slash = value.indexOf("/");
  if (slash <= 0) {
    return null;
  }
  const providerID = value.slice(0, slash);
  const id = value.slice(slash + 1);
  if (providerID.length === 0 || id.length === 0) {
    return null;
  }
  return { providerID, id };
}

/**
 * Read the `model:` line inside the YAML frontmatter (between the first pair
 * of `---` markers). Port of `scripts/apply-model-preset.py` parsing rules.
 */
export function parseModelLine(text: string): string | null {
  if (!text.startsWith("---")) {
    return null;
  }
  const closeMarker = text.indexOf("\n---", 3);
  if (closeMarker === -1) {
    return null;
  }
  const frontmatter = text.slice(0, closeMarker);
  const match = /^model:\s*(\S+)\s*$/m.exec(frontmatter);
  return match ? match[1] : null;
}

/**
 * Apply one-hop fallbacks to a raw preset model map. Optional tiers
 * (TIER_ROUTER, TIER_REVIEW) are substituted exactly once from required
 * tiers; there is no chained fallback. The input map is never mutated.
 */
export function applyTierFallbacks(presetModels: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...presetModels };
  for (const token of TOKENS) {
    if (out[token]) {
      continue;
    }
    const fallback = TIER_FALLBACKS[token];
    if (fallback && out[fallback]) {
      out[token] = out[fallback];
    }
  }
  return out;
}

/**
 * Resolve a preset name (explicit or `default_preset`) into a fully
 * populated tier map. Throws clear errors on: no preset selection available,
 * unknown preset name, missing required tiers. Optional tiers resolve via
 * `applyTierFallbacks`; absence of a required tier stays an error.
 */
export function resolvePreset(
  config: Pick<TierConfig, "presets" | "default_preset">,
  presetName?: string | null,
): ResolvedTiers {
  const target = presetName ?? config.default_preset;
  if (!target) {
    throw new Error(
      "[opencode-orchestrator-kit] No preset specified and no `default_preset` in models.config.json",
    );
  }

  const rawModels = config.presets?.[target]?.models;
  if (!rawModels) {
    const available = Object.keys(config.presets ?? {}).join(", ") || "(none)";
    throw new Error(
      `[opencode-orchestrator-kit] Unknown preset '${target}' in models.config.json. Available presets: ${available}`,
    );
  }

  const missing: string[] = [];
  for (const token of REQUIRED_TOKENS) {
    if (!rawModels[token]) {
      missing.push(token);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `[opencode-orchestrator-kit] Preset '${target}' is missing required tier(s): ${missing.join(", ")}`,
    );
  }

  return { preset: target, models: applyTierFallbacks(rawModels) };
}

/**
 * Pure warning collector. For each canonical tier with a value:
 *   - `placeholder/*` -> `{ code: "placeholder" }` (availability check skipped);
 *   - value not in the available set -> `{ code: "unavailable" }`.
 * Present and available tiers never warn. Placeholder/unavailable tiers are
 * never fatal: the caller leaves the agent's model untouched.
 */
export function collectTierWarnings(
  models: Record<string, string>,
  isAvailable: (value: string) => boolean = () => true,
): RawTierWarning[] {
  const warnings: RawTierWarning[] = [];
  for (const token of TOKENS) {
    const value = models[token];
    if (!value) {
      continue;
    }
    if (isPlaceholder(value)) {
      warnings.push({
        code: "placeholder",
        tier: token,
        value,
        message: `tier ${token} has the unresolved placeholder value '${value}'; edit .opencode/models.config.json to point this tier at a real provider/model ID`,
      });
      continue;
    }
    if (!isAvailable(value)) {
      warnings.push({
        code: "unavailable",
        tier: token,
        value,
        message: `tier ${token} model '${value}' is not available in this OpenCode session's model list; assign no model for ${token} until the provider is configured`,
      });
    }
  }
  return warnings;
}

/**
 * Read a JSON file and validate the model-config structure. Kept separate
 * from discovery so tests can drive arbitrary paths with an injectable
 * reader. Throws clear errors on unreadable files, invalid JSON and
 * configs without a `presets` object.
 */
export function validateStructure(raw: string, sourcePath: string): TierConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`[opencode-orchestrator-kit] Invalid JSON in model config at ${sourcePath}`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(
      `[opencode-orchestrator-kit] Model config must be a JSON object (got ${typeof parsed}): ${sourcePath}`,
    );
  }
  const config = parsed as { presets?: unknown };
  if (typeof config.presets !== "object" || config.presets === null) {
    throw new Error(`[opencode-orchestrator-kit] Model config must contain a "presets" object: ${sourcePath}`);
  }
  const presets = Object.entries(config.presets as Record<string, unknown>).map(([name, preset]) => {
    if (typeof preset !== "object" || preset === null || typeof (preset as TierPreset).models !== "object") {
      throw new Error(
        `[opencode-orchestrator-kit] Preset '${name}' must be an object with a "models" map in ${sourcePath}`,
      );
    }
    const models: Record<string, unknown> = (preset as { models: Record<string, unknown> }).models;
    const cleaned: Record<string, string> = {};
    for (const [tier, value] of Object.entries(models)) {
      cleaned[tier] = String(value);
    }
    return [name, { ...(preset as TierPreset), models: cleaned }];
  });
  const rest = parsed as Record<string, unknown>;
  return {
    description: typeof rest.description === "string" ? rest.description : undefined,
    version: typeof rest.version === "number" ? rest.version : undefined,
    default_preset: typeof rest.default_preset === "string" ? rest.default_preset : undefined,
    presets: Object.fromEntries(presets) as TierConfig["presets"],
  };
}

/**
 * Config discovery priority: `<project>/.opencode/models.config.json` when
 * present, otherwise the kit's committed template (`templates/models.config.json`).
 * An existing-but-broken project config is an ERROR: silently falling back to
 * the template would mask a broken user edit. Returns the resolved config
 * plus where it came from so callers can surface the decision.
 */
export function discoverTierConfig(
  projectConfigPath: string,
  templateConfigPath: string,
  readFile: (path: string) => string,
  exists: (path: string) => boolean,
): { path: string; source: "project" | "template"; config: TierConfig } {
  const useProject = exists(projectConfigPath);
  const path = useProject ? projectConfigPath : templateConfigPath;
  let raw: string;
  try {
    raw = readFile(path);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[opencode-orchestrator-kit] Required model config not found (looked at '${projectConfigPath}', then at the kit template '${templateConfigPath}'): ${cause}`,
    );
  }
  return {
    path,
    source: useProject ? "project" : "template",
    config: validateStructure(raw, path),
  };
}
