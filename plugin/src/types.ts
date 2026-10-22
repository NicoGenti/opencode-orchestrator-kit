import type { Skill } from "@opencode/plugin";

/**
 * Narrow, structural views of the OpenCode 2 plugin context.
 *
 * These interfaces are deliberately minimal: the runtime `Plugin.Context`
 * (see `@opencode/plugin/dist/promise/plugin.d.ts`) is structurally
 * assignable to `KitContext`, and hand-rolled test fakes can implement
 * `KitContext` directly without importing the runtime package.
 */

/** Agent shape needed by the kit: everything else is left untouched. */
export interface KitAgent {
  model?: { providerID: string; id: string };
}

export interface KitAgentEditor {
  get(id: string): unknown | undefined;
  default(id: string | undefined): void;
  update(id: string, update: (agent: KitAgent) => void): void;
}

export interface KitAgentDomain {
  transform(callback: (editor: KitAgentEditor) => void): Promise<unknown>;
  reload(): Promise<void>;
}

export interface KitCommandDomain {
  reload(): Promise<void>;
}

/** Skill shape per the installed `Skill.Info` schema (id, name, description?, path, content). */
export type KitSkill = {
  id: string;
  name: string;
  description?: string;
  path: string;
  content: string;
} & Partial<Pick<Skill.Info, "autoinvoke">>;

export interface KitSkillEditor {
  add(skill: KitSkill): void;
}

export interface KitSkillDomain {
  /** Returns whatever `ctx.skill.list()` exposes; normalised defensively in setup. */
  list(): Promise<unknown>;
  transform(callback: (editor: KitSkillEditor) => void): Promise<unknown>;
}

export interface KitModelDomain {
  /** Returns whatever `ctx.model.list()` exposes; normalised defensively in setup. */
  list(): Promise<unknown>;
}

export interface KitLocation {
  readonly directory: string;
  readonly project?: { readonly directory: string };
}

export interface KitContext {
  readonly location: KitLocation;
  readonly options: Readonly<Record<string, unknown>>;
  readonly agent: KitAgentDomain;
  readonly command: KitCommandDomain;
  readonly skill: KitSkillDomain;
  readonly model: KitModelDomain;
}

/**
 * Injectable filesystem operations used by kitSetup. The default
 * implementation (`nodeIo` in setup.ts) is backed by node:fs; tests wrap
 * these operations to record writes over a real temp directory.
 */
export interface KitIo {
  exists(path: string): boolean;
  /** Entry NAMES of a directory; empty array when the directory is absent. */
  listEntries(dir: string): string[];
  isDirectory(path: string): boolean;
  readFile(path: string): string;
  mkdirRecursive(dir: string): void;
  copyFile(src: string, dst: string): void;
}

/** Structured warning emitted (never thrown) by tier resolution. */
export interface TierWarning {
  code: "placeholder" | "unavailable" | "default-agent-missing" | "agent-missing" | "skill-read";
  tier?: string;
  value?: string;
  message: string;
}

/** Plugin options accepted via `opencode.json` `plugins: [{ package, options }]`. */
export interface KitOptions {
  preset?: string;
  withExtras?: boolean;
}

/** Kit results, so tests (and future tooling) can assert every effect. */
export interface SetupResult {
  /** Destination files created during this run (absolute paths). */
  materialised: string[];
  /** Destination files that already existed and were deliberately left alone. */
  skippedExisting: string[];
  /** Skill ids registered in-memory during this run. */
  skillsAdded: string[];
  /** Skill ids skipped because `ctx.skill.list()` already exposes them. */
  skillsSkipped: string[];
  /** Agent ids whose model was assigned from a resolved tier. */
  agentsUpdated: string[];
  /** Where the tier config was found. */
  tierSource: "project" | "template";
  /** Preset selected after `options.preset` / `default_preset` resolution. */
  tierPreset: string;
  /** Default agent set (or null if skipped with a warning). */
  defaultAgent: string | null;
  /** Structured warnings, all messages prefixed with `[opencode-orchestrator-kit]`. */
  warnings: TierWarning[];
}
