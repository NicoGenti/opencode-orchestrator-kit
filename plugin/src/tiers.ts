/**
 * Tier vocabulary, bundled presets and tier resolution for the plugin.
 *
 * Self-contained mirror of scripts/resolve-model-preset.ts (which cannot be
 * imported from `plugin/` — it is not in the package `files`). The bundled
 * config object is a verbatim transcription of templates/models.config.json
 * (parity is asserted in tests/plugin-tiers.test.ts).
 *
 * Errors are reported through TierConfigError so callers can distinguish
 * "bad kit config" (must be fixed in plugin options / bundled presets) from
 * runtime availability problems (signaled, never fatal).
 */

/** Canonical five-tier list, in canonical order. */
export const TIER_TOKENS = [
  "TIER_ROUTER",
  "TIER_REASONING",
  "TIER_CODE",
  "TIER_FAST",
  "TIER_REVIEW",
] as const;

export type TierToken = (typeof TIER_TOKENS)[number];

/** Tiers every valid preset must declare in its raw `models` map. */
export const REQUIRED_TIERS: readonly TierToken[] = [
  "TIER_REASONING",
  "TIER_CODE",
  "TIER_FAST",
] as const;

/**
 * Optional-tier fallbacks: one hop only, never chained. Each key is a tier
 * that may be omitted from a preset; the value is the tier whose model is
 * substituted. Both fallback targets are required tiers, so a failing
 * fallback always surfaces the missing tier as a required-tier error.
 */
export const TIER_FALLBACKS: Readonly<
  Record<"TIER_ROUTER" | "TIER_REVIEW", TierToken>
> = {
  TIER_ROUTER: "TIER_REASONING",
  TIER_REVIEW: "TIER_CODE",
};

/** A preset declared in the bundled model config. */
export interface TierPreset {
  label?: string;
  description?: string;
  requires?: string[];
  models: Record<string, string>;
}

/** The bundled transcription of templates/models.config.json. */
export interface BundledModelConfig {
  $schema?: string;
  version?: number;
  description?: string;
  tiers?: Record<string, string>;
  fallbacks?: Partial<Record<TierToken, TierToken>>;
  default_preset?: string;
  presets: Record<string, TierPreset>;
}

/** Error raised for invalid tier/preset configuration (never for runtime availability). */
export class TierConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TierConfigError";
  }
}

/** A fully resolved tier map: canonical tier → concrete model id or token-free value. */
export interface ResolvedTierMap {
  preset: string;
  models: Record<string, string>;
}

