/**
 * Entry point of the opencode-orchestrator-kit plugin for OpenCode 2.
 *
 * This module is the ONLY place where `@opencode/plugin` is imported as a
 * value (the `Plugin.define` helper). Every other kit module may reference
 * the package only with `import type`, so tests can run with plain `bun test`
 * from the repository root without installing the plugin's dependencies.
 *
 * The default export is what OpenCode loads for a `plugins` entry
 * (`"opencode-orchestrator-kit"` in opencode.json).
 */

import { Plugin } from "@opencode/plugin";

import { kitSetup } from "./setup.ts";

export default Plugin.define({
  id: "opencode-orchestrator-kit",
  async setup(context): Promise<void> {
    await kitSetup(context);
    // Side effects are durable (files replaced on disk, in-memory skill
    // registrations live as long as the runtime). No cleanup needed.
  },
});
