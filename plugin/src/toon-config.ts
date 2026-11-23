/**
 * toon-config.ts — opt-in TOON encoding for the native `plan_board` tool.
 *
 * Surface (issue #208): the tool's JSON payload is the only encoded surface;
 * `runPlanBoard` and the V1 Python CLI stay JSON-native. The flag lives in the
 * user-local `.opencode/toon.config.json` file, read per call from the first
 * existing candidate the tool hands the loader (board root, then the project
 * root).
 *
 * Precedence and failure behaviour mirror `loadComprehensionConfig`
 * (plugin/src/comprehension.ts:284): a file value overrides the built-in
 * defaults, an absent file yields the defaults silently, and an invalid file
 * (malformed JSON or wrong shape) yields the defaults plus exactly one
 * warning. The loader never throws for file content.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Shape of `.opencode/toon.config.json`. */
export interface ToonConfig {
  toon: {
    enabled: boolean;
    surfaces: string[];
  };
}

/**
 * Built-in defaults: TOON is off, and `plan_board` is the only surface the
 * flag would cover once enabled.
 */
export const DEFAULT_TOON_CONFIG: ToonConfig = {
  toon: { enabled: false, surfaces: ["plan_board"] },
};

const CONFIG_DIR = ".opencode";
const CONFIG_FILE = "toon.config.json";

export interface LoadToonConfigResult {
  config: ToonConfig;
  /** Exactly one message for an invalid file; empty for absent/valid files. */
  warnings: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function invalidResult(message: string): LoadToonConfigResult {
  return {
    config: structuredClone(DEFAULT_TOON_CONFIG),
    warnings: [message],
  };
}

/**
 * Load the TOON configuration from the first existing candidate.
 *
 * `root` is either a single directory (its `.opencode/toon.config.json` only)
 * or an ordered candidate list, as the tool builds for the project-root
 * fallback. The first EXISTING file wins, even when invalid: an invalid file
 * never lets a later candidate override it.
 *
 * Absent file(s) → defaults with zero warnings. Malformed JSON, a non-object
 * document, or an invalid `toon` section → defaults with exactly one warning.
 * Never throws.
 */
export function loadToonConfig(
  root: string | readonly string[],
): LoadToonConfigResult {
  const config = structuredClone(DEFAULT_TOON_CONFIG);
  const roots = typeof root === "string" ? [root] : root;

  let raw: string | null = null;
  for (const candidate of roots) {
    try {
      raw = readFileSync(join(candidate, CONFIG_DIR, CONFIG_FILE), "utf-8");
      break; // first existing file wins
    } catch {
      // Unreadable/absent candidate: try the next one.
    }
  }
  if (raw === null) {
    return { config, warnings: [] }; // no candidate exists: pure defaults
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return invalidResult(`${CONFIG_FILE} is not valid JSON; using defaults`);
  }
  if (!isPlainObject(parsed)) {
    return invalidResult(`${CONFIG_FILE} is not a JSON object; using defaults`);
  }

  const toon = parsed["toon"];
  if (toon === undefined) {
    return { config, warnings: [] }; // whole section keeps its defaults
  }
  if (!isPlainObject(toon)) {
    return invalidResult(
      `${CONFIG_FILE} toon section is not a JSON object; using defaults`,
    );
  }

  const enabled = toon["enabled"];
  if (enabled !== undefined && typeof enabled !== "boolean") {
    return invalidResult(
      `${CONFIG_FILE} toon.enabled is invalid; using defaults`,
    );
  }

  const surfaces = toon["surfaces"];
  if (surfaces !== undefined) {
    if (
      !Array.isArray(surfaces) ||
      !surfaces.every((surface) => typeof surface === "string")
    ) {
      return invalidResult(
        `${CONFIG_FILE} toon.surfaces is invalid; using defaults`,
      );
    }
  }

  if (enabled !== undefined) {
    config.toon.enabled = enabled;
  }
  if (surfaces !== undefined) {
    config.toon.surfaces = [...(surfaces as string[])];
  }
  return { config, warnings: [] };
}
