/**
 * tests/plugin-comprehension.test.ts — Phase 4 (plan 13): comprehension gate
 * + telemetry writer ported into the OpenCode 2 plugin (TDD, RED first).
 *
 * Pins the observable contract the implementation must satisfy
 * (plugin/src/comprehension.ts — module does NOT exist yet, this suite is
 * expected to fail "module not found" until the implementation lands):
 *   - classification rules verbatim-pinned against agents/orchestrator.md
 *   - comprehension.config.json loading (absent/empty/bad-JSON/top-level
 *     garbage/per-key merge/invalid-leaf fall-back matrix)
 *   - formatGateRow / formatRecallRow byte-exact telemetry rows
 *   - appendGateRow / appendRecallRow header-once + append-only discipline
 *
 * NOTHING in this suite touches the repo's real `.context/` sinks: every case
 * runs on a throwaway base directory under /tmp/opencode.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  appendGateRow,
  appendRecallRow,
  CLASSIFICATION_RULES,
  COMPREHENSION_DEFAULTS,
  formatGateRow,
  formatRecallRow,
  gateRequiresCoach,
  loadComprehensionConfig,
  TelemetryContractError,
} from "../plugin/src/comprehension";

const ROOT = join(import.meta.dir, "..");

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

/** Loose return type on purpose: the merged config shape is data, not API. */
type LoadedConfig = { config: Record<string, any>; warnings: string[] };
const loadCompreh = (base: string): LoadedConfig =>
  loadComprehensionConfig(base) as LoadedConfig;

// ── helpers (typed loosely so the pending plugin types cannot break typecheck) ──

const formatGate = (input: unknown, now?: Date): string =>
  formatGateRow(input as never, now);
const formatRecall = (input: unknown, now?: Date): string =>
  formatRecallRow(input as never, now);

const appendGate = (base: string, input: unknown, now?: Date) =>
  (appendGateRow as (b: string, i: unknown, n?: Date) => Promise<{
    path: string;
    row: string;
    created: boolean;
  }>)(base, input, now);

const appendRecall = (base: string, input: unknown, now?: Date) =>
  (appendRecallRow as (b: string, i: unknown, n?: Date) => Promise<{
    path: string;
    row: string;
    created: boolean;
  }>)(base, input, now);

/** A legal gate-row input; tests override single fields to make invalid cases. */
const LEGAL_GATE: Record<string, unknown> = {
  mode: "LIGHT",
  dci: "3/4",
  evaluator_conf: "4",
  outcome: "PASS",
  user_conf: "2",
};

const gateRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...LEGAL_GATE,
  ...over,
});

/** A legal recall-row input (dci1 format). */
const LEGAL_RECALL: Record<string, unknown> = {
  plan: "0007",
  src: "stored",
  retry: 0,
  user_conf: "2",
  evaluator_conf: "4",
  dci: "3/4",
  outcome: "PASS",
};

const recallRow = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...LEGAL_RECALL,
  ...over,
});

/** Asserts fn throws TelemetryContractError and that the message names `field`. */
function expectTelemetryThrow(fn: () => unknown, field: string): void {
  let thrown = false;
  let message = "";
  try {
    fn();
  } catch (error) {
    thrown = true;
    expect(error).toBeInstanceOf(TelemetryContractError);
    expect((error as Error).name).toBe("TelemetryContractError");
    message = (error as Error).message ?? String(error);
  }
  expect(thrown).toBe(true);
  expect(message.toLowerCase()).toContain(field.toLowerCase());
}

