/**
 * tests/plugin-comprehension.test.ts — plugin comprehension/research module contract (RED first).
 *
 * Binds the exact public API of `plugin/src/comprehension.ts` to the repo
 * sources of truth:
 *   - tests/contract-fields.ts (dataset contract + normative examples)
 *   - templates/comprehension.config.json (canonical config defaults)
 *   - skills/comprehension-workflow/SKILL.md §Telemetry writer / §Retention
 *     records / §Manual /recall (row + record formats)
 *
 * All filesystem cases run on throwaway `os.tmpdir()` roots created with
 * `fs.mkdtempSync` and cleaned in afterEach — never the real repo `.context/`.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  FORBIDDEN,
  RECALL_EXAMPLES,
  TASK_EXAMPLES,
  TASK_FIELDS as CONTRACT_TASK_FIELDS,
  RECALL_FIELDS as CONTRACT_RECALL_FIELDS,
  GATE_TYPES as CONTRACT_GATE_TYPES,
  makeRecallEvent,
  makeTaskEvent,
} from "./contract-fields.ts";
import type { RetentionFields } from "../plugin/src/comprehension.ts";
import {
  COMPREHENSION_LOG_HEADER,
  DEFAULT_COMPREHENSION_CONFIG,
  EVALUATION_ID_RE,
  FORBIDDEN_FIELDS,
  GATE_TYPES,
  RECALL_FIELDS,
  RESEARCH_ID_RE,
  TASK_FIELDS,
  appendComprehensionLog,
  comprehensionLogPath,
  createResearchRecorder,
  datasetPath,
  formatImmediateRow,
  formatRecallRow,
  gateRequiresCoach,
  loadComprehensionConfig,
  makeEvaluationId,
  makeResearchId,
  renderRetentionRecord,
  retentionRecordPath,
  slotForTaskIndex,
  validateRecallEvent,
  validateTaskEvent,
  writeRetentionRecord,
} from "../plugin/src/comprehension.ts";

const ROOT = join(import.meta.dir, "..");

/** Shape of templates/comprehension.config.json (canonical defaults). */
interface ComprehensionConfig {
  comprehension: {
    enabled: boolean;
    mode: string;
    light: { questions: number; modelTier: string };
    deep: { questions: number; modelTier: string; escalationTier: string };
    context: Record<string, unknown>;
    evaluation: Record<string, unknown>;
  };
  recall: Record<string, unknown>;
  research: Record<string, unknown>;
}

const TEMPLATE_CONFIG = JSON.parse(
  readFileSync(join(ROOT, "templates", "comprehension.config.json"), "utf-8"),
) as ComprehensionConfig;

/**
 * DEFAULT_COMPREHENSION_CONFIG re-observed as a mutable ComprehensionConfig —
 * the module may type it precisely (readonly literals); tests read the values
 * through this cast so the assertions do not depend on the declared shape.
 */
const defaultConfig = DEFAULT_COMPREHENSION_CONFIG as unknown as ComprehensionConfig;

// ── throwaway root management (never the real repo .context/) ──

let tempRoot: string;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "plugin-comprehension-"));
});

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

// ── 1. constants + field parity with contract-fields.ts ──

describe("contract parity", () => {
  test("GATE_TYPES is exactly the four canonical gate values in order", () => {
    expect([...GATE_TYPES]).toEqual(["n/a", "NONE", "LIGHT", "DEEP"]);
    expect([...GATE_TYPES]).toEqual([...CONTRACT_GATE_TYPES]);
  });

  test("TASK_FIELDS deep-equals the contract fields (19, canonical order)", () => {
    expect([...TASK_FIELDS]).toEqual([...CONTRACT_TASK_FIELDS]);
    expect(TASK_FIELDS).toHaveLength(19);
  });

  test("RECALL_FIELDS deep-equals the contract fields (8, canonical order)", () => {
    expect([...RECALL_FIELDS]).toEqual([...CONTRACT_RECALL_FIELDS]);
    expect(RECALL_FIELDS).toHaveLength(8);
  });

  test("FORBIDDEN_FIELDS sorted-equals the contract FORBIDDEN keys", () => {
    expect([...FORBIDDEN_FIELDS].sort()).toEqual([...FORBIDDEN].sort());
  });
});

