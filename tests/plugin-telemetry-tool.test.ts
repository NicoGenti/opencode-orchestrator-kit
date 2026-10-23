/**
 * tests/plugin-telemetry-tool.test.ts — Phase 4 (plan 13): the native
 * `comprehension_telemetry` tool (TDD, RED first).
 *
 * Pins the observable contract of plugin/src/comprehension-tool.ts (module
 * does NOT exist yet, this suite is expected to fail "module not found" until
 * the implementation lands):
 *   - registration via ctx.tool.transform, silent degradation without ctx.tool
 *   - JSON Schema: exactly 13 properties, action enum, additionalProperties:false
 *   - execute JSON payloads (plan-board return convention) per action
 *   - bad-argument / invalid-* / research-disabled error codes
 *   - zero dataset I/O while research is off + per-base controller persistence
 *
 * NOTHING in this suite touches the repo's real `.context/` sinks: every case
 * runs on a throwaway base directory under /tmp/opencode.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { makeRecallEvent, makeTaskEvent, validateEventLine } from "./contract-fields";
import {
  registerComprehensionTelemetryTool,
  TELEMETRY_TOOL_NAME,
} from "../plugin/src/comprehension-tool";

/** Throwaway base dirs under /tmp/opencode (never the repo's .context/). */
const tmpDirs: string[] = [];
function tempDir(prefix: string): string {
  mkdirSync("/tmp/opencode", { recursive: true });
  const dir = mkdtempSync(join("/tmp/opencode", prefix));
  tmpDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

/** Mock PluginContext whose tool.transform records exactly one tool entry. */
function mockToolCtx(sink: Array<Record<string, unknown>>): CtxWithTool {
  const ctx = {
    tool: {
      transform: (callback: (editor: { add(t: Record<string, unknown>): void }) => void) => {
        callback({
          add: (tool: Record<string, unknown>) => {
            sink.push(tool);
          },
        });
      },
    },
  };
  return ctx as unknown as CtxWithTool;
}

type CtxWithTool = Parameters<typeof registerComprehensionTelemetryTool>[0];

/** Registers and returns the single recorded tool entry. */
function registerFresh(deps?: { baseDir?: string }): Record<string, unknown> {
  const sink: Array<Record<string, unknown>> = [];
  const registered = registerComprehensionTelemetryTool(
    mockToolCtx(sink),
    deps as { baseDir?: string } | undefined,
  );
  expect(registered).toBe(true);
  expect(sink).toHaveLength(1);
  return sink[0];
}

async function runTool(tool: Record<string, unknown>, input: unknown): Promise<any> {
  const execute = tool.execute as (input: unknown) => Promise<unknown>;
  const result = await execute(input);
  expect(typeof result).toBe("string");
  return JSON.parse(result as string);
}

const GATE_LOG = join(".context", "comprehension-log.md");
const DATASET = join(".context", "research-dataset.jsonl");

const LEGAL_GATE_ROW_INPUT = {
  action: "append_gate_row",
  mode: "LIGHT",
  dci: "3/4",
  evaluator_conf: "4",
  outcome: "PASS",
  user_conf: "2",
};

const LEGAL_RECALL_ROW_INPUT = {
  action: "append_recall_row",
  plan: "0007",
  src: "stored",
  retry: 0,
  user_conf: "2",
  evaluator_conf: "4",
  dci: "3/4",
  outcome: "PASS",
};

describe("registerComprehensionTelemetryTool — registration", () => {
  test("registers exactly one tool named comprehension_telemetry, executable", () => {
    const tool = registerFresh();
    expect(tool.name).toBe(TELEMETRY_TOOL_NAME);
    expect(TELEMETRY_TOOL_NAME).toBe("comprehension_telemetry");
    expect(typeof tool.execute).toBe("function");
  });

  test("degrades silently (false, no throw) when the host has no ctx.tool.transform", () => {
    expect(registerComprehensionTelemetryTool({} as CtxWithTool)).toBe(false);
  });

  test("description spells out the append-only sinks, the payload contract and the off-state", () => {
    const description = registerFresh().description as string;
    expect(typeof description).toBe("string");
    for (const needle of [
      "append-only",
      ".context/comprehension-log.md",
      ".context/research-dataset.jsonl",
      "ok:false",
    ]) {
      expect(description).toContain(needle);
    }
    const lowered = description.toLowerCase();
    expect(lowered).toContain("research");
    expect(lowered).toMatch(/(never|not|no data).{0,60}read/i);
    expect(lowered).toMatch(/(never|not|no data).{0,60}writ(e|ten)/i);
  });

  test("input schema: object, required [action], additionalProperties false, exactly 13 properties", () => {
    const input = registerFresh().input as Record<string, any>;
    expect(input.type).toBe("object");
    expect(input.required).toEqual(["action"]);
    expect(input.additionalProperties).toBe(false);
    const properties = input.properties as Record<string, Record<string, unknown>>;
    expect(Object.keys(properties).sort()).toEqual(
      [
        "action", "base", "dci", "enabled", "evaluator_conf", "mode", "outcome",
        "plan", "recall", "retry", "src", "task", "user_conf",
      ],
    );
    expect((properties.action.enum as string[])).toEqual([
      "append_gate_row",
      "append_recall_row",
      "research_status",
      "research_set",
      "research_start_task",
      "research_task_event",
      "research_recall_event",
    ]);
    expect(properties.action.type).toBe("string");
    expect(properties.base.type).toBe("string");
    expect(properties.mode.enum).toEqual(["LIGHT", "DEEP"]);
    expect(properties.outcome.enum).toEqual(["PASS", "FAIL", "RETRY", "SKIPPED"]);
    expect(properties.src.enum).toEqual(["stored", "reconstructed"]);
    expect(properties.retry).toEqual({ type: "integer", enum: [0, 1] });
    expect(properties.enabled.type).toBe("boolean");
    expect(properties.plan).toEqual({ type: "string", pattern: "^[0-9]{4}$" });
    expect(properties.dci.type).toBe("string");
    expect(properties.evaluator_conf.type).toBe("string");
    expect(properties.user_conf.type).toBe("string");
    expect(properties.task.type).toBe("object");
    expect(properties.recall.type).toBe("object");
  });
});

describe("comprehension_telemetry — append actions", () => {
  test("append_gate_row on a fresh base creates header + row and returns the JSON payload", async () => {
    const tool = registerFresh();
    const base = tempDir("tool-gate-");
    const json = await runTool(tool, { ...LEGAL_GATE_ROW_INPUT, base });
    expect(json.ok).toBe(true);
    expect(json.created).toBe(true);
    expect(json.path).toBe(join(base, GATE_LOG));
    expect(json.row).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z mode=LIGHT DCI=3\/4 evaluator_conf=4 outcome=PASS user_conf=2$/,
    );
    const text = readFileSync(json.path, "utf8");
    expect(text.startsWith("# comprehension telemetry (one line per evaluation; no user answers)\n")).toBe(true);
    expect(text.trimEnd().endsWith(json.row)).toBe(true);
  });

  test("append_recall_row lands on the same single sink (dci1 format)", async () => {
    const tool = registerFresh();
    const base = tempDir("tool-recall-");
    const json = await runTool(tool, { ...LEGAL_RECALL_ROW_INPUT, base });
    expect(json.ok).toBe(true);
    expect(json.path).toBe(join(base, GATE_LOG));
    expect(json.row).toMatch(
      /^\d{4}-\d{2}-\d{2} \| plan=0007 \| type=dci1 \| src=stored \| retry=0 \| user_conf=2 \| evaluator_conf=4 \| DCI=3\/4 \| outcome=PASS$/,
    );
    const gate = await runTool(tool, { action: "append_gate_row", mode: "DEEP", dci: "skipped", evaluator_conf: "n/a", user_conf: "n/a", outcome: "SKIPPED", base });
    expect(gate.ok).toBe(true);
    const lines = readFileSync(join(base, GATE_LOG), "utf8").split("\n").filter((l) => l.trim() !== "");
    expect(lines).toHaveLength(3); // one header + two rows from ONE shared sink
    expect(lines[1]).toBe(json.row);
    expect(lines[2]).toBe(gate.row);
  });

  test("invalid rows come back as invalid-gate-row / invalid-recall-row with ok:false (no file write)", async () => {
    const tool = registerFresh();
    const base = tempDir("tool-badrows-");
    const gate = await runTool(tool, { ...LEGAL_GATE_ROW_INPUT, mode: "NONE", base });
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe("invalid-gate-row");
    const recall = await runTool(tool, { ...LEGAL_RECALL_ROW_INPUT, plan: "7", base });
    expect(recall.ok).toBe(false);
    expect(recall.code).toBe("invalid-recall-row");
    expect(existsSync(join(base, GATE_LOG))).toBe(false); // validation precedes any fs access
  });
});

