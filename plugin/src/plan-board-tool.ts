import { runPlanBoard } from "./plan-board";
import type { PluginContext } from "./runtime/opencode-plugin";

/** Name under which the native plan-board tool is registered. */
export const PLAN_BOARD_TOOL_NAME = "plan_board";

/**
 * Tool documentation shown to the model. It must spell out the deterministic
 * CLI port contract, the exit codes and the standing authorization copied
 * from the plan-board lifecycle rules.
 */
export const PLAN_BOARD_TOOL_DESCRIPTION = [
  "Deterministic port of the plan-board CLI for the kit's plan/ column board: `check` audits board structure, `move` promotes a plan between columns, `new` creates a plan from a nine-section markdown body and `adopt` normalises a legacy file; the outcome is returned as a JSON payload.",
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
      enum: ["none", "pass", "skipped", "fail", "disabled", "n/a"],
      description: "Comprehension verdict recorded when moving to complete.",
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
 * Tool implementation: runs the pure port (which never throws) and returns
 * its JSON payload as a pretty-printed string.
 */
export function executePlanBoardTool(input: unknown): string {
  const { payload } = runPlanBoard(planBoardArgv(input));
  return JSON.stringify(payload, null, 2);
}

/**
 * Registers the native `plan_board` tool through `ctx.tool.transform`.
 * Returns true iff registered; when the host does not expose `ctx.tool` the
 * registration degrades silently to keep setup successful.
 */
export function registerPlanBoardTool(ctx: PluginContext): boolean {
  if (typeof ctx.tool?.transform !== "function") {
    return false; // silent degradation — no warning
  }
  ctx.tool.transform((editor) => {
    editor.add({
      name: PLAN_BOARD_TOOL_NAME,
      description: PLAN_BOARD_TOOL_DESCRIPTION,
      input: PLAN_BOARD_TOOL_INPUT,
      execute: executePlanBoardTool,
    });
  });
  return true;
}