/** LOCAL calendar date (mirrors plugin/src/plan-board.ts today() decision). */
function localDate(d: Date): string {
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

// ── classification rules ──

const NONE_TRIGGERS =
  "docs, formatting, comment changes, mechanical rename, non-behavioral changes";
const LIGHT_TRIGGERS =
  "small bug fix, localized behavioral change, small validation, single-concern modification";
const DEEP_TRIGGERS =
  "business logic, new abstraction, state/control flow, persistence, API contract, auth/security, concurrency, cross-layer, architecture";

describe("classification rules (NONE/LIGHT/DEEP)", () => {
  test("triggers + coach calls are pinned verbatim", () => {
    expect(CLASSIFICATION_RULES.NONE.triggers).toEqual(NONE_TRIGGERS);
    expect(CLASSIFICATION_RULES.NONE.coachCalls).toBe(0);
    expect(CLASSIFICATION_RULES.LIGHT.triggers).toEqual(LIGHT_TRIGGERS);
    expect(CLASSIFICATION_RULES.LIGHT.coachCalls).toBe(2);
    expect(CLASSIFICATION_RULES.DEEP.triggers).toEqual(DEEP_TRIGGERS);
    expect(CLASSIFICATION_RULES.DEEP.coachCalls).toBe(4);
  });

  test("each triggers string appears verbatim inside agents/orchestrator.md (drift pin)", () => {
    const orchestrator = readFileSync(join(ROOT, "agents", "orchestrator.md"), "utf8");
    for (const triggers of [NONE_TRIGGERS, LIGHT_TRIGGERS, DEEP_TRIGGERS]) {
      expect(orchestrator.includes(triggers)).toBe(true);
    }
  });

  test("gateRequiresCoach is false only for NONE", () => {
    expect(gateRequiresCoach("NONE")).toBe(false);
    expect(gateRequiresCoach("LIGHT")).toBe(true);
    expect(gateRequiresCoach("DEEP")).toBe(true);
  });
});

// ── configuration defaults + loading ──

const EXPECTED_DEFAULTS = {
  comprehension: {
    enabled: true,
    mode: "adaptive",
    light: { questions: 2, modelTier: "TIER_FAST" },
    deep: { questions: 4, modelTier: "TIER_FAST", escalationTier: "TIER_REVIEW" },
    context: { maxDiffLines: 300, unifiedContextLines: 3, maxRelatedSymbols: 3 },
    evaluation: { maxRetries: 1, escalateOnAmbiguity: true },
  },
  recall: { enabled: true, automatic: false },
  research: { enabled: false },
};

describe("comprehension defaults", () => {
  test("COMPREHENSION_DEFAULTS deep-equal the ratified default object", () => {
    expect(COMPREHENSION_DEFAULTS).toEqual(EXPECTED_DEFAULTS);
  });

  test("templates/comprehension.config.json parses to the same default object", () => {
    const template = JSON.parse(
      readFileSync(join(ROOT, "templates", "comprehension.config.json"), "utf8"),
    );
    expect(template).toEqual(EXPECTED_DEFAULTS);
    expect(COMPREHENSION_DEFAULTS).toEqual(template);
  });
});

function writeConfig(base: string, json: unknown): void {
  mkdirSync(join(base, ".opencode"), { recursive: true });
  writeFileSync(
    join(base, ".opencode", "comprehension.config.json"),
    typeof json === "string" ? json : (JSON.stringify(json, null, 2) + "\n"),
    "utf-8",
  );
}

describe("loadComprehensionConfig — never throws", () => {
  test("absent file → defaults with zero warnings (deliberate silent defaults)", () => {
    const base = tempDir("cfg-absent-");
    const { config, warnings } = loadCompreh(base);
    expect(config).toEqual(EXPECTED_DEFAULTS);
    expect(warnings).toEqual([]);
  });

  test("empty file → defaults + exactly one warning mentioning comprehension.config", () => {
    const base = tempDir("cfg-empty-");
    writeConfig(base, "");
    const { config, warnings } = loadCompreh(base);
    expect(config).toEqual(EXPECTED_DEFAULTS);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("comprehension.config");
  });

  test("unparseable JSON → defaults + one warning", () => {
    const base = tempDir("cfg-badjson-");
    writeConfig(base, "{ this is not json ][");
    const { config, warnings } = loadCompreh(base);
    expect(config).toEqual(EXPECTED_DEFAULTS);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("comprehension.config");
  });

  test("parseable but non-object top level (null, array, number, string) → defaults + one warning", () => {
    for (const [label, top] of [
      ["null", "null"],
      ["array", "[]"],
      ["number", "5"],
      ["string", '"adaptation"'],
    ] as const) {
      const base = tempDir(`cfg-top-${label}-`);
      writeConfig(base, top);
      const { config, warnings } = loadCompreh(base);
      expect(config).toEqual(EXPECTED_DEFAULTS);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("comprehension.config");
    }
  });

  test("per-key merge: file value > default, nested merged key-by-key, unknown keys ignored silently", () => {
    const base = tempDir("cfg-merge-");
    writeConfig(base, {
      comprehension: { light: { questions: 5, bogus: true }, enabled: false },
      research: { enabled: true, missedKey: 1 },
      unknownTop: "ignored",
    });
    const { config, warnings } = loadCompreh(base);
    expect(warnings).toEqual([]);
    expect(config).toEqual({
      comprehension: {
        ...EXPECTED_DEFAULTS.comprehension,
        enabled: false,
        light: { questions: 5, modelTier: "TIER_FAST" },
      },
      recall: EXPECTED_DEFAULTS.recall,
      research: { enabled: true },
    });
  });

  test("invalid leaf value → that leaf falls back to its default with ONE dotted-key warning", () => {
    const base = tempDir("cfg-leaf-");
    writeConfig(base, {
      comprehension: { light: { questions: -3 }, context: { unifiedContextLines: -1 } },
      research: { enabled: true },
    });
    const { config, warnings } = loadCompreh(base);
    expect(warnings).toHaveLength(2);
    expect(warnings.some((w) => w.includes("comprehension.light.questions"))).toBe(true);
    expect(warnings.some((w) => w.includes("comprehension.context.unifiedContextLines"))).toBe(true);
    expect(config.comprehension.light.questions).toBe(2);
    expect(config.comprehension.context.unifiedContextLines).toBe(3);
    expect(config.research.enabled).toBe(true);
  });

  test("six invalid leaves in one file: exactly 6 warnings, defaults restored, valid override survives", () => {
    const base = tempDir("cfg-6bad-");
    writeConfig(base, {
      comprehension: {
        light: { modelTier: 7, questions: 3 },
        deep: { questions: -1 },
        context: { maxDiffLines: 1.5 },
        evaluation: { maxRetries: "many" },
      },
      recall: { automatic: "maybe" },
      research: { enabled: "yes" },
    });
    const { config, warnings } = loadCompreh(base);
    expect(warnings).toHaveLength(6);
    const paths = [
      "comprehension.light.modelTier",
      "comprehension.deep.questions",
      "comprehension.context.maxDiffLines",
      "comprehension.evaluation.maxRetries",
      "recall.automatic",
      "research.enabled",
    ];
    for (const path of paths) {
      expect(warnings.some((w) => w.includes(path))).toBe(true);
    }
    expect(config.comprehension.light.modelTier).toBe("TIER_FAST");
    expect(config.comprehension.deep.questions).toBe(4);
    expect(config.comprehension.context.maxDiffLines).toBe(300);
    expect(config.comprehension.evaluation.maxRetries).toBe(1);
    expect(config.recall.automatic).toBe(false);
    expect(config.research.enabled).toBe(false);
    expect(config.comprehension.light.questions).toBe(3); // the valid override survives
  });

  test("zero is a valid non-negative limit; a valid tier/tier-string override is kept", () => {
    const base = tempDir("cfg-zero-");
    writeConfig(base, {
      comprehension: {
        evaluation: { maxRetries: 0 },
        deep: { escalationTier: "TIER_ROUTER" },
      },
    });
    const { config, warnings } = loadCompreh(base);
    expect(warnings).toEqual([]);
    expect(config.comprehension.evaluation.maxRetries).toBe(0);
    expect(config.comprehension.deep.escalationTier).toBe("TIER_ROUTER");
  });
});

// ── formatGateRow ──

describe("formatGateRow — byte-exact rows", () => {
  test("injected Date → exact ISO UTC millisecond row", () => {
    const now = new Date("2026-03-15T14:30:05.123Z");
    expect(formatGate(gateRow(), now)).toBe(
      "2026-03-15T14:30:05.123Z mode=LIGHT DCI=3/4 evaluator_conf=4 outcome=PASS user_conf=2",
    );
  });

  test("no date → row starts with a UTC ISO-8601 millisecond timestamp", () => {
    const row = formatGate(gateRow());
    expect(row).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z mode=LIGHT DCI=3\/4 evaluator_conf=4 outcome=PASS user_conf=2$/,
    );
  });

  test("DEEP row with score 0 and full denominator 8 is byte-exact", () => {
    const now = new Date("2026-03-15T00:00:00.500Z");
    expect(
      formatGate(gateRow({ mode: "DEEP", dci: "0/8", outcome: "FAIL", user_conf: "5" }), now),
    ).toBe(
      "2026-03-15T00:00:00.500Z mode=DEEP DCI=0/8 evaluator_conf=4 outcome=FAIL user_conf=5",
    );
    expect(
      formatGate(
        gateRow({ mode: "DEEP", dci: "8/8", evaluator_conf: "1", user_conf: "1" }),
        new Date("2026-03-15T00:00:01.000Z"),
      ),
    ).toBe(
      "2026-03-15T00:00:01.000Z mode=DEEP DCI=8/8 evaluator_conf=1 outcome=PASS user_conf=1",
    );
  });

  test("customer-reviewed SKIPPED row (dci skipped + n/a + n/a) is legitimate for non-SKIPPED outcomes", () => {
    // The skill: "skipped" is used for any case where the score is not computed.
    expect(
      formatGate(
        gateRow({ outcome: "RETRY", dci: "skipped", evaluator_conf: "n/a", user_conf: "n/a" }),
        new Date("2026-03-15T14:30:00.000Z"),
      ),
    ).toBe(
      "2026-03-15T14:30:00.000Z mode=LIGHT DCI=skipped evaluator_conf=n/a outcome=RETRY user_conf=n/a",
    );
  });
});