describe("comprehension_telemetry — bad arguments", () => {
  const tool = registerFresh();

  test("missing/unknown action and non-object input → ok:false code bad-argument", async () => {
    for (const [label, input] of [
      ["empty input", {}],
      ["unknown action", { action: "frobnicate" }],
      ["action of wrong type", { action: 42 }],
      ["non-object input", 42],
      ["null input", null],
      ["missing mode for append_gate_row", { action: "append_gate_row", dci: "3/4", evaluator_conf: "4", outcome: "PASS", user_conf: "2", base: tempDir("tool-arg-") }],
      ["missing enabled for research_set", { action: "research_set" }],
      ["non-boolean enabled", { action: "research_set", enabled: "yes" }],
      ["missing task for research_task_event", { action: "research_task_event" }],
      ["missing recall for research_recall_event", { action: "research_recall_event" }],
    ] as Array<[string, unknown]>) {
      const json = await runTool(tool, input);
      expect(json.ok).toBe(false);
      expect(json.code).toBe("bad-argument");
      expect(typeof json.message).toBe("string");
      void label;
    }
  });

  test("research actions reject missing sub-fields without touching the dataset", async () => {
    const base = tempDir("tool-argsink-");
    let json = await runTool(tool, { action: "research_task_event", base });
    expect(json.code).toBe("bad-argument");
    expect(existsSync(join(base, DATASET))).toBe(false);
    json = await runTool(tool, { action: "research_recall_event", base });
    expect(json.code).toBe("bad-argument");
    expect(existsSync(join(base, DATASET))).toBe(false);
  });
});