// ── 2. ids ──

describe("ids", () => {
  test("makeResearchId matches the v0.6.6 research regex", () => {
    expect(makeResearchId()).toMatch(RESEARCH_ID_RE);
  });

  test("makeEvaluationId matches the v0.6.7 evaluation regex", () => {
    expect(makeEvaluationId()).toMatch(EVALUATION_ID_RE);
  });

  test("two consecutive calls never collide", () => {
    expect(makeResearchId()).not.toBe(makeResearchId());
    expect(makeEvaluationId()).not.toBe(makeEvaluationId());
  });

  test("ids carry the res-/ev- prefixes", () => {
    expect(makeResearchId().startsWith("res-")).toBe(true);
    expect(makeEvaluationId().startsWith("ev-")).toBe(true);
  });

  test("a fixed UTC date gives the deterministic readable-timestamp shape", () => {
    const fixed = new Date(Date.UTC(2026, 9, 23, 10, 0, 0));
    const researchId = makeResearchId(fixed);
    const evaluationId = makeEvaluationId(fixed);
    expect(researchId.startsWith("res-20261023-100000-")).toBe(true);
    expect(evaluationId.startsWith("ev-20261023-100000-")).toBe(true);
    expect(researchId).toMatch(RESEARCH_ID_RE);
    expect(evaluationId).toMatch(EVALUATION_ID_RE);
  });
});

// ── 3. gate + slot helpers ──

describe("gate and slot helpers", () => {
  test("gateRequiresCoach is true only for LIGHT/DEEP", () => {
    expect(gateRequiresCoach("NONE")).toBe(false);
    expect(gateRequiresCoach("n/a")).toBe(false);
    expect(gateRequiresCoach("LIGHT")).toBe(true);
    expect(gateRequiresCoach("DEEP")).toBe(true);
  });

  test("slotForTaskIndex alternates deterministically 0-based", () => {
    expect(slotForTaskIndex(0)).toBe("A");
    expect(slotForTaskIndex(1)).toBe("B");
    expect(slotForTaskIndex(2)).toBe("A");
    expect(slotForTaskIndex(3)).toBe("B");
  });
});

// ── 4. config loader ──

describe("loadComprehensionConfig", () => {
  test("DEFAULT_COMPREHENSION_CONFIG equals templates/comprehension.config.json", () => {
    expect(DEFAULT_COMPREHENSION_CONFIG).toEqual(TEMPLATE_CONFIG);
    expect(Object.keys(DEFAULT_COMPREHENSION_CONFIG)).toEqual([
      "comprehension",
      "recall",
      "research",
    ]);
    expect(Object.keys(TEMPLATE_CONFIG)).toEqual([
      "comprehension",
      "recall",
      "research",
    ]);
  });

  test("the defaults carry the canonical leaves, research off", () => {
    expect(defaultConfig.comprehension.light.questions).toBe(2);
    expect(defaultConfig.comprehension.deep.questions).toBe(4);
    expect(defaultConfig.recall).toEqual({ enabled: true, automatic: false });
    expect(DEFAULT_COMPREHENSION_CONFIG.research).toEqual({ enabled: false });
  });

  test("an absent file resolves to the defaults with zero warnings", () => {
    // tempRoot has no .opencode directory at all — the loader must not throw.
    const result = loadComprehensionConfig(tempRoot);
    expect(result.warnings).toHaveLength(0);
    expect(result.config).toEqual(DEFAULT_COMPREHENSION_CONFIG);
  });

  test("a valid file overrides only the given leaf and keeps other defaults", () => {
    mkdirSync(join(tempRoot, ".opencode"), { recursive: true });
    const fileConfig = structuredClone(TEMPLATE_CONFIG);
    fileConfig.comprehension.light.questions = 3;
    writeFileSync(
      join(tempRoot, ".opencode", "comprehension.config.json"),
      JSON.stringify(fileConfig, null, 2),
    );

    const result = loadComprehensionConfig(tempRoot);
    expect(result.warnings).toHaveLength(0);
    expect(result.config.comprehension.light.questions).toBe(3);
    expect(result.config.comprehension.light.modelTier).toBe(
      defaultConfig.comprehension.light.modelTier,
    );

    const expected = structuredClone(TEMPLATE_CONFIG);
    expected.comprehension.light.questions = 3;
    expect(result.config).toEqual(expected);
  });

  test("an invalid JSON file resolves to the defaults with exactly one warning", () => {
    mkdirSync(join(tempRoot, ".opencode"), { recursive: true });
    writeFileSync(
      join(tempRoot, ".opencode", "comprehension.config.json"),
      "{ this is not json",
    );

    const result = loadComprehensionConfig(tempRoot);
    expect(result.warnings).toHaveLength(1);
    expect(result.config).toEqual(DEFAULT_COMPREHENSION_CONFIG);
  });

  test("an invalid individual entry falls back to its default with one warning", () => {
    mkdirSync(join(tempRoot, ".opencode"), { recursive: true });
    const fileConfig = structuredClone(TEMPLATE_CONFIG);
    fileConfig.comprehension.light.questions = "two" as unknown as number;
    writeFileSync(
      join(tempRoot, ".opencode", "comprehension.config.json"),
      JSON.stringify(fileConfig, null, 2),
    );

    const result = loadComprehensionConfig(tempRoot);
    expect(result.warnings).toHaveLength(1);
    expect(result.config.comprehension.light.questions).toBe(
      defaultConfig.comprehension.light.questions,
    );
  });
});

