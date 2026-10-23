/**
 * comprehension-tool.ts — Phase 4 (plan 13): the native
 * `comprehension_telemetry` tool (pinned by tests/plugin-telemetry-tool.test.ts).
 *
 * Mirrors `registerPlanBoardTool` (plugin/src/plan-board-tool.ts): registered
 * through `ctx.tool.transform`, returning `false` silently when the host does
 * not expose `ctx.tool` so plugin setup stays successful. `execute` follows
 * the plan-board return convention: an async function returning a pretty-
 * printed STRING JSON payload — `{ok:true,...}` on success and
 * `{ok:false, code, message}` on any contract violation, never a thrown
 * error to the host.
 *
 * Error codes by cause:
 *   - `bad-argument` — missing/unknown action, missing action-required input
 *     fields, non-object input;
 *   - `invalid-gate-row` / `invalid-recall-row` / `invalid-task-event` /
 *     `invalid-recall-event` — `TelemetryContractError` from the writers or
 *     the dataset validators;
 *   - `research-disabled` — `ResearchDisabledError` (zero dataset I/O).
 *
 * Controllers are cached per resolved base directory within one registration,
 * so `research_status` / `research_set` state persists across calls for the
 * same base.
 */
import type { PluginContext } from "./runtime/opencode-plugin";

import {
  appendGateRow,
  appendRecallRow,
  TelemetryContractError,
} from "./comprehension";
import {
  ResearchController,
  ResearchDisabledError,
} from "./research";

/** Name under which the native comprehension telemetry tool is registered. */
export const TELEMETRY_TOOL_NAME = "comprehension_telemetry";

/** Allowed tool actions, in the pinned enum order. */
const TELEMETRY_ACTIONS = [
  "append_gate_row",
  "append_recall_row",
  "research_status",
  "research_set",
  "research_start_task",
  "research_task_event",
  "research_recall_event",
] as const;

type TelemetryAction = (typeof TELEMETRY_ACTIONS)[number];

/** Keys consumed by the append actions (for the bad-argument presence gate). */
const GATE_ROW_KEYS = ["mode", "dci", "evaluator_conf", "outcome", "user_conf"] as const;
const RECALL_ROW_KEYS = [
  "plan", "src", "retry", "user_conf", "evaluator_conf", "dci", "outcome",
] as const;

/**
 * Tool documentation shown to the model: the append-only sinks, the payload
 * contract and the off-state guarantee (the dataset is never read nor
 * written while research mode is off).
 */
export const TELEMETRY_TOOL_DESCRIPTION = [
  "Comprehension + research telemetry writer for the kit's `.context/` session memory.",
  "Fields are validated BEFORE anything touches the filesystem; any drift answers `{ok:false, code, message}` and no file changes.",
  "Sinks (strictly append-only, header once, rows only after): `.context/comprehension-log.md` for dci0 gate rows and dci1 recall rows, `.context/research-dataset.jsonl` for research task/recall events (JSONL, no header).",
  "Research mode is off until the config seed `research.enabled: true` or an explicit `research_set`; while research is off the dataset is never read nor written (zero-I/O contract), never at bootstrap.",
].join(" ");

/** JSON Schema of the tool input (exactly 13 properties, action required). */
export const TELEMETRY_TOOL_INPUT: Record<string, unknown> = {
  type: "object",
  required: ["action"],
  additionalProperties: false,
  properties: {
    action: {
      type: "string",
      enum: [...TELEMETRY_ACTIONS],
      description: "Telemetry action to run.",
    },
    base: {
      type: "string",
      description: "Session base directory (defaults to the plugin base dir or the process cwd).",
    },
    mode: {
      type: "string",
      enum: ["LIGHT", "DEEP"],
    },
    dci: {
      type: "string",
    },
    evaluator_conf: {
      type: "string",
    },
    outcome: {
      type: "string",
      enum: ["PASS", "FAIL", "RETRY", "SKIPPED"],
    },
    user_conf: {
      type: "string",
    },
    plan: {
      type: "string",
      pattern: "^[0-9]{4}$",
    },
    src: {
      type: "string",
      enum: ["stored", "reconstructed"],
    },
    retry: {
      type: "integer",
      enum: [0, 1],
    },
    enabled: {
      type: "boolean",
    },
    task: {
      type: "object",
    },
    recall: {
      type: "object",
    },
  },
};

/** Optional dependencies (all optional). */
export interface TelemetryToolDependencies {
  /** Default base directory used when the call carries no `base` input. */
  baseDir?: string;
}

/** Serializes a payload the way the plan-board tool does (pretty JSON string). */
function toPayload(payload: Record<string, unknown>): string {
  return JSON.stringify(payload, null, 2);
}

/** Standard failure payload. */
function fail(code: string, message: string): Record<string, unknown> {
  return { ok: false, code, message };
}

/** True when `value` is a non-null, non-array object. */
function isRowObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Executes one telemetry call against a resolved base. HOME of the dispatch
 * contract: see the module doc block for the result-shape table.
 */
