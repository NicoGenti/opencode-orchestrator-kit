import { parseFrontmatterMap } from "../../plugin/src/frontmatter-map";
import type { FrontmatterMap } from "../../plugin/src/frontmatter-map";
import {
  kitInvariantRules,
  resolveEffect,
  toV2Permissions,
} from "../../plugin/src/permissions";

export type AccessBadge = "read-only" | "scoped write" | "edit: ask" | "writes";

export interface AgentSource {
  name: string;
  markdown: string;
}

export interface RosterAgent {
  name: string;
  description: string;
  summary: string;
  mode: string;
  badge: AccessBadge;
  detail: string;
  emoji: string;
}

export interface RosterGroup {
  id: string;
  title: string;
  note: string;
  agents: RosterAgent[];
}

export interface SiteRoster {
  groups: RosterGroup[];
  extras: RosterAgent[];
  coreCount: number;
  specialistCount: number;
  primaryCount: number;
  extrasCount: number;
}

export interface SiteCommand {
  name: string;
  description: string;
}

const EMOJI: Record<string, string> = {
  orchestrator: "🧭",
  profiler: "🩺",
  explorer: "🔎",
  librarian: "📚",
  oracle: "🔮",
  planner: "🗺️",
  "plan-writer": "📋",
  "developer-fixer": "🔧",
  "test-engineer": "🧪",
  "code-reviewer": "🛡️",
  security: "🔐",
  "comprehension-coach": "🎓",
  "build-helper": "🏗️",
  "npm-helper": "📦",
  "deploy-helper": "🚀",
  "pc-doctor": "🖥️",
  writer: "✍️",
};

const CORE_GROUPS: ReadonlyArray<{
  id: string;
  title: string;
  note: string;
  names: readonly string[];
}> = [
  {
    id: "routing",
    title: "Core routing",
    note: "Installed by default. The primary agent only routes.",
    names: ["orchestrator", "profiler", "explorer", "oracle", "planner"],
  },
  {
    id: "delivery",
    title: "Core delivery",
    note: "Installed by default. Implementation, tests, review, and the plan board.",
    names: [
      "developer-fixer",
      "test-engineer",
      "code-reviewer",
      "security",
      "comprehension-coach",
      "plan-writer",
    ],
  },
  {
    id: "ops",
    title: "Operations helpers",
    note: "Installed by default, and routed only when a matching build, npm, or deploy failure shows up.",
    names: ["build-helper", "npm-helper", "deploy-helper"],
  },
  {
    id: "docs",
    title: "Docs lookup",
    note: "Installed by default, and routed only for remote documentation lookups.",
    names: ["librarian"],
  },
];

const COMMAND_ORDER = [
  "start-session",
  "recall",
  "research-mode",
  "close-session",
];

function extractFrontmatter(markdown: string, source: string): string {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error(`${source} has no frontmatter block`);
  }
  return match[1];
}

