/**
 * comprehension.ts — Phase 4 (plan 13): the comprehension gate + telemetry
 * writer ported into the OpenCode 2 plugin (pinned by
 * tests/plugin-comprehension.test.ts).
 *
 * Everything here is drift-pinned against the kit's canonical surfaces:
 *   - CLASSIFICATION_RULES triggers are verbatim rows of the classification
 *     table in agents/orchestrator.md;
 *   - COMPREHENSION_DEFAULTS deep-equal templates/comprehension.config.json;
 *   - the sink is `.context/comprehension-log.md` with the exact header-once
 *     + append-only discipline documented in agents/orchestrator.md and the
 *     `comprehension-workflow` skill.
 *
 * Guaranteed properties (mirrors of the orchestrator contract):
 *   - loadComprehensionConfig NEVER throws: absent file is silent defaults,
 *     every other defect degrades to defaults plus one or more warnings;
 *   - formatGateRow / formatRecallRow validate BEFORE any fs access and
 *     throw TelemetryContractError naming the violated field on any drift;
 *   - append* validate first, then append one row (never rewrite bytes).
 *
 * Dependencies: node:fs + node:path only.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── classification rules (verbatim agents/orchestrator.md table rows) ──

/** Strict comprehension-gate modes: NONE-classified tasks never reach the gate. */
export type GateMode = "LIGHT" | "DEEP";

/** Final verdicts of a comprehension-coach evaluation. */
export type GateOutcome = "PASS" | "FAIL" | "RETRY" | "SKIPPED";

/** One classification tier: its trigger list plus the coach question budget. */
export interface ClassificationRule {
  /** Verbatim trigger string from the agents/orchestrator.md table row. */
  triggers: string;
  /** Maximum comprehension-coach calls the tier allows (0 for NONE). */
  coachCalls: number;
}

/** Classification tiers, verbatim-pinned against agents/orchestrator.md. */
export const CLASSIFICATION_RULES: Record<"NONE" | GateMode, ClassificationRule> = {
  NONE: {
    triggers: "docs, formatting, comment changes, mechanical rename, non-behavioral changes",
    coachCalls: 0,
  },
  LIGHT: {
    triggers: "small bug fix, localized behavioral change, small validation, single-concern modification",
    coachCalls: 2,
  },
  DEEP: {
    triggers: "business logic, new abstraction, state/control flow, persistence, API contract, auth/security, concurrency, cross-layer, architecture",
    coachCalls: 4,
  },
};

/**
 * Does this classification require a comprehension-coach delegation?
 * Only NONE skips the coach entirely.
 */
export function gateRequiresCoach(mode: "NONE" | GateMode): boolean {
  return mode !== "NONE";
}

// ── contract error ──

/**
 * Thrown whenever telemetry input violates the byte-level row contract or the
 * research dataset schema. The message always names the violated field so
 * callers can surface actionable drift.
 */
export class TelemetryContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelemetryContractError";
  }
}

// ── configuration defaults + tolerant loader ──

/** Path of the config file relative to the session base directory. */
const CONFIG_REPR = ".opencode/comprehension.config.json";

/**
 * Built-in defaults of `.opencode/comprehension.config.json`; deep-equal (and
 * mirrored from) templates/comprehension.config.json at the repo root.
 */
export const COMPREHENSION_DEFAULTS = {
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

/** Deep clone of the defaults, so every loader call gets a fresh object. */
function freshDefaults(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(COMPREHENSION_DEFAULTS)) as Record<string, unknown>;
}

const isBoolean = (value: unknown): boolean => typeof value === "boolean";
const isString = (value: unknown): boolean => typeof value === "string";
const isPositiveInt = (value: unknown): boolean =>
  typeof value === "number" && Number.isInteger(value) && value > 0;
const isNonNegativeInt = (value: unknown): boolean =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

/** Per-leaf validation rule for one dotted config path. */
interface LeafRule {
  check: (value: unknown) => boolean;
  /** Human-readable expectation used in the dotted-path warning. */
  expected: string;
}