// ── 5. sink paths ──

describe("sink paths", () => {
  test("comprehensionLogPath/datasetPath/retentionRecordPath derive the canonical sinks", () => {
    expect(comprehensionLogPath(tempRoot)).toBe(
      join(tempRoot, ".context", "comprehension-log.md"),
    );
    expect(datasetPath(tempRoot)).toBe(
      join(tempRoot, ".context", "research-dataset.jsonl"),
    );
    const evaluationId = "ev-20261023-100000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    expect(retentionRecordPath(tempRoot, evaluationId)).toBe(
      join(tempRoot, ".context", "comprehension", `${evaluationId}.md`),
    );
  });
});

// ── 6. telemetry writer ──

describe("formatters", () => {
  test("formatImmediateRow emits the scored immediate row byte-for-byte", () => {
    expect(
      formatImmediateRow({
        timestamp: new Date("2026-10-23T10:00:00.000Z"),
        mode: "DEEP",
        dci: "6/8",
        evaluatorConf: 4,
        outcome: "FAIL",
        userConf: 3,
      }),
    ).toBe("2026-10-23T10:00:00.000Z mode=DEEP DCI=6/8 evaluator_conf=4 outcome=FAIL user_conf=3");
  });

  test("formatImmediateRow emits the SKIPPED variant with verbatim n/a fields", () => {
    expect(
      formatImmediateRow({
        timestamp: new Date("2026-10-23T10:00:00.000Z"),
        mode: "LIGHT",
        dci: "skipped",
        evaluatorConf: "n/a",
        outcome: "SKIPPED",
        userConf: "n/a",
      }),
    ).toBe("2026-10-23T10:00:00.000Z mode=LIGHT DCI=skipped evaluator_conf=n/a outcome=SKIPPED user_conf=n/a");
  });

  test("formatRecallRow emits the dci1 row byte-for-byte (pipes, spacing, type=dci1)", () => {
    expect(
      formatRecallRow({
        date: "2026-10-25",
        plan: "0013",
        src: "stored",
        retry: 1,
        userConf: 5,
        evaluatorConf: 4,
        dci: "6/8",
        outcome: "RETRY",
      }),
    ).toBe("2026-10-25 | plan=0013 | type=dci1 | src=stored | retry=1 | user_conf=5 | evaluator_conf=4 | DCI=6/8 | outcome=RETRY");

    expect(
      formatRecallRow({
        date: "2026-10-25",
        plan: "0007",
        src: "reconstructed",
        retry: 0,
        userConf: "n/a",
        evaluatorConf: "n/a",
        dci: "skipped",
        outcome: "SKIPPED",
      }),
    ).toBe("2026-10-25 | plan=0007 | type=dci1 | src=reconstructed | retry=0 | user_conf=n/a | evaluator_conf=n/a | DCI=skipped | outcome=SKIPPED");
  });
});

