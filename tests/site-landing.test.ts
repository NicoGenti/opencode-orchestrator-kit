import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { applySiteTokens } from "../src/site/html-tokens";
import { HERO_INSTALL, INSTALL_TABS } from "../src/site/install";
import { buildCommands, buildRoster } from "../src/site/roster-model";
import type { AgentSource } from "../src/site/roster-model";

const REPO_ROOT = join(import.meta.dir, "..");

function readAgents(dir: string): AgentSource[] {
  return readdirSync(join(REPO_ROOT, dir))
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({
      name: name.replace(/\.md$/, ""),
      markdown: readFileSync(join(REPO_ROOT, dir, name), "utf8"),
    }));
}

describe("landing roster is derived from agent frontmatter", () => {
  const coreFiles = readAgents("agents");
  const extraFiles = readAgents("extras");
  const commandFiles = readAgents("command");
  const roster = buildRoster(coreFiles, extraFiles);
  const commands = buildCommands(commandFiles);
  const coreAgents = roster.groups.flatMap((group) => group.agents);

  test("every agents/ and extras/ file appears once, in the right group", () => {
    expect(roster.coreCount).toBe(coreFiles.length);
    expect(roster.extrasCount).toBe(extraFiles.length);
    expect(coreAgents.map((agent) => agent.name).sort()).toEqual(
      coreFiles.map((file) => file.name).sort(),
    );
    expect(roster.extras.map((agent) => agent.name).sort()).toEqual(
      extraFiles.map((file) => file.name).sort(),
    );
    expect(roster.primaryCount).toBe(1);
    expect(roster.specialistCount).toBe(roster.coreCount - 1);
    expect(coreAgents.map((agent) => agent.name)).toContain("plan-writer");
    expect(coreAgents.map((agent) => agent.name)).toContain(
      "comprehension-coach",
    );
    expect(roster.extras.map((agent) => agent.name)).toEqual(
      expect.arrayContaining(["pc-doctor", "writer"]),
    );
    expect(coreAgents.map((agent) => agent.name)).not.toContain("pc-doctor");
    expect(coreAgents.map((agent) => agent.name)).not.toContain("writer");
  });

  test("permission badges follow the frontmatter, including planner and the helpers", () => {
    const byName = new Map(
      [...coreAgents, ...roster.extras].map((agent) => [agent.name, agent]),
    );
    const planner = byName.get("planner");
    expect(planner?.badge).toBe("scoped write");
    expect(planner?.detail).toContain("plan-body");

    for (const name of ["build-helper", "npm-helper", "deploy-helper"]) {
      expect(byName.get(name)?.badge).toBe("edit: ask");
    }

    for (const name of [
      "explorer",
      "librarian",
      "oracle",
      "code-reviewer",
      "security",
      "comprehension-coach",
    ]) {
      expect(byName.get(name)?.badge).toBe("read-only");
    }

    expect(byName.get("orchestrator")?.badge).toBe("scoped write");
    expect(byName.get("plan-writer")?.badge).toBe("scoped write");
    expect(byName.get("plan-writer")?.detail).toContain("plan");
    expect(byName.get("developer-fixer")?.badge).toBe("writes");
    expect(byName.get("writer")?.badge).toBe("writes");
    expect(byName.get("pc-doctor")?.badge).toBe("edit: ask");
  });

  test("commands come from command/*.md in session order", () => {
    expect(commands.map((command) => command.name)).toEqual([
      "start-session",
      "recall",
      "research-mode",
      "close-session",
    ]);
    expect(commands.every((command) => command.description.length > 20)).toBe(
      true,
    );
  });

  test("the page renders counts from the roster module", () => {
    const page = readFileSync(
      join(REPO_ROOT, "src/components/landing/LandingPage.tsx"),
      "utf8",
    );
    const loader = readFileSync(join(REPO_ROOT, "src/site/roster.ts"), "utf8");
    expect(loader).toContain('import.meta.glob("../../agents/*.md"');
    expect(loader).toContain('import.meta.glob("../../extras/*.md"');
    expect(loader).toContain("buildRoster");
    expect(page).toContain("roster.specialistCount");
    expect(page).toContain("roster.coreCount");
    expect(page).not.toContain("14 specialists");
    expect(page).not.toContain("15 specialists");
    expect(page).toContain('role="tablist"');
    expect(page).toContain("aria-selected");
    expect(page).toContain("aria-expanded");
    expect(page).toContain('href="#top"');
    expect(page).toContain('aria-hidden="true"');
    expect(page).not.toContain("on the roadmap");
  });
});