function frontmatterScalar(frontmatter: string, key: string): string {
  const inline = new RegExp(`^${key}:[ \\t]+(\\S.*)$`, "m").exec(frontmatter);
  if (inline) {
    return inline[1].trim().replace(/^["']|["']$/g, "");
  }
  const block = new RegExp(
    `^${key}:[ \\t]*>-[ \\t]*\\r?\\n((?:[ \\t]+[^\\r\\n]*\\r?\n?)+)`,
    "m",
  ).exec(frontmatter);
  if (!block) {
    throw new Error(`${key} is missing from frontmatter`);
  }
  return block[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const match = /^(.{1,180}?\.)(?:\s|$)/.exec(clean);
  const sentence = match ? match[1] : clean;
  if (sentence.length <= 140) return sentence;
  const cut = sentence.slice(0, 137);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const EDIT_SAMPLES: ReadonlyArray<{ path: string; label: string }> = [
  { path: "src/app.ts", label: "application code" },
  { path: "plan/qa/1.md", label: "plan files" },
  { path: ".context/plan-body-1.md", label: "plan-body files" },
  { path: ".context/progress.md", label: "session memory" },
  { path: ".opencode/PROJECT-PROFILE.md", label: "the repo profile" },
  { path: "package.json", label: "package.json" },
  { path: "tsconfig.json", label: "tsconfig" },
  { path: "vite.config.ts", label: "vite config" },
  { path: "tests/foo.test.ts", label: "tests" },
  { path: "README.md", label: "docs" },
  { path: ".github/workflows/ci.yml", label: "workflows" },
];

function listLabels(labels: string[]): string {
  const shown = labels.slice(0, 3).join(", ");
  return labels.length > 3 ? `${shown} +${labels.length - 3} more` : shown;
}

/**
 * Badge from the translated edit rules (write and patch fold into edit).
 * A missing catch-all follows the translator default: unmatched paths allow.
 */
export function accessFromPermission(
  agentName: string,
  permission: FrontmatterMap | undefined,
  tools: FrontmatterMap | undefined,
): { badge: AccessBadge; detail: string } {
  const rules = [
    ...toV2Permissions(permission, tools),
    ...kitInvariantRules(agentName),
  ];
  const probed = EDIT_SAMPLES.map((sample) => ({
    label: sample.label,
    effect: resolveEffect(rules, "edit", sample.path),
  }));
  const app =
    probed.find((sample) => sample.label === "application code")?.effect ??
    "deny";
  const allows = probed
    .filter((sample) => sample.effect === "allow")
    .map((sample) => sample.label);
  const asks = probed
    .filter((sample) => sample.effect === "ask")
    .map((sample) => sample.label);

  if (app === "allow") {
    return {
      badge: "writes",
      detail: "Can edit project files. Plan files stay denied where the rules deny them.",
    };
  }
  if (asks.length > 0) {
    return {
      badge: "edit: ask",
      detail:
        asks.length > 4
          ? "Edit asks before changing files."
          : `Edit asks on ${listLabels(asks)}.`,
    };
  }
  if (allows.length > 0) {
    return {
      badge: "scoped write",
      detail: `Edit allows ${listLabels(allows)}. Other sampled paths are denied.`,
    };
  }
  return { badge: "read-only", detail: "Edit is denied." };
}

export function parseAgent(source: AgentSource): RosterAgent {
  const frontmatter = extractFrontmatter(source.markdown, source.name);
  const description = frontmatterScalar(frontmatter, "description");
  const mode = frontmatterScalar(frontmatter, "mode");
  const permission = parseFrontmatterMap(frontmatter, "permission");
  const tools = parseFrontmatterMap(frontmatter, "tools");
  const access = accessFromPermission(source.name, permission, tools);
  return {
    name: source.name,
    description,
    summary: firstSentence(description),
    mode,
    badge: access.badge,
    detail: access.detail,
    emoji: EMOJI[source.name] ?? "•",
  };
}

function groupAgents(agents: RosterAgent[]): RosterGroup[] {
  const byName = new Map(agents.map((agent) => [agent.name, agent]));
  const used = new Set<string>();
  const groups: RosterGroup[] = [];
  for (const definition of CORE_GROUPS) {
    const members: RosterAgent[] = [];
    for (const name of definition.names) {
      const agent = byName.get(name);
      if (!agent) continue;
      members.push(agent);
      used.add(name);
    }
    if (members.length > 0) {
      groups.push({
        id: definition.id,
        title: definition.title,
        note: definition.note,
        agents: members,
      });
    }
  }
  const rest = agents.filter((agent) => !used.has(agent.name));
  if (rest.length > 0) {
    groups.push({
      id: "core",
      title: "Core",
      note: "Ships in agents/.",
      agents: rest,
    });
  }
  return groups;
}

export function buildRoster(
  coreFiles: AgentSource[],
  extraFiles: AgentSource[],
): SiteRoster {
  const core = coreFiles.map(parseAgent);
  const extras = extraFiles.map(parseAgent);
  const primaryCount = core.filter((agent) => agent.mode === "primary").length;
  return {
    groups: groupAgents(core),
    extras,
    coreCount: core.length,
    specialistCount: core.length - primaryCount,
    primaryCount,
    extrasCount: extras.length,
  };
}

export function buildCommands(files: AgentSource[]): SiteCommand[] {
  const parsed = files.map((file) => {
    const frontmatter = extractFrontmatter(file.markdown, file.name);
    return {
      name: file.name,
      description: frontmatterScalar(frontmatter, "description"),
    };
  });
  const rank = new Map(COMMAND_ORDER.map((name, index) => [name, index]));
  return parsed.sort((a, b) => {
    const ar = rank.get(a.name) ?? COMMAND_ORDER.length;
    const br = rank.get(b.name) ?? COMMAND_ORDER.length;
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name);
  });
}
