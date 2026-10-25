/**
 * comprehension.ts — pure library for the comprehension gate sinks: telemetry
 * log rows, per-evaluation retention records, the Research Mode dataset
 * (v0.6.6/v0.6.7 contract) and the user-local comprehension config loader.
 *
 * Sources of truth (bound by tests/plugin-comprehension.test.ts):
 *   - tests/contract-fields.ts — dataset contract + validator semantics
 *   - templates/comprehension.config.json — canonical config defaults
 *   - skills/comprehension-workflow/SKILL.md §Telemetry writer / §Retention
 *     records / §Manual /recall — row + record formats
 *
 * Contract (mirrors plugin/src/plan-board.ts): pure library — no stdout,
 * no process exit, and public functions never throw (failures surface as
 * result objects). Filesystem effects are append-only by permission: the
 * telemetry log and the dataset never rewrite existing content. Only node
 * built-ins (node:fs, node:path, node:crypto).
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// ── dataset contract constants (parity with tests/contract-fields.ts) ──

export const GATE_TYPES = ["n/a", "NONE", "LIGHT", "DEEP"] as const;
export type GateType = (typeof GATE_TYPES)[number];

export type Slot = "A" | "B";

/** Task event = ResearchTupleV1 (v0.6.4): 19 fields, canonical order, all required. */
export const TASK_FIELDS = [
  "event", "schema_version", "research_id", "date", "plan", "slot", "task_type",
  "gate_type", "duration_min", "agent_calls", "input_tokens", "output_tokens",
  "user_confidence", "evaluator_confidence", "dci_immediate", "retries", "skipped",
  "bugfix_ref", "tokens_source",
] as const;

/** Recall event (8 fields, canonical order, all required) — appended by /recall. */
export const RECALL_FIELDS = [
  "event", "schema_version", "research_id", "date", "dci_delayed",
  "evaluator_confidence", "retries", "skipped",
] as const;

/** Fields forbidden by the dataset schema (v0.6.0 extras + session identifiers). */
export const FORBIDDEN_FIELDS = [
  "ts", "session_id", "task_id", "user_conf", "dci1", "gap", "src",
  "confidence_delta", "escalations", "questions_count", "alternation",
] as const;

const FORBIDDEN_SET = new Set<string>(FORBIDDEN_FIELDS);

/** research_id format v0.6.6: readable UTC timestamp + 128-bit CSPRNG hex suffix. */
export const RESEARCH_ID_RE = /^res-\d{8}-\d{6}-[0-9a-f]{32}$/;
/** evaluation_id (v0.6.7): same 128-bit shape with an `ev-` prefix. */
export const EVALUATION_ID_RE = /^ev-\d{8}-\d{6}-[0-9a-f]{32}$/;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DCI_RE = /^DCI=(\d+)\/(\d+)$/;

const SCHEMA_VERSION = 1 as const;

// ── ids ──

/** Readable UTC timestamp `YYYYMMDD-HHMMSS` (zero-padded, UTC getters). */
export function utcTimestamp(now: Date = new Date()): string {
  const p2 = (value: number): string => `${value}`.padStart(2, "0");
  return (
    `${now.getUTCFullYear()}` +
    p2(now.getUTCMonth() + 1) +
    p2(now.getUTCDate()) +
    "-" +
    p2(now.getUTCHours()) +
    p2(now.getUTCMinutes()) +
    p2(now.getUTCSeconds())
  );
}

/**
 * One research_id per task: generated ONCE at task start, then reused verbatim
 * by the recall event and the comprehension record (never regenerated).
 * 128-bit CSPRNG suffix via node:crypto randomBytes.
 */
export function makeResearchId(now: Date = new Date()): string {
  return `res-${utcTimestamp(now)}-${randomBytes(16).toString("hex")}`;
}

/** One evaluation_id per evaluation; names the retention record file, never a dataset field. */
export function makeEvaluationId(now: Date = new Date()): string {
  return `ev-${utcTimestamp(now)}-${randomBytes(16).toString("hex")}`;
}