const INVALID_GATE_CASES: Array<[string, Record<string, unknown>, string]> = [
  ["mode NONE", { mode: "NONE" }, "mode"],
  ["mode lowercase light", { mode: "light" }, "mode"],
  ["mode URGENT", { mode: "URGENT" }, "mode"],
  ["mode empty string", { mode: "" }, "mode"],
  ["dci with DCI= prefix (must be bare N/M)", { dci: "DCI=3/4" }, "dci"],
  ["dci odd denominator 5", { dci: "3/5" }, "dci"],
  ["dci odd denominator 7", { dci: "3/7" }, "dci"],
  ["dci denominator 10 (outside even 2-8)", { dci: "3/10" }, "dci"],
  ["dci score above available", { dci: "9/8" }, "dci"],
  ["dci negative score", { dci: "-1/4" }, "dci"],
  ["dci non-integer score", { dci: "2.5/4" }, "dci"],
  ["dci missing slash", { dci: "34" }, "dci"],
  ["dci empty string", { dci: "" }, "dci"],
  ["dci n/a is not a gate reading", { dci: "n/a" }, "dci"],
  ["evaluator_conf below range", { evaluator_conf: "0" }, "evaluator_conf"],
  ["evaluator_conf above range", { evaluator_conf: "6" }, "evaluator_conf"],
  ["evaluator_conf not an integer string", { evaluator_conf: "4x" }, "evaluator_conf"],
  ["evaluator_conf number, not string", { evaluator_conf: 4 }, "evaluator_conf"],
  ["evaluator_conf n/a with a real reading", { evaluator_conf: "n/a" }, "evaluator_conf"],
  ["user_conf below range", { user_conf: "0" }, "user_conf"],
  ["user_conf above range", { user_conf: "6" }, "user_conf"],
  ["SKIPPED outcome must not carry a reading", { outcome: "SKIPPED", dci: "3/4" }, "dci"],
  [
    "SKIPPED outcome must force evaluator n/a",
    { outcome: "SKIPPED", dci: "skipped", evaluator_conf: "4" },
    "evaluator_conf",
  ],
  [
    "SKIPPED outcome must force user n/a",
    { outcome: "SKIPPED", dci: "skipped", evaluator_conf: "n/a", user_conf: "3" },
    "user_conf",
  ],
  ["skipped dci without SKIPPED outcome still forces evaluator n/a", { dci: "skipped" }, "evaluator_conf"],
];

