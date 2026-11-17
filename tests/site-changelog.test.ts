import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseChangelog,
  parseLatestRelease,
} from "../src/site/changelog-model";
import { buildRoster } from "../src/site/roster-model";
import type { AgentSource } from "../src/site/roster-model";

const REPO_ROOT = join(import.meta.dir, "..");
const changelog = readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf8");
const pluginPackage = JSON.parse(
  readFileSync(join(REPO_ROOT, "plugin/package.json"), "utf8"),
) as { version: string };

function readAgents(dir: string): AgentSource[] {
  return readdirSync(join(REPO_ROOT, dir))
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({
      name: name.replace(/\.md$/, ""),
      markdown: readFileSync(join(REPO_ROOT, dir, name), "utf8"),
    }));
}

describe("the landing What's new section comes from CHANGELOG.md", () => {
  test("the current KIT_VERSION has a released section with real items", () => {
    const release = parseLatestRelease(changelog, pluginPackage.version);

    expect(release.version).toBe(pluginPackage.version);
    expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(release.items.length).toBeGreaterThan(0);
    for (const item of release.items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.body.length).toBeGreaterThan(0);
      expect(item.title).not.toContain("\n");
    }
  });

  test("an unknown version falls back to the newest released section", () => {
    const current = parseLatestRelease(changelog, pluginPackage.version);
    const fallback = parseLatestRelease(changelog, "9.9.9");

    expect(fallback.version).toBe(current.version);
    expect(fallback.version).not.toBe("Unreleased");
    expect(fallback.items.length).toBeGreaterThan(0);
  });

  test("the Unreleased section is parsed but never selected", () => {
    const sections = parseChangelog(changelog);
    const unreleased = sections.find((s) => s.version === "Unreleased");
    const selected = parseLatestRelease(changelog, "Unreleased");

    expect(selected.version).not.toBe("Unreleased");
    if (unreleased) {
      const pendingTitles = unreleased.items.map((item) => item.title);
      for (const title of pendingTitles) {
        expect(selected.items.map((item) => item.title)).not.toContain(title);
      }
    }
  });

  test("only top-level `- **Title**: body` bullets are picked up", () => {
    const fixture = [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "- **Pending**: not shipped yet",
      "",
      "## [1.0.0] — 2026-01-01",
      "",
      "### Added",
      "",
      "- **First item**: the body of the first item",
      "  - a nested bullet is ignored",
      "",
      "### Fixed",
      "",
      "- **Second item**: another body",
      "",
      "## [0.9.0] — 2025-12-01",
      "",
      "- **Older item**: older body",
    ].join("\n");

    const release = parseLatestRelease(fixture, "1.0.0");
    expect(release.date).toBe("2026-01-01");
    expect(release.items).toEqual([
      { title: "First item", body: "the body of the first item" },
      { title: "Second item", body: "another body" },
    ]);

    expect(parseLatestRelease(fixture, "2.0.0").version).toBe("1.0.0");
    expect(parseLatestRelease(fixture, "2.0.0").items).toEqual(release.items);
  });
});

describe("the page is wired to the changelog and the roster", () => {
  test("changelog.ts reads CHANGELOG.md with KIT_VERSION and the page imports it", () => {
    const wiring = readFileSync(
      join(REPO_ROOT, "src/site/changelog.ts"),
      "utf8",
    );
    expect(wiring).toContain('"../../CHANGELOG.md?raw"');
    expect(wiring).toContain("KIT_VERSION");
    expect(wiring).toContain("parseLatestRelease");

    const page = readFileSync(
      join(REPO_ROOT, "src/components/landing/LandingPage.tsx"),
      "utf8",
    );
    expect(page).toContain("latestRelease");
    expect(page).not.toContain("WHATS_NEW");
    expect(page).not.toContain("What&apos;s new in 1.0");
    expect(page).toContain("roster.primaryCount");
    expect(page).toContain("roster.specialistCount");
    expect(page).toContain("roster.extrasCount");

    const install = readFileSync(
      join(REPO_ROOT, "src/site/install.ts"),
      "utf8",
    );
    expect(install).not.toContain("WHATS_NEW");
  });

  test("buildRoster still matches agents/ and extras/ on disk", () => {
    const coreFiles = readAgents("agents");
    const extraFiles = readAgents("extras");
    const roster = buildRoster(coreFiles, extraFiles);

    expect(roster.coreCount).toBe(coreFiles.length);
    expect(roster.extrasCount).toBe(extraFiles.length);
    expect(roster.primaryCount).toBeGreaterThanOrEqual(1);
    expect(roster.groups.flatMap((group) => group.agents)).toHaveLength(
      coreFiles.length,
    );
    expect(roster.extras).toHaveLength(extraFiles.length);
  });
});