// ── gate + slot helpers ──

/** Does this gate classification require a comprehension-coach delegation? */
export function gateRequiresCoach(gate: GateType): boolean {
  return gate === "LIGHT" || gate === "DEEP";
}

/** Deterministic slot alternation, 0-based activation order (first task = A). */
export function slotForTaskIndex(index: number): Slot {
  return index % 2 === 0 ? "A" : "B";
}

// ── config loader ──

/** Shape of templates/comprehension.config.json (canonical defaults). */
export interface ComprehensionConfig {
  comprehension: {
    enabled: boolean;
    mode: string;
    light: { questions: number; modelTier: string };
    deep: { questions: number; modelTier: string; escalationTier: string };
    context: { maxDiffLines: number; unifiedContextLines: number; maxRelatedSymbols: number };
    evaluation: { maxRetries: number; escalateOnAmbiguity: boolean };
  };
  recall: { enabled: boolean; automatic: boolean };
  research: { enabled: boolean };
}

/** Built-in defaults: structural deep-equal of templates/comprehension.config.json. */
export const DEFAULT_COMPREHENSION_CONFIG: ComprehensionConfig = {
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

const CONFIG_DIR = ".opencode";
const CONFIG_FILE = "comprehension.config.json";

type SectionKey = "comprehension" | "recall" | "research";
const SECTIONS: SectionKey[] = ["comprehension", "recall", "research"];

interface LeafSpec {
  section: SectionKey;
  entry?: string;
  key: string;
  check: (value: unknown) => boolean;
}

const isBoolean: LeafSpec["check"] = (value) => typeof value === "boolean";
const isString: LeafSpec["check"] = (value) => typeof value === "string";
const isPositiveInt: LeafSpec["check"] = (value) =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

/** Validated leaves; everything else in the file is ignored ([SKILL §Configuration]). */
const LEAVES: LeafSpec[] = [
  { section: "comprehension", key: "enabled", check: isBoolean },
  { section: "comprehension", key: "mode", check: isString },
  { section: "comprehension", entry: "light", key: "questions", check: isPositiveInt },
  { section: "comprehension", entry: "light", key: "modelTier", check: isString },
  { section: "comprehension", entry: "deep", key: "questions", check: isPositiveInt },
  { section: "comprehension", entry: "deep", key: "modelTier", check: isString },
  { section: "comprehension", entry: "deep", key: "escalationTier", check: isString },
  { section: "comprehension", entry: "context", key: "maxDiffLines", check: isPositiveInt },
  { section: "comprehension", entry: "context", key: "unifiedContextLines", check: isPositiveInt },
  { section: "comprehension", entry: "context", key: "maxRelatedSymbols", check: isPositiveInt },
  { section: "comprehension", entry: "evaluation", key: "maxRetries", check: isPositiveInt },
  { section: "comprehension", entry: "evaluation", key: "escalateOnAmbiguity", check: isBoolean },
  { section: "recall", key: "enabled", check: isBoolean },
  { section: "recall", key: "automatic", check: isBoolean },
  { section: "research", key: "enabled", check: isBoolean },
];

export interface LoadComprehensionConfigResult {
  config: ComprehensionConfig;
  warnings: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Per-entry merge of `.opencode/comprehension.config.json` over the defaults.
 * Precedence ([SKILL §Configuration]): file value > built-in defaults.
 * Absent file → defaults with zero warnings; invalid JSON → defaults with
 * exactly one warning; an invalid entry (or an invalid section object) falls
 * back to its default with exactly one warning. Never throws.
 */
export function loadComprehensionConfig(
  root: string,
): LoadComprehensionConfigResult {
  const config = structuredClone(DEFAULT_COMPREHENSION_CONFIG);
  const warnings: string[] = [];

  let raw: string;
  try {
    raw = readFileSync(join(root, CONFIG_DIR, CONFIG_FILE), "utf-8");
  } catch {
    // Absent (or unreadable) file: pure defaults, zero warnings.
    return { config, warnings };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnings.push(`${CONFIG_FILE} is not valid JSON; using default limits`);
    return { config, warnings };
  }
  if (!isPlainObject(parsed)) {
    warnings.push(`${CONFIG_FILE} is not a JSON object; using default limits`);
    return { config, warnings };
  }

  const file = parsed as Record<string, unknown>;
  for (const section of SECTIONS) {
    const top = file[section];
    if (top === undefined) continue; // whole section keeps its defaults
    if (!isPlainObject(top)) {
      warnings.push(`${section} section is not a JSON object; using ${section} defaults`);
      continue;
    }
    const topValue = top as Record<string, unknown>;
    const leaves = LEAVES.filter((leaf) => leaf.section === section);
    const entryKeys = new Set(leaves.map((leaf) => leaf.entry));
    for (const entry of entryKeys) {
      let holder: Record<string, unknown> | undefined = topValue;
      let prefix: string = section;
      if (entry !== undefined) {
        prefix = `${section}.${entry}`;
        const sub = topValue[entry];
        if (sub === undefined) continue; // subsection keeps its defaults
        if (!isPlainObject(sub)) {
          warnings.push(`${prefix} section is not a JSON object; using ${prefix} defaults`);
          continue;
        }
        holder = sub as Record<string, unknown>;
      }
      if (holder === undefined) continue;
      const sectionConfig = config[section] as unknown as Record<string, unknown>;
      const target =
        entry === undefined
          ? sectionConfig
          : (sectionConfig as unknown as Record<string, Record<string, unknown>>)[entry];
      for (const leaf of leaves.filter((candidate) => candidate.entry === entry)) {
        if (holder[leaf.key] === undefined) continue; // default kept
        if (!leaf.check(holder[leaf.key])) {
          warnings.push(`${prefix}.${leaf.key} is invalid; using its default`);
          continue;
        }
        target[leaf.key] = holder[leaf.key];
      }
    }
  }
  return { config, warnings };
}

// ── sink paths ──

export function comprehensionLogPath(root: string): string {
  return join(root, ".context", "comprehension-log.md");
}

export function datasetPath(root: string): string {
  return join(root, ".context", "research-dataset.jsonl");
}

export function retentionRecordPath(root: string, evaluationId: string): string {
  return join(root, ".context", "comprehension", `${evaluationId}.md`);
}

// ── telemetry writer ([SKILL §Telemetry writer]) ──

export type Conf = number | "n/a";

export interface ImmediateRow {
  timestamp: Date;
  mode: string;
  dci: string;
  evaluatorConf: Conf;
  outcome: string;
  userConf: Conf;
}

/** One telemetry row: single space-separated fields, no user-answer content. */
export function formatImmediateRow(row: ImmediateRow): string {
  return [
    row.timestamp.toISOString(),
    `mode=${row.mode}`,
    `DCI=${row.dci}`,
    `evaluator_conf=${row.evaluatorConf}`,
    `outcome=${row.outcome}`,
    `user_conf=${row.userConf}`,
  ].join(" ");
}

export interface RecallRow {
  date: string;
  plan: string;
  src: string;
  retry: number;
  userConf: Conf;
  evaluatorConf: Conf;
  dci: string;
  outcome: string;
}

/** One dci1 row ([recall.md step 9] / [SKILL §Manual /recall]). */
export function formatRecallRow(row: RecallRow): string {
  return [
    row.date,
    `plan=${row.plan}`,
    "type=dci1",
    `src=${row.src}`,
    `retry=${row.retry}`,
    `user_conf=${row.userConf}`,
    `evaluator_conf=${row.evaluatorConf}`,
    `DCI=${row.dci}`,
    `outcome=${row.outcome}`,
  ].join(" | ");
}

export type ComprehensionLogResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

/** First-write bootstrap header (written exactly once per file). */
export const COMPREHENSION_LOG_HEADER =
  "# comprehension telemetry (one line per evaluation; no user answers)";

/**
 * Append EXACTLY one telemetry/recall row to `.context/comprehension-log.md`
 * (header-once bootstrap; append-only — a pre-existing headerless file is not
 * rewritten). Never throws; empty/blank rows are rejected with "empty-line".
 */
export function appendComprehensionLog(
  root: string,
  row: string,
): ComprehensionLogResult {
  if (typeof row !== "string" || row.trim() === "") {
    return { ok: false, error: "empty-line" };
  }
  const path = comprehensionLogPath(root);
  try {
    if (existsSync(path)) {
      // Append-only by permission: existing bytes are never rewritten.
      appendFileSync(path, `${row}\n`, "utf-8");
    } else {
      mkdirSync(join(root, ".context"), { recursive: true });
      writeFileSync(path, `${COMPREHENSION_LOG_HEADER}\n${row}\n`, "utf-8");
    }
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── retention records ([SKILL §Retention records]) ──

export interface RetentionFields {
  plan: string;
  evaluationId: string;
  researchId: string;
  questions: string[];
  userConf: Conf;
  dci: string;
  outcome: string;
  date: string;
  src: string;
}

/** Per-evaluation record format (each field on its own line, no answers, no prose). */
export function renderRetentionRecord(fields: RetentionFields): string {
  const lines = [
    `plan: ${fields.plan}`,
    `evaluation_id: ${fields.evaluationId}`,
    `research_id: ${fields.researchId}`,
    "questions:",
  ];
  for (const question of fields.questions) {
    lines.push(`- ? ${question}`);
  }
  lines.push(
    `user_conf: ${fields.userConf}`,
    `dci: ${fields.dci}`,
    `outcome: ${fields.outcome}`,
    `date: ${fields.date}`,
    `src: ${fields.src}`,
  );
  return lines.join("\n");
}

export type RetentionRecordResult =
  | { ok: true; path: string }
  | { ok: false; error: string; path: string };

/**
 * Write the flat per-evaluation record keyed by its evaluation_id; append-safe:
 * a second write of the same evaluation is refused with "record-exists".
 */
export function writeRetentionRecord(
  root: string,
  fields: RetentionFields,
): RetentionRecordResult {
  const path = retentionRecordPath(root, fields.evaluationId);
  try {
    if (existsSync(path)) {
      return { ok: false, error: "record-exists", path };
    }
    mkdirSync(join(root, ".context", "comprehension"), { recursive: true });
    writeFileSync(path, `${renderRetentionRecord(fields)}\n`, "utf-8");
    return { ok: true, path };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      path,
    };
  }
}

// ── dataset event validation (parity with tests/contract-fields.ts) ──

const isNum = (v: unknown): boolean =>
  typeof v === "string" ? false : typeof v === "number" && Number.isFinite(v);
const isNonNegInt = (v: unknown): boolean =>
  isNum(v) && Number.isInteger(v) && (v as number) >= 0;
const conf1to5orNa = (v: unknown): boolean =>
  v === "n/a" || (isNonNegInt(v) && (v as number) >= 1 && (v as number) <= 5);
const isConf1to5 = (v: unknown): boolean =>
  isNonNegInt(v) && (v as number) >= 1 && (v as number) <= 5;

/** A DCI reading ("n/a" or "DCI=<score>/<even denominator 2-8>"). */
function validDCI(v: unknown): boolean {
  if (v === "n/a") return true;
  if (typeof v !== "string") return false;
  const m = DCI_RE.exec(v);
  if (!m) return false;
  const avail = Number(m[2]);
  if (avail < 2 || avail > 8 || avail % 2 !== 0) return false;
  return Number(m[1]) <= avail;
}

function isValidResearchId(v: unknown): boolean {
  return typeof v === "string" && RESEARCH_ID_RE.test(v);
}

/** Validate one task event (ResearchTupleV1) against the v0.6.4 contract. [] when valid. */
export function validateTaskEvent(event: Record<string, unknown>): string[] {
  const errs: string[] = [];
  for (const f of TASK_FIELDS) if (!(f in event)) errs.push(`missing field: ${f}`);
  for (const k of Object.keys(event)) {
    if (!(TASK_FIELDS as readonly string[]).includes(k)) errs.push(`unknown field: ${k}`);
    if (FORBIDDEN_SET.has(k)) errs.push(`forbidden field: ${k}`);
  }
  if ("event" in event && event.event !== "task") errs.push("event must be 'task'");
  if ("schema_version" in event && event.schema_version !== SCHEMA_VERSION)
    errs.push(`schema_version must be ${SCHEMA_VERSION}`);
  if ("research_id" in event && !isValidResearchId(event.research_id))
    errs.push("research_id must match res-YYYYMMDD-HHMMSS-<32hex> (v0.6.6 128-bit format)");
  if ("date" in event && !(typeof event.date === "string" && ISO_DATE_RE.test(event.date)))
    errs.push("date must be ISO YYYY-MM-DD");
  if ("plan" in event && typeof event.plan !== "string") errs.push("plan must be a string");
  if ("slot" in event && event.slot !== "A" && event.slot !== "B") errs.push("slot must be A|B");
  if ("task_type" in event && !["bugfix", "feature", "test", "docs", "refactor", "other"].includes(event.task_type as string))
    errs.push("task_type must be one of bugfix|feature|test|docs|refactor|other");
  if ("gate_type" in event && !(GATE_TYPES as readonly string[]).includes(event.gate_type as string))
    errs.push("gate_type must be n/a|NONE|LIGHT|DEEP");
  if ("duration_min" in event && (!isNum(event.duration_min) || (event.duration_min as number) < 0))
    errs.push("duration_min must be a non-negative number");
  if ("agent_calls" in event && !isNonNegInt(event.agent_calls))
    errs.push("agent_calls must be a non-negative integer (count of ALL subagent delegations)");
  if ("input_tokens" in event && !isNonNegInt(event.input_tokens)) errs.push("input_tokens must be a non-negative integer");
  if ("output_tokens" in event && !isNonNegInt(event.output_tokens)) errs.push("output_tokens must be a non-negative integer");
  if ("user_confidence" in event && !conf1to5orNa(event.user_confidence))
    errs.push("user_confidence must be 1-5 or n/a");
  if ("evaluator_confidence" in event && !conf1to5orNa(event.evaluator_confidence))
    errs.push("evaluator_confidence must be 1-5 or n/a");
  if ("dci_immediate" in event && !validDCI(event.dci_immediate))
    errs.push("dci_immediate must be n/a or DCI=<score>/<even denominator 2-8>");
  if ("retries" in event && event.retries !== 0 && event.retries !== 1) errs.push("retries must be 0 or 1");
  if ("skipped" in event && typeof event.skipped !== "boolean") errs.push("skipped must be boolean");
  if ("bugfix_ref" in event) {
    const b = event.bugfix_ref;
    if (typeof b !== "string" || (b !== "" && !/^plan=\d{4}$/.test(b)))
      errs.push('bugfix_ref must be "" or "plan=<NNNN>"');
  }
  if ("tokens_source" in event && event.tokens_source !== "estimated" && event.tokens_source !== "exact")
    errs.push("tokens_source must be estimated|exact");
  if ("dci_delayed" in event)
    errs.push("dci_delayed is not a task field (retired with the v0.6.3 backfill; DCI1 is a recall event)");
  if (event.dci_immediate === "n/a" && event.user_confidence !== "n/a" && event.user_confidence !== undefined && event.slot === "A")
    errs.push("slot A carries no calibration answer");

  // Slot behavior invariants (source of truth: contract SLOT_BEHAVIOR)
  if (event.slot === "A") {
    if (event.gate_type !== "n/a") errs.push("slot A records gate_type n/a");
    if (event.user_confidence !== "n/a") errs.push("user_confidence is n/a in slot A");
    if (event.evaluator_confidence !== "n/a") errs.push("evaluator_confidence is n/a in slot A");
    if (event.dci_immediate !== "n/a") errs.push("dci_immediate is n/a in slot A (no gate reading in control)");
    if (event.retries !== undefined && event.retries !== 0) errs.push("slot A records 0 retries (no gate)");
    if (event.skipped !== undefined && event.skipped !== false)
      errs.push("slot A never records a user skip (control ≠ skip)");
  }
  if (event.slot === "B") {
    if (event.gate_type === "n/a") errs.push("slot B records its gate classification (NONE/LIGHT/DEEP)");
    if (event.gate_type === "NONE") {
      if (event.user_confidence !== "n/a") errs.push("NONE: no calibration question → user_confidence n/a");
      if (event.evaluator_confidence !== "n/a") errs.push("NONE: no evaluation → evaluator_confidence n/a");
      if (event.dci_immediate !== "n/a") errs.push("NONE: no gate reading → dci_immediate n/a");
      if (event.retries !== undefined && event.retries !== 0) errs.push("NONE: no retries");
      if (event.skipped !== undefined && event.skipped !== false) errs.push("NONE: nothing to skip");
    }
    const gated = event.gate_type === "LIGHT" || event.gate_type === "DEEP";
    if (gated && event.skipped === false) {
      if (!isConf1to5(event.user_confidence))
        errs.push("LIGHT/DEEP without skip: user_confidence must be 1-5 (calibration asked)");
      if (!isConf1to5(event.evaluator_confidence))
        errs.push("LIGHT/DEEP without skip: evaluator_confidence must be 1-5");
      if (typeof event.dci_immediate !== "string" || !DCI_RE.test(event.dci_immediate))
        errs.push("LIGHT/DEEP without skip: dci_immediate must be a DCI reading");
    }
    if (gated && event.skipped === true) {
      if (event.evaluator_confidence !== "n/a") errs.push("SKIPPED: no verdict → evaluator_confidence n/a");
      if (event.dci_immediate !== "n/a") errs.push("SKIPPED: no reading → dci_immediate n/a");
    }
  }
  return errs;
}

/** Validate one recall event against the v0.6.4 contract. [] when valid. */
export function validateRecallEvent(event: Record<string, unknown>): string[] {
  const errs: string[] = [];
  for (const f of RECALL_FIELDS) if (!(f in event)) errs.push(`missing field: ${f}`);
  for (const k of Object.keys(event)) {
    if (!(RECALL_FIELDS as readonly string[]).includes(k)) errs.push(`unknown field: ${k}`);
    if (FORBIDDEN_SET.has(k)) errs.push(`forbidden field: ${k}`);
  }
  if ("event" in event && event.event !== "recall") errs.push("event must be 'recall'");
  if ("schema_version" in event && event.schema_version !== SCHEMA_VERSION)
    errs.push(`schema_version must be ${SCHEMA_VERSION}`);
  if ("research_id" in event && !isValidResearchId(event.research_id))
    errs.push("research_id must match res-YYYYMMDD-HHMMSS-<32hex> (v0.6.6 128-bit format)");
  if ("date" in event && !(typeof event.date === "string" && ISO_DATE_RE.test(event.date)))
    errs.push("date must be ISO YYYY-MM-DD");
  if ("dci_delayed" in event && !validDCI(event.dci_delayed))
    errs.push("dci_delayed must be n/a or DCI=<score>/<even denominator 2-8>");
  if ("evaluator_confidence" in event && !conf1to5orNa(event.evaluator_confidence))
    errs.push("evaluator_confidence must be 1-5 or n/a");
  if ("retries" in event && event.retries !== 0 && event.retries !== 1) errs.push("retries must be 0 or 1");
  if ("skipped" in event && typeof event.skipped !== "boolean") errs.push("skipped must be boolean");
  if (event.skipped === true) {
    if (event.dci_delayed !== "n/a") errs.push("skipped recall: dci_delayed must be n/a");
    if (event.evaluator_confidence !== "n/a") errs.push("skipped recall: evaluator_confidence must be n/a");
  }
  if (event.skipped === false) {
    if (typeof event.dci_delayed !== "string" || !DCI_RE.test(event.dci_delayed))
      errs.push("non-skipped recall: dci_delayed must be a DCI reading");
    if (!isConf1to5(event.evaluator_confidence))
      errs.push("non-skipped recall: evaluator_confidence must be 1-5");
  }
  return errs;
}

/** Dispatch one parsed dataset line to its event validator. */
function validateEventLine(event: Record<string, unknown>): string[] {
  if (event.event === "task") return validateTaskEvent(event);
  if (event.event === "recall") return validateRecallEvent(event);
  return ["event must be 'task' or 'recall'"];
}

// ── research recorder ──

export type AppendResult =
  | { ok: true; noop: true }
  | { ok: true; noop: false }
  | { ok: false; noop: false; error: string };

export type ValidateFileResult =
  | { ok: true; noop: true }
  | { ok: boolean; noop: false; lines: number; errors: string[] };

export interface ResearchRecorder {
  enabled: boolean;
  appendTask: (event: Record<string, unknown>) => AppendResult;
  appendRecall: (event: Record<string, unknown>) => AppendResult;
  validateFile: () => ValidateFileResult;
}

function validateDatasetFile(root: string): ValidateFileResult {
  let content: string;
  try {
    content = readFileSync(datasetPath(root), "utf-8");
  } catch {
    // Absent dataset: nothing to validate.
    return { ok: true, noop: false, lines: 0, errors: [] };
  }
  const errors: string[] = [];
  let lines = 0;
  const physical = content.split("\n");
  for (let i = 0; i < physical.length; i++) {
    const line = physical[i];
    if (line.trim() === "") continue;
    lines++;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      errors.push(`${i + 1}: invalid JSON`);
      continue;
    }
    if (!isPlainObject(parsed)) {
      errors.push(`${i + 1}: not a dataset event object`);
      continue;
    }
    const errs = validateEventLine(parsed);
    if (errs.length > 0) errors.push(`${i + 1}: ${errs.join("; ")}`);
  }
  return { ok: errors.length === 0, noop: false, lines, errors };
}

/**
 * Recorder for the Research Mode lifecycle. When disabled, the recorder never
 * touches the filesystem: every call is a no-op. When enabled: validate first,
 * append exactly one JSONL line only on success — the dataset is strictly
 * append-only (appends only; never read during bootstrap).
 */
export function createResearchRecorder(
  root: string,
  enabled: boolean,
): ResearchRecorder {
  if (!enabled) {
    return {
      enabled: false,
      appendTask: () => ({ ok: true, noop: true }),
      appendRecall: () => ({ ok: true, noop: true }),
      validateFile: () => ({ ok: true, noop: true }),
    };
  }

  const append = (
    event: Record<string, unknown>,
    kind: "task" | "recall",
  ): AppendResult => {
    const errors =
      kind === "task" ? validateTaskEvent(event) : validateRecallEvent(event);
    if (errors.length > 0) {
      return { ok: false, noop: false, error: errors.join("; ") };
    }
    try {
      mkdirSync(join(root, ".context"), { recursive: true });
      appendFileSync(datasetPath(root), `${JSON.stringify(event)}\n`, "utf-8");
      return { ok: true, noop: false };
    } catch (err) {
      return { ok: false, noop: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  return {
    enabled: true,
    appendTask: (event) => append(event, "task"),
    appendRecall: (event) => append(event, "recall"),
    validateFile: () => validateDatasetFile(root),
  };
}
