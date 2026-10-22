/**
 * setup.ts — kitSetup: the materialiser/registrant of opencode-orchestrator-kit
 * for the OpenCode 2 plugin runtime.
 *
 * Order of operations (per the Phase 1-2 spec):
 *   1. read plugin options ({ preset?, withExtras? });
 *   2. materialise kit files into `<project>/.opencode/` CREATE-IF-MISSING ONLY
 *      (install.sh parity: an existing file is never overwritten);
 *   3. reload the agent/command domains so the freshly materialised files
 *      are visible to the registry;
 *   4. register every `skills/**\/SKILL.md` in-memory via ctx.skill.transform,
 *      skipping ids already present (idempotence against a file-copy install);
 *   5. resolve the tier config (project models.config.json, else the kit
 *      template), apply resolved models ONLY to agents whose target
 *      frontmatter `model:` line is a {{TIER_*}} token, and select the
 *      orchestrator as default agent.
 *
 * Type rule honoured: `@opencode/plugin` is imported with `import type` ONLY
 * (erased at runtime, so `bun test` from the repo root works without
 * `plugin/node_modules`). The only value import of `@opencode/plugin`
 * lives in `index.ts`.
 */

import { join } from "node:path";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  collectTierWarnings,
  discoverTierConfig,
  isTierToken,
  parseModelLine,
  parseModelRef,
  resolvePreset,
  tierTokenName,
} from "./tiers.ts";
import type { KitContext, KitIo, KitOptions, KitSkill, SetupResult, TierWarning } from "./types.ts";

const WARNING_PREFIX = "[opencode-orchestrator-kit]";

/** Default filesystem operations. Tests wrap these to record writes. */
export const nodeIo: KitIo = {
  exists: (path) => existsSync(path),
  listEntries: (dir) => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  },
  isDirectory: (path) => {
    try {
      readdirSync(path);
      return true;
    } catch {
      return false;
    }
  },
  readFile: (path) => readFileSync(path, "utf-8"),
  mkdirRecursive: (dir) => {
    mkdirSync(dir, { recursive: true });
  },
  copyFile: (src, dst) => {
    copyFileSync(src, dst);
  },
};

/** Asset roots live in the repo root next to the plugin (dev path; packaging is Phase 6). */
const AGENTS_DIR = fileURLToPath(new URL("../../agents", import.meta.url));
const COMMAND_DIR = fileURLToPath(new URL("../../command", import.meta.url));
const EXTRAS_DIR = fileURLToPath(new URL("../../extras", import.meta.url));
const SKILLS_DIR = fileURLToPath(new URL("../../skills", import.meta.url));
const TEMPLATE_CONFIG = fileURLToPath(new URL("../../templates/models.config.json", import.meta.url));

const MD_SUFFIX_RE = /\.md$/;
const AGENT_MD_RE = /^[a-z0-9-]+\.md$/i;

/** Read plugin options with runtime checks (no unsafe casts). */
function readKitOptions(options: Readonly<Record<string, unknown>>): KitOptions {
  const preset = typeof options.preset === "string" && options.preset.length > 0 ? options.preset : undefined;
  const withExtras = options.withExtras === true;
  return { preset, withExtras };
}

function projectDirectory(context: KitContext): string {
  return context.location.project?.directory ?? context.location.directory;
}

interface CopyOutcome {
  created: string[];
  skipped: string[];
}

/** CREATE-IF-MISSING materialisation: an existing destination is never overwritten. */
function materialiseDirectory(
  io: KitIo,
  sourceDir: string,
  destinationDir: string,
  filter: (name: string) => boolean,
): CopyOutcome {
  const created: string[] = [];
  const skipped: string[] = [];
  if (!io.isDirectory(sourceDir)) {
    return { created, skipped };
  }
  const names = io.listEntries(sourceDir).filter(filter).sort();
  if (names.length > 0) {
    io.mkdirRecursive(destinationDir);
  }
  for (const name of names) {
    const source = join(sourceDir, name);
    const destination = join(destinationDir, name);
    if (io.exists(destination)) {
      skipped.push(destination);
      continue;
    }
    io.copyFile(source, destination);
    created.push(destination);
  }
  return { created, skipped };
}

interface SkillFile {
  readonly id: string;
  readonly path: string;
}

/** Recursive walk for `skills/**\/SKILL.md`, including `skills/examples/*`. */
function findSkillFiles(io: KitIo, skillsDir: string): SkillFile[] {
  const found: SkillFile[] = [];
  if (!io.isDirectory(skillsDir)) {
    return found;
  }
  for (const entry of io.listEntries(skillsDir).sort()) {
    const entryPath = join(skillsDir, entry);
    if (!io.isDirectory(entryPath)) {
      continue;
    }
    const skillPath = join(entryPath, "SKILL.md");
    if (io.exists(skillPath)) {
      found.push({ id: entry, path: skillPath });
      continue;
    }
    found.push(...findSkillFiles(io, entryPath));
  }
  return found;
}