/** Validation rules per dotted leaf path of the config tree. */
const LEAF_RULES: Record<string, LeafRule> = {
  "comprehension.enabled": { check: isBoolean, expected: "a boolean" },
  "comprehension.mode": { check: isString, expected: "a string" },
  "comprehension.light.questions": { check: isPositiveInt, expected: "a positive integer" },
  "comprehension.light.modelTier": { check: isString, expected: "a string" },
  "comprehension.deep.questions": { check: isPositiveInt, expected: "a positive integer" },
  "comprehension.deep.modelTier": { check: isString, expected: "a string" },
  "comprehension.deep.escalationTier": { check: isString, expected: "a string" },
  "comprehension.context.maxDiffLines": { check: isPositiveInt, expected: "a positive integer" },
  "comprehension.context.unifiedContextLines": {
    check: isNonNegativeInt,
    expected: "a non-negative integer",
  },
  "comprehension.context.maxRelatedSymbols": {
    check: isNonNegativeInt,
    expected: "a non-negative integer",
  },
  "comprehension.evaluation.maxRetries": {
    check: isNonNegativeInt,
    expected: "a non-negative integer",
  },
  "comprehension.evaluation.escalateOnAmbiguity": { check: isBoolean, expected: "a boolean" },
  "recall.enabled": { check: isBoolean, expected: "a boolean" },
  "recall.automatic": { check: isBoolean, expected: "a boolean" },
  "research.enabled": { check: isBoolean, expected: "a boolean" },
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Recursively merges one section of the parsed file over the defaults. Only
 * dotted paths with a rule can override (and only with valid values); every
 * unknown key is ignored silently; invalid leaves fall back to the default
 * and emit exactly one warning containing the dotted path.
 */
function mergeSection(
  defaults: Record<string, unknown>,
  file: Record<string, unknown>,
  pathPrefix: string,
  warnings: string[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const key of Object.keys(defaults)) {
    const leafPath = `${pathPrefix}${key}`;
    const rule = LEAF_RULES[leafPath];
    if (rule) {
      if (key in file && rule.check(file[key])) {
        merged[key] = file[key];
      } else {
        if (key in file) {
          warnings.push(
            `${CONFIG_REPR}: ignoring invalid value for "${leafPath}" (expected ${rule.expected}); using the built-in default`,
          );
        }
        merged[key] = defaults[key];
      }
      continue;
    }
    const nested = file[key];
    if (isPlainObject(nested) && isPlainObject(defaults[key])) {
      merged[key] = mergeSection(
        defaults[key] as Record<string, unknown>,
        nested,
        `${leafPath}.`,
        warnings,
      );
    } else {
      merged[key] = defaults[key];
    }
  }
  return merged;
}

/** The `{ config, warnings }` pair returned by `loadComprehensionConfig`. */
export interface LoadedComprehensionConfig {
  /** Effective configuration (defaults merged with valid file overrides). */
  config: Record<string, unknown>;
  /** One human-readable warning per defect; empty for the silent cases. */
  warnings: string[];
}

/**
 * Loads `.opencode/comprehension.config.json` under `baseDir`. NEVER throws:
 *   - absent file → defaults + zero warnings (deliberate silent defaults);
 *   - empty file, unparseable JSON or a non-object top level → defaults +
 *     exactly one warning mentioning "comprehension.config";
 *   - per-key nested merge (file value > default), unknown keys silently
 *     ignored, invalid leaves revert to their default with one dotted-path
 *     warning each.
 */
export function loadComprehensionConfig(baseDir: string): LoadedComprehensionConfig {
  const path = join(baseDir, ".opencode", "comprehension.config.json");
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    // Absent (or unreadable) config: silent defaults, per contract.
    return { config: freshDefaults(), warnings: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      config: freshDefaults(),
      warnings: [
        `${CONFIG_REPR} could not be parsed as JSON; using the built-in defaults`,
      ],
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      config: freshDefaults(),
      warnings: [
        `${CONFIG_REPR} has a non-object top level; using the built-in defaults`,
      ],
    };
  }
  const warnings: string[] = [];
  const config = mergeSection(freshDefaults(), parsed, "", warnings);
  return { config, warnings };
}

// ── telemetry rows ──

/** Byte-exact header emitted exactly once when the log sink is created. */
const LOG_HEADER =
  "# comprehension telemetry (one line per evaluation; no user answers)\n";

/** Absolute path of the single telemetry sink for both row types. */
function logPath(baseDir: string): string {
  return join(baseDir, ".context", "comprehension-log.md");
}

/** Result of a successful telemetry append pass-through. */
export interface TelemetryAppendResult {
  path: string;
  row: string;
  /** True only when this write created the sink (header included). */
  created: boolean;
}

const DCI_RE = /^(\d+)\/(\d+)$/;
const RATING_RE = /^[1-5]$/;
const GATE_OUTCOMES: readonly string[] = ["PASS", "FAIL", "RETRY", "SKIPPED"];

