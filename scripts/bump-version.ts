/**
 * scripts/bump-version.ts — set the kit version in both package manifests
 * and promote CHANGELOG.md [Unreleased] to that version.
 *
 *   bun run bump-version <x.y.z>
 *
 * Updates package.json and plugin/package.json to the same version. Rewrites
 * the single `## [Unreleased]` heading into `## [x.y.z] — YYYY-MM-DD` (UTC
 * date) and leaves a fresh empty `## [Unreleased]` above it. Does not create
 * a git tag and does not publish.
 *
 * Tests point BUMP_VERSION_ROOT at a fixture directory. Unset, the script
 * edits this repository.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const VERSION = /^\d+\.\d+\.\d+$/;
const VERSION_FIELD = /("version"\s*:\s*")([^"]+)(")/;

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function replacePackageVersion(source: string, version: string): string {
  if (!VERSION_FIELD.test(source)) {
    throw new Error('package.json has no "version" field');
  }
  VERSION_FIELD.lastIndex = 0;
  return source.replace(VERSION_FIELD, `$1${version}$3`);
}

export function promoteUnreleased(
  changelog: string,
  version: string,
  isoDate: string,
): string {
  const headings = changelog.match(/^## \[Unreleased\][ \t]*$/gm);
  if (!headings || headings.length !== 1) {
    throw new Error(
      "CHANGELOG.md must contain exactly one ## [Unreleased] heading",
    );
  }
  if (changelog.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md already has a [${version}] heading`);
  }
  const match = /^## \[Unreleased\][ \t]*$/m.exec(changelog);
  if (!match || match.index === undefined) {
    throw new Error(
      "CHANGELOG.md must contain exactly one ## [Unreleased] heading",
    );
  }
  const promoted = `## [${version}] — ${isoDate}`;
  const fresh = "## [Unreleased]\n\n";
  return (
    changelog.slice(0, match.index) +
    fresh +
    promoted +
    changelog.slice(match.index + match[0].length)
  );
}

function usage(): never {
  console.error("Usage: bun run bump-version <x.y.z>");
  process.exit(1);
}

function main(): void {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const version = args[0];
  if (args.length !== 1 || !version || !VERSION.test(version)) usage();

  const root = process.env.BUMP_VERSION_ROOT
    ? resolve(process.env.BUMP_VERSION_ROOT)
    : join(import.meta.dir, "..");
  const date = todayUtc();
  const paths = [
    join(root, "package.json"),
    join(root, "plugin", "package.json"),
    join(root, "CHANGELOG.md"),
  ];
  const [rootPkg, pluginPkg, changelog] = paths.map((path) =>
    readFileSync(path, "utf-8"),
  );
  writeFileSync(paths[0], replacePackageVersion(rootPkg, version));
  writeFileSync(paths[1], replacePackageVersion(pluginPkg, version));
  writeFileSync(paths[2], promoteUnreleased(changelog, version, date));
  console.log(`version ${version} (${date})`);
}

if (import.meta.main) main();
