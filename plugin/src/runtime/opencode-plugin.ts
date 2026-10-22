// TEMPORARY runtime stand-in for "@opencode/plugin".
// Pinned to the @opencode/plugin 2.1.x surface per docs/PLUGIN-V2-FEASIBILITY.md;
// to be replaced by the real dependency in Phase 6 when lockfile changes are
// allowed. It exists because `bun test` must exercise the real plugin sources
// with ZERO npm dependencies installed (the peer dependency declared in
// plugin/package.json documents the real contract). The ambient type shim for
// the real specifier lives in plugin/types/opencode-plugin-shim.d.ts.

/** Command entry contributed through `ctx.command.transform`. */
export interface CommandInfo {
  name: string;
  description: string;
  /** V1 command-kit parity: the agent that handles the command. */
  agent?: string;
  /** Command implementation; returns the markdown body (Phase 1 skeleton). */
  execute?: (input: unknown) => unknown;
}

/** Editor handed to a `ctx.command.transform` callback. */
export interface CommandEditor {
  add(command: CommandInfo): void;
}

/** Skill entry contributed through `ctx.skill.transform`. */
export interface SkillInfo {
  id: string;
  name: string;
  /** Absolute path of the packaged SKILL.md copy. */
  path: string;
  content: string;
}

/** Editor handed to a `ctx.skill.transform` callback. */
export interface SkillEditor {
  add(skill: SkillInfo): void;
}

/** Editor-transform context handed to the plugin `setup`. */
export interface PluginContext {
  command: {
    transform(callback: (editor: CommandEditor) => unknown): void;
  };
  skill: {
    transform(callback: (editor: SkillEditor) => unknown): void;
  };
}

/** Input accepted by `Plugin.define`. */
export interface PluginDefinition {
  id: string;
  setup: (ctx: PluginContext) => void;
}

/** What `Plugin.define` returns (the installed plugin instance). */
export interface PluginInstance {
  id: string;
  setup: (ctx: PluginContext) => void;
}

/** Minimal @opencode/plugin 2.1.x entry point surface used by this kit. */
export const Plugin: {
  define(definition: PluginDefinition): PluginInstance;
} = {
  define(definition) {
    return { id: definition.id, setup: definition.setup };
  },
};