/** `"skipped"`, or a bare `N/M` reading with an even 2-8 denominator and 0≤N≤M. */
function isValidDCI(value: unknown): boolean {
  if (value === "skipped") {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }
  const match = DCI_RE.exec(value);
  if (!match) {
    return false;
  }
  const score = Number(match[1]);
  const available = Number(match[2]);
  return (
    available >= 2 && available <= 8 && available % 2 === 0 && score >= 0 && score <= available
  );
}

/** Contract violation helper: the message always leads with the field name. */
function telemetryThrow(field: string, detail: string): never {
  throw new TelemetryContractError(`${field}: ${detail}`);
}

/** Human-readable rendering of an arbitrary value for error messages. */
function repr(value: unknown): string {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

/** Shared checks for user_conf/evaluator_conf on a non-skipped row. */
function assertConfidence(
  field: "user_conf" | "evaluator_conf",
  value: unknown,
  allowNA: boolean,
): void {
  if (typeof value !== "string") {
    telemetryThrow(field, `must be a string, got ${repr(value)}`);
  }
  if (allowNA && value === "n/a") {
    return;
  }
  if (!RATING_RE.test(value)) {
    const allowed = allowNA ? `"n/a" or the string "1".."5"` : `the string "1".."5"`;
    telemetryThrow(field, `must be ${allowed}, got ${repr(value)}`);
  }
}

/** Shared checks for evaluator_conf + user_conf once the outcome/DCI are known. */
function assertConfidencePair(
  outcome: string,
  skippedScore: boolean,
  evaluatorConf: unknown,
  userConf: unknown,
): void {
  if (typeof evaluatorConf !== "string") {
    telemetryThrow("evaluator_conf", `must be a string, got ${repr(evaluatorConf)}`);
  }
  if (skippedScore) {
    if (evaluatorConf !== "n/a") {
      telemetryThrow(
        "evaluator_conf",
        `must be "n/a" when the DCI is skipped, got ${repr(evaluatorConf)}`,
      );
    }
  } else {
    assertConfidence("evaluator_conf", evaluatorConf, false);
  }
  if (outcome === "SKIPPED") {
    if (userConf !== "n/a") {
      telemetryThrow(
        "user_conf",
        `must be "n/a" for an outcome=SKIPPED row, got ${repr(userConf)}`,
      );
    }
  } else {
    assertConfidence("user_conf", userConf, true);
  }
}

/**
 * Validates one gate-row input against the byte-level contract. Throws a
 * TelemetryContractError naming the first violated field.
 */
function validateGateRow(row: Record<string, unknown>): void {
  const { mode, dci, evaluator_conf, user_conf, outcome } = row;
  if (mode !== "LIGHT" && mode !== "DEEP") {
    telemetryThrow("mode", `must be LIGHT or DEEP, got ${repr(mode)}`);
  }
  if (!isValidDCI(dci)) {
    telemetryThrow(
      "dci",
      `must be "skipped" or a bare N/M reading with an even denominator 2-8 and 0 <= N <= M, got ${repr(dci)}`,
    );
  }
  const skippedScore = dci === "skipped";
  if (typeof outcome !== "string" || !GATE_OUTCOMES.includes(outcome)) {
    telemetryThrow("outcome", `must be PASS|FAIL|RETRY|SKIPPED, got ${repr(outcome)}`);
  }
  if (outcome === "SKIPPED" && !skippedScore) {
    telemetryThrow(
      "dci",
      `an outcome=SKIPPED row must carry DCI=skipped, got ${repr(dci)}`,
    );
  }
  assertConfidencePair(outcome, skippedScore, evaluator_conf, user_conf);
}

/**
 * Formats one gate telemetry row (UTC ISO-8601 millisecond stamp):
 * `<ISO> mode=<LIGHT|DEEP> DCI=<N/M|skipped> evaluator_conf=<1-5|n/a>
 * outcome=<PASS|FAIL|RETRY|SKIPPED> user_conf=<1-5|n/a>`. Input may be any
 * value: validation runs BEFORE anything else, and any contract violation
 * throws a `TelemetryContractError` whose message names the violated field
 * (an input already carrying a `DCI=` prefix on `dci` is an error).
 */
export function formatGateRow(input: unknown, now?: Date): string {
  if (!isPlainObject(input)) {
    telemetryThrow("input", "must be an object");
  }
  validateGateRow(input);
  const iso = (now ?? new Date()).toISOString();
  return `${iso} mode=${input.mode} DCI=${input.dci} evaluator_conf=${input.evaluator_conf} outcome=${input.outcome} user_conf=${input.user_conf}`;
}

/** LOCAL calendar date "YYYY-MM-DD" (same decision as plan-board `today()`). */
function localCalendarDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Valid bare plan id for a dci1 row: exactly four decimal digits. */
const PLAN_ID_RE = /^\d{4}$/;

/**
 * Validates one recall (dci1) row input. Same rules as the gate row plus the
 * dci1 envelope (plan/src/retry); throws naming the first violated field.
 */
function validateRecallRow(row: Record<string, unknown>): void {
  const { plan, src, retry, dci, evaluator_conf, user_conf, outcome } = row;
  if (typeof plan !== "string" || !PLAN_ID_RE.test(plan)) {
    telemetryThrow("plan", `must be a four-digit plan id string, got ${repr(plan)}`);
  }
  if (src !== "stored" && src !== "reconstructed") {
    telemetryThrow("src", `must be stored|reconstructed, got ${repr(src)}`);
  }
  if (retry !== 0 && retry !== 1) {
    telemetryThrow("retry", `must be 0 or 1, got ${repr(retry)}`);
  }
  if (!isValidDCI(dci)) {
    telemetryThrow(
      "dci",
      `must be "skipped" or a bare N/M reading with an even denominator 2-8 and 0 <= N <= M, got ${repr(dci)}`,
    );
  }
  const skippedScore = dci === "skipped";
  if (typeof outcome !== "string" || !GATE_OUTCOMES.includes(outcome)) {
    telemetryThrow("outcome", `must be PASS|FAIL|RETRY|SKIPPED, got ${repr(outcome)}`);
  }
  if (outcome === "SKIPPED" && !skippedScore) {
    telemetryThrow(
      "dci",
      `an outcome=SKIPPED row must carry DCI=skipped, got ${repr(dci)}`,
    );
  }
  assertConfidencePair(outcome, skippedScore, evaluator_conf, user_conf);
}

/**
 * Formats one recall telemetry row in the dci1 format (LOCAL calendar date):
 * `<date> | plan=NNNN | type=dci1 | src=<stored|reconstructed> | retry=0|1 |
 * user_conf=<...> | evaluator_conf=<...> | DCI=<N/M|skipped> | outcome=<...>`.
 * Validation runs BEFORE anything else; violations throw a
 * `TelemetryContractError` naming the violated field.
 */
export function formatRecallRow(input: unknown, now?: Date): string {
  if (!isPlainObject(input)) {
    telemetryThrow("input", "must be an object");
  }
  validateRecallRow(input);
  const date = localCalendarDate(now ?? new Date());
  return `${date} | plan=${input.plan} | type=dci1 | src=${input.src} | retry=${input.retry} | user_conf=${input.user_conf} | evaluator_conf=${input.evaluator_conf} | DCI=${input.dci} | outcome=${input.outcome}`;
}

/**
 * Appends one validated gate row to `<baseDir>/.context/comprehension-log.md`
 * with header-once + append-only discipline: validation happens BEFORE any fs
 * access; the first-ever write creates the file with exactly one header and
 * the row (`created: true`); every later write appends the row only
 * (`created: false`, flag "a", never touching existing bytes).
 */
export async function appendGateRow(
  baseDir: string,
  input: unknown,
  now?: Date,
): Promise<TelemetryAppendResult> {
  const row = formatGateRow(input, now);
  return appendTelemetryRow(baseDir, row);
}

/** Recall (dci1) counterpart of `appendGateRow`; same sink, same discipline. */
export async function appendRecallRow(
  baseDir: string,
  input: unknown,
  now?: Date,
): Promise<TelemetryAppendResult> {
  const row = formatRecallRow(input, now);
  return appendTelemetryRow(baseDir, row);
}

/** Shared sink writer: header once when the file is absent, else row only. */
async function appendTelemetryRow(
  baseDir: string,
  row: string,
): Promise<TelemetryAppendResult> {
  const path = logPath(baseDir);
  const created = !existsSync(path);
  mkdirSync(join(baseDir, ".context"), { recursive: true });
  if (created) {
    writeFileSync(path, `${LOG_HEADER}${row}\n`, {
      encoding: "utf-8",
      flag: "a",
    });
  } else {
    appendFileSync(path, `${row}\n`, { encoding: "utf-8", flag: "a" });
  }
  return { path, row, created };
}