/** Bundled model config (transcription of templates/models.config.json). */
export const BUNDLED_MODEL_CONFIG: BundledModelConfig = {
  $schema:
    "https://nicogenti.github.io/opencode-orchestrator-kit/schemas/models.config.schema.json",
  version: 2,
  description:
    "Phase 1 model-profile template for opencode-orchestrator-kit. Editable by the user; copied to .opencode/models.config.json by install.sh. Agent frontmatter references logical tiers ({{TIER_ROUTER}}, {{TIER_REASONING}}, {{TIER_CODE}}, {{TIER_FAST}}, {{TIER_REVIEW}}) instead of hardcoded model IDs; install.sh / scripts/apply-model-preset.py resolve tokens to concrete provider/model IDs at install time using the preset selected below. Two profiles are shipped: `default` (known-good) and `generic` (unresolved placeholders meant to be edited by the user).",
  tiers: {
    TIER_ROUTER:
      "Routing agent — used by orchestrator. Falls back to TIER_REASONING when omitted.",
    TIER_REASONING:
      "Deep reasoning / architecture / orchestration — used by oracle, security, planner. Required.",
    TIER_CODE:
      "Implementation, code authoring, and test-writing — used by developer-fixer and test-engineer. Required.",
    TIER_FAST:
      "Lightweight utility and high-throughput tasks — used by profiler, explorer, librarian, build-helper, npm-helper, deploy-helper, pc-doctor, writer. Required.",
    TIER_REVIEW:
      "General correctness / quality review — used by code-reviewer. Falls back to TIER_CODE when omitted.",
  },
  fallbacks: {
    TIER_ROUTER: "TIER_REASONING",
    TIER_REVIEW: "TIER_CODE",
  },
  default_preset: "default",
  presets: {
    default: {
      label: "OpenCode Go + Ollama Cloud (known-good)",
      description:
        "Known-good default profile mirroring the kit's out-of-the-box behavior: a flagship reasoning model, cloud-hosted specialists for code and review, and a fast cloud model for utility tasks. Validates clean against scripts/validate-models.sh.",
      requires: [],
      models: {
        TIER_ROUTER: "opencode-go/gpt-5.6-luna",
        TIER_REASONING: "opencode-go/kimi-k3",
        TIER_CODE: "opencode-go/minimax-m3",
        TIER_REVIEW: "opencode-go/minimax-m3",
        TIER_FAST: "ollama/deepseek-v4.1-flash:cloud",
      },
    },
    freellmapi: {
      label: "FreeLLMAPI (app locale su http://127.0.0.1:31415/v1)",
      description:
        "Instrada ogni tier sull'app FreeLLMAPI installata sul PC. Usa gli alias di routing (auto:smart / auto:fast) perche' restano validi quando il catalogo concreto cambia; i singoli tier restano sovrascrivibili con id concreti presenti in /v1/models.",
      requires: ["freellmapi"],
      models: {
        TIER_ROUTER: "freellmapi/auto:smart",
        TIER_REASONING: "freellmapi/auto:smart",
        TIER_CODE: "freellmapi/auto:smart",
        TIER_REVIEW: "freellmapi/auto:smart",
        TIER_FAST: "freellmapi/auto:fast",
      },
    },
    generic: {
      label: "Generic profile (unresolved placeholders — edit before use)",
      description:
        "Editable generic profile with placeholder/* sentinel values for every required tier. The placeholder/* prefix is reserved: scripts/validate-models.sh exits non-zero while any value still starts with 'placeholder/', and scripts/apply-model-preset.py refuses to apply a preset that still has unresolved placeholders. Edit each tier to a real provider/model ID, save, then re-run scripts/validate-models.sh.",
      requires: [],
      models: {
        TIER_ROUTER: "placeholder/router-model-id",
        TIER_REASONING: "placeholder/reasoning-model-id",
        TIER_CODE: "placeholder/code-model-id",
        TIER_REVIEW: "placeholder/review-model-id",
        TIER_FAST: "placeholder/fast-model-id",
      },
    },
    "opencode-go-free": {
      label: "OpenCode Go — solo modelli gratuiti (*-free)",
      description:
        "Usa esclusivamente i modelli gratuiti del provider opencode-go (beam-free, minimax-m3.1-flash-free). longcat-2.5-preview-free e cat-jam-free restano disponibili come alternative manuali (cat-jam-free solo via Hermes). Nessun modello a consumo, nessun ollama, nessun freellmapi.",
      requires: [],
      models: {
        TIER_ROUTER: "opencode-go/beam-free",
        TIER_REASONING: "opencode-go/beam-free",
        TIER_CODE: "opencode-go/minimax-m3.1-flash-free",
        TIER_REVIEW: "opencode-go/beam-free",
        TIER_FAST: "opencode-go/minimax-m3.1-flash-free",
      },
    },
    ollama: {
      label: "Ollama Cloud (provider ollama locale)",
      description:
        "Instrada ogni tier sul provider `ollama` definito in opencode.jsonc (Ollama Cloud via endpoint OpenAI-compatibile locale). Verificato il 2026-10-27 con `opencode2 run --model`: tutti e cinque i modelli rispondono su `ollama`, mentre il provider `ollama-cloud` del catalogo built-in risponde `Model unavailable` per gli stessi id. Nessun consumo su opencode-go, nessun freellmapi.",
      requires: ["ollama"],
      models: {
        TIER_ROUTER: "ollama/glm-5.3-flash:cloud",
        TIER_REASONING: "ollama/beam:cloud",
        TIER_CODE: "ollama/deepseek-v4.1-flash:cloud",
        TIER_REVIEW: "ollama/glm-5.3:cloud",
        TIER_FAST: "ollama/minimax-m3.1-flash:cloud",
      },
    },
  },
};

function lookupPreset(model: BundledModelConfig, presetName: string) {
  const preset = model.presets?.[presetName];
  if (!preset) {
    return undefined;
  }
  return preset;
}

function isTokenValue(value: string): boolean {
  return value.includes("{{TIER_");
}

