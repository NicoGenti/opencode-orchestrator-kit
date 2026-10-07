/**
 * tests/research-mode.test.ts — Research Mode behavioral tests (v0.6.4)
 *
 * These tests invoke the pure source of truth in contract-fields.ts
 * (DatasetEventV1 event model, deterministic A/B slot routing, validators) —
 * they do not grep prose. Prose pins for command/research-mode.md live in
 * workflow-hardening.test.ts; this file checks BEHAVIOR:
 *   - research_id uniqueness + task↔recall correlation
 *   - append-only dataset: recall is a NEW event with the SAME research_id,
 *     no row rewriting anywhere (dci_delayed is retired as a task field)
 *   - slot A = control: no classification, no gate, no calibration,
 *     never a user skip, agent_calls still faithful
 *   - slot B = treatment: NONE/LIGHT/DEEP classification + gate + coach
 *   - metric truthfulness: agent_calls counts ALL delegations;
 *     user_confidence and evaluator_confidence are distinct fields
 *   - the real sink (.context/research-dataset.jsonl), when it exists, is a
 *     valid, correlation-closed event log
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXAMPLES, TASK_EXAMPLES, RECALL_EXAMPLES, makeTaskEvent, makeRecallEvent,
  validateTaskEvent, validateRecallEvent, validateEventLine, sameResearchId,
  slotForTaskIndex, nextSlot, SLOT_BEHAVIOR, gateRequiresCoach,
  isValidResearchId, validDCI, GATE_TYPES, TASK_FIELDS, RECALL_FIELDS,
  SCHEMA_VERSION, FORBIDDEN,
} from "./contract-fields.ts";

const SINK = join(import.meta.dir, "..", ".context", "research-dataset.jsonl");

describe("research-mode — DatasetEventV1 schema (v0.6.4)", () => {
  test("task event = ResearchTupleV1: 19 fields incl. research_id, no dci_delayed", () => {
    expect(TASK_FIELDS).toHaveLength(19);
    expect(TASK_FIELDS).toContain("research_id");
    expect(TASK_FIELDS).not.toContain("dci_delayed");
    expect(RECALL_FIELDS).toHaveLength(8);
    expect(SCHEMA_VERSION).toBe(1);
    expect(GATE_TYPES).toEqual(["n/a", "NONE", "LIGHT", "DEEP"]);
  });

  test("legacy extras and session identifiers are forbidden anywhere in the log", () => {
    for (const f of ["ts", "session_id", "task_id", "user_conf", "dci1", "gap",
                     "src", "confidence_delta", "escalations", "questions_count",
                     "alternation"]) {
      expect(FORBIDDEN.has(f)).toBe(true);
    }
    const errs = validateTaskEvent(makeTaskEvent({ ts: 123, user_conf: 5 }));
    expect(errs.some((m) => m.includes("unknown field: ts"))).toBe(true);
    expect(errs.some((m) => m.includes("forbidden field: ts"))).toBe(true);
    expect(errs.some((m) => m.includes("forbidden field: user_conf"))).toBe(true);
  });

  test("dci_delayed is retired as a task field (the delayed reading is a recall event)", () => {
    const errs = validateTaskEvent(makeTaskEvent({ dci_delayed: "DCI=2/4" }));
    expect(errs.some((m) => m.includes("dci_delayed is not a task field"))).toBe(true);
  });
});

describe("research-mode — research_id uniqueness + correlation", () => {
  test("format res-YYYYMMDD-HHMMSS is validated deterministically", () => {
    expect(isValidResearchId("res-20261007-143000")).toBe(true);
    expect(isValidResearchId("res-2026100-143000")).toBe(false);
    expect(isValidResearchId("res-20261007-1430001")).toBe(false);
    expect(isValidResearchId("task-20261007-143000")).toBe(false);
    expect(isValidResearchId(20261007)).toBe(false);
  });

  test("every task gets its own research_id; plan is metadata, never the identifier", () => {
    for (const t of TASK_EXAMPLES) expect(isValidResearchId(t.research_id)).toBe(true);
    const ids = new Set(TASK_EXAMPLES.map((t) => t.research_id));
    expect(ids.size).toBe(TASK_EXAMPLES.length); // unique per task
    // two events with the SAME plan but distinct research_ids both validate:
    expect(validateTaskEvent(makeTaskEvent({ research_id: "res-20261007-150000", plan: "0007" }))).toEqual([]);
    expect(validateTaskEvent(makeTaskEvent({ research_id: "res-20261007-160000", plan: "0007" }))).toEqual([]);
  });

  test("a recall event ties to its task through the SAME research_id", () => {
    expect(sameResearchId(TASK_EXAMPLES[1], RECALL_EXAMPLES[0])).toBe(true);
    expect(sameResearchId(TASK_EXAMPLES[0], RECALL_EXAMPLES[0])).toBe(false);
    expect(sameResearchId({ ...TASK_EXAMPLES[1], research_id: "res-20261007-000000" }, RECALL_EXAMPLES[0])).toBe(false);
  });
});

describe("research-mode — deterministic A/B slot routing", () => {
  test("alternation: even index = A, odd index = B", () => {
    expect([0, 1, 2, 3, 4, 5].map(slotForTaskIndex)).toEqual(["A", "B", "A", "B", "A", "B"]);
  });

  test("rejects negative / non-integer indices", () => {
    expect(() => slotForTaskIndex(-1)).toThrow();
    expect(() => slotForTaskIndex(1.5)).toThrow();
  });

  test("nextSlot toggles and is involutive", () => {
    expect(nextSlot("A")).toBe("B");
    expect(nextSlot("B")).toBe("A");
    expect(nextSlot(nextSlot("A"))).toBe("A");
  });

  test("SLOT_BEHAVIOR: A = control (no classification/gate/coach), B = treatment", () => {
    expect(SLOT_BEHAVIOR.A).toMatchObject({
      classification: false, gate: false, gateType: "n/a",
      coachCalls: 0, calibration: false, skippedPossible: false,
    });
    expect(SLOT_BEHAVIOR.B).toMatchObject({
      classification: true, gate: true, calibration: true, skippedPossible: true,
    });
    expect(typeof SLOT_BEHAVIOR.B.gateType).toBe("string");
  });
});

describe("research-mode — slot A: control, no comprehension overhead", () => {
  test("example slot A event: gate n/a, no confidences, no DCI reading, 0 retries", () => {
    const a = TASK_EXAMPLES[0];
    expect(a.slot).toBe("A");
    expect(a.gate_type).toBe("n/a");
    expect(a.user_confidence).toBe("n/a");
    expect(a.evaluator_confidence).toBe("n/a");
    expect(a.dci_immediate).toBe("n/a");
    expect(a.retries).toBe(0);
    expect(gateRequiresCoach("n/a")).toBe(false);
    expect(validateTaskEvent(a)).toEqual([]);
  });

  test("control ≠ user skip: slot A records skipped=false and rejects skipped=true", () => {
    expect(TASK_EXAMPLES[0].skipped).toBe(false);
    expect(SLOT_BEHAVIOR.A.skippedPossible).toBe(false);
    const errs = validateTaskEvent(makeTaskEvent({
      slot: "A", gate_type: "n/a", user_confidence: "n/a",
      evaluator_confidence: "n/a", dci_immediate: "n/a", retries: 0, skipped: true,
    }));
    expect(errs).toContain("slot A never records a user skip (control ≠ skip)");
  });

  test("any classification attempt on slot A is rejected", () => {
    const errs = validateTaskEvent(makeTaskEvent({
      slot: "A", gate_type: "LIGHT", user_confidence: "n/a",
      evaluator_confidence: "n/a", dci_immediate: "n/a", retries: 0, skipped: false,
    }));
    expect(errs).toContain("slot A records gate_type n/a");
  });

  test("slot A stays valid with real delegation work (agent_calls faithful)", () => {
    expect(validateTaskEvent(makeTaskEvent({
      slot: "A", gate_type: "n/a", user_confidence: "n/a",
      evaluator_confidence: "n/a", dci_immediate: "n/a", retries: 0, skipped: false,
    }))).toEqual([]);
    expect(TASK_EXAMPLES[0].agent_calls).toBe(2); // control used subagents → NOT 0
    expect(TASK_EXAMPLES[0].agent_calls).toBeGreaterThan(0);
  });
});

describe("research-mode — slot B: classification + gate enabled", () => {
  test("example slot B event: LIGHT classified, both confidences 1-5, DCI0 recorded", () => {
    const b = TASK_EXAMPLES[1];
    expect(b.slot).toBe("B");
    expect(b.gate_type).toBe("LIGHT");
    expect(gateRequiresCoach("LIGHT")).toBe(true);
    expect(b.user_confidence).toBe(2);
    expect(b.evaluator_confidence).toBe(4);
    expect(b.user_confidence).not.toBe(b.evaluator_confidence); // distinct fields
    expect(validDCI(b.dci_immediate)).toBe(true);
    expect(b.retries).toBe(1);
    expect(b.skipped).toBe(false);
    expect(validateTaskEvent(b)).toEqual([]);
  });

  test("gate coach mapping: NONE / no-gate → no coach; LIGHT / DEEP → coach", () => {
    expect(gateRequiresCoach("NONE")).toBe(false);
    expect(gateRequiresCoach("n/a")).toBe(false);
    expect(gateRequiresCoach("LIGHT")).toBe(true);
    expect(gateRequiresCoach("DEEP")).toBe(true);
  });

  test("NONE classification: no calibration, no reading, nothing to skip", () => {
    expect(validateTaskEvent(makeTaskEvent({
      gate_type: "NONE", user_confidence: "n/a", evaluator_confidence: "n/a",
      dci_immediate: "n/a", retries: 0, skipped: false,
    }))).toEqual([]);
    const badNone = makeTaskEvent({
      gate_type: "NONE", user_confidence: "n/a", evaluator_confidence: "n/a",
      dci_immediate: "n/a", retries: 1, skipped: false,
    });
    expect(validateTaskEvent(badNone)).toContain("NONE: no retries");
  });

  test("gate without skip requires a real calibration + evaluation + DCI0 reading", () => {
    const errs = validateTaskEvent(makeTaskEvent({
      gate_type: "LIGHT", user_confidence: "n/a", evaluator_confidence: 4,
      dci_immediate: "DCI=4/4", retries: 0, skipped: false,
    }));
    expect(errs.some((m) => m.includes("user_confidence must be 1-5"))).toBe(true);
  });
});

describe("research-mode — skipped gate semantics (a user skip is not the control)", () => {
  test("DEEP + user skip: no verdict, no reading; user_confidence is unconstrained", () => {
    expect(validateTaskEvent(makeTaskEvent({
      gate_type: "DEEP", skipped: true, dci_immediate: "n/a", evaluator_confidence: "n/a",
    }))).toEqual([]);
    expect(validateTaskEvent(makeTaskEvent({
      gate_type: "DEEP", skipped: true, dci_immediate: "n/a", evaluator_confidence: "n/a",
      user_confidence: "n/a",
    }))).toEqual([]);
  });

  test("a skip must also void the reading: skipped LIGHT with a DCI reading is invalid", () => {
    const errs = validateTaskEvent(makeTaskEvent({
      gate_type: "LIGHT", skipped: true, dci_immediate: "DCI=4/4",
      evaluator_confidence: "n/a", retries: 0,
    }));
    expect(errs.some((m) => m.includes("SKIPPED: no reading"))).toBe(true);
  });
});

describe("research-mode — metric truthfulness", () => {
  test("agent_calls counts ALL subagent delegations (non-negative integer)", () => {
    expect(TASK_EXAMPLES[0].agent_calls).toBe(2);
    expect(TASK_EXAMPLES[1].agent_calls).toBe(4);
    expect(validateTaskEvent(makeTaskEvent({ agent_calls: 0 }))).toEqual([]); // zero delegations is legitimate
    expect(validateTaskEvent(makeTaskEvent({ agent_calls: 7 }))).toEqual([]);
    expect(validateTaskEvent(makeTaskEvent({ agent_calls: -1 })))
      .toContain("agent_calls must be a non-negative integer (count of ALL subagent delegations)");
    expect(validateTaskEvent(makeTaskEvent({ agent_calls: 2.5 }))
      .some((m) => m.includes("agent_calls"))).toBe(true);
    expect(validateTaskEvent(makeTaskEvent({ agent_calls: "3" }))
      .some((m) => m.includes("agent_calls"))).toBe(true);
  });

  test("user_confidence and evaluator_confidence are independent, separately-rated fields", () => {
    expect(validateTaskEvent(makeTaskEvent({ user_confidence: 3, evaluator_confidence: 5 }))).toEqual([]);
    expect(validateTaskEvent(makeTaskEvent({ user_confidence: 5, evaluator_confidence: 5 }))).toEqual([]);
    expect(validateTaskEvent(makeTaskEvent({ user_confidence: 6 })))
      .toContain("user_confidence must be 1-5 or n/a");
    expect(validateTaskEvent(makeTaskEvent({ evaluator_confidence: 0 })))
      .toContain("evaluator_confidence must be 1-5 or n/a");
  });

  test("only DCI=n/m readings count (even denominator 2-8)", () => {
    expect(validDCI("DCI=3/4")).toBe(true);
    expect(validDCI("DCI=4/4")).toBe(true);
    expect(validDCI("DCI=5/6")).toBe(true);
    expect(validDCI("DCI=3/5")).toBe(false); // odd denominator
    expect(validDCI("DCI=5/4")).toBe(false); // score above available
    expect(validDCI("n/a")).toBe(true);
    expect(validDCI("")).toBe(false);
    expect(validDCI(12)).toBe(false);
  });
});

describe("research-mode — recall: a NEW append-only event (no row rewriting)", () => {
  test("recall event shape: 8 fields, event='recall', same research_id, carries DCI1", () => {
    const r = RECALL_EXAMPLES[0];
    expect(Object.keys(r).sort()).toEqual([...RECALL_FIELDS].sort());
    expect(validateRecallEvent(r)).toEqual([]);
    expect(r.event).toBe("recall");
    expect(r.research_id).toBe(TASK_EXAMPLES[1].research_id);
    expect(validDCI(r.dci_delayed)).toBe(true);
    expect(r.dci_delayed).not.toBe(TASK_EXAMPLES[1].dci_immediate); // DCI1 is its own reading
    expect(r.evaluator_confidence).toBe(3);
  });

  test("recall events never mutate a task row: task-only fields are rejected", () => {
    const errs = validateRecallEvent(makeRecallEvent({ gate_type: "LIGHT" }));
    expect(errs.some((m) => m.includes("unknown field: gate_type"))).toBe(true);
  });

  test("the delayed DCI1 is a fresh, independent reading", () => {
    expect(validateRecallEvent(makeRecallEvent({ dci_delayed: "DCI=5/6", evaluator_confidence: 2 }))).toEqual([]);
    expect(validateRecallEvent(makeRecallEvent({ dci_delayed: "DCI=1/4", evaluator_confidence: 1 }))).toEqual([]);
  });

  test("skipped recall: no reading, no verdict — everything numeric is n/a", () => {
    expect(validateRecallEvent(makeRecallEvent({
      skipped: true, dci_delayed: "n/a", evaluator_confidence: "n/a",
    }))).toEqual([]);
    expect(validateRecallEvent(makeRecallEvent({
      skipped: true, dci_delayed: "n/a", evaluator_confidence: 3,
    }))).toContain("skipped recall: evaluator_confidence must be n/a");
    expect(validateRecallEvent(makeRecallEvent({ skipped: false, dci_delayed: "n/a" })))
      .toContain("non-skipped recall: dci_delayed must be a DCI reading");
  });
});

describe("research-mode — dispatch + contract-doc examples", () => {
  test("validateEventLine dispatches by event type and rejects unknown types", () => {
    expect(validateEventLine(TASK_EXAMPLES[0])).toEqual([]);
    expect(validateEventLine(TASK_EXAMPLES[1])).toEqual([]);
    expect(validateEventLine(RECALL_EXAMPLES[0])).toEqual([]);
    expect(validateEventLine({})).toEqual(["event must be 'task' or 'recall'"]);
    expect(validateEventLine({ event: "tuple" })).toEqual(["event must be 'task' or 'recall'"]);
  });

  test("the normative examples in command/research-mode.md satisfy the typed contract", () => {
    expect(EXAMPLES).toHaveLength(3);
    for (const ev of EXAMPLES) expect(validateEventLine(ev)).toEqual([]);
  });
});

describe("research-mode — the real sink is a valid append-only event log", () => {
  test(".context/research-dataset.jsonl (when present) holds only valid v0.6.4 events", () => {
    if (!existsSync(SINK)) return; // fresh install: sink is created on first research session
    const lines = readFileSync(SINK, "utf8").split("\n").filter((l) => l.trim() !== "");
    const taskIds = new Set<string>();
    for (const line of lines) {
      const ev = JSON.parse(line) as Record<string, unknown>; // every line is one JSON object
      if (ev.schema_version !== SCHEMA_VERSION) continue; // legacy rows are historical data, untouched
      expect(validateEventLine(ev)).toEqual([]);
      if (ev.event === "task") taskIds.add(ev.research_id as string);
    }
    for (const line of lines) {
      const ev = JSON.parse(line) as Record<string, unknown>;
      if (ev.event === "recall" && ev.schema_version === SCHEMA_VERSION) {
        expect(taskIds.has(ev.research_id as string)).toBe(true);
      }
    }
  });
});