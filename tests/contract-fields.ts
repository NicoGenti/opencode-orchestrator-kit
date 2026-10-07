/**
 * tests/contract-fields.ts — Research Mode contract + deterministic A/B source of truth (v0.6.6)
 *
 * Pure, markdown-free source of truth for:
 *   - DatasetEventV1 (schema_version 1): `.context/research-dataset.jsonl` is a
 *     strictly append-only event log with two event types:
 *       task   → ResearchTupleV1 (19 fields, incl. research_id; DCI0 context)
 *       recall → same research_id + the delayed DCI1 reading (8 fields)
 *   - Slot alternation (A/B) and per-slot behavior
 *   - research_id: v0.6.6 `res-<YYYYMMDD>-<HHMMSS>-<32hex>` — readable task-start
 *     timestamp + 128-bit random suffix, generated once and reused verbatim
 *   - evaluation_id: v0.6.7 `ev-<YYYYMMDD>-<HHMMSS>-<32hex>` — per-evaluation
 *     comprehension record identity (file name), never a dataset field
 *
 * `plan` is descriptive metadata, never an identifier. `dci_delayed` is not a
 * task field: the v0.6.3 single-row backfill edit is retired — the delayed
 * reading is a recall event appended by /recall.
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Dataset event contract version (DatasetEventV1). */
export const SCHEMA_VERSION = 1 as const;

/**
 * research_id format v0.6.6: `res-<YYYYMMDD>-<HHMMSS>-<32 hex chars>` — the
 * readable task-start timestamp (24h clock) plus a 128-bit random suffix
 * sampled from the platform CSPRNG (node:crypto randomBytes). The random
 * suffix is what disambiguates tasks activated in the same second; the
 * timestamp part stays human-sortable. Uniqueness is probabilistic at 128
 * bits (CSPRNG random suffix, never derived). One research_id is generated per
 * task and reused unchanged for the task's recall event and comprehension record
 * (no regeneration, no mutation over the task → recall lifecycle).
 */
const RESEARCH_ID_RE = /^res-\d{8}-\d{6}-[0-9a-f]{32}$/;
/** Legacy formats (v0.6.0–v0.6.5): timestamp-only, or timestamp + 8-hex counter suffix. */
const LEGACY_RESEARCH_ID_RE = /^res-\d{8}-\d{6}(-[0-9a-fA-F]{8})?$/;
/**
 * evaluation_id (v0.6.7): identity of ONE comprehension evaluation (LIGHT/DEEP),
 * same 128-bit shape as the research_id with an `ev-` prefix. One evaluation_id
 * per evaluation, generated once and never regenerated — it names the record
 * file (`.context/comprehension/<evaluation-id>.md`) so multiple
 * evaluations of the same plan stay append-safe. NOT a dataset field: dataset
 * correlation stays on research_id (Research Mode only; `n/a` otherwise).
 */
const EVALUATION_ID_RE = /^ev-\d{8}-\d{6}-[0-9a-f]{32}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DCI_RE = /^DCI=(\d+)\/(\d+)$/;

export function isValidResearchId(v: unknown): boolean {
  return typeof v === "string" && RESEARCH_ID_RE.test(v);
}

/** Legacy-format recogniser (v0.6.0–v0.6.5 ids: rejected on write, kept for migration tests). */
export function isLegacyResearchId(v: unknown): boolean {
  return typeof v === "string" && LEGACY_RESEARCH_ID_RE.test(v);
}

/**
 * v0.6.6 suffix: 16 random bytes (128 bits) from the platform CSPRNG, hex-encoded.
 * The suffix is random, never derived: uniqueness is probabilistic at 128 bits,
 * which is the standard robustness tier (UUID-v4 class).
 */
export function makeResearchIdSuffix(): string {
  return randomBytes(16).toString("hex");
}

/**
 * One research_id per task: generated ONCE at task start, then reused verbatim
 * by the recall event and the comprehension record. Never derived back from
 * (timestamp, index) — re-derivation is impossible by design; correlation is
 * verified by copying the stored id, not by recomputing it.
 */
