import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FORBIDDEN, TUPLE_FIELDS, EXAMPLES, makeTuple, validateTuple } from "./contract-fields.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const md = (_path: string) =>
  readFileSync(join(repoRoot, _path), "utf8");

test("RM0: research mode is zero-overhead when inactive", () => {
  const doc = md("command/research-mode.md");
  expect(doc.includes("When inactive — zero overhead")).toBe(true);
  expect(doc.includes("the dataset file is never read, never written")).toBe(true);
});

// ——— Deterministic schema checks: assertions run on parsed JSON tuples, not prose tokens ———

test("RM4: ResearchTupleV1 has exactly 17 contract fields (both example slots)", () => {
  // RM4 — the sole field-contract reference: every example tuple must have exactly 17 fields.
  for (const tuple of EXAMPLES) {
    expect(Object.keys(tuple).length).toBe(17);
    for (const f of TUPLE_FIELDS) {
      if (!(f in tuple)) throw new Error(`missing contract field: ${f}`);
    }
  }
});

test("RM4a: contract field order is stable", () => {
  expect(TUPLE_FIELDS).toEqual([
    "date", "plan", "slot", "task_type", "gate_type", "duration_min", "agent_calls",
    "input_tokens", "output_tokens", "user_confidence", "evaluator_confidence",
    "dci_immediate", "dci_delayed", "retries", "skipped", "bugfix_ref", "tokens_source",
  ]);
});

test("RM5: tokens_source enum is estimated|exact; estimate/actual are retired", () => {
  expect(validateTuple(makeTuple({ tokens_source: "exact", input_tokens: 18900, output_tokens: 3400 }))).toEqual([]);
  expect(validateTuple(makeTuple({ tokens_source: "estimate" })).join(" ")).toContain("must be estimated|exact");
  expect(validateTuple(makeTuple({ tokens_source: "actual" })).join(" ")).toContain("must be estimated|exact");
  const doc = md("command/research-mode.md");
  expect(doc.includes('"estimate"')).toBe(false);
  expect(doc.includes('"actual"')).toBe(false);
  expect(doc.includes('"estimated" (default) | "exact"')).toBe(true);
});

test("RM6: forbidden v0.6.0 extras absent from the parsed example tuples", () => {
  for (const tuple of EXAMPLES) {
    for (const k of Object.keys(tuple)) {
      if (FORBIDDEN.has(k)) throw new Error(`forbidden field in example tuple: ${k}`);
    }
    expect(validateTuple(tuple)).toEqual([]);
  }
});

test("RM1: slot A (control) emits gate n/a, no confidence, skipped, estimated tokens", () => {
  const doc = md("command/research-mode.md");
  expect(doc.includes("Slot A (control)")).toBe(true);
  const a = EXAMPLES[0];
  expect(a.slot).toBe("A");
  expect(a.gate_type).toBe("n/a");
  expect(a.user_confidence).toBe("n/a");
  expect(a.evaluator_confidence).toBe("n/a");
  expect(a.dci_immediate).toBe("n/a");
  expect(a.skipped).toBe(true);
  expect(a.tokens_source).toBe("estimated");
});

test("RM2: user_confidence and evaluator_confidence are distinct scalar fields in the slot B tuple", () => {
  const b = EXAMPLES[1];
  expect(b.slot).toBe("B");
  expect(b.user_confidence).toBe(2);          // developer self-rating (calibration)
  expect(b.evaluator_confidence).toBe(4);     // coach confidence at the passing check
  // not conflated: two different values under two different keys
  expect(b.user_confidence).not.toBe(b.evaluator_confidence);
});

test("RM3: /recall never runs inside the task lifecycle; dci_delayed stays n/a at write time", () => {
  const doc = md("command/research-mode.md");
  const flow = doc.slice(doc.indexOf("## Behavioral A/B flow"));
  expect(flow.includes("outside the task lifecycle")).toBe(true);
  expect(flow.includes("→ /recall")).toBe(false);
  expect(flow.includes("run /recall")).toBe(false);
  for (const tuple of EXAMPLES) expect(tuple.dci_delayed).toBe("n/a");
});

test("RM7: every example line emits exactly the 17 contract fields, contract key order", () => {
  const doc = md("command/research-mode.md");
  const objs: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const start = doc.indexOf('{"date"', from);
    if (start < 0) break;
    objs.push(JSON.parse(doc.slice(start, doc.indexOf("}", start) + 1)) as Record<string, unknown>);
    from = start + 1;
  }
  const order = [...TUPLE_FIELDS];
  const sorted = [...order].sort();
  for (const obj of objs) {
    expect(Object.keys(obj).sort()).toEqual(sorted);
    expect(Object.keys(obj)).toEqual(order);
  }
  expect(objs.length).toBe(EXAMPLES.length);
});

test("RM8: slots alternate A→B in activation order", () => {
  expect(EXAMPLES.map((t) => t.slot)).toEqual(["A", "B"]);
});