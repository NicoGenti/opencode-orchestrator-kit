import { Plugin } from "./runtime/opencode-plugin";

import { collectPackagedSkills } from "./assets";
import { loadPackagedStartSession } from "./command";

/**
 * opencode-orchestrator-kit plugin (Phase 1 skeleton).
 *
 * Registers exactly one command (`/start-session`, mirroring
 * command/start-session.md) and the 9 kit skills packaged under
 * plugin/assets/skills/. Agent registration, tools and ctx.storage land in
 * later plan phases (issue #13).
 *
 * Note: @opencode/plugin is a peer dependency not installed in this repo — the
 * import is served by the temporary runtime stand-in until Phase 6 swaps it
 * for `import { Plugin } from "@opencode/plugin"` (see the header of
 * src/runtime/opencode-plugin.ts and plugin/types/opencode-plugin-shim.d.ts).
 */
export default Plugin.define({
  id: "opencode-orchestrator-kit",
  setup(ctx) {
    ctx.command.transform((editor) => {
      const startSession = loadPackagedStartSession();
      editor.add({
        name: startSession.name,
        description: startSession.description,
        agent: startSession.agent,
        execute: () => startSession.body,
      });
    });
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
  },
});
