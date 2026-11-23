import { runPlanBoard } from "./plan-board";
import type { PluginContext } from "./runtime/opencode-plugin";
import { loadToonConfig, type ToonConfig } from "./toon-config";

/** Name under which the native plan-board tool is registered. */
export const PLAN_BOARD_TOOL_NAME = "plan_board";

/**
 * Tool documentation shown to the model. It must spell out the deterministic
 * CLI port contract, the exit codes and the standing authorization copied
 * from the plan-board lifecycle rules.
 */
export const PLAN_BOARD_TOOL_DESCRIPTION = [
  "Deterministic port of the plan-board CLI for the kit's plan/ column board: `check` audits board structure, `move` promotes a plan between columns, `new` creates a plan from a nine-section markdown body and `adopt` normalises a legacy file; the outcome is returned as a JSON payload by default (opt into a TOON-encoded payload with `toon.enabled` in `.opencode/toon.config.json`).",
  "Exit contract: `0` means ok (warnings allowed), `1` means a blocking error.",
  "Standing authorization: `check` and `move` of already-conforming files are covered by the standing approval `## Approved Mutation Summary — plan-board-standing-v1` and need no fresh approval, while `new`, `adopt`, body edits, deletion and rename require a per-dispatch approved Mutation Summary.",
  "Mutations must stay under the board root.",
].join(" ");

/** JSON Schema of the tool input, mirroring the plan-board flag grammar. */
export const PLAN_BOARD_TOOL_INPUT: Record<string, unknown> = {
  type: "object",
  required: ["command"],
  additionalProperties: false,
  properties: {
    command: {
      type: "string",
      enum: ["check", "move", "new", "adopt"],
      description: "Plan-board subcommand to run.",
    },
    root: {
      type: "string",
      description: "Board root, default `plan`.",
    },
    id: {
      type: "string",
      description: "Plan id for `move`/`new`.",
    },
    to: {
      type: "string",
      enum: ["draft", "in-progress", "qa", "complete"],
      description: "Destination column for `move`.",
    },
    comprehension: {
      type: "string",
      enum: [
        "none",
        "pass",
        "skipped",
        "needs_review",
        "fail",
        "disabled",
        "n/a",
      ],
      description: "Comprehension verdict recorded when moving to complete.",
    },
    outcome: {
      type: "string",
      description: "One-line lesson outcome recorded when moving to complete.",
    },
    title: {
      type: "string",
      description: "Plan title for `new`.",
    },
    owner: {
      type: "string",
      description: "Frontmatter owner for `new`/`adopt`.",
    },
    executor: {
      type: "string",
      description: "Frontmatter executor for `new`/`adopt`.",
    },
    body: {
      type: "string",
      description: "Path of the markdown body file for `new`.",
    },
    column: {
      type: "string",
      enum: ["draft", "in-progress", "qa", "complete"],
      description: "Column targeted by `new` (default `draft`).",
    },
    file: {
      type: "string",
      description: "Plan file stem or name for `adopt`.",
    },
    dryRun: {
      type: "boolean",
      description: "Preview the mutation without touching the board.",
    },
  },
};

/** Input keys accepted as string value flags, in argv emission order. */
const STRING_FLAG_FIELDS = [
  "id",
  "to",
  "comprehension",
  "outcome",
  "title",
  "body",
  "column",
  "file",
  "owner",
  "executor",
] as const;

/**
 * Translates an untrusted tool input into the plan-board argv: only string
 * values are collected (non-string values are ignored, not stringified),
 * `--dry-run` is emitted only for an exact `true`, and a missing/empty
 * command yields an empty argv so the port answers `missing-argument`.
 */
function planBoardArgv(input: unknown): string[] {
  const record =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const command = record["command"];
  if (typeof command !== "string" || command.length === 0) {
    return [];
  }
  const argv = [command];
  for (const field of STRING_FLAG_FIELDS) {
    const value = record[field];
    if (typeof value === "string") {
      argv.push(`--${field}`, value);
    }
  }
  const root = record["root"];
  if (typeof root === "string") {
    argv.push("--root", root);
  }
  if (record["dryRun"] === true) {
    argv.push("--dry-run");
  }
  return argv;
}

