import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SOURCE_COMMAND = join(ROOT, "command", "start-session.md");
const SOURCE_RECALL = join(ROOT, "command", "recall.md");
const SOURCE_RESEARCH_MODE = join(ROOT, "command", "research-mode.md");
const SOURCE_CLOSE_SESSION = join(ROOT, "command", "close-session.md");
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
  { source: SOURCE_CLOSE_SESSION, assetRel: "commands/close-session.md" },
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

/**
 * Normalize CRLF to LF so a comparison is host-EOL independent.
 *
 * Only the pure `\n` vs `\r\n` difference is tolerated: a lone `\r` is left
 * untouched, and any other byte difference (a mutated character) still
 * fails the comparison.
 */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

const packagedFiles = collectAllFiles(ASSETS_DIR)
  .map((path) => relative(ASSETS_DIR, path).split(sep).join("/"))
  .sort();

const SYNC_HINT =
  "Run `bun run sync-assets` to regenerate plugin/assets from command/, skills/, agents/, and extras/.";

describe("plugin/assets packaging parity", () => {
  test("the addressable sources cover 4 commands, 16 agents and 2 extras", () => {
    expect(commandBindings).toHaveLength(4);
    expect(agentBindings).toHaveLength(16);
    expect(extraBindings).toHaveLength(2);
  });

  test("the assets tree mirrors the repo sources exactly (no extras, none missing)", () => {
    const expected = bindings.map((binding) => binding.assetRel).sort();
    if (
      packagedFiles.length !== expected.length ||
      packagedFiles.some((file, index) => file !== expected[index])
    ) {
      throw new Error(
        `plugin/assets does not match the source tree. ${SYNC_HINT}\npackaged: ${packagedFiles.join(", ")}\nexpected: ${expected.join(", ")}`,
      );
    }
    expect(packagedFiles).toEqual(expected);
  });

  test("the four kit commands are packaged and nothing else is", () => {
    const packagedCommands = packagedFiles.filter((file) =>
      file.startsWith("commands/"),
    );
    expect(packagedCommands.sort()).toEqual(
      commandBindings.map((binding) => binding.assetRel).sort(),
    );
    expect(packagedFiles).toContain("commands/close-session.md");
  });

  test("the EOL tolerance does not hide a mutated character", () => {
    const source = readFileSync(
      join(ROOT, "skills", "github-actions-cicd", "SKILL.md"),
      "utf-8",
    );
    // A pure LF/CRLF difference is tolerated (host core.autocrlf artifact).
    const lf = normalizeEol(source);
    expect(normalizeEol(lf.replace(/\n/g, "\r\n"))).toBe(lf);
    // A single mutated character is NOT tolerated.
    const mutated = source.replace("workflow", "workflov");
    expect(mutated).not.toBe(source);
    expect(normalizeEol(mutated)).not.toBe(normalizeEol(source));
    // A whitespace-only mutation is NOT tolerated either: the tolerance is
    // scoped to the line terminators, not to whitespace in general.
    const respaced = source.replace(" ", "\t");
    expect(respaced).not.toBe(source);
    expect(normalizeEol(respaced)).not.toBe(normalizeEol(source));
  });

  test("every packaged asset is content-identical to its repo-root source", () => {
    for (const binding of bindings) {
      const packaged = join(ASSETS_DIR, ...binding.assetRel.split("/"));
      // EOL-normalized: the repository content is the contract, the working
      // tree's LF/CRLF split is a host artifact (core.autocrlf), not a
      // difference. Every other byte difference still fails the comparison.
      const same =
        normalizeEol(readFileSync(packaged, "utf-8")) ===
        normalizeEol(readFileSync(binding.source, "utf-8"));
      if (!same) {
        throw new Error(
          `plugin/assets/${binding.assetRel} is not byte-identical to its source. ${SYNC_HINT}`,
        );
      }
      expect(same).toBe(true);
    }
  });
});
