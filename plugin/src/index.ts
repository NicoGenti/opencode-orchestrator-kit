import { Plugin } from "./runtime/opencode-plugin";
import type { AgentEditor } from "./runtime/opencode-plugin";

import { collectPackagedSkills } from "./assets";
import { loadPackagedStartSession } from "./command";

import {
  collectAvailabilityWarnings,
  resolveTierMap,
  resolveTierValue,
} from "./tiers";
import type { ResolvedTierMap } from "./tiers";

import { collectPackagedAgents, parseModelRef } from "./agents";

import { registerPlanBoardTool } from "./plan-board-tool";

/** Prefix used for every kit signal printed to the console. */
const WARNING_PREFIX = "[opencode-orchestrator-kit]";

/**
 * opencode-orchestrator-kit plugin (Phase 3).
 *
 * Reads the plugin options `{ preset?, withExtras? }`, resolves the tier map
 * from the bundled presets ( throwing TierConfigError early on bad config ),
 * signals unavailable tier models against `ctx.model.list()` (non-fatal), and
 * registers: one command (`/start-session`), the 9 kit skills and the 15
 * packaged agents (+2 extras when `withExtras: true`) via `ctx.agent.transform`.
 *
 * Phase 3 additionally registers the native `plan_board` tool (the pure
 * plan-board CLI port) via `ctx.tool.transform`; when the host does not
 * expose `ctx.tool` the registration degrades silently and setup stays
 * successful.
 *
 * Agent registration is an upsert guarded by `editor.get(id)`: user-configured
 * agents win. It never calls `editor.default(...)` — the user's startup agent
 * is NOT changed; orchestrator stays the only `mode: primary` kit agent.
 *
 * Note: @opencode/plugin is a peer dependency not installed in this repo — the
 * import is served by the temporary runtime stand-in until Phase 6 swaps it
 * for `import { Plugin } from "@opencode/plugin"` (see the header of
 * src/runtime/opencode-plugin.ts and plugin/types/opencode-plugin-shim.d.ts).
 */
export default Plugin.define({
  id: "opencode-orchestrator-kit",
  async setup(ctx) {
    // 1. Options (all optional).
    const options = ctx.options ?? {};
    const presetName =
      typeof options.preset === "string" && options.preset.length > 0
        ? options.preset
        : undefined;
    const withExtras = options.withExtras === true;

    // 2. Tier resolution — throws TierConfigError BEFORE any registration
    //    (fail early, leave the runtime untouched on bad config).
    const tierMap = resolveTierMap(presetName);

    // 3. Unavailable models are signaled, never fatal.
    const registry = await ctx.model.list();
    if (registry.length === 0) {
      console.warn(
        `${WARNING_PREFIX} runtime model registry is empty; skipping tier availability checks (preset: '${tierMap.preset}')`,
      );
    } else {
      for (const warning of collectAvailabilityWarnings(
        tierMap.models,
        tierMap.preset,
        registry,
      )) {
        console.warn(warning.message);
      }
    }

    // 4. Commands.
    ctx.command.transform((editor) => {
      const startSession = loadPackagedStartSession();
      editor.add({
        name: startSession.name,
        description: startSession.description,
        agent: startSession.agent,
        execute: () => startSession.body,
      });
    });

    // 5. Skills.
    ctx.skill.transform((editor) => {
      for (const skill of collectPackagedSkills()) {
        editor.add({
          id: skill.id,
          name: skill.name,
          path: skill.path,
          content: skill.content,
        });
      }
    });

    // 6. Agents (upsert via ctx.agent.transform; user config wins).
    await ctx.agent.transform((editor) => {
      for (const agent of collectPackagedAgents(withExtras)) {
        registerAgent(editor, agent, tierMap);
      }
    });

    // 7. Native plan_board tool (Phase 3) via ctx.tool.transform; degrades
    //    silently when the host does not expose ctx.tool.
    registerPlanBoardTool(ctx);
  },
});

/**
 * Upsert one packaged agent into the editor unless the user already
 * configured an agent with the same id.
 */
function registerAgent(
  editor: AgentEditor,
  agent: ReturnType<typeof collectPackagedAgents>[number],
  tierMap: ResolvedTierMap,
): void {
  if (editor.get(agent.id)) {
    return; // user config wins
  }
  editor.update(agent.id, (info) => {
    const value = resolveTierValue(agent.model, tierMap.models, tierMap.preset);
    info.description = agent.description;
    // update() seeds "primary" for fresh ids — set mode explicitly every time
    // so subagents never leak into the primary-agent cycle.
    info.mode = agent.mode;
    info.model = parseModelRef(value);
    info.system = agent.system;
  });
}