describe("appendComprehensionLog", () => {
  test("first call creates the file with the header on line 1 and the row on line 2", () => {
    const row = "2026-10-23T10:00:00.000Z mode=DEEP DCI=6/8 evaluator_conf=4 outcome=FAIL user_conf=3";
    const result = appendComprehensionLog(tempRoot, row);
    expect(result).toEqual({
      ok: true,
      path: join(tempRoot, ".context", "comprehension-log.md"),
    });
    expect(existsSync(join(tempRoot, ".context"))).toBe(true);
    expect(readFileSync(comprehensionLogPath(tempRoot), "utf-8")).toBe(
      `${COMPREHENSION_LOG_HEADER}\n${row}\n`,
    );
  });

  test("later calls append only — the header appears exactly once", () => {
    appendComprehensionLog(tempRoot, "2026-10-23T10:00:00.000Z mode=DEEP DCI=6/8 evaluator_conf=4 outcome=FAIL user_conf=3");
    expect(appendComprehensionLog(tempRoot, "2026-10-23T11:00:00.000Z mode=LIGHT DCI=5/8 evaluator_conf=3 outcome=PASS user_conf=2")).toEqual({
      ok: true,
      path: comprehensionLogPath(tempRoot),
    });
    const content = readFileSync(comprehensionLogPath(tempRoot), "utf-8");
    expect(content).toBe(
      [
        COMPREHENSION_LOG_HEADER,
        "2026-10-23T10:00:00.000Z mode=DEEP DCI=6/8 evaluator_conf=4 outcome=FAIL user_conf=3",
        "2026-10-23T11:00:00.000Z mode=LIGHT DCI=5/8 evaluator_conf=3 outcome=PASS user_conf=2",
        "",
      ].join("\n"),
    );
    expect(
      content.split("\n").filter((line) => line === COMPREHENSION_LOG_HEADER),
    ).toHaveLength(1);
  });

  test("a pre-existing file without the header never gets the header inserted (append-only)", () => {
    mkdirSync(join(tempRoot, ".context"), { recursive: true });
    writeFileSync(comprehensionLogPath(tempRoot), "row-zero\n");
    expect(appendComprehensionLog(tempRoot, "row-one").ok).toBe(true);
    expect(readFileSync(comprehensionLogPath(tempRoot), "utf-8")).toBe(
      "row-zero\nrow-one\n",
    );
  });
});

// ── 7. retention records ──

describe("retention records", () => {
  const evaluationId = "ev-20261023-100000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const researchId = "res-20261023-100000-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const fields: RetentionFields = {
    plan: "0007",
    evaluationId,
    researchId,
    questions: [
      "Why does the gate run before the diff is shown?",
      "Which agent does the escalation delegate to?",
    ],
    userConf: 3,
    dci: "6/8",
    outcome: "FAIL",
    date: "2026-10-23",
    src: "stored",
  };

  test("renderRetentionRecord emits the exact per-evaluation record format", () => {
    expect(renderRetentionRecord(fields)).toBe(
      [
        `plan: ${fields.plan}`,
        `evaluation_id: ${evaluationId}`,
        `research_id: ${researchId}`,
        "questions:",
        "- ? Why does the gate run before the diff is shown?",
        "- ? Which agent does the escalation delegate to?",
        "user_conf: 3",
        "dci: 6/8",
        "outcome: FAIL",
        "date: 2026-10-23",
        "src: stored",
      ].join("\n"),
    );
  });

  test("renderRetentionRecord passes research_id=n/a through verbatim", () => {
    const rendered = renderRetentionRecord({ ...fields, researchId: "n/a" });
    expect(rendered).toContain("research_id: n/a");
  });

  test("writeRetentionRecord creates the flat record and refuses double-write", () => {
    const result = writeRetentionRecord(tempRoot, fields);
    expect(result).toEqual({
      ok: true,
      path: join(tempRoot, ".context", "comprehension", `${evaluationId}.md`),
    });
    expect(existsSync(result.path)).toBe(true);
    expect(readFileSync(result.path, "utf-8")).toBe(
      `${renderRetentionRecord(fields)}\n`,
    );

    const again = writeRetentionRecord(tempRoot, fields);
    expect(again).toEqual({
      ok: false,
      error: "record-exists",
      path: result.path,
    });
    // The original bytes are untouched by the refused write.
    expect(readFileSync(result.path, "utf-8")).toBe(
      `${renderRetentionRecord(fields)}\n`,
    );
  });
});

