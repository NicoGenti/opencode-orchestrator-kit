import { describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import {
  promoteUnreleased,
  replacePackageVersion,
  todayUtc,
} from "../scripts/bump-version.ts";

const REPO_ROOT = join(import.meta.dir, "..");

function latestReleasedVersion(changelog: string): string {
  const match = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  if (!match) throw new Error("CHANGELOG.md has no released version heading");
  return match[1];
}

describe("package versions match the latest released changelog heading", () => {
  test("root package.json, plugin/package.json, and CHANGELOG agree", () => {
    const root = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf-8"),
    ) as { version: string };
    const plugin = JSON.parse(
      readFileSync(join(REPO_ROOT, "plugin", "package.json"), "utf-8"),
    ) as { version: string };
    const changelog = readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf-8");
    const released = latestReleasedVersion(changelog);
    expect(root.version).toBe(plugin.version);
    expect(root.version).toBe(released);
    expect(changelog.startsWith("# Changelog\n")).toBe(true);
    expect(changelog).toMatch(/^## \[Unreleased\]$/m);
  });
});

describe("bump-version transforms", () => {
  test("replaces only the version field", () => {
    const source =
      '{\n  "name": "x",\n  "version": "0.7.0",\n  "private": true\n}\n';
    expect(replacePackageVersion(source, "1.2.3")).toBe(
      '{\n  "name": "x",\n  "version": "1.2.3",\n  "private": true\n}\n',
    );
  });

  test("promotes Unreleased and leaves an empty Unreleased section", () => {
    const source = [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "### Fixed",
      "",
      "- A fix.",
      "",
      "## [0.7.0] — 2026-10-27",
      "",
    ].join("\n");
    expect(promoteUnreleased(source, "0.8.0", "2026-11-02")).toBe(
      [
        "# Changelog",
        "",
        "## [Unreleased]",
        "",
        "## [0.8.0] — 2026-11-02",
        "",
        "### Fixed",
        "",
        "- A fix.",
        "",
        "## [0.7.0] — 2026-10-27",
        "",
      ].join("\n"),
    );
  });

  test("rejects a second Unreleased heading and an existing version", () => {
    expect(() =>
      promoteUnreleased("# c\n\n## [0.1.0]\n", "0.2.0", "2026-11-02"),
    ).toThrow(/exactly one/);
    expect(() =>
      promoteUnreleased(
        "## [Unreleased]\n\n## [0.2.0] — 2026-01-01\n",
        "0.2.0",
        "2026-11-02",
      ),
    ).toThrow(/already has/);
  });

  test("todayUtc is the UTC calendar date", () => {
    expect(todayUtc(new Date("2026-11-02T23:30:00.000Z"))).toBe("2026-11-02");
  });
});

describe("bun run bump-version on a fixture", () => {
  test("updates both manifests and the changelog, and rejects a bad argument", () => {
    const root = mkdtempSync(join(tmpdir(), "bump-version-"));
    try {
      mkdirSync(join(root, "plugin"));
      writeFileSync(
        join(root, "package.json"),
        '{ "name": "root", "version": "0.1.0" }\n',
      );
      writeFileSync(
        join(root, "plugin", "package.json"),
        '{ "name": "plugin", "version": "0.1.0" }\n',
      );
      writeFileSync(
        join(root, "CHANGELOG.md"),
        "## [Unreleased]\n\n### Added\n\n- Note.\n\n## [0.1.0] — 2026-01-01\n",
      );
      const script = join(REPO_ROOT, "scripts", "bump-version.ts");
      const bad = spawnSync("bun", [script, "1.2"], {
        encoding: "utf-8",
        env: { ...process.env, BUMP_VERSION_ROOT: root },
      });
      expect(bad.status).not.toBe(0);
      expect(bad.stderr).toMatch(/Usage: bun run bump-version/);

      const ok = spawnSync("bun", [script, "1.2.3"], {
        encoding: "utf-8",
        env: { ...process.env, BUMP_VERSION_ROOT: root },
      });
      expect(ok.status).toBe(0);
      expect(ok.stdout).toMatch(/^version 1\.2\.3 \(\d{4}-\d{2}-\d{2}\)\n$/);
      const rootPkg = JSON.parse(
        readFileSync(join(root, "package.json"), "utf-8"),
      ) as { version: string };
      const pluginPkg = JSON.parse(
        readFileSync(join(root, "plugin", "package.json"), "utf-8"),
      ) as { version: string };
      const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf-8");
      expect(rootPkg.version).toBe("1.2.3");
      expect(pluginPkg.version).toBe("1.2.3");
      expect(changelog.startsWith("## [Unreleased]\n\n## [1.2.3] — ")).toBe(
        true,
      );
      expect(changelog).toContain("### Added\n\n- Note.");
      expect(changelog).toContain("## [0.1.0] — 2026-01-01");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
