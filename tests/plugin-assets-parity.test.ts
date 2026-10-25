import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SOURCE_COMMAND = join(ROOT, "command", "start-session.md");
const SOURCE_RECALL = join(ROOT, "command", "recall.md");
const SOURCE_RESEARCH_MODE = join(ROOT, "command", "research-mode.md");
const SOURCE_SKILLS = join(ROOT, "skills");
const SOURCE_AGENTS = join(ROOT, "agents");
const SOURCE_EXTRAS = join(ROOT, "extras");
const ASSETS_DIR = join(ROOT, "plugin", "assets");

/** Repo-root source file → its packaged path relative to plugin/assets/. */
interface AssetBinding {
  source: string;
  assetRel: string;
}

/** Collect .md files of a flat directory as bindings for a given subdir. */
function collectFlatSources(dir: string, subdir: string): AssetBinding[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => ({
      source: join(dir, entry.name),
      assetRel: `${subdir}/${entry.name}`,
    }));
}

function collectSkillSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSkillSources(fullPath, out);
    } else if (entry.name === "SKILL.md") {
      out.push(fullPath);
    }
  }
  return out;
}

function collectAllFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectAllFiles(fullPath, out);
    } else {
      out.push(fullPath);
    }
  }
  return out;
}

const bindings: AssetBinding[] = [
  { source: SOURCE_COMMAND, assetRel: "commands/start-session.md" },
  { source: SOURCE_RECALL, assetRel: "commands/recall.md" },
  { source: SOURCE_RESEARCH_MODE, assetRel: "commands/research-mode.md" },
  ...collectSkillSources(SOURCE_SKILLS).map((source) => ({
    source,
    assetRel: `skills/${relative(SOURCE_SKILLS, source).split(sep).join("/")}`,
  })),
  ...collectFlatSources(SOURCE_AGENTS, "agents"),
  ...collectFlatSources(SOURCE_EXTRAS, "extras"),
];

const commandBindings = bindings.filter((binding) =>
  binding.assetRel.startsWith("commands/"),
);
const agentBindings = bindings.filter((binding) =>
  binding.assetRel.startsWith("agents/"),
);
const extraBindings = bindings.filter((binding) =>
  binding.assetRel.startsWith("extras/"),
);

const packagedFiles = collectAllFiles(ASSETS_DIR)
  .map((path) => relative(ASSETS_DIR, path).split(sep).join("/"))
  .sort();

describe("plugin/assets packaging parity", () => {
  test("the addressable sources cover 3 commands, 15 agents and 2 extras", () => {
    expect(commandBindings).toHaveLength(3);
    expect(agentBindings).toHaveLength(15);
    expect(extraBindings).toHaveLength(2);
  });

  test("the assets tree mirrors the repo sources exactly (no extras, none missing)", () => {
    expect(packagedFiles).toEqual(
      bindings.map((binding) => binding.assetRel).sort(),
    );
  });

  test("no out-of-scope command file is packaged", () => {
    // Exactly the three kit command documents live under commands/ — any
    // additional packaging (e.g. close-session.md) is out of scope.
    const packagedCommands = packagedFiles.filter((file) =>
      file.startsWith("commands/"),
    );
    expect(packagedCommands.sort()).toEqual(
      commandBindings.map((binding) => binding.assetRel).sort(),
    );
    expect(packagedFiles).not.toContain("commands/close-session.md");
  });

  test("every packaged asset is byte-identical to its repo-root source", () => {
    for (const binding of bindings) {
      const packaged = join(ASSETS_DIR, ...binding.assetRel.split("/"));
      const same = readFileSync(packaged).equals(readFileSync(binding.source));
      expect(same).toBe(true);
    }
  });
});