export function makeResearchId(seed: { timestamp: string }): string {
  return `res-${seed.timestamp}-${makeResearchIdSuffix()}`;
}

export const MAKE_RESEARCH_ID_NOTE =
  "CSPRNG suffix: 128 bits of platform-cryptographic randomness appended to the " +
  "readable task-start timestamp; generated once at task start and reused " +
  "verbatim by the recall event and the comprehension record (never regenerated).";

/** Validator for the comprehension record's `evaluation_id` field / file name. */
export function isValidEvaluationId(v: unknown): boolean {
  return typeof v === "string" && EVALUATION_ID_RE.test(v);
}

/**
 * One evaluation_id per evaluation: generated once per evaluation, then reused
 * verbatim as the record file name. Never derived back from (timestamp, index);
 * never a dataset key — dataset correlation stays on research_id.
 */
export function makeEvaluationId(seed: { timestamp: string }): string {
  return `ev-${seed.timestamp}-${makeResearchIdSuffix()}`;
}

export const MAKE_EVALUATION_ID_NOTE =
  "CSPRNG suffix: 128 bits of platform-cryptographic randomness appended to the " +
  "readable evaluation timestamp; generated once per evaluation and reused " +
  "verbatim as the comprehension record file name (never regenerated). " +
  "evaluation_id is the evaluation's identity; research_id (Research Mode only) " +
  "remains the dataset correlation key.";

export const GATE_TYPES = ["n/a", "NONE", "LIGHT", "DEEP"] as const;
export type GateType = (typeof GATE_TYPES)[number];
export type Slot = "A" | "B";

/**
 * Deterministic slot alternation, 0-based activation order:
 * first active task = A, next = B, then A, B, …
 */
export function slotForTaskIndex(i: number): Slot {
  if (!Number.isInteger(i) || i < 0) throw new Error("task index must be a non-negative integer");
  return i % 2 === 0 ? "A" : "B";
}

export function nextSlot(prev: Slot): Slot {
  return prev === "A" ? "B" : "A";
}

/**
 * A/B behavior source of truth: what each slot runs.
 * Slot A (control): no classification, no gate, 0 gate overhead, never a user skip.
 * Slot B (treatment): classify NONE/LIGHT/DEEP, gate per agents/orchestrator.md.
 * agent_calls is a task-truthfulness counter in BOTH slots (all subagent
 * delegations), never a gate-overhead counter — hence absent from this table.
 */
export const SLOT_BEHAVIOR = {
  A: {
    classification: false,
    gate: false,
    gateType: "n/a",
    coachCalls: 0,
    calibration: false,
    skippedPossible: false,
  },
  B: {
    classification: true,
    gate: true,
    gateType: "NONE|LIGHT|DEEP",
    coachCalls: "NONE=0; LIGHT/DEEP=1 evaluation + at most 1 escalation",
    calibration: true,
    skippedPossible: true,
  },
} as const;

/** Does this gate classification require a comprehension-coach delegation? */
export function gateRequiresCoach(gate: GateType): boolean {
  return gate === "LIGHT" || gate === "DEEP";
}

/** Task event = ResearchTupleV1 (19 fields, canonical order, all required). */
export const TASK_FIELDS = [
  "event", "schema_version", "research_id", "date", "plan", "slot", "task_type",
  "gate_type", "duration_min", "agent_calls", "input_tokens", "output_tokens",
  "user_confidence", "evaluator_confidence", "dci_immediate", "retries", "skipped",
  "bugfix_ref", "tokens_source",
] as const;

/** Recall event: same research_id as the correlated task event + the DCI1 reading. */
export const RECALL_FIELDS = [
  "event", "schema_version", "research_id", "date", "dci_delayed",
  "evaluator_confidence", "retries", "skipped",
] as const;

export type TaskEvent = {
  event: "task"; schema_version: typeof SCHEMA_VERSION; research_id: string;
  date: string; plan: string; slot: Slot; task_type: string; gate_type: GateType;
  duration_min: number; agent_calls: number;
  input_tokens: number; output_tokens: number;
  user_confidence: number | "n/a"; evaluator_confidence: number | "n/a";
  dci_immediate: string; retries: number; skipped: boolean;
  bugfix_ref: string; tokens_source: "estimated" | "exact";
};

