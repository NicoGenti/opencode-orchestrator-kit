// TEMPORARY ambient shim pinned to the @opencode/plugin 2.1.x surface per
// docs/PLUGIN-V2-FEASIBILITY.md; to be replaced by the real dependency in
// Phase 6 when lockfile changes are allowed. Field names mirror the shapes
// recorded by the Phase-0 spike against @opencode/plugin@2.1.2 type defs
// (commands → editor.add({ name, description, execute }); skills →
// editor.add({ id, name, path /* absolute */, content })). The runtime
// stand-in used until Phase 6 lives in plugin/src/runtime/opencode-plugin.ts
// (typed identically), because the bundle under test must run with zero
// installed npm dependencies.
declare module "@opencode/plugin" {
  /** Command entry contributed through ctx.command.transform. */
  export interface CommandInfo {
    name: string;
    description: string;
    /** V1 command-kit parity: the agent that handles the command. */
    agent?: string;
    /** Command implementation; returns the markdown body (Phase 1 skeleton). */
    execute?: (input: unknown) => unknown;
  }
  /** Editor handed to a ctx.command.transform callback. */
  export interface CommandEditor {
    add(command: CommandInfo): void;
  }
  /** Skill entry contributed through ctx.skill.transform. */
  export interface SkillInfo {
    id: string;
    name: string;
    /** Absolute path of the packaged SKILL.md copy. */
    path: string;
    content: string;
  }
  /** Editor handed to a ctx.skill.transform callback. */
  export interface SkillEditor {
    add(skill: SkillInfo): void;
  }
  /** Editor-transform context handed to the plugin setup. */
  export interface PluginContext {
    command: {
      transform(callback: (editor: CommandEditor) => unknown): void;
    };
    skill: {
      transform(callback: (editor: SkillEditor) => unknown): void;
    };
  }
  /** Input accepted by Plugin.define. */
  export interface PluginDefinition {
    id: string;
    setup: (ctx: PluginContext) => void;
  }
  /** What Plugin.define returns (the installed plugin instance). */
  export interface PluginInstance {
    id: string;
    setup: (ctx: PluginContext) => void;
  }
  /** Minimal @opencode/plugin 2.1.x entry point surface used by this kit. */
  export declare const Plugin: {
    define(definition: PluginDefinition): PluginInstance;
  };
}
