/**
 * scripts/sync-assets.ts — regenerate plugin/assets from the repo sources.
 *
 * The packaged plugin ships byte-identical copies of the addressable kit
 * markdown. This script is the only writer of that tree:
 *
 *   command/start-session.md, recall.md, research-mode.md -> assets/commands/
 *   skills/<id>/SKILL.md                                  -> assets/skills/
 *   agents/*.md                                           -> assets/agents/
 *   extras/*.md                                           -> assets/extras/
 *
 * `bun run sync-assets` writes the mirror and deletes packaged files that
 * no longer have a source. `bun run sync-assets --check` compares bytes and
 * exits 1 on drift without writing. The plugin `prepack` script runs the
 * write mode so a published tarball cannot lag the sources.
 */

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  type Dirent,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PACKAGED_COMMANDS = [
  "start-session.md",
  "recall.md",
  "research-mode.md",
] as const;

interface AssetBinding {
  source: string;
  assetRel: string;
}

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
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectAllFiles(fullPath, out);
    } else {
      out.push(fullPath);
    }
  }
  return out;
}

function assetBindings(root: string): AssetBinding[] {
  const skillsDir = join(root, "skills");
  return [
    ...PACKAGED_COMMANDS.map((name) => ({
      source: join(root, "command", name),
      assetRel: `commands/${name}`,
    })),
    ...collectSkillSources(skillsDir).map((source) => ({
      source,
      assetRel: `skills/${relative(skillsDir, source).split(sep).join("/")}`,
    })),
    ...collectFlatSources(join(root, "agents"), "agents"),
    ...collectFlatSources(join(root, "extras"), "extras"),
  ];
}

function readIfPresent(path: string): Buffer | null {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
}

function pruneEmptyDirs(dir: string): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = join(dir, entry.name);
    pruneEmptyDirs(fullPath);
    if (readdirSync(fullPath).length === 0) {
      rmSync(fullPath, { recursive: true });
    }
  }
}

export interface SyncAssetsResult {
  fileCount: number;
  problems: string[];
}

/** Copy or compare the addressable sources under `root` into plugin/assets. */
export function syncAssets(root: string, check: boolean): SyncAssetsResult {
  const assetsDir = join(root, "plugin", "assets");
  const bindings = assetBindings(root);
  const expected = new Set(bindings.map((binding) => binding.assetRel));
  const problems: string[] = [];

  for (const binding of bindings) {
    const dest = join(assetsDir, ...binding.assetRel.split("/"));
    const sourceBytes = readFileSync(binding.source);
    const destBytes = readIfPresent(dest);
    if (destBytes !== null && sourceBytes.equals(destBytes)) continue;
    problems.push(binding.assetRel);
    if (!check) {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, sourceBytes);
    }
  }

  for (const path of collectAllFiles(assetsDir)) {
    const assetRel = relative(assetsDir, path).split(sep).join("/");
    if (expected.has(assetRel)) continue;
    problems.push(`stale ${assetRel}`);
    if (!check) rmSync(path);
  }

  if (!check) pruneEmptyDirs(assetsDir);
  return { fileCount: bindings.length, problems };
}

function main(): void {
  const check = process.argv.includes("--check");
  const result = syncAssets(ROOT, check);

  if (result.problems.length === 0) {
    console.log(`plugin/assets matches ${result.fileCount} source files.`);
    return;
  }

  if (check) {
    console.error("plugin/assets is out of date:");
    for (const problem of result.problems) console.error(`  ${problem}`);
    console.error(
      "Run `bun run sync-assets` to regenerate plugin/assets from command/, skills/, agents/, and extras/.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Updated plugin/assets (${result.problems.length} change(s), ${result.fileCount} files).`,
  );
  for (const problem of result.problems) console.log(`  ${problem}`);
}

if (import.meta.main) main();
