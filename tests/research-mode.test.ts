/**
 * tests/research-mode.test.ts — Research Mode behavioral tests (v0.6.6)
 *
 * These tests invoke the pure source of truth in contract-fields.ts
 * (DatasetEventV1 event model, deterministic A/B slot routing, validators) —
 * they do not grep prose. Prose pins for command/research-mode.md live in
 * workflow-hardening.test.ts; this file checks BEHAVIOR:
 *   - research_id uniqueness + task↔recall correlation
 *   - append-only dataset: recall is a NEW event with the SAME research_id,
 *     no row rewriting anywhere (dci_delayed is retired as a task field)
 *   - evaluation_id (v0.6.7): per-evaluation record identity (ev- prefix),
 *     never a dataset field — correlation stays on research_id
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
  isValidResearchId, isLegacyResearchId, makeResearchId,
  isValidEvaluationId, makeEvaluationId, MAKE_EVALUATION_ID_NOTE,
  MAKE_RESEARCH_ID_NOTE, validDCI, GATE_TYPES,
  TASK_FIELDS, RECALL_FIELDS, SCHEMA_VERSION, FORBIDDEN,
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

  // v0.6.5 — DatasetEventV1 contract freeze: any schema change must be a
  // deliberate, documented act — these exhaustive pins fail on silent drift.
  describe("DatasetEventV1 invariant — explicit field-list freeze (v0.6.5)", () => {
    test("TASK_FIELDS are exactly these, in this order, no more no less", () => {
      expect([...TASK_FIELDS]).toEqual([
        "event", "schema_version", "research_id", "date", "plan", "slot", "task_type",
        "gate_type", "duration_min", "agent_calls", "input_tokens", "output_tokens",
        "user_confidence", "evaluator_confidence", "dci_immediate", "retries", "skipped",
        "bugfix_ref", "tokens_source",
      ]);
    });

    test("RECALL_FIELDS are exactly these, in this order", () => {
      expect([...RECALL_FIELDS]).toEqual([
        "event", "schema_version", "research_id", "date", "dci_delayed",
        "evaluator_confidence", "retries", "skipped",
      ]);
    });

    test("FORBIDDEN is exactly this set", () => {
      expect(new Set(FORBIDDEN)).toEqual(new Set([
        "ts", "session_id", "task_id", "user_conf", "dci1", "gap", "src",
        "confidence_delta", "escalations", "questions_count", "alternation",
      ]));
    });
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
  test("format res-YYYYMMDD-HHMMSS-32hex is validated deterministically (v0.6.6)", () => {
    expect(isValidResearchId("res-20261007-143000-3f9a7c2e1b08d54fa6e3c70b92d1846a")).toBe(true);
    expect(isValidResearchId("res-20261007-143000-3F9A7C2E1B08D54FA6E3C70B92D1846A")).toBe(false); // uppercase not canonical (lowercase only)
    expect(isValidResearchId("res-2026100-143000-3f9a7c2e1b08d54fa6e3c70b92d1846a")).toBe(false); // wrong date length
    expect(isValidResearchId("res-20261007-1430001-3f9a7c2e1b08d54fa6e3c70b92d1846a")).toBe(false); // wrong time length
    expect(isValidResearchId("res-20261007-143000")).toBe(false); // legacy format: rejected
    expect(isValidResearchId("res-20261007-143000-g1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")).toBe(false); // not hex
    expect(isValidResearchId("res-20261007-143000-3f9a7c2e1b08d54fa6e3c70b92d1846")).toBe(false); // 31 hex chars
    expect(isValidResearchId("res-20261007-143000-3f9a7c2e1b08d54fa6e3c70b92d1846aa")).toBe(false); // 33 hex chars
    expect(isValidResearchId("task-20261007-143000-3f9a7c2e1b08d54fa6e3c70b92d1846a")).toBe(false); // wrong prefix
    expect(isValidResearchId(20261007)).toBe(false);
  });

  test("makeResearchId generates fresh random ids; readable timestamp preserved", () => {
    const a = makeResearchId({ timestamp: "20261007-143000" });
    const b = makeResearchId({ timestamp: "20261007-143000" });
    expect(a).not.toBe(b); // CSPRNG: two draws never repeat (probabilistic 128-bit uniqueness)
    expect(a.startsWith("res-20261007-143000-")).toBe(true); // timestamp part preserved
    expect(isValidResearchId(a)).toBe(true);
    expect(isValidResearchId(b)).toBe(true);
  });

  test("every task gets its own research_id; plan is metadata, never the identifier", () => {
    const N = 50;
    const timestamp = "20261007-143000";
    const ids = [];
    for (let i = 0; i < N; i++) ids.push(makeResearchId({ timestamp }));
    expect(new Set(ids).size).toBe(N); // distinct suffixes even within the same second
    for (const id of ids) {
      expect(isValidResearchId(id)).toBe(true);
      expect(id.startsWith(`res-${timestamp}-`)).toBe(true); // readable timestamp preserved
    }
    // two sessions started in the same second still get distinct research_ids
    const s1 = makeResearchId({ timestamp });
    const s2 = makeResearchId({ timestamp });
    expect(s1).not.toBe(s2);
    // legacy v0.6.5 formats are recognisable and rejected by the current validator
    expect(isLegacyResearchId("res-20261007-143000")).toBe(true);
    expect(isLegacyResearchId("res-20261007-143000-a1b2c3d4")).toBe(true);
    expect(isValidResearchId("res-20261007-143000-a1b2c3d4")).toBe(false);
  });

  test("two events with the SAME plan but distinct research_ids both validate (multi-evaluation)", () => {
    expect(validateTaskEvent(makeTaskEvent({ research_id: makeResearchId({ timestamp: "20261007-150000" }), plan: "0007" }))).toEqual([]);
    expect(validateTaskEvent(makeTaskEvent({ research_id: makeResearchId({ timestamp: "20261007-150000" }), plan: "0007" }))).toEqual([]); // same second, same plan, distinct id
  });

  test("a recall event ties to its task through the SAME research_id", () => {
    expect(sameResearchId(TASK_EXAMPLES[1], RECALL_EXAMPLES[0])).toBe(true);
    expect(sameResearchId(TASK_EXAMPLES[0], RECALL_EXAMPLES[0])).toBe(false);
    expect(sameResearchId({ ...TASK_EXAMPLES[1], research_id: makeResearchId({ timestamp: "20261007-000000" }) }, RECALL_EXAMPLES[0])).toBe(false);
  });
});

describe("research-mode — evaluation_id identity (v0.6.7)", () => {
  test("format ev-YYYYMMDD-HHMMSS-32hex: the res- twin, never a dataset key", () => {
    const a = makeEvaluationId({ timestamp: "20261007-150000" });
    const b = makeEvaluationId({ timestamp: "20261007-150000" });
    expect(a).not.toBe(b); // CSPRNG: two draws never repeat (probabilistic 128-bit uniqueness)
    expect(a.startsWith("ev-20261007-150000-")).toBe(true); // readable evaluation timestamp preserved
    expect(isValidEvaluationId(a)).toBe(true);
    expect(isValidEvaluationId(b)).toBe(true);
    expect(isValidResearchId(a)).toBe(false); // evaluation_id ≠ research_id: never a dataset key
    expect(isValidEvaluationId("res-20261007-150000-3f9a7c2e1b08d54fa6e3c70b92d1846a")).toBe(false);
    expect(isValidEvaluationId("ev-20261007-150000")).toBe(false); // bare timestamp: rejected
    expect(MAKE_EVALUATION_ID_NOTE).toMatch(/128 ?bits/i);
    expect(MAKE_EVALUATION_ID_NOTE).toMatch(/CSPRNG|crypto/i);
    expect(MAKE_EVALUATION_ID_NOTE).toMatch(/research_id/); // identity vs correlation split is documented
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

describe("research-mode — research_id lifecycle stability (v0.6.6)", () => {
  test("MAKE_RESEARCH_ID_NOTE documents the 128-bit CSPRNG suffix", () => {
    expect(MAKE_RESEARCH_ID_NOTE).toMatch(/128 ?bits/i);
    expect(MAKE_RESEARCH_ID_NOTE).toMatch(/CSPRNG|crypto/i);
    expect(MAKE_RESEARCH_ID_NOTE).toMatch(/recall event|comprehension record/);
  });

  test("the id is written once and reused verbatim, never re-derived", () => {
    // Correlation works by copying the stored id; there is no deterministic
    // re-derivation to stay compatible with — a fresh draw is a DIFFERENT id.
    const a = makeResearchId({ timestamp: "20261007-143000" });
    const b = makeResearchId({ timestamp: "20261007-143000" });
    expect(a).not.toBe(b);
    for (const id of [a, b]) {
      expect(isValidResearchId(id)).toBe(true);
      expect(isLegacyResearchId(id)).toBe(false);
    }
    // legacy v0.6.5 formats are rejected by the current validator
    expect(isValidResearchId("res-20261007-143000")).toBe(false);
    expect(isValidResearchId("res-20261007-143000-a1b2c3d4")).toBe(false);
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
  test(".context/research-dataset.jsonl (when present) holds only valid v0.6.6 events", () => {
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

describe("research-mode — v0.6.7 correlation finalization pins (E)", () => {
  test("append-safe records: multiple evaluations of the same plan have negligible collision probability and never overwrite each other (path-keyed by evaluation_id)", () => {
    const planId = "0007"; // v0.6.7: kept for prose only — record paths went flat below
    const recordPathFor = (id: string) => join(".context", "comprehension", `${id}.md`);
    const ids = [makeEvaluationId({ timestamp: "20261007-150000" }), makeEvaluationId({ timestamp: "20261007-150000" }), makeEvaluationId({ timestamp: "20261007-150100" })];
    expect(ids[0]).not.toBe(ids[1]); // same second, two evaluations → distinct paths
    expect(ids[1]).not.toBe(ids[2]);
    const paths = new Set(ids.map(recordPathFor));
    expect(paths.size).toBe(ids.length); // one path per evaluation, never overwritten
    for (const id of ids) {
      expect(isValidEvaluationId(id)).toBe(true);
      expect(recordPathFor(id)).toBe(join(".context", "comprehension", `${id}.md`));
    }
  });

  test("recall selects the CORRECT evaluation: the record's stored research_id pins the recall event", () => {
    const planId = "0007";
    const firstEval = makeEvaluationId({ timestamp: "20261007-150000" });
    const secondEval = makeEvaluationId({ timestamp: "20261007-150100" });
    const firstTask = makeResearchId({ timestamp: "20261007-150000" });
    const secondTask = makeResearchId({ timestamp: "20261007-150100" });
    // record store keyed by evaluation_id (append-safe): both records coexist for plan 0007
    const records: Record<string, string> = {
      [firstEval]: `plan: ${planId}\nevaluation_id: ${firstEval}\nresearch_id: ${firstTask}\n`,
      [secondEval]: `plan: ${planId}\nevaluation_id: ${secondEval}\nresearch_id: ${secondTask}\n`,
    };
    const selectedRecord = records[secondEval]; // the user's selection pins one specific evaluation_id
    const storedId = selectedRecord.split("research_id: ")[1]!.trim();
    const recallEvent = makeRecallEvent({ research_id: storedId, plan: planId });
    expect(recallEvent.research_id).toBe(secondTask); // copied verbatim from the SELECTED record
    expect(recallEvent.research_id).not.toBe(firstTask);
    expect(sameResearchId({ research_id: secondTask } as never, recallEvent)).toBe(true);
    expect(storedId).not.toBe(firstTask); // no ambiguous plan-only lookup: each record carries its own task's research_id
  });

  test("canonical docs ↔ validator consistency: doc template placeholders match the validator's format", () => {
    const docs = [
      "command/research-mode.md",
      "command/recall.md",
      "skills/comprehension-workflow/SKILL.md",
      "agents/orchestrator.md",
      "docs/CONFIGURATION.md",
    ];
    for (const d of docs) {
      const text = readFileSync(join(process.cwd(), d), "utf8");
      expect(text.includes("res-YYYYMMDD-HHMMSS-<32hex>")).toBe(true); // doc carries the canonical placeholder
      const legacyRefs = text.match(/res-YYYYMMDD-HHMMSS(?!-<32hex>)/);
      expect(legacyRefs).toBeNull(); // no bare legacy timestamp format remains in live docs
    }
    // and the validator is exactly the documented format
    expect(isValidResearchId("res-20261007-143000-3f9a7c2e1b08d54fa6e3c70b92d1846a")).toBe(true);
    expect(isValidResearchId("res-20261007-143000-3f9a7c2e1b08d54fa6e3c70b92d1846")).toBe(false);
  });

  test("evaluation_id: bare timestamp forms are rejected; the CSPRNG suffix stays valid (v0.6.7)", () => {
    expect(isValidEvaluationId("ev-20261007-150000")).toBe(false);
    expect(isValidEvaluationId("ev-20261007-150000-3f9a7c2e")).toBe(false);
    const id = makeEvaluationId({ timestamp: "20261007-150000" });
    expect(isValidEvaluationId(id)).toBe(true);
    expect(id.startsWith("ev-20261007-150000-")).toBe(true);
  });

  test("evaluation_id: suffix mechanics match the research_id contract (32 hex, never derived)", () => {
    const rid = makeResearchId({ timestamp: "20261007-150000" });
    expect(rid.slice(-32)).toMatch(/^[0-9a-f]{32}$/); // CSPRNG suffix, 128 bits
    expect(isValidResearchId(rid)).toBe(true);
    const tampered = rid.slice(0, -1) + (rid.at(-1) === "a" ? "b" : "a");
    expect(isValidResearchId(tampered)).toBe(true); // same format — only the value differs
    expect(tampered).not.toBe(rid);
    expect(MAKE_EVALUATION_ID_NOTE).toContain("record file name");
    expect(MAKE_EVALUATION_ID_NOTE).toContain("never regenerated");
  });
});