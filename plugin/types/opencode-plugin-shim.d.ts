// Ambient shim for "@opencode/plugin" — the shipped 0.7.0 design: the plugin
// bundle runs against this declared module while the peer dependency
// `@opencode/plugin ^2.1.0` (plugin/package.json) documents the real host
// contract. Field names mirror the shapes recorded by the Phase-0 spike
// against @opencode/plugin@2.1.2 type defs, updated to the shipped OpenCode
// 2.2 command contract (commands → editor.add({ name, description, execute });
// skills → editor.add({ id, name, path /* absolute */, content })). The
// runtime stand-in lives in plugin/src/runtime/opencode-plugin.ts (typed
// identically), because the bundle under test must run with zero installed
// npm dependencies.
declare module "@opencode/plugin" {
  /** Invocation handed to a command's `execute` by the host (OpenCode 2.2). */
  export interface CommandInvocation {
    sessionID: string;
    /** Original prompt input (text, attachments, agent/model when the host sets them). */
    prompt: Record<string, unknown>;
    delivery: "steer" | "queue";
  }
  /** Command entry contributed through ctx.command.transform. */
  export interface CommandInfo {
    name: string;
    description: string;
    /**
     * Command implementation. OpenCode 2.2 calls `execute(input).then(...)`:
     * the callback MUST return a promise AND deliver the prompt itself
     * (see ctx.session.prompt). Returning a string makes the host throw
     * `t(s).then is not a function`.
     */
    execute: (input: CommandInvocation) => Promise<void>;
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
  /** OpenCode 2 Model.Ref object shape (agent.model). */
  export interface ModelRef {
    providerID: string;
    id: string;
    variant?: string;
  }
  /** One entry of the V2 ordered permission rule list (agents.<id>.permissions). */
  export interface PermissionRule {
    /** Tool permission action (V2 names: edit, shell, subagent, ...). */
    action: string;
    /** Value being used: path, command, URL, skill ID, agent ID, ... */
    resource: string;
    effect: "allow" | "ask" | "deny";
  }

  /** Agent entry as exposed by the AgentEditor (Agent.Info fields in use). */
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
   * Editor handed to a ctx.agent.transform callback. update is an UPSERT
   * (unknown ids are seeded with defaults and inserted) — hence "mode" must
   * be set explicitly for every update, because seeding defaults to "primary".
   */
  export interface AgentEditor {
    list(): AgentInfo[];
    get(id: string): AgentInfo | undefined;
    default(id: string): void;
    update(id: string, callback: (agent: AgentInfo) => void): void;
    remove(id: string): void;
  }
  /** Tool entry contributed through ctx.tool.transform; mirrors the shape
   *  recorded by the Phase-0 spike against @opencode/plugin@2.1.2 type defs
   *  (tool.d.ts: editor.add({ name, description, input JSON Schema, options,
   *  execute }) — tools cannot be upsert-created, only added). */
  export interface ToolInfo {
    name: string;
    description: string;
    /** JSON Schema of the tool input. */
    input?: Record<string, unknown>;
    options?: Record<string, unknown>;
    execute: (input: unknown) => unknown;
  }
  /** Editor handed to a ctx.tool.transform callback. */
  export interface ToolEditor {
    add(tool: ToolInfo): void;
  }
  /** Editor-transform context handed to the plugin setup. */
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
    /** Session client: command executors deliver their prompt through it. */
    session: {
      prompt(input: Record<string, unknown>): Promise<unknown>;
      switchAgent?(input: { sessionID: string; agent: string }): Promise<void>;
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
     *  host does not expose ctx.tool. */
    tool?: {
      transform(callback: (editor: ToolEditor) => unknown): void;
    };
  }
  /** Input accepted by Plugin.define. */
  export interface PluginDefinition {
    id: string;
    setup: (ctx: PluginContext) => void | Promise<void>;
  }
  /** What Plugin.define returns (the installed plugin instance). */
  export interface PluginInstance {
    id: string;
    setup: (ctx: PluginContext) => void | Promise<void>;
  }
  /** Minimal @opencode/plugin 2.1.x entry point surface used by this kit. */
  export declare const Plugin: {
    define(definition: PluginDefinition): PluginInstance;
  };
}