// ── 8. validation parity with tests/contract-fields.ts ──

describe("dataset event validation parity", () => {
  test("every normative task example validates cleanly", () => {
    for (const example of TASK_EXAMPLES) {
      expect(validateTaskEvent(example)).toEqual([]);
    }
  });

  test("every normative recall example validates cleanly", () => {
    for (const example of RECALL_EXAMPLES) {
      expect(validateRecallEvent(example)).toEqual([]);
    }
  });

  test("a deleted required field fails", () => {
    const event = makeTaskEvent();
    delete event.date;
    expect(validateTaskEvent(event).length).toBeGreaterThan(0);

    const recall = makeRecallEvent();
    delete recall.research_id;
    expect(validateRecallEvent(recall).length).toBeGreaterThan(0);
  });

  test("a FORBIDDEN key fails", () => {
    expect(validateTaskEvent(makeTaskEvent({ session_id: "ses-xyz" })).length).toBeGreaterThan(0);
    expect(validateRecallEvent(makeRecallEvent({ src: "stored" })).length).toBeGreaterThan(0);
  });

  test("an uppercase-hex research_id fails", () => {
    const uppercaseHex = String(makeTaskEvent().research_id).replace(
      /[0-9a-f]{32}$/,
      (hex) => hex.toUpperCase(),
    );
    expect(validateTaskEvent(makeTaskEvent({ research_id: uppercaseHex })).length).toBeGreaterThan(0);
  });

  test("an invalid gate_type value fails", () => {
    expect(validateTaskEvent(makeTaskEvent({ gate_type: "huge" })).length).toBeGreaterThan(0);
  });

  test("slot A with gate_type NONE violates the slot invariant", () => {
    const event = makeTaskEvent({ slot: "A", gate_type: "NONE" });
    expect(validateTaskEvent(event).length).toBeGreaterThan(0);
  });

  test("an out-of-range DCI reading fails the recall contract", () => {
    const event = makeRecallEvent({ dci_delayed: "DCI=11/8" });
    expect(validateRecallEvent(event).length).toBeGreaterThan(0);
  });
});

// ── 9. research recorder ──

describe("createResearchRecorder: disabled", () => {
  test("appendTask/appendRecall/validateFile are no-ops that touch no filesystem", () => {
    const recorder = createResearchRecorder(tempRoot, false);
    expect(recorder.enabled).toBe(false);
    expect(recorder.appendTask(makeTaskEvent())).toEqual({ ok: true, noop: true });
    expect(recorder.appendRecall(makeRecallEvent())).toEqual({ ok: true, noop: true });
    expect(recorder.validateFile()).toEqual({ ok: true, noop: true });
    // Still empty: no files created, no .context dir, no mkdir whatsoever.
    expect(readdirSync(tempRoot)).toEqual([]);
    expect(existsSync(datasetPath(tempRoot))).toBe(false);
  });
});