async function executeTelemetryTool(
  input: unknown,
  deps: TelemetryToolDependencies | undefined,
  controllers: Map<string, ResearchController>,
): Promise<string> {
  if (!isRowObject(input)) {
    return toPayload(fail("bad-argument", "input must be an object with an action field"));
  }
  const record = input;
  const action = record.action;
  if (
    typeof action !== "string" ||
    !(TELEMETRY_ACTIONS as readonly string[]).includes(action)
  ) {
    return toPayload(
      fail("bad-argument", `action must be one of ${TELEMETRY_ACTIONS.join("|")}`),
    );
  }
  const base =
    typeof record.base === "string" && record.base.length > 0
      ? record.base
      : deps?.baseDir ?? process.cwd();
  let controller = controllers.get(base);
  if (!controller) {
    controller = new ResearchController(base);
    controllers.set(base, controller);
  }

  switch (action as TelemetryAction) {
    // ── append actions (validation precedes any fs access) ──
    case "append_gate_row": {
      const missing = GATE_ROW_KEYS.filter((key) => !(key in record));
      if (missing.length > 0) {
        return toPayload(fail("bad-argument", `missing action field(s) for append_gate_row: ${missing.join(", ")}`));
      }
      try {
        const { path, row, created } = await appendGateRow(base, {
          mode: record.mode,
          dci: record.dci,
          evaluator_conf: record.evaluator_conf,
          outcome: record.outcome,
          user_conf: record.user_conf,
        });
        return toPayload({ ok: true, path, row, created });
      } catch (error) {
        if (error instanceof TelemetryContractError) {
          return toPayload(fail("invalid-gate-row", error.message));
        }
        return toPayload(fail("internal-error", String(error)));
      }
    }
    case "append_recall_row": {
      const missing = RECALL_ROW_KEYS.filter((key) => !(key in record));
      if (missing.length > 0) {
        return toPayload(fail("bad-argument", `missing action field(s) for append_recall_row: ${missing.join(", ")}`));
      }
      try {
        const { path, row, created } = await appendRecallRow(base, {
          plan: record.plan,
          src: record.src,
          retry: record.retry,
          user_conf: record.user_conf,
          evaluator_conf: record.evaluator_conf,
          dci: record.dci,
          outcome: record.outcome,
        });
        return toPayload({ ok: true, path, row, created });
      } catch (error) {
        if (error instanceof TelemetryContractError) {
          return toPayload(fail("invalid-recall-row", error.message));
        }
        return toPayload(fail("internal-error", String(error)));
      }
    }
    // ── research lifecycle (ResearchDisabledError → research-disabled code) ──
    case "research_status": {
      return toPayload({ ok: true, ...controller.status() });
    }
    case "research_set": {
      if (typeof record.enabled !== "boolean") {
        return toPayload(fail("bad-argument", "research_set needs a boolean enabled field"));
      }
      return toPayload({ ok: true, ...(await controller.set(record.enabled)) });
    }
    default: {
      try {
        if (action === "research_start_task") {
          const task = await controller.startTask();
          return toPayload({ ok: true, research_id: task.research_id, slot: task.slot });
        }
        if (action === "research_task_event") {
          if (!isRowObject(record.task)) {
            return toPayload(fail("bad-argument", "research_task_event needs a task object"));
          }
          const result = await controller.appendTaskEvent(record.task);
          return toPayload({ ok: true, path: result.path, line: result.line });
        }
        // action === "research_recall_event" (the only remaining action).
        if (!isRowObject(record.recall)) {
          return toPayload(fail("bad-argument", "research_recall_event needs a recall object"));
        }
        const result = await controller.appendRecallEvent(record.recall);
        return toPayload({ ok: true, path: result.path, line: result.line });
      } catch (error) {
        if (error instanceof ResearchDisabledError) {
          return toPayload(fail("research-disabled", error.message));
        }
        if (error instanceof TelemetryContractError) {
          return toPayload(
            fail(
              action === "research_task_event" ? "invalid-task-event" : "invalid-recall-event",
              error.message,
            ),
          );
        }
        return toPayload(fail("internal-error", String(error)));
      }
    }
  }
}

/**
 * Registers the native `comprehension_telemetry` tool through
 * `ctx.tool.transform`. Returns true iff registered; when the host does not
 * expose `ctx.tool` the registration degrades silently (no warning), keeping
 * plugin setup successful.
 */
export function registerComprehensionTelemetryTool(
  ctx: PluginContext,
  deps?: TelemetryToolDependencies,
): boolean {
  if (typeof ctx.tool?.transform !== "function") {
    return false; // silent degradation — no warning
  }
  const controllers = new Map<string, ResearchController>();
  ctx.tool.transform((editor) => {
    editor.add({
      name: TELEMETRY_TOOL_NAME,
      description: TELEMETRY_TOOL_DESCRIPTION,
      input: TELEMETRY_TOOL_INPUT,
      execute: (input: unknown) => executeTelemetryTool(input, deps, controllers),
    });
  });
  return true;
}