function frontmatterSlice(text: string): string | null {
  if (!text.startsWith("---")) {
    return null;
  }
  const closeMarker = text.indexOf("\n---", 3);
  if (closeMarker === -1) {
    return null;
  }
  return text.slice(0, closeMarker);
}

/**
 * Minimal frontmatter field reader: single-line values plus `>-`/`>`/`|`
 * block scalars with two-space-indented continuation lines. Best effort —
 * `name` in the kit's SKILL.md files is always single-line.
 */
function readFrontmatterField(text: string, field: string): string | undefined {
  const frontmatter = frontmatterSlice(text);
  if (!frontmatter) {
    return undefined;
  }
  const pattern = new RegExp(`^${field}:[ \\t]*(.*)$`, "m");
  const match = pattern.exec(frontmatter);
  if (!match) {
    return undefined;
  }
  let value = match[1].trim();
  const afterMatch = frontmatter.slice(match.index + match[0].length);
  if (value === "" || /^[>|]-{0,2}\s*$/.test(value)) {
    const folded = /^[>|]/.test(value);
    const lines: string[] = [];
    for (const line of afterMatch.split("\n")) {
      if (/^[ \t]{2,}\S/.test(line)) {
        lines.push(line.trim());
      } else if (line.trim() === "") {
        continue;
      } else {
        break;
      }
    }
    value = folded ? lines.join(" ") : lines.join("\n");
  }
  return value.replace(/^["']|["']$/g, "");
}

/** Normalize whatever `ctx.skill.list()` exposes into a set of ids. */
function normalizeSkillIds(value: unknown): Set<string> {
  let entries: unknown[];
  if (Array.isArray(value)) {
    entries = value;
  } else if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.skills)) {
      entries = record.skills;
    } else if (Array.isArray(record.data)) {
      entries = record.data;
    } else {
      entries = [];
    }
  } else {
    entries = [];
  }
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry !== null && typeof entry === "object") {
      const id = (entry as Record<string, unknown>).id;
      if (typeof id === "string") {
        ids.add(id);
      }
    }
  }
  return ids;
}

/** Normalize whatever `ctx.model.list()` exposes into `provider/model` values. */
function normalizeAvailableModels(value: unknown): Set<string> {
  let entries: unknown[];
  if (Array.isArray(value)) {
    entries = value;
  } else if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.models)) {
      entries = record.models;
    } else if (Array.isArray(record.data)) {
      entries = record.data;
    } else {
      entries = [];
    }
  } else {
    entries = [];
  }
  const available = new Set<string>();
  for (const entry of entries) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const providerID = record.providerID;
    const id = typeof record.id === "string" ? record.id : record.modelID;
    if (typeof providerID === "string" && typeof id === "string") {
      available.add(`${providerID}/${id}`);
    }
  }
  return available;
}

function prefixedWarning(
  code: TierWarning["code"],
  message: string,
  tier?: string,
  value?: string,
): TierWarning {
  return { code, tier, value, message: `${WARNING_PREFIX} ${message}` };
}

function buildSkillInfo(id: string, skillPath: string, text: string): KitSkill {
  const name = readFrontmatterField(text, "name") ?? id;
  const description = readFrontmatterField(text, "description");
  return {
    id,
    name,
    ...(description === undefined ? {} : { description }),
    path: skillPath,
    content: text,
  };
}

/**
 * The kit's plugin setup. The second parameter is an injectable I/O layer so
 * tests can record file writes while running against a real temp directory.
 */