/** ResearchTupleV1 (v0.6.4) — the task event of DatasetEventV1. */
export type ResearchTupleV1 = TaskEvent;

export type RecallEvent = {
  event: "recall"; schema_version: typeof SCHEMA_VERSION; research_id: string;
  date: string; dci_delayed: string; evaluator_confidence: number | "n/a";
  retries: number; skipped: boolean;
};

/** Fields forbidden by the dataset schema (v0.6.0 extras + session identifiers). */
export const FORBIDDEN = new Set([
  "ts", "session_id", "task_id", "user_conf", "dci1", "gap", "src",
  "confidence_delta", "escalations", "questions_count", "alternation",
] as const);

// ── Example events, parsed from command/research-mode.md (single contract source) ──

function parseExampleLines(matcher: string): Record<string, unknown>[] {
  const md = readFileSync(join(repoRoot, "command/research-mode.md"), "utf8");
  const out: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const start = md.indexOf(matcher, from);
    if (start < 0) break;
    const end = md.indexOf("}", start);
    out.push(JSON.parse(md.slice(start, end + 1)) as Record<string, unknown>);
    from = end + 1;
  }
  return out;
}

const taskExamples = parseExampleLines('{"event":"task"');
const recallExamples = parseExampleLines('{"event":"recall"');

if (taskExamples.length < 2) {
  throw new Error(`expected slot A + slot B task events in research-mode.md, found ${taskExamples.length}`);
}
if (recallExamples.length < 1) {
  throw new Error(`expected a recall event example in research-mode.md, found ${recallExamples.length}`);
}

/** All example events parsed from the contract doc (task events first, then recall). */
export const EXAMPLES: Record<string, unknown>[] = [...taskExamples, ...recallExamples];
export const TASK_EXAMPLES: Record<string, unknown>[] = taskExamples;
export const RECALL_EXAMPLES: Record<string, unknown>[] = recallExamples;

export function makeTaskEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...structuredClone(taskExamples[1]), ...overrides };
}

export function makeRecallEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...structuredClone(recallExamples[0]), ...overrides };
}

// ── Validators ──

/** A DCI reading ("n/a" or "DCI=<score>/<even denominator 2-8>"); "n/a" is valid. */
export function validDCI(v: unknown): boolean {
  if (v === "n/a") return true;
  if (typeof v !== "string") return false;
  const m = DCI_RE.exec(v);
  if (!m) return false;
  const avail = Number(m[2]);
  if (avail < 2 || avail > 8 || avail % 2 !== 0) return false;
  return Number(m[1]) <= avail;
}

const isNum = (v: unknown) => typeof v === "string" ? false : typeof v === "number" && Number.isFinite(v);
const isNonNegInt = (v: unknown) => isNum(v) && Number.isInteger(v) && (v as number) >= 0;
const conf1to5orNa = (v: unknown) => v === "n/a" || (isNonNegInt(v) && (v as number) >= 1 && (v as number) <= 5);
const isConf1to5 = (v: unknown) => isNonNegInt(v) && (v as number) >= 1 && (v as number) <= 5;