describe("formatGateRow — validation battery (each failure names its field)", () => {
  test("every invalid input throws TelemetryContractError mentioning the violated field", () => {
    expect(INVALID_GATE_CASES.length).toBeGreaterThanOrEqual(19);
    for (const [label, over, field] of INVALID_GATE_CASES) {
      expectTelemetryThrow(() => formatGate(gateRow(over)), field);
      void label;
    }
  });
});

// ── appendGateRow ──

const GATE_LOG = join(".context", "comprehension-log.md");
const LOG_HEADER =
  "# comprehension telemetry (one line per evaluation; no user answers)\n";

function gatePath(base: string): string {
  return join(base, ".context", "comprehension-log.md");
}

describe("appendGateRow — header-once append-only sink", () => {
  test("first write creates the file with exactly one header + the row (created: true)", async () => {
    const base = tempDir("gate-first-");
    const now = new Date("2026-03-15T14:30:05.123Z");
    const result = await appendGate(base, gateRow(), now);
    expect(result.created).toBe(true);
    expect(result.row).toBe(
      "2026-03-15T14:30:05.123Z mode=LIGHT DCI=3/4 evaluator_conf=4 outcome=PASS user_conf=2",
    );
    expect(result.path).toBe(gatePath(base));
    expect(readFileSync(result.path, "utf8")).toBe(`${LOG_HEADER}${result.row}\n`);
  });

  test("second write appends ONLY the row (created: false), pre-existing bytes byte-identical", async () => {
    const base = tempDir("gate-second-");
    const first = await appendGate(base, gateRow(), new Date("2026-03-15T14:30:05.123Z"));
    const second = await appendGate(
      base,
      gateRow({ mode: "DEEP", outcome: "FAIL" }),
      new Date("2026-03-15T15:00:00.456Z"),
    );
    expect(second.created).toBe(false);
    const expected =
      `${LOG_HEADER}${first.row}\n` +
      `2026-03-15T15:00:00.456Z mode=DEEP DCI=3/4 evaluator_conf=4 outcome=FAIL user_conf=2\n`;
    expect(readFileSync(second.path, "utf8")).toBe(expected);
  });

  test("pre-existing headerless file: rows appended WITHOUT an injected header, bytes survive", async () => {
    const base = tempDir("gate-headerless-");
    mkdirSync(join(base, ".context"), { recursive: true });
    const prior = "leftover bytes\n";
    writeFileSync(gatePath(base), prior, "utf-8");
    const result = await appendGate(base, gateRow(), new Date("2026-03-15T14:30:05.123Z"));
    expect(result.created).toBe(false);
    const text = readFileSync(result.path, "utf8");
    expect(text.startsWith(prior)).toBe(true);
    expect(text.includes(LOG_HEADER)).toBe(false);
    expect(text).toBe(prior + `${result.row}\n`);
  });

  test("validation happens BEFORE any fs access: invalid input creates nothing", async () => {
    const base = tempDir("gate-invalid-");
    let thrown = false;
    try {
      await appendGate(base, gateRow({ mode: "NONE" }));
    } catch (error) {
      thrown = true;
      expect(error).toBeInstanceOf(TelemetryContractError);
    }
    expect(thrown).toBe(true);
    expect(existsSync(join(base, ".context"))).toBe(false);
    expect(existsSync(gatePath(base))).toBe(false);
  });

  test("missing .context directory is created recursively on the first valid write", async () => {
    const base = tempDir("gate-mkdir-");
    const result = await appendGate(base, gateRow(), new Date("2026-03-15T14:30:05.123Z"));
    expect(existsSync(result.path)).toBe(true);
  });
});

