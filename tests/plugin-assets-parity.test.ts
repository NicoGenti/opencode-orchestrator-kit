import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SOURCE_COMMAND = join(ROOT, "command", "start-session.md");
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
  ...collectSkillSources(SOURCE_SKILLS).map((source) => ({
    source,
    assetRel: `skills/${relative(SOURCE_SKILLS, source).split(sep).join("/")}`,
  })),
  ...collectFlatSources(SOURCE_AGENTS, "agents"),
  ...collectFlatSources(SOURCE_EXTRAS, "extras"),
];

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
  test("the addressable sources cover 15 agents and 2 extras", () => {
    expect(agentBindings).toHaveLength(15);
    expect(extraBindings).toHaveLength(2);
  });

  test("the assets tree mirrors the repo sources exactly (no extras, none missing)", () => {
    expect(packagedFiles).toEqual(
      bindings.map((binding) => binding.assetRel).sort(),
    );
  });

  test("no out-of-scope command file is packaged", () => {
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