/** Validate one task event (ResearchTupleV1) against the v0.6.4 contract. [] when valid. */
export function validateTaskEvent(e: Record<string, unknown>): string[] {
  const errs: string[] = [];
  for (const f of TASK_FIELDS) if (!(f in e)) errs.push(`missing field: ${f}`);
  for (const k of Object.keys(e)) {
    if (!(TASK_FIELDS as readonly string[]).includes(k)) errs.push(`unknown field: ${k}`);
    if (FORBIDDEN.has(k)) errs.push(`forbidden field: ${k}`);
  }
  if ("event" in e && e.event !== "task") errs.push("event must be 'task'");
  if ("schema_version" in e && e.schema_version !== SCHEMA_VERSION)
    errs.push(`schema_version must be ${SCHEMA_VERSION}`);
  if ("research_id" in e && !isValidResearchId(e.research_id))
    errs.push("research_id must match res-YYYYMMDD-HHMMSS-<32hex> (v0.6.6 128-bit format)");
  if ("date" in e && !(typeof e.date === "string" && ISO_DATE_RE.test(e.date)))
    errs.push("date must be ISO YYYY-MM-DD");
  if ("plan" in e && typeof e.plan !== "string") errs.push("plan must be a string");
  if ("slot" in e && e.slot !== "A" && e.slot !== "B") errs.push("slot must be A|B");
  if ("task_type" in e && !["bugfix", "feature", "test", "docs", "refactor", "other"].includes(e.task_type as string))
    errs.push("task_type must be one of bugfix|feature|test|docs|refactor|other");
  if ("gate_type" in e && !(GATE_TYPES as readonly string[]).includes(e.gate_type as string))
    errs.push("gate_type must be n/a|NONE|LIGHT|DEEP");
  if ("duration_min" in e && (!isNum(e.duration_min) || (e.duration_min as number) < 0))
    errs.push("duration_min must be a non-negative number");
  if ("agent_calls" in e && !isNonNegInt(e.agent_calls))
    errs.push("agent_calls must be a non-negative integer (count of ALL subagent delegations)");
  if ("input_tokens" in e && !isNonNegInt(e.input_tokens)) errs.push("input_tokens must be a non-negative integer");
  if ("output_tokens" in e && !isNonNegInt(e.output_tokens)) errs.push("output_tokens must be a non-negative integer");
  if ("user_confidence" in e && !conf1to5orNa(e.user_confidence))
    errs.push("user_confidence must be 1-5 or n/a");
  if ("evaluator_confidence" in e && !conf1to5orNa(e.evaluator_confidence))
    errs.push("evaluator_confidence must be 1-5 or n/a");
  if ("dci_immediate" in e && !validDCI(e.dci_immediate))
    errs.push("dci_immediate must be n/a or DCI=<score>/<even denominator 2-8>");
  if ("retries" in e && e.retries !== 0 && e.retries !== 1) errs.push("retries must be 0 or 1");
  if ("skipped" in e && typeof e.skipped !== "boolean") errs.push("skipped must be boolean");
  if ("bugfix_ref" in e) {
    const b = e.bugfix_ref;
    if (typeof b !== "string" || (b !== "" && !/^plan=\d{4}$/.test(b)))
      errs.push('bugfix_ref must be "" or "plan=<NNNN>"');
  }
  if ("tokens_source" in e && e.tokens_source !== "estimated" && e.tokens_source !== "exact")
    errs.push("tokens_source must be estimated|exact");
  if ("dci_delayed" in e)
    errs.push("dci_delayed is not a task field (retired with the v0.6.3 backfill; DCI1 is a recall event)");
  if (e.dci_immediate === "n/a" && e.user_confidence !== "n/a" && e.user_confidence !== undefined && e.slot === "A")
    errs.push("slot A carries no calibration answer");

  // Slot behavior invariants (source of truth: SLOT_BEHAVIOR)
  if (e.slot === "A") {
    if (e.gate_type !== "n/a") errs.push("slot A records gate_type n/a");
    if (e.user_confidence !== "n/a") errs.push("user_confidence is n/a in slot A");
    if (e.evaluator_confidence !== "n/a") errs.push("evaluator_confidence is n/a in slot A");
    if (e.dci_immediate !== "n/a") errs.push("dci_immediate is n/a in slot A (no gate reading in control)");
    if (e.retries !== undefined && e.retries !== 0) errs.push("slot A records 0 retries (no gate)");
    if (e.skipped !== undefined && e.skipped !== false)
      errs.push("slot A never records a user skip (control ≠ skip)");
  }
  if (e.slot === "B") {
    if (e.gate_type === "n/a") errs.push("slot B records its gate classification (NONE/LIGHT/DEEP)");
    if (e.gate_type === "NONE") {
      if (e.user_confidence !== "n/a") errs.push("NONE: no calibration question → user_confidence n/a");
      if (e.evaluator_confidence !== "n/a") errs.push("NONE: no evaluation → evaluator_confidence n/a");
      if (e.dci_immediate !== "n/a") errs.push("NONE: no gate reading → dci_immediate n/a");
      if (e.retries !== undefined && e.retries !== 0) errs.push("NONE: no retries");
      if (e.skipped !== undefined && e.skipped !== false) errs.push("NONE: nothing to skip");
    }
    const gated = e.gate_type === "LIGHT" || e.gate_type === "DEEP";
    if (gated && e.skipped === false) {
      if (!isConf1to5(e.user_confidence))
        errs.push("LIGHT/DEEP without skip: user_confidence must be 1-5 (calibration asked)");
      if (!isConf1to5(e.evaluator_confidence))
        errs.push("LIGHT/DEEP without skip: evaluator_confidence must be 1-5");
      if (typeof e.dci_immediate !== "string" || !DCI_RE.test(e.dci_immediate))
        errs.push("LIGHT/DEEP without skip: dci_immediate must be a DCI reading");
    }
    if (gated && e.skipped === true) {
      if (e.evaluator_confidence !== "n/a") errs.push("SKIPPED: no verdict → evaluator_confidence n/a");
      if (e.dci_immediate !== "n/a") errs.push("SKIPPED: no reading → dci_immediate n/a");
    }
  }
  return errs;
}