describe("createResearchRecorder: enabled", () => {
  test("validateFile on an absent dataset reports ok with zero lines", () => {
    const recorder = createResearchRecorder(tempRoot, true);
    expect(recorder.enabled).toBe(true);
    const result = recorder.validateFile();
    expect(result.ok).toBe(true);
    expect(result.lines).toBe(0);
  });

  test("a valid task event appends exactly one JSONL line that parses back", () => {
    const recorder = createResearchRecorder(tempRoot, true);
    const event = makeTaskEvent();
    expect(recorder.appendTask(event)).toEqual({ ok: true, noop: false });
    const dataset = datasetPath(tempRoot);
    expect(existsSync(dataset)).toBe(true);
    expect(readFileSync(dataset, "utf-8")).toBe(`${JSON.stringify(event)}\n`);
    expect(JSON.parse(readFileSync(dataset, "utf-8"))).toEqual(event);
  });

  test("a valid recall event appends a second JSONL line and validateFile stays clean", () => {
    const recorder = createResearchRecorder(tempRoot, true);
    const task = makeTaskEvent();
    const recall = makeRecallEvent({ research_id: task.research_id });
    expect(recorder.appendTask(task).ok).toBe(true);
    expect(recorder.appendRecall(recall)).toEqual({ ok: true, noop: false });
    const dataset = datasetPath(tempRoot);
    const parsed = readFileSync(dataset, "utf-8")
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(parsed).toEqual([task, recall]);

    const check = recorder.validateFile();
    expect(check.ok).toBe(true);
    expect(check.lines).toBe(2);
    expect(check.errors ?? []).toEqual([]);
  });

  test("an invalid event appends nothing (file absent or unchanged)", () => {
    const recorder = createResearchRecorder(tempRoot, true);
    const bad = recorder.appendTask(makeTaskEvent({ gate_type: "huge" }));
    expect(bad.ok).toBe(false);
    expect(bad.noop).toBe(false);
    expect(typeof bad.error).toBe("string");
    expect(existsSync(datasetPath(tempRoot))).toBe(false);

    const task = makeTaskEvent();
    recorder.appendTask(task);
    const before = readFileSync(datasetPath(tempRoot), "utf-8");
    const badRecall = recorder.appendRecall(
      makeRecallEvent({ research_id: task.research_id, dci_delayed: "DCI=11/8" }),
    );
    expect(badRecall.ok).toBe(false);
    expect(badRecall.noop).toBe(false);
    expect(typeof badRecall.error).toBe("string");
    expect(readFileSync(datasetPath(tempRoot), "utf-8")).toBe(before);
  });

  test("validateFile flags corrupted lines by their line number", () => {
    const valid = makeTaskEvent();
    const corrupted = makeTaskEvent({ gate_type: "huge" });
    mkdirSync(join(tempRoot, ".context"), { recursive: true });
    writeFileSync(
      datasetPath(tempRoot),
      `${JSON.stringify(valid)}\n${JSON.stringify(corrupted)}\n`,
    );

    const result = createResearchRecorder(tempRoot, true).validateFile();
    expect(result.ok).toBe(false);
    const errors = result.errors ?? [];
    expect(errors).toHaveLength(1);
    expect(String(errors[0]).startsWith("2: ")).toBe(true);
  });
});

// ── 10. privacy by construction ──

describe("dataset privacy", () => {
  test("valid task events serialize carrying only contract fields, never FORBIDDEN keys", () => {
    const samples = [
      ...TASK_EXAMPLES,
      makeTaskEvent(),
      makeTaskEvent({ tokens_source: "exact" }),
    ];
    for (const event of samples) {
      const keys = Object.keys(JSON.parse(JSON.stringify(event)) as Record<string, unknown>);
      expect(
        keys.filter((key) => !(TASK_FIELDS as readonly string[]).includes(key)),
      ).toEqual([]);
      expect(
        keys.filter((key) => (FORBIDDEN_FIELDS as readonly string[]).includes(key)),
      ).toEqual([]);
    }
  });

  test("valid recall events serialize carrying only contract fields, never FORBIDDEN keys", () => {
    const samples = [...RECALL_EXAMPLES, makeRecallEvent(), makeRecallEvent({ retries: 1 })];
    for (const event of samples) {
      const keys = Object.keys(JSON.parse(JSON.stringify(event)) as Record<string, unknown>);
      expect(
        keys.filter((key) => !(RECALL_FIELDS as readonly string[]).includes(key)),
      ).toEqual([]);
      expect(
        keys.filter((key) => (FORBIDDEN_FIELDS as readonly string[]).includes(key)),
      ).toEqual([]);
    }
  });
});