// ── formatRecallRow (dci1 format) ──

describe("formatRecallRow — byte-exact dci1 rows", () => {
  test("injected LOCAL date → exact row (TZ-independent pin computed in-test)", () => {
    const now = new Date(2026, 2, 15, 14, 30, 5); // LOCAL 2026-03-15 14:30:05
    expect(
      formatRecall(recallRow({ user_conf: "3", dci: "5/6", outcome: "RETRY", retry: 1 }), now),
    ).toBe(
      `${localDate(now)} | plan=0007 | type=dci1 | src=stored | retry=1 | user_conf=3 | evaluator_conf=4 | DCI=5/6 | outcome=RETRY`,
    );
  });

  test("reconstructed source row", () => {
    const now = new Date(2026, 2, 15, 23, 59, 5);
    expect(formatRecall(recallRow({ src: "reconstructed", evaluator_conf: "1" }), now)).toBe(
      `${localDate(now)} | plan=0007 | type=dci1 | src=reconstructed | retry=0 | user_conf=2 | evaluator_conf=1 | DCI=3/4 | outcome=PASS`,
    );
  });

  test("SKIPPED dci1 row: user n/a + evaluator n/a + DCI=skipped", () => {
    const now = new Date(2026, 2, 15, 6, 0, 5);
    expect(
      formatRecall(
        recallRow({
          user_conf: "n/a",
          evaluator_conf: "n/a",
          dci: "skipped",
          outcome: "SKIPPED",
        }),
        now,
      ),
    ).toBe(
      `${localDate(now)} | plan=0007 | type=dci1 | src=stored | retry=0 | user_conf=n/a | evaluator_conf=n/a | DCI=skipped | outcome=SKIPPED`,
    );
  });

  test("a non-SKIPPED outcome with skipped score + n/a + n/a remains legal", () => {
    const now = new Date(2026, 2, 15, 6, 0, 5);
    expect(
      formatRecall(
        recallRow({ user_conf: "n/a", evaluator_conf: "n/a", dci: "skipped", outcome: "FAIL" }),
        now,
      ),
    ).toBe(
      `${localDate(now)} | plan=0007 | type=dci1 | src=stored | retry=0 | user_conf=n/a | evaluator_conf=n/a | DCI=skipped | outcome=FAIL`,
    );
  });
});