/** Validate one recall event against the v0.6.4 contract. [] when valid. */
export function validateRecallEvent(e: Record<string, unknown>): string[] {
  const errs: string[] = [];
  for (const f of RECALL_FIELDS) if (!(f in e)) errs.push(`missing field: ${f}`);
  for (const k of Object.keys(e)) {
    if (!(RECALL_FIELDS as readonly string[]).includes(k)) errs.push(`unknown field: ${k}`);
    if (FORBIDDEN.has(k)) errs.push(`forbidden field: ${k}`);
  }
  if ("event" in e && e.event !== "recall") errs.push("event must be 'recall'");
  if ("schema_version" in e && e.schema_version !== SCHEMA_VERSION)
    errs.push(`schema_version must be ${SCHEMA_VERSION}`);
  if ("research_id" in e && !isValidResearchId(e.research_id))
    errs.push("research_id must match res-YYYYMMDD-HHMMSS-<32hex> (v0.6.6 128-bit format)");
  if ("date" in e && !(typeof e.date === "string" && ISO_DATE_RE.test(e.date)))
    errs.push("date must be ISO YYYY-MM-DD");
  if ("dci_delayed" in e && !validDCI(e.dci_delayed))
    errs.push("dci_delayed must be n/a or DCI=<score>/<even denominator 2-8>");
  if ("evaluator_confidence" in e && !conf1to5orNa(e.evaluator_confidence))
    errs.push("evaluator_confidence must be 1-5 or n/a");
  if ("retries" in e && e.retries !== 0 && e.retries !== 1) errs.push("retries must be 0 or 1");
  if ("skipped" in e && typeof e.skipped !== "boolean") errs.push("skipped must be boolean");
  if (e.skipped === true) {
    if (e.dci_delayed !== "n/a") errs.push("skipped recall: dci_delayed must be n/a");
    if (e.evaluator_confidence !== "n/a") errs.push("skipped recall: evaluator_confidence must be n/a");
  }
  if (e.skipped === false) {
    if (typeof e.dci_delayed !== "string" || !DCI_RE.test(e.dci_delayed))
      errs.push("non-skipped recall: dci_delayed must be a DCI reading");
    if (!isConf1to5(e.evaluator_confidence))
      errs.push("non-skipped recall: evaluator_confidence must be 1-5");
  }
  return errs;
}

/** Dispatch one parsed dataset line to its event validator. */
export function validateEventLine(e: Record<string, unknown>): string[] {
  if (e.event === "task") return validateTaskEvent(e);
  if (e.event === "recall") return validateRecallEvent(e);
  return ["event must be 'task' or 'recall'"];
}

/** Correlation: a recall event is tied to its task by the SAME research_id. */
export function sameResearchId(task: Record<string, unknown>, ev: Record<string, unknown>): boolean {
  return task.research_id === ev.research_id;
}