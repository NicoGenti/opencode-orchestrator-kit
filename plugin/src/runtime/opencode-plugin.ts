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

/** OpenCode 2 Model.Ref object shape (`agent.model`). */
export interface ModelRef {
  providerID: string;
  id: string;
  variant?: string;
}

/** One entry of the V2 ordered permission rule list (`agents.<id>.permissions`). */
export interface PermissionRule {
  /** Tool permission action (V2 names: `edit`, `shell`, `subagent`, ...). */
  action: string;
  /** Value being used: path, command, URL, skill ID, agent ID, ... */
  resource: string;
  effect: "allow" | "ask" | "deny";
}

/** Agent entry as exposed by the AgentEditor (`Agent.Info` fields in use). */
export interface AgentInfo {
  id: string;
  name: string;
  model?: ModelRef;
  system?: string;
  description?: string;
  mode?: "subagent" | "primary" | "all";
  hidden?: boolean;
  permissions?: PermissionRule[];
}

/**
 * Editor handed to a `ctx.agent.transform` callback. `update` is an UPSERT
 * (unknown ids are seeded with defaults and inserted) — hence "mode" must be
 * set explicitly for every update, because seeding defaults to "primary".
 */
export interface AgentEditor {
  list(): AgentInfo[];
  get(id: string): AgentInfo | undefined;
  default(id: string): void;
  update(id: string, callback: (agent: AgentInfo) => void): void;
  remove(id: string): void;
}

/** Tool entry contributed through `ctx.tool.transform`; mirrors the shape
 *  recorded by the Phase-0 spike against @opencode/plugin 2.1.x type defs
 *  (tool.d.ts of @opencode/plugin@2.1.2, docs/PLUGIN-V2-FEASIBILITY.md:
 *  editor.add({ name, description, input JSON Schema, options, execute }) —
 *  tools cannot be upsert-created, only added). */
export interface ToolInfo {
  name: string;
  description: string;
  /** JSON Schema of the tool input. */
  input?: Record<string, unknown>;
  options?: Record<string, unknown>;
  execute: (input: unknown) => unknown;
}

/** Editor handed to a `ctx.tool.transform` callback. */
export interface ToolEditor {
  add(tool: ToolInfo): void;
}

/** Editor-transform context handed to the plugin `setup`. */
export interface PluginContext {
  /** Plugin options from the `plugins` config entry (all optional). */
  options: Record<string, unknown>;
  /** Runtime model registry for availability checks. */
  model: {
    list(): Promise<Array<{ providerID: string; id: string }>>;
  };
  command: {
    transform(callback: (editor: CommandEditor) => unknown): void;
  };
  skill: {
    transform(callback: (editor: SkillEditor) => unknown): void;
  };
  agent: {
    transform(
      callback: (editor: AgentEditor) => void | Promise<void>,
    ): Promise<void>;
  };
  /** Optional V2 tools transform — the plugin degrades silently when the
   *  host does not expose `ctx.tool`. */
  tool?: {
    transform(callback: (editor: ToolEditor) => unknown): void;
  };
}

/** Input accepted by `Plugin.define`. */
export interface PluginDefinition {
  id: string;
  setup: (ctx: PluginContext) => void | Promise<void>;
}

/** What `Plugin.define` returns (the installed plugin instance). */
export interface PluginInstance {
  id: string;
  setup: (ctx: PluginContext) => void | Promise<void>;
}

/** Minimal @opencode/plugin 2.1.x entry point surface used by this kit. */
export const Plugin: {
  define(definition: PluginDefinition): PluginInstance;
} = {
  define(definition) {
    return { id: definition.id, setup: definition.setup };
  },
};