/**
 * Resolve a raw agent-frontmatter value that may be a `{{TIER_*}}` token.
 * Non-token values pass through unchanged; a token with no entry in the
 * resolved tier map raises TierConfigError.
 */
export function resolveTierValue(
  value: string,
  models: Record<string, string>,
  preset: string,
): string {
  const match = /^\{\{(TIER_[A-Z_]+)\}\}$/.exec(value);
  if (!match) {
    return value;
  }
  const resolved = models[match[1] as TierToken];
  if (!resolved) {
    throw new TierConfigError(
      `Unresolved model tier token ${value} (no value for ${match[1]} in preset '${preset}')`,
    );
  }
  return resolved;
}

/**
 * Resolve a preset name into a full tier map against the bundled config.
 * Applies `default_preset` when the argument is undefined, then required-tier
 * validation, one-hop fallbacks, and unresolved-token/placeholder detection.
 */
export function resolveTierMapForConfig(
  config: BundledModelConfig,
  presetName?: string,
): ResolvedTierMap {
  const target = presetName ?? config.default_preset;
  if (!target) {
    throw new TierConfigError(
      "No preset specified and no default_preset in the bundled model config",
    );
  }
  const available = Object.keys(config.presets ?? {});
  const preset = lookupPreset(config, target);
  if (!preset) {
    throw new TierConfigError(
      `Unknown model preset '${target}'. Available presets: ${available.join(", ")}`,
    );
  }
  const raw = preset.models ?? {};
  const missing = REQUIRED_TIERS.filter((tier) => !raw[tier]);
  if (missing.length > 0) {
    throw new TierConfigError(
      `Model preset '${target}' is missing required tier(s): ${missing.join(", ")} (available presets: ${available.join(", ")})`,
    );
  }
  const models: Record<string, string> = { ...raw };
  for (const token of TIER_TOKENS) {
    if (models[token]) {
      continue;
    }
    const fallback = TIER_FALLBACKS[token as "TIER_ROUTER" | "TIER_REVIEW"];
    if (fallback && models[fallback]) {
      models[token] = models[fallback];
    }
  }
  for (const token of TIER_TOKENS) {
    const value = models[token];
    if (!value) {
      continue;
    }
    if (isTokenValue(value)) {
      throw new TierConfigError(
        `Unresolved model tier token ${value} for tier ${token} in preset '${target}' — every tier value must be a concrete provider/model ID`,
      );
    }
    if (value.startsWith("placeholder/")) {
      throw new TierConfigError(
        `Preset '${target}' still ships a placeholder model for tier ${token}: '${value}' — set a real provider/model ID before use (the placeholder/* prefix is reserved for unfinished configs)`,
      );
    }
  }
  return { preset: target, models };
}

/** Resolve against the bundled config (mirrors scripts/resolve-model-preset.ts). */
export function resolveTierMap(presetName?: string): ResolvedTierMap {
  return resolveTierMapForConfig(BUNDLED_MODEL_CONFIG, presetName);
}

/** One entry of the runtime model registry (`ctx.model.list()` item). */
export interface ModelRegistryEntry {
  providerID: string;
  id: string;
}

/** One unavailable-tier signal (message already carries the diagnostics prefix). */
export interface TierAvailabilityWarning {
  tier: TierToken;
  model: string;
  message: string;
}

/**
 * Compare a resolved tier map against the runtime model registry and return
 * one entry per offending tier (once per tier, even when models are shared).
 */
export function collectAvailabilityWarnings(
  models: Record<string, string>,
  presetName: string,
  registry: readonly ModelRegistryEntry[],
): TierAvailabilityWarning[] {
  const warnings: TierAvailabilityWarning[] = [];
  for (const token of TIER_TOKENS) {
    const value = models[token];
    if (!value) {
      continue;
    }
    const [providerID, ...rest] = value.split("/");
    const modelId = rest.join("/").split("#")[0];
    const available =
      providerID !== undefined &&
      modelId !== undefined &&
      registry.some(
        (entry) => entry.providerID === providerID && entry.id === modelId,
      );
    if (!available) {
      warnings.push({
        tier: token,
        model: value,
        message: `[opencode-orchestrator-kit] preset '${presetName}': model for tier ${token} is unavailable in the runtime registry (${value}) — agents on this tier may fail to resolve`,
      });
    }
  }
  return warnings;
}
