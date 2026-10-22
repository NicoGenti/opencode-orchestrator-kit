import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SOURCE_COMMAND = join(ROOT, "command", "start-session.md");
const SOURCE_SKILLS = join(ROOT, "skills");
const ASSETS_DIR = join(ROOT, "plugin", "assets");

/** Repo-root source file → its packaged path relative to plugin/assets/. */
interface AssetBinding {
  source: string;
  assetRel: string;
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
];

const packagedFiles = collectAllFiles(ASSETS_DIR)
  .map((path) => relative(ASSETS_DIR, path).split(sep).join("/"))
  .sort();

describe("plugin/assets packaging parity", () => {
  test("the assets tree mirrors the repo sources exactly (no extras, none missing)", () => {
    expect(packagedFiles).toEqual(
      bindings.map((binding) => binding.assetRel).sort(),
    );
  });

  test("every packaged asset is byte-identical to its repo-root source", () => {
    for (const binding of bindings) {
      const packaged = join(ASSETS_DIR, ...binding.assetRel.split("/"));
      const same = readFileSync(packaged).equals(readFileSync(binding.source));
      expect(same).toBe(true);
    }
  });
});