describe("comprehension_telemetry — research lifecycle", () => {
  test("research_status on a fresh base → default; set persists across calls with the same base", async () => {
    const tool = registerFresh();
    const base = tempDir("tool-status-");
    let json = await runTool(tool, { action: "research_status", base });
    expect(json).toEqual({ ok: true, active: false, source: "default", taskIndex: 0 });
    json = await runTool(tool, { action: "research_set", enabled: true, base });
    expect(json).toEqual({ ok: true, active: true, source: "session", taskIndex: 0 });
    json = await runTool(tool, { action: "research_status", base });
    expect(json).toEqual({ ok: true, active: true, source: "session", taskIndex: 0 });
  });

  test("research_start_task with a config seed → active config + A,B alternation", async () => {
    const base = tempDir("tool-start-");
    mkdirSync(join(base, ".opencode"), { recursive: true });
    writeFileSync(
      join(base, ".opencode", "comprehension.config.json"),
      JSON.stringify({ research: { enabled: true } }, null, 2) + "\n",
      "utf-8",
    );
    const tool = registerFresh();
    let json = await runTool(tool, { action: "research_status", base });
    expect(json).toEqual({ ok: true, active: true, source: "config", taskIndex: 0 });
    json = await runTool(tool, { action: "research_start_task", base });
    expect(json.ok).toBe(true);
    expect(json.slot).toBe("A");
    expect(String(json.research_id)).toMatch(/^res-\d{8}-\d{6}-[0-9a-f]{32}$/);
    json = await runTool(tool, { action: "research_start_task", base });
    expect((json as any).slot).toBe("B");
    json = await runTool(tool, { action: "research_status", base });
    expect((json as any).taskIndex).toBe(2);
  });

  test("task/recall events append one canonical line each, no header", async () => {
    const base = tempDir("tool-events-");
    const tool = registerFresh();
    await runTool(tool, { action: "research_set", enabled: true, base });
    const json = await runTool(tool, { action: "research_start_task", base });
    const event = makeTaskEvent({ research_id: json.research_id as string, slot: "B" as const });
    const appended = await runTool(tool, { action: "research_task_event", task: event, base });
    expect(appended.ok).toBe(true);
    expect(appended.path).toBe(join(base, DATASET));
    expect(appended.line).toBe(JSON.stringify(event));
    const recall = makeRecallEvent({ research_id: json.research_id as string });
    const recallRes = await runTool(tool, { action: "research_recall_event", recall, base });
    expect(recallRes.ok).toBe(true);
    expect(recallRes.line).toBe(JSON.stringify(recall));
    const lines = readFileSync(join(base, DATASET), "utf8").split("\n").filter((l) => l.trim() !== "");
    expect(lines).toEqual([JSON.stringify(event), JSON.stringify(recall)]);
    for (const line of lines) expect(validateEventLine(JSON.parse(line))).toEqual([]);
  });

  test("invalid task/recall events → invalid-task-event / invalid-recall-event, bytes untouched", async () => {
    const base = tempDir("tool-invev-");
    const tool = registerFresh();
    await runTool(tool, { action: "research_set", enabled: true, base });
    const json = await runTool(tool, { action: "research_start_task", base });
    const priorLine = JSON.stringify(makeTaskEvent({ research_id: json.research_id as string, slot: "B" as const }));
    await runTool(tool, { action: "research_task_event", task: JSON.parse(priorLine), base });
    const prior = readFileSync(join(base, DATASET), "utf8");

    const badTask = await runTool(tool, {
      action: "research_task_event",
      task: makeTaskEvent({ agent_calls: -1 }),
      base,
    });
    expect(badTask.ok).toBe(false);
    expect(badTask.code).toBe("invalid-task-event");
    const badRecall = await runTool(tool, {
      action: "research_recall_event",
      recall: makeRecallEvent({ research_id: json.research_id as string, skipped: true, dci_delayed: "DCI=2/4" }),
      base,
    });
    expect(badRecall.ok).toBe(false);
    expect(badRecall.code).toBe("invalid-recall-event");
    expect(readFileSync(join(base, DATASET), "utf8")).toBe(prior);
  });

  test("research disabled → code research-disabled with ZERO dataset I/O (poisoned bytes stay identical)", async () => {
    const base = tempDir("tool-disabled-");
    const poisoned = '{"event":"task"\n this is not json ]}';
    mkdirSync(join(base, ".context"), { recursive: true });
    const dataset = join(base, DATASET);
    writeFileSync(dataset, poisoned, "utf-8");
    const tool = registerFresh(); // no config in this base → research inactive
    for (const [action, extra] of [
      ["research_start_task", {}],
      ["research_task_event", { task: makeTaskEvent() }],
      ["research_recall_event", { recall: makeRecallEvent() }],
    ] as const) {
      const json = await runTool(tool, { action, base, ...extra });
      expect(json.ok).toBe(false);
      expect(json.code).toBe("research-disabled");
    }
    expect(readFileSync(dataset, "utf8")).toBe(poisoned);
  });
});

describe("comprehension_telemetry — base resolution", () => {
  test("deps.baseDir is the default; an explicit input.base overrides per call", async () => {
    const defaultBase = tempDir("tool-baseA-");
    const overrideBase = tempDir("tool-baseB-");
    mkdirSync(join(overrideBase, ".opencode"), { recursive: true });
    writeFileSync(
      join(overrideBase, ".opencode", "comprehension.config.json"),
      JSON.stringify({ research: { enabled: true } }, null, 2) + "\n",
      "utf-8",
    );
    const tool = registerFresh({ baseDir: defaultBase });

    let json = await runTool(tool, { action: "research_status" });
    expect(json).toEqual({ ok: true, active: false, source: "default", taskIndex: 0 });

    // explicit override reads the OTHER base's config (active:true, source config)
    json = await runTool(tool, { action: "research_status", base: overrideBase });
    expect(json).toEqual({ ok: true, active: true, source: "config", taskIndex: 0 });

    // once more without base: the default-base controller state is unchanged
    json = await runTool(tool, { action: "research_status" });
    expect(json).toEqual({ ok: true, active: false, source: "default", taskIndex: 0 });
  });
});
