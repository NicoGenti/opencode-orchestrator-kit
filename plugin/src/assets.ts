import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path of the packaged asset root (plugin/assets/). */
export const assetsDir: string = fileURLToPath(
  new URL("../assets", import.meta.url),
);

const SKILLS_SUBDIR = "skills";

/** A kit skill packaged under plugin/assets/skills/<id>/SKILL.md. */
export interface PackagedSkill {
  id: string;
  name: string;
  path: string;
  content: string;
}

/**
 * Read a packaged asset as UTF-8 text.
 * `relativePath` uses "/" separators (e.g. "commands/start-session.md").
 */
export function readAsset(relativePath: string): string {
  return readFileSync(join(assetsDir, ...relativePath.split("/")), "utf-8");
}

function collectSkills(
  root: string,
  collected: PackagedSkill[] = [],
): PackagedSkill[] {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      collectSkills(fullPath, collected);
    } else if (entry.name === "SKILL.md") {
      const id = relative(join(assetsDir, SKILLS_SUBDIR), dirname(fullPath))
        .split(sep)
        .join("/");
      collected.push({
        id,
        name: id,
        path: fullPath,
        content: readFileSync(fullPath, "utf-8"),
      });
    }
  }
  return collected;
}

/** Manifest of the packaged kit skills, sorted by id for stable iteration. */
export function collectPackagedSkills(): PackagedSkill[] {
  return collectSkills(join(assetsDir, SKILLS_SUBDIR)).sort((a, b) =>
    a.id < b.id ? -1 : 1,
  );
}
