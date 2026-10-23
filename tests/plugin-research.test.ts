/**
 * tests/plugin-research.test.ts — Phase 4 (plan 13): research telemetry ported
 * into the OpenCode 2 plugin (TDD, RED first).
 *
 * Pins the observable contract of plugin/src/research.ts (module does NOT
 * exist yet, this suite is expected to fail "module not found" until the
 * implementation lands):
 *   - field freezes (TASK_FIELDS 19 / RECALL_FIELDS 8) vs tests/contract-fields.ts
 *   - makeResearchId (UTC stamp + 128-bit CSPRNG suffix, port of scripts/record-id.ts)
 *   - validateTaskEvent / validateRecallEvent = canonical validators as a
 *     STRICT SUPERSET (one ratified privacy hardening on `plan`)
 *   - ResearchController: config seed / session set / slot alternation /
 *     append-only JSONL writes / ZERO I/O while research is inactive
 *
 * NOTHING in this suite touches the repo's real `.context/` sinks: every case
 * runs on a throwaway base directory under /tmp/opencode.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { TelemetryContractError } from "../plugin/src/comprehension";
import {
  makeResearchId,
  RECALL_FIELDS as PLUGIN_RECALL_FIELDS,
  ResearchController,
  ResearchDisabledError,
  slotForTaskIndex as pluginSlot,
  TASK_FIELDS as PLUGIN_TASK_FIELDS,
  validateRecallEvent as pluginValidateRecallEvent,
  validateTaskEvent as pluginValidateTaskEvent,
} from "../plugin/src/research";

import {
  FORBIDDEN,
  makeRecallEvent,
  makeTaskEvent,
  RECALL_EXAMPLES,
  RECALL_FIELDS as CANON_RECALL_FIELDS,
  sameResearchId,
  slotForTaskIndex as canonicalSlot,
  TASK_EXAMPLES,
  TASK_FIELDS as CANON_TASK_FIELDS,
  validateEventLine,
  validateRecallEvent as canonicalValidateRecallEvent,
  validateTaskEvent as canonicalValidateTaskEvent,
  isValidResearchId,
} from "./contract-fields";

const DATASET = join(".context", "research-dataset.jsonl");

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

// ── field freezes vs the canonical source of truth ──

describe("research.ts — DatasetEventV1 field freezes", () => {
  test("TASK_FIELDS deep-equal AND order-equal the canonical 19 fields", () => {
    expect([...PLUGIN_TASK_FIELDS]).toHaveLength(19);
    expect([...PLUGIN_TASK_FIELDS]).toEqual([...CANON_TASK_FIELDS]);
  });

  test("RECALL_FIELDS deep-equal AND order-equal the canonical 8 fields", () => {
    expect([...PLUGIN_RECALL_FIELDS]).toHaveLength(8);
    expect([...PLUGIN_RECALL_FIELDS]).toEqual([...CANON_RECALL_FIELDS]);
  });
});

// ── slotForTaskIndex port ──

describe("research.ts — slotForTaskIndex", () => {
  test("port equals the canonical alternation for every legal index", () => {
    for (const i of [0, 1, 2, 3, 4, 5]) {
      expect(pluginSlot(i)).toEqual(canonicalSlot(i) as "A" | "B");
    }
    expect([0, 1, 2, 3, 4, 5].map(pluginSlot)).toEqual(["A", "B", "A", "B", "A", "B"]);
  });

  test("negative and non-integer indices throw a RangeError", () => {
    expect(() => pluginSlot(-1)).toThrow(RangeError);
    expect(() => pluginSlot(1.5)).toThrow(RangeError);
  });
});

// ── makeResearchId (port of scripts/record-id.ts) ──

describe("research.ts — makeResearchId", () => {
  test("format res-YYYYMMDD-HHMMSS-<32hex> passes the canonical validity helper", () => {
    const id = makeResearchId();
    expect(isValidResearchId(id)).toBe(true);
    expect(id.startsWith("res-")).toBe(true);
  });

  test("UTC components of the injected now form the readable stamp", () => {
    const id = makeResearchId(new Date("2026-02-01T10:00:00Z"));
    expect(id.startsWith("res-20260201-100000-")).toBe(true);
    expect(id.slice(-32)).toMatch(/^[0-9a-f]{32}$/);
  });

  test("20 draws in the same second are all unique (128-bit CSPRNG suffix)", () => {
    const now = new Date("2026-02-01T10:00:00Z");
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) ids.push(makeResearchId(now));
    expect(new Set(ids).size).toBe(20);
    for (const id of ids) {
      expect(isValidResearchId(id)).toBe(true);
      expect(id.startsWith("res-20260201-100000-")).toBe(true);
    }
  });
});

// ── validator parity: the plugin validators are a strict superset ──

type TaskCase = Record<string, unknown>;
const T = (over: Record<string, unknown> = {}): TaskCase => makeTaskEvent(over);
const R = (over: Record<string, unknown> = {}): TaskCase => makeRecallEvent(over);

function missingFieldClone(e: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const clone = { ...e };
  for (const key of keys) delete clone[key];
  return clone;
}

const TASK_BATTERY: Array<[string, unknown]> = [
  ["fallback slot B task event", T()],
  ["slot A control example", TASK_EXAMPLES[0] as unknown],
  ["slot B LIGHT example", TASK_EXAMPLES[1] as unknown],
  ["empty object", {}],
  ["event:'recall' on a task call", T({ event: "recall" })],
  ["event wrong type", T({ event: "taskX" })],
  ["schema_version 2", T({ schema_version: 2 })],
  ["legacy research_id format", T({ research_id: "res-20261007-143000" })],
  ["bad date", T({ date: "2026/10/07" })],
  ["non-string plan", T({ plan: 7 })],
  ["slot C", T({ slot: "C" })],
  ["unknown task_type", T({ task_type: "hotfix" })],
  ["unknown gate_type", T({ gate_type: "URGENT" })],
  ["negative duration", T({ duration_min: -3 })],
  ["negative agent_calls", T({ agent_calls: -1 })],
  ["float agent_calls", T({ agent_calls: 2.5 })],
  ["string agent_calls", T({ agent_calls: "3" })],
  ["input_tokens float", T({ input_tokens: 1.5 })],
  ["output_tokens string", T({ output_tokens: "3500" })],
  ["user_confidence out of range", T({ user_confidence: 6 })],
  ["evaluator_confidence out of range", T({ evaluator_confidence: 0 })],
  ["bad dci_immediate (odd denominator)", T({ dci_immediate: "DCI=3/5" })],
  ["retries out of range", T({ retries: 2 })],
  ["skipped not boolean", T({ skipped: "no" })],
  ["bad bugfix_ref", T({ bugfix_ref: "plan-0007" })],
  ["unknown tokens_source", T({ tokens_source: "measured" })],
  ["dci_delayed on task (retired)", T({ dci_delayed: "DCI=3/4" })],
  ["missing several fields", missingFieldClone(T(), ["retries", "skipped", "bugfix_ref", "tokens_source"])],
  ["LIGHT without calibration answer", T({ user_confidence: "n/a", evaluator_confidence: 4, dci_immediate: "DCI=4/4" })],
  ["classification attempt on slot A", T({ slot: "A", gate_type: "LIGHT" })],
  ["slot A with a user skip", T({ slot: "A", skipped: true })],
  ["skipped gate keeps a reading", T({ gate_type: "DEEP", skipped: true, dci_immediate: "DCI=4/4" })],
  ["skipped gate keeps a verdict", T({ gate_type: "LIGHT", skipped: true, dci_immediate: "n/a", evaluator_confidence: 4 })],
  ["NONE with retries", T({ gate_type: "NONE", user_confidence: "n/a", evaluator_confidence: "n/a", dci_immediate: "n/a", retries: 1 })],
  ["unknown key user_answer", T({ user_answer: "the length is 42" })],
  ["forbidden legacy keys", T({ ts: 123, user_conf: 5, session_id: "s-1" })],
];

const RECALL_BATTERY: Array<[string, unknown]> = [
  ["fallback recall event", R()],
  ["recall example", RECALL_EXAMPLES[0] as unknown],
  ["empty object", {}],
  ["event:'task' on a recall call", R({ event: "task" })],
  ["schema_version 2", R({ schema_version: 2 })],
  ["legacy research_id", R({ research_id: "res-20261007-154500" })],
  ["31-hex suffix", R({ research_id: "res-20261007-154500-9f3e2b7c5a41e8d02fb6c7314a95e62" })],
  ["bad date", R({ date: "09-10-2026" })],
  ["odd denominator DCI1", R({ dci_delayed: "DCI=2/5" })],
  ["dci_delayed missing on non-skipped recall", R({ skipped: false, dci_delayed: "n/a" })],
  ["evaluator_confidence out of range", R({ evaluator_confidence: 6 })],
  ["retries out of range", R({ retries: 3 })],
  ["skipped not boolean", R({ skipped: "true" })],
  ["skipped recall keeps a reading", R({ skipped: true, dci_delayed: "DCI=2/4" })],
  ["skipped recall keeps a verdict", R({ skipped: true, dci_delayed: "n/a", evaluator_confidence: 3 })],
  ["task-only field on recall", R({ gate_type: "LIGHT" })],
  ["unknown key user_answer", R({ user_answer: "again 42" })],
  ["forbidden key session_id", R({ session_id: "s-1" })],
  ["missing several fields", missingFieldClone(R(), ["retries", "skipped"])],
];

describe("validateTaskEvent / validateRecallEvent — canonical parity battery", () => {
  test("every task case produces the SAME error array on both validators", () => {
    expect(TASK_BATTERY.length).toBeGreaterThanOrEqual(15);
    for (const [label, event] of TASK_BATTERY) {
      expect(pluginValidateTaskEvent(event)).toEqual(canonicalValidateTaskEvent(event as never));
      void label;
    }
  });

  test("every recall case produces the SAME error array on both validators", () => {
    expect(RECALL_BATTERY.length).toBeGreaterThanOrEqual(8);
    for (const [label, event] of RECALL_BATTERY) {
      expect(pluginValidateRecallEvent(event)).toEqual(
        canonicalValidateRecallEvent(event as never),
      );
      void label;
    }
  });
});

describe("privacy hardening — the plugin rejects code-looking plans (strict superset)", () => {
  const CODE_PLANS = ["const leak = true;", "0007; rm -rf /", "plan text"];

  test("canonical accepts the code-looking plans, the plugin rejects them mentioning plan", () => {
    for (const plan of CODE_PLANS) {
      expect(canonicalValidateTaskEvent(T({ plan }) as never)).toEqual([]); // canonical baseline
      const errs = pluginValidateTaskEvent(T({ plan }));
      expect(errs.length).toBeGreaterThan(0);
      expect(errs.join(" ").toLowerCase()).toContain("plan");
    }
  });

  test("bare plan ids stay valid on both validators", () => {
    expect(pluginValidateTaskEvent(T({ plan: "0007" }))).toEqual([]);
    expect(pluginValidateTaskEvent(T({ plan: "" }))).toEqual([]);
  });

  test("non-string plan keeps EXACTLY the canonical message", () => {
    expect(pluginValidateTaskEvent(T({ plan: 7 }))).toEqual(["plan must be a string"]);
    expect(canonicalValidateTaskEvent(T({ plan: 7 }) as never)).toEqual(
      ["plan must be a string"],
    );
  });

  test("closed schema: unknown key user_answer is rejected by both callbacks identically", () => {
    const ev = T({ user_answer: "the length is 42" });
    expect(pluginValidateTaskEvent(ev)).toEqual(canonicalValidateTaskEvent(ev as never));
    expect(pluginValidateTaskEvent(ev).some((m) => m.includes("unknown field: user_answer"))).toBe(true);
  });

  test("FORBIDDEN keys ts / user_conf / session_id are rejected on both event types", () => {
    const badTask = T({ ts: 123, user_conf: 5, session_id: "s-1" });
    expect(pluginValidateTaskEvent(badTask)).toEqual(canonicalValidateTaskEvent(badTask as never));
    for (const key of ["ts", "user_conf", "session_id"]) {
      expect(FORBIDDEN.has(key as never)).toBe(true);
      expect(
        pluginValidateTaskEvent(T({ [key]: 1 })).some((m) => m.includes(`forbidden field: ${key}`)),
      ).toBe(true);
    }
    const badRecall = R({ user_conf: 5 });
    expect(pluginValidateRecallEvent(badRecall)).toEqual(
      canonicalValidateRecallEvent(badRecall as never),
    );
  });
});

// ── ResearchController ──

function writeResearchConfig(base: string, research: Record<string, unknown>): void {
  mkdirSync(join(base, ".opencode"), { recursive: true });
  writeFileSync(
    join(base, ".opencode", "comprehension.config.json"),
    JSON.stringify({ research }, null, 2) + "\n",
    "utf-8",
  );
}

describe("ResearchController — status from config / session", () => {
  test("config absent → inactive with source default (config read never touches the dataset)", () => {
    const base = tempDir("ctl-absent-");
    const controller = new ResearchController(base);
    expect(controller.status()).toEqual({ active: false, source: "default", taskIndex: 0 });
    expect(existsSync(join(base, ".context"))).toBe(false);
  });

  test("config seed research.enabled true → active with source config", () => {
    const base = tempDir("ctl-cfg-on-");
    writeResearchConfig(base, { enabled: true });
    const controller = new ResearchController(base);
    expect(controller.status()).toEqual({ active: true, source: "config", taskIndex: 0 });
  });

  test("config seed research.enabled false → inactive with source default", () => {
    const base = tempDir("ctl-cfg-off-");
    writeResearchConfig(base, { enabled: false });
    const controller = new ResearchController(base);
    expect(controller.status()).toEqual({ active: false, source: "default", taskIndex: 0 });
  });

  test("set(true) → active with source session; set(false) → session source and taskIndex reset", async () => {
    const base = tempDir("ctl-set-");
    const controller = new ResearchController(base);
    const on = await controller.set(true);
    expect(on).toEqual({ active: true, source: "session", taskIndex: 0 });
    expect(controller.status().source).toBe("session");
    await controller.startTask();
    await controller.startTask();
    expect(controller.status().taskIndex).toBe(2);
    const off = await controller.set(false);
    expect(off).toEqual({ active: false, source: "session", taskIndex: 0 });
    // reactivation resets the alternation counter: the next task is slot A again
    await controller.set(true);
    const task = await controller.startTask();
    expect(task.slot).toBe("A");
  });
});

describe("ResearchController — startTask when inactive → ZERO fs access", () => {
  test("startTask / appendTaskEvent / appendRecallEvent all throw ResearchDisabledError code research-disabled, and .context/ stays absent", async () => {
    const base = tempDir("ctl-zero-");
    const controller = new ResearchController(base);
    const attempts = [
      () => controller.startTask(),
      () => controller.appendTaskEvent(makeTaskEvent()),
      () => controller.appendRecallEvent(makeRecallEvent()),
    ];
    for (const attempt of attempts) {
      let err: unknown;
      try {
        await attempt();
      } catch (error) {
        err = error;
      }
      expect(err).toBeInstanceOf(ResearchDisabledError);
      expect((err as Error).name).toBe("ResearchDisabledError");
      expect((err as { code?: unknown }).code).toBe("research-disabled");
    }
    expect(existsSync(join(base, ".context"))).toBe(false);
    expect(existsSync(join(base, DATASET))).toBe(false);
  });

  test("pre-poisoned dataset file stays BYTE-IDENTICAL after every inactive attempt", async () => {
    const base = tempDir("ctl-poison-");
    const poisoned = '{"event":"task"\n this is not json ]}';
    mkdirSync(join(base, ".context"), { recursive: true });
    const dataset = join(base, DATASET);
    writeFileSync(dataset, poisoned, "utf-8");
    const controller = new ResearchController(base);
    for (const attempt of [
      () => controller.startTask(),
      () => controller.appendTaskEvent(makeTaskEvent()),
      () => controller.appendRecallEvent(makeRecallEvent()),
    ]) {
      let threw = false;
      try {
        await attempt();
      } catch (error) {
        threw = true;
        expect(error).toBeInstanceOf(ResearchDisabledError);
      }
      expect(threw).toBe(true);
    }
    expect(readFileSync(dataset, "utf8")).toBe(poisoned);
  });
});

describe("ResearchController — active lifecycle", () => {
  test("slots alternate A,B,A,B and all four ids are unique, valid and time-pinned via options.now", async () => {
    const base = tempDir("ctl-slots-");
    const controller = new ResearchController(base, {
      now: () => new Date("2026-02-01T10:00:00Z"),
    });
    await controller.set(true);
    const ids: string[] = [];
    const slots: string[] = [];
    for (let i = 0; i < 4; i++) {
      const task = await controller.startTask();
      ids.push(task.research_id);
      slots.push(task.slot);
    }
    expect(slots).toEqual(["A", "B", "A", "B"]);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) {
      expect(isValidResearchId(id)).toBe(true);
      expect(id.startsWith("res-20260201-100000-")).toBe(true);
    }
  });

  test("task events: exact bytes as given, NO header, every line canonically valid", async () => {
    const base = tempDir("ctl-append-");
    const controller = new ResearchController(base);
    await controller.set(true);
    const first = await controller.startTask(); // slot A
    const eventA = makeTaskEvent({
      research_id: first.research_id,
      slot: "A",
      gate_type: "n/a",
      user_confidence: "n/a",
      evaluator_confidence: "n/a",
      dci_immediate: "n/a",
      retries: 0,
      skipped: false,
      plan: "",
    });
    const second = await controller.startTask(); // slot B
    const eventB = makeTaskEvent({ research_id: second.research_id, slot: "B" });

    const resultA = await controller.appendTaskEvent(eventA);
    expect(resultA.ok).toBe(true);
    expect(resultA.path).toBe(join(base, DATASET));
    expect(resultA.line).toBe(JSON.stringify(eventA));
    const dataset = join(base, DATASET);
    expect(readFileSync(dataset, "utf8")).toBe(`${JSON.stringify(eventA)}\n`);

    await controller.appendTaskEvent(eventB);
    // key order as given; JSONL has NO header
    expect(readFileSync(dataset, "utf8")).toBe(
      `${JSON.stringify(eventA)}\n${JSON.stringify(eventB)}\n`,
    );
    for (const line of readFileSync(dataset, "utf8").split("\n").filter((l) => l.trim() !== "")) {
      expect(validateEventLine(JSON.parse(line))).toEqual([]);
    }
  });

  test("recall event correlates through the SAME research_id (append-only, no rewrite)", async () => {
    const base = tempDir("ctl-recall-");
    const controller = new ResearchController(base);
    await controller.set(true);
    await controller.startTask();
    const second = await controller.startTask();
    const taskEvent = makeTaskEvent({ research_id: second.research_id, slot: "B" });
    await controller.appendTaskEvent(taskEvent);
    const recall = makeRecallEvent({ research_id: second.research_id });
    const result = await controller.appendRecallEvent(recall);
    expect(result.ok).toBe(true);
    expect(result.line).toBe(JSON.stringify(recall));
    const dataset = join(base, DATASET);
    const lines = readFileSync(dataset, "utf8").split("\n").filter((l) => l.trim() !== "");
    expect(lines).toHaveLength(2);
    expect(readFileSync(dataset, "utf8")).toBe(
      `${JSON.stringify(taskEvent)}\n${JSON.stringify(recall)}\n`,
    );
    expect(sameResearchId(JSON.parse(lines[0]), JSON.parse(lines[1]))).toBe(true);
    for (const line of lines) expect(validateEventLine(JSON.parse(line))).toEqual([]);
  });

  test("invalid task event → TelemetryContractError (single class identity) mentioning the field; prior bytes untouched", async () => {
    const base = tempDir("ctl-invalid-");
    const controller = new ResearchController(base);
    await controller.set(true);
    const task = await controller.startTask();
    await controller.appendTaskEvent(makeTaskEvent({ research_id: task.research_id, slot: "B" }));
    const dataset = join(base, DATASET);
    const before = readFileSync(dataset, "utf8");

    let err: unknown;
    try {
      await controller.appendTaskEvent(makeTaskEvent({ agent_calls: -1 }));
    } catch (error) {
      err = error;
    }
    expect(err).toBeInstanceOf(TelemetryContractError); // the SAME class the telemetry tool dispatches on
    expect((err as Error).name).toBe("TelemetryContractError");
    expect((err as Error).message).toContain("agent_calls");
    expect(readFileSync(dataset, "utf8")).toBe(before);

    let recallErr: unknown;
    try {
      await controller.appendRecallEvent(
        makeRecallEvent({ research_id: task.research_id, skipped: true, dci_delayed: "DCI=2/4" }),
      );
    } catch (error) {
      recallErr = error;
    }
    expect(recallErr).toBeInstanceOf(TelemetryContractError);
    expect((recallErr as Error).message).toContain("dci_delayed");
    expect(readFileSync(dataset, "utf8")).toBe(before);
  });
});
