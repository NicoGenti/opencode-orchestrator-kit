import { MIGRATION_URL, STUDIO_DOCS_URL } from "./release";

/** One-line plugins entry, the same object the README documents. */
export const HERO_INSTALL =
  '{ "package": "opencode-orchestrator-kit", "options": { "preset": "generic", "withExtras": false } }';

export const NPM_INSTALL = `{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-orchestrator-kit",
      "options": { "preset": "generic", "withExtras": false },
    },
  ],
}`;

export const LOCAL_INSTALL = `{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "/absolute/path/to/opencode-orchestrator-kit/plugin",
      "options": { "preset": "generic", "withExtras": false },
    },
  ],
}`;

export const GIT_INSTALL =
  "opencode plugin add 'github:NicoGenti/opencode-orchestrator-kit#main::path:plugin'";

export const LEGACY_INSTALL = `# Project-only: ./.opencode/ and ./AGENTS.md
./install.sh project

# Global: ~/.config/opencode/
./install.sh global`;

export const STUDIO_INSTALL = `./install.sh studio <profile-name>

# Stay in sync with git pull in this repo
./install.sh --symlink studio <profile-name>`;

export interface InstallTab {
  id: string;
  label: string;
  deprecated?: boolean;
  intro: string;
  code: string;
  note: string;
  link?: { href: string; label: string };
}

export const INSTALL_TABS: readonly InstallTab[] = [
  {
    id: "npm",
    label: "npm",
    intro:
      "Primary install on OpenCode 2. Add the npm package to the plugins array in opencode.json or opencode.jsonc. Nothing is copied into .opencode/.",
    code: NPM_INSTALL,
    note: "Peer dependency: @opencode/plugin ^2.1.0. preset selects the tier mapping (generic is the one you edit). withExtras defaults to false, so pc-doctor and writer stay off until you opt in.",
  },
  {
    id: "git",
    label: "Git",
    intro:
      "OpenCode 2 accepts a git package spec on opencode plugin add, including a subdirectory selector, because this plugin lives in plugin/ and not at the repository root.",
    code: GIT_INSTALL,
    note: "That command writes a package entry. Set preset and withExtras with the object form if the generated entry has no options. This repository has not executed that install against a live OpenCode binary.",
  },
  {
    id: "local",
    label: "Local directory",
    intro:
      "A checkout of this repository uses the same object form with an absolute directory path.",
    code: LOCAL_INSTALL,
    note: "Local paths must be directories. A path to a single file is skipped. Relative paths resolve from the config file that contains the entry.",
  },
  {
    id: "legacy",
    label: "Legacy v1",
    deprecated: true,
    intro:
      "Deprecated on OpenCode 2. install.sh is the v1 copy-based installer, kept for OpenCode 1.x and offline use.",
    code: LEGACY_INSTALL,
    note: "The installer seeds a model profile and resolves {{TIER_*}} tokens at install time. On the plugin path, tier resolution happens at runtime from the preset instead.",
    link: { href: MIGRATION_URL, label: "Migration guide" },
  },
  {
    id: "studio",
    label: "OpenCode Studio",
    intro:
      "OpenCode Studio is supported today. If you already manage OpenCode through Studio profiles, the legacy installer can scope the kit to one profile instead of installing it globally.",
    code: STUDIO_INSTALL,
    note: "Create the profile in Studio first so its config directory exists. The command copies the kit into ~/.config/opencode-profiles/<profile-name>/. Then run /start-session in that profile.",
    link: { href: STUDIO_DOCS_URL, label: "Studio setup guide" },
  },
];

export const WHATS_NEW: readonly { title: string; body: string }[] = [
  {
    title: "Install from npm",
    body: "opencode-orchestrator-kit is the OpenCode 2 plugin. Add the package to the plugins array and the roster, commands, and skills register at runtime.",
  },
  {
    title: "A plan board with an owner",
    body: "plan-writer is the only agent that creates or moves plan files. On OpenCode 2 it calls the native plan_board tool; the v1 installer falls back to scripts/plan-board.py.",
  },
  {
    title: "Four session commands",
    body: "Start a session, recall a comprehension review, opt into research recording, and close the session without starting new work.",
  },
  {
    title: "Design rules on an empty repo",
    body: "The first run looks for a design-rules artifact. On a new repository the profiler asks for the goal and seeds one. Existing artifacts are reported, not overwritten.",
  },
  {
    title: "Companion kits stay optional",
    body: "This kit runs on its own. It does not fetch or pin another repository. A companion may install its own skills and commands where OpenCode already looks. web-* is a reserved prefix for a web-stack skill pack. A web-kit is one example of that shape. This package runs without a companion repository.",
  },
  {
    title: "Extras are opt-in",
    body: "pc-doctor and writer are not part of the default roster. Set withExtras to true, or on the legacy installer pass --with-extras.",
  },
];