const INVALID_RECALL_CASES: Array<[Record<string, unknown>, string]> = [
  [{ plan: "7" }, "plan"],
  [{ plan: "plan=0007" }, "plan"],
  [{ plan: "" }, "plan"],
  [{ plan: "abc" }, "plan"],
  [{ plan: "0007; rm -rf /" }, "plan"],
  [{ plan: "00001" }, "plan"],
  [{ src: "storedx" }, "src"],
  [{ src: "STORED" }, "src"],
  [{ retry: 2 }, "retry"],
  [{ retry: -1 }, "retry"],
  [{ retry: false }, "retry"],
  [{ dci: "3/5" }, "dci"],
  [{ dci: "DCI=3/4" }, "dci"],
  [{ dci: "9/4" }, "dci"],
  [{ user_conf: "0" }, "user_conf"],
  [{ user_conf: "6" }, "user_conf"],
  [{ evaluator_conf: "6" }, "evaluator_conf"],
  [{ outcome: "SKIPPED", dci: "3/4", user_conf: "2", evaluator_conf: "4" }, "dci"],
  [{ outcome: "SKIPPED", dci: "skipped", evaluator_conf: "4", user_conf: "n/a" }, "evaluator_conf"],
  [
    { outcome: "SKIPPED", dci: "skipped", evaluator_conf: "n/a", user_conf: "3" },
    "user_conf",
  ],
];

describe("formatRecallRow — validation battery (each failure names its field)", () => {
  test("every invalid input throws TelemetryContractError mentioning the violated field", () => {
    expect(INVALID_RECALL_CASES.length).toBeGreaterThanOrEqual(19);
    for (const [over, field] of INVALID_RECALL_CASES) {
      expectTelemetryThrow(() => formatRecall(recallRow(over)), field);
    }
  });
});

// ── appendRecallRow + shared header-once sink ──

describe("appendRecallRow — the same sink, same header-once discipline", () => {
  test("recall row appended to the existing gate log without re-emitting the header", async () => {
    const base = tempDir("recall-append-");
    const now = new Date(2026, 2, 15, 14, 30, 5);
    // Pre-existing gate log: the fresh temp dir starts empty, so a gate append
    // materialises the sink first (header-once), then the recall row lands on
    // the existing log and `created` stays false with no re-emitted header.
    await appendGate(base, gateRow(), new Date("2026-03-15T10:00:00.000Z"));
    const result = await appendRecall(base, recallRow(), now);
    expect(result.created).toBe(false);
    expect(result.row).toBe(
      `${localDate(now)} | plan=0007 | type=dci1 | src=stored | retry=0 | user_conf=2 | evaluator_conf=4 | DCI=3/4 | outcome=PASS`,
    );
  });

  test("first-ever write from the recall side also creates header + row (created: true)", async () => {
    const base = tempDir("recall-first-");
    const now = new Date(2026, 2, 15, 14, 30, 5);
    const result = await appendRecall(base, recallRow(), now);
    expect(result.created).toBe(true);
    expect(readFileSync(result.path, "utf8")).toBe(`${LOG_HEADER}${result.row}\n`);
  });

  test("gate + gate + recall share ONE header and stay append-ordered", async () => {
    const base = tempDir("sink-shared-");
    const g1 = await appendGate(base, gateRow(), new Date("2026-03-15T10:00:00.000Z"));
    const g2 = await appendGate(
      base,
      gateRow({ mode: "DEEP", dci: "skipped", evaluator_conf: "n/a", user_conf: "n/a", outcome: "SKIPPED" }),
      new Date("2026-03-15T11:00:00.000Z"),
    );
    const localNow = new Date(2026, 2, 15, 12, 30, 0);
    const r1 = await appendRecall(base, recallRow(), localNow);
    const text = readFileSync(g1.path, "utf8");
    const lines = text.split("\n").filter((line) => line.trim() !== "");
    expect(lines).toEqual([
      LOG_HEADER.trim(),
      g1.row,
      g2.row,
      r1.row,
    ]);
    expect(g1.created).toBe(true);
    expect(g2.created).toBe(false);
    expect(r1.created).toBe(false);
  });
});
