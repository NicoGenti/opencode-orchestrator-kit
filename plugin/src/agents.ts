import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { assetsDir } from "./assets";
import type { ModelRef } from "./runtime/opencode-plugin";

/** Absolute path of the packaged agents directory (plugin/assets/agents/). */
const AGENTS_SUBDIR = "agents";
/** Absolute path of the packaged extras directory (plugin/assets/extras/). */
const EXTRAS_SUBDIR = "extras";

const AGENT_MODES = ["subagent", "primary", "all"] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

/**
 * A kit agent packaged under plugin/assets/{agents,extras}/<id>.md.
 * The packaged copies are byte-identical to the repo sources, so `model`
 * still carries the unparsed frontmatter value (normally a `{{TIER_*}}`
 * token); tier resolution happens at plugin setup time.
 */
export interface PackagedAgent {
  id: string;
  /** Absolute path of the packaged markdown copy. */
  path: string;
  /** Repo-relative source this copy mirrors (e.g. "agents/orchestrator.md"). */
  source: string;
  /** Packaged path relative to plugin/assets/ (same shape as `source`). */
  assetRel: string;
  description: string;
  mode: AgentMode;
  /** Raw frontmatter model value (tier token or literal model reference). */
  model: string;
  /** System prompt: the file body, frontmatter stripped, trimmed. */
  system: string;
}

/**
 * Parse a `provider/model#variant` reference into the OpenCode 2 `Model.Ref`
 * object shape. The first `/` splits provider from model; everything up to an
 * optional `#variant` suffix is the model id.
 */
export function parseModelRef(value: string): ModelRef {
  const slash = value.indexOf("/");
  if (slash <= 0 || slash === value.length - 1) {
    throw new Error(
      `Invalid model reference '${value}' (expected provider/model[#variant])`,
    );
  }
  const providerID = value.slice(0, slash);
  const remainder = value.slice(slash + 1);
  const hash = remainder.indexOf("#");
  if (hash === -1) {
    return { providerID, id: remainder };
  }
  if (hash === remainder.length - 1) {
    throw new Error(
      `Invalid model reference '${value}' (empty #variant suffix)`,
    );
  }
  return {
    providerID,
    id: remainder.slice(0, hash),
    variant: remainder.slice(hash + 1),
  };
}

/** Top-level scalar (inline text or a `>-` folded block) from frontmatter. */
function frontmatterScalar(
  frontmatter: string,
  key: string,
): string | undefined {
  const inline = new RegExp(`^${key}:[ \\t]+(\\S.*)$`, "m").exec(frontmatter);
  if (inline) {
    return inline[1].trim();
  }
  const block = new RegExp(
    `^${key}:[ \\t]*>-[ \\t]*\\r?\\n((?:[ \\t]+[^\\r\\n]*\\r?\\n?)+)`,
    "m",
  ).exec(frontmatter);
  if (block) {
    return block[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  return undefined;
}

export interface ParsedAgentFrontmatter {
  description: string;
  mode: AgentMode;
  model: string;
}

/**
 * Extract the fields this phase registers (description / mode / model) and
 * the system prompt body from a packaged agent markdown file. All other
 * frontmatter keys are ignored here; Phase 5 owns the permissions translation
 * (note: `temperature` has no OpenCode 2 home and is dropped silently).
 */
export function parseAgentFile(
  content: string,
  source: string,
): ParsedAgentFrontmatter & { system: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error(`${source} has no frontmatter block`);
  }
  const description = frontmatterScalar(match[1], "description");
  const mode = frontmatterScalar(match[1], "mode");
  const model = frontmatterScalar(match[1], "model");
  if (!description || !mode || !model) {
    throw new Error(
      `${source} frontmatter needs top-level description, mode and model`,
    );
  }
  if (!AGENT_MODES.includes(mode as AgentMode)) {
    throw new Error(
      `${source} frontmatter mode must be one of ${AGENT_MODES.join(", ")} (got '${mode}')`,
    );
  }
  return {
    description,
    mode: mode as AgentMode,
    model,
    system: content.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim(),
  };
}

function collectAgents(subdir: string, sourceRoot: string): PackagedAgent[] {
  const root = join(assetsDir, subdir);
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => {
      const path = join(root, entry.name);
      const id = entry.name.replace(/\.md$/, "");
      const content = readFileSync(path, "utf-8");
      const parsed = parseAgentFile(content, `${sourceRoot}/${entry.name}`);
      return {
        id,
        path,
        source: `${sourceRoot}/${entry.name}`,
        assetRel: `${subdir}/${entry.name}`,
        ...parsed,
      };
    });
}

/**
 * Manifest of the packaged kit agents (and optionally the extras), sorted by
 * id for stable iteration order.
 */
export function collectPackagedAgents(withExtras: boolean): PackagedAgent[] {
  const agents = collectAgents(AGENTS_SUBDIR, AGENTS_SUBDIR);
  if (!withExtras) {
    return agents.sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  return agents
    .concat(collectAgents(EXTRAS_SUBDIR, EXTRAS_SUBDIR))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}