/**
 * Directories whose `.opencode/toon.config.json` may configure the encoder,
 * in lookup order.
 *
 * `--root` is the board root; the canonical call is `root: "plan"`, so a board
 * never contains the project-level config. The candidates are therefore the
 * explicit board root (an optional board-anchored override, used by the
 * tests), then `.` (the project root). `loadToonConfig` reads the first
 * existing file; none existing means the silent JSON default.
 */
function planBoardConfigRoots(input: unknown): string[] {
  const record =
    typeof input === "object" && input !== null
      ? (input as Record<string, unknown>)
      : {};
  const root = record["root"];
  if (typeof root !== "string" || root.length === 0) return ["."];
  return [root, "."];
}

/**
 * Serialize the payload for the host result.
 *
 * Default: the existing pretty JSON, byte-for-byte. When the user-local config
 * enables TOON and lists the `plan_board` surface, the payload is encoded as
 * TOON instead. The dependency is imported lazily so the default path — and
 * the packed artifact, which ships no `node_modules` — never needs it.
 *
 * A missing encoder is a degradation, not a failure: the payload falls back to
 * JSON and carries `configWarning: "encoder-unavailable"` so the caller can
 * observe it. A valid, resolvable encoder adds no `configWarning`.
 */
async function formatPlanBoardPayload(
  payload: Record<string, unknown>,
  config: ToonConfig,
): Promise<string> {
  if (
    !config.toon.enabled ||
    !config.toon.surfaces.includes(PLAN_BOARD_TOOL_NAME)
  ) {
    return JSON.stringify(payload, null, 2);
  }
  try {
    const { encode } = await import("@toon-format/toon");
    return encode(payload);
  } catch {
    payload["configWarning"] = "encoder-unavailable";
    return JSON.stringify(payload, null, 2);
  }
}

/**
 * Tool implementation: runs the pure port (which never throws) and resolves to
 * the host's tool-result shape.
 *
 * The OpenCode 2 host does `execute(input).then(...)` and then reads
 * `"output" in result` / `result.content`: a bare value (string or promise of
 * a string) fails with `t(s).then is not a function` or `a is not an Object`.
 * The documented shape for a tool without an output schema is
 * `{ content: [{ type: "text", text }] }` plus optional `metadata`
 * (session "Restyle Petalo palette Enrica", 2026-11-02).
 */
export async function executePlanBoardTool(
  input: unknown,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const { payload } = runPlanBoard(planBoardArgv(input));
  const toon = loadToonConfig(planBoardConfigRoots(input));
  if (toon.warnings.length > 0) {
    payload["configWarning"] = toon.warnings[0];
  }
  return {
    content: [
      {
        type: "text",
        text: await formatPlanBoardPayload(payload, toon.config),
      },
    ],
  };
}

/**
 * Registers the native `plan_board` tool through `ctx.tool.transform`.
 * Returns true iff registered; when the host does not expose `ctx.tool` the
 * registration degrades silently to keep setup successful.
 * Registers a first-class tool (options.codemode === false); Code Mode would hide it behind the execute sandbox.
 */
export function registerPlanBoardTool(ctx: PluginContext): boolean {
  if (typeof ctx.tool?.transform !== "function") {
    return false; // silent degradation — no warning
  }
  ctx.tool.transform((editor) => {
    editor.add({
      name: PLAN_BOARD_TOOL_NAME,
      // OpenCode 2 exposes plugin tools ONLY in Code Mode (`execute` -> `tools.plan_board`)
      // unless `codemode: false` is passed. Without that option the tool does not appear in
      // the agent catalogue (2026-11-02 session: 11 execute calls + 1 "No tool named plan_board").
      // Do not set `permission: "edit"`: the standing authorization covers check/move.
      options: { codemode: false },
      description: PLAN_BOARD_TOOL_DESCRIPTION,
      input: PLAN_BOARD_TOOL_INPUT,
      execute: executePlanBoardTool,
    });
  });
  return true;
}