export async function kitSetup(
  context: KitContext,
  io: KitIo = nodeIo,
): Promise<SetupResult> {
  const result: SetupResult = {
    materialised: [],
    skippedExisting: [],
    skillsAdded: [],
    skillsSkipped: [],
    agentsUpdated: [],
    tierSource: "template",
    tierPreset: "",
    defaultAgent: null,
    warnings: [],
  };

  const options = readKitOptions(context.options);
  const project = projectDirectory(context);
  const agentsDest = join(project, ".opencode", "agents");
  const commandsDest = join(project, ".opencode", "commands");

  // 2. Materialise (create-if-missing, never overwrite — install.sh parity).
  const materialisedAgents = materialiseDirectory(io, AGENTS_DIR, agentsDest, (name) => MD_SUFFIX_RE.test(name));
  const materialisedCommands = materialiseDirectory(io, COMMAND_DIR, commandsDest, (name) => MD_SUFFIX_RE.test(name));
  const materialisedExtras = options.withExtras
    ? materialiseDirectory(io, EXTRAS_DIR, agentsDest, (name) => AGENT_MD_RE.test(name))
    : { created: [], skipped: [] };
  result.materialised = [...materialisedAgents.created, ...materialisedCommands.created, ...materialisedExtras.created];
  result.skippedExisting = [
    ...materialisedAgents.skipped,
    ...materialisedCommands.skipped,
    ...materialisedExtras.skipped,
  ];

  // 3. Reload so the registry sees the materialised files.
  await context.agent.reload();
  await context.command.reload();

  // 4. Register skills in-memory (skip ids already present).
  const existingSkillIds = normalizeSkillIds(await context.skill.list());
  const skillAdds: KitSkill[] = [];
  for (const file of findSkillFiles(io, SKILLS_DIR)) {
    if (existingSkillIds.has(file.id)) {
      result.skillsSkipped.push(file.id);
      continue;
    }
    let text: string;
    try {
      text = io.readFile(file.path);
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      result.warnings.push(prefixedWarning("skill-read", `cannot read skill file ${file.path}: ${cause}`));
      continue;
    }
    skillAdds.push(buildSkillInfo(file.id, file.path, text));
  }
  if (skillAdds.length > 0) {
    await context.skill.transform((editor) => {
      for (const skill of skillAdds) {
        editor.add(skill);
      }
    });
    result.skillsAdded = skillAdds.map((skill) => skill.id);
  }

  // 5. Tiers: discovery, resolution, warnings, model assignment, default agent.
  const projectConfigPath = join(project, ".opencode", "models.config.json");
  const { source, config } = discoverTierConfig(projectConfigPath, TEMPLATE_CONFIG, io.readFile, io.exists);
  const resolved = resolvePreset(config, options.preset ?? null);
  result.tierSource = source;
  result.tierPreset = resolved.preset;

  const available = normalizeAvailableModels(await context.model.list());
  const rawWarnings = collectTierWarnings(resolved.models, (value) => available.has(value));
  result.warnings.push(
    ...rawWarnings.map((warning) =>
      prefixedWarning(warning.code, warning.message, warning.tier, warning.value),
    ),
  );
  // Placeholder and unavailable tiers get NO model assignment; the warnings
  // above are the required signaling.
  const warnedTiers = new Set(rawWarnings.map((warning) => warning.tier));

  // Collect assignments BEFORE the transform so the editor callback stays
  // cheap and repeatable (per the plugin docs: "Keep transforms cheap
  // and repeatable").
  const agentDestMd = io
    .listEntries(agentsDest)
    .filter((name) => MD_SUFFIX_RE.test(name))
    .sort();
  const assignments: { id: string; tier: string; model: { providerID: string; id: string } }[] = [];
  for (const name of agentDestMd) {
    let text: string;
    try {
      text = io.readFile(join(agentsDest, name));
    } catch {
      continue;
    }
    const modelValue = parseModelLine(text);
    if (!modelValue) {
      continue;
    }
    const tier = tierTokenName(modelValue);
    if (!tier || !isTierToken(modelValue)) {
      continue; // concrete value (or unknown token) — leave alone
    }
    if (warnedTiers.has(tier)) {
      continue; // placeholder/* or unavailable — no model assignment
    }
    const concreteValue = resolved.models[tier];
    if (!concreteValue || isTierToken(concreteValue)) {
      continue;
    }
    const ref = parseModelRef(concreteValue);
    if (!ref) {
      continue;
    }
    assignments.push({ id: name.replace(/\.md$/, ""), tier, model: ref });
  }

  await context.agent.transform((editor) => {
    for (const assignment of assignments) {
      if (editor.get(assignment.id) === undefined) {
        const warning = prefixedWarning(
          "agent-missing",
          `materialised agent '${assignment.id}' is not registered in the agent domain; skip model assignment`,
          assignment.tier,
          `${assignment.model.providerID}/${assignment.model.id}`,
        );
        if (!result.warnings.some((entry) => warning.code === entry.code && warning.message === entry.message)) {
          result.warnings.push(warning);
        }
        continue;
      }
      editor.update(assignment.id, (agent) => {
        agent.model = { providerID: assignment.model.providerID, id: assignment.model.id };
      });
      if (!result.agentsUpdated.includes(assignment.id)) {
        result.agentsUpdated.push(assignment.id);
      }
    }
    const orchestrator = editor.get("orchestrator");
    if (orchestrator === undefined) {
      result.warnings.push(
        prefixedWarning(
          "default-agent-missing",
          "agent 'orchestrator' is not registered; no default agent set",
        ),
      );
      return;
    }
    editor.default("orchestrator");
    result.defaultAgent = "orchestrator";
  });

  for (const warning of result.warnings) {
    console.warn(warning.message);
  }

  return result;
}