describe("install copy matches the README paths", () => {
  test("tabs cover npm, git, a local directory, legacy v1, and Studio", () => {
    expect(INSTALL_TABS.map((tab) => tab.id)).toEqual([
      "npm",
      "git",
      "local",
      "legacy",
      "studio",
    ]);
    expect(HERO_INSTALL).toContain('"package": "opencode-orchestrator-kit"');
    expect(HERO_INSTALL).toContain('"preset": "generic"');
    expect(HERO_INSTALL).toContain('"withExtras": false');
    const npm = INSTALL_TABS.find((tab) => tab.id === "npm");
    expect(npm?.code).toContain('"package": "opencode-orchestrator-kit"');
    expect(INSTALL_TABS.find((tab) => tab.id === "git")?.code).toContain(
      "github:NicoGenti/opencode-orchestrator-kit#main::path:plugin",
    );
    expect(INSTALL_TABS.find((tab) => tab.id === "local")?.code).toContain(
      "/absolute/path/to/opencode-orchestrator-kit/plugin",
    );
    const legacy = INSTALL_TABS.find((tab) => tab.id === "legacy");
    expect(legacy?.deprecated).toBe(true);
    expect(legacy?.code).toContain("./install.sh project");
    expect(INSTALL_TABS.find((tab) => tab.id === "studio")?.code).toContain(
      "./install.sh studio <profile-name>",
    );
  });
});

describe("site head tokens and npm metadata", () => {
  test("applySiteTokens replaces version and date placeholders", () => {
    const html = applySiteTokens(
      "v __KIT_VERSION__ on __DATE_MODIFIED__",
      "1.2.3",
      "2026-11-02",
    );
    expect(html).toBe("v 1.2.3 on 2026-11-02");
  });

  test("index.docs.html is the SEO and JSON-LD source", () => {
    const html = readFileSync(join(REPO_ROOT, "index.docs.html"), "utf8");
    expect(html).toContain(
      "OpenCode Plugin: Multi-Agent Orchestrator for AI Coding Agents",
    );
    expect(html).toContain("OpenCode plugin on npm");
    expect(html).toContain(
      "https://www.npmjs.com/package/opencode-orchestrator-kit",
    );
    expect(html).toContain(
      "https://github.com/NicoGenti/opencode-orchestrator-kit#install-on-opencode-2-plugin--recommended",
    );
    expect(html).toContain('"programmingLanguage": "TypeScript"');
    expect(html).toContain('"softwareVersion": "__KIT_VERSION__"');
    expect(html).toContain('"dateModified": "__DATE_MODIFIED__"');
    expect(html).toContain("<noscript>");
    expect(html).toContain("og-image.jpg");
    expect(html).not.toContain("fonts.googleapis.com");
    expect(html).not.toContain("og-image.png");
    expect(html).toContain(
      'rel="canonical"\n      href="https://nicogenti.github.io/opencode-orchestrator-kit/"',
    );
  });

  test("plugin/package.json advertises the site and every command without a version bump", () => {
    const pkg = JSON.parse(
      readFileSync(join(REPO_ROOT, "plugin/package.json"), "utf8"),
    ) as {
      version: string;
      description: string;
      homepage: string;
      keywords: string[];
    };
    expect(pkg.version).toBe("1.0.0");
    expect(pkg.homepage).toBe(
      "https://nicogenti.github.io/opencode-orchestrator-kit/",
    );
    expect(pkg.keywords).toEqual(
      expect.arrayContaining([
        "opencode",
        "opencode-plugin",
        "ai-agents",
        "multi-agent",
        "orchestrator",
        "coding-agent",
      ]),
    );
    for (const command of [
      "/start-session",
      "/recall",
      "/research-mode",
      "/close-session",
    ]) {
      expect(pkg.description).toContain(command);
    }
    const unreleased = readFileSync(
      join(REPO_ROOT, "CHANGELOG.md"),
      "utf8",
    ).split("## [1.0.0]")[0];
    expect(unreleased).toContain("homepage");
    expect(unreleased).toContain("/close-session");
    expect(unreleased).toContain("Landing page");
  });
});
