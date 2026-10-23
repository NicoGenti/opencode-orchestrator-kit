/**
 * research.ts — Phase 4 (plan 13): research telemetry ported into the
 * OpenCode 2 plugin (pinned by tests/plugin-research.test.ts).
 *
 * The validators are a verbatim port of the canonical source of truth in
 * tests/contract-fields.ts (error message strings included), extended with
 * ONE ratified privacy hardening: a string `plan` must be "" or a bare id
 * matching ^[A-Za-z0-9][A-Za-z0-9._-]*$ — code, shell fragments and prose are
 * rejected. `makeResearchId` ports scripts/record-id.ts (UTC stamp + 128-bit
 * suffix from the platform CSPRNG via globalThis.crypto).
 *
 * `ResearchController` owns the consultation lifecycle against the session
 * base directory with a hard zero-I/O guarantee: while research is inactive
 * every entry point throws `ResearchDisabledError` BEFORE any filesystem
 * access — no stat, no read, no write. While active, the controller only ever
 * appends canonical JSONL lines to `.context/research-dataset.jsonl`
 * (mkdir recursive; the dataset is never read, never modified, never given a
 * header).
 *
 * Dependencies: node:fs + node:path only (crypto is the platform global).
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { loadComprehensionConfig, TelemetryContractError } from "./comprehension";

// ── field freezes (canonical order, verbatim port) ──

/** DatasetEventV1 schema version. */
export const SCHEMA_VERSION = 1;

/** Task event = ResearchTupleV1: 19 fields, canonical order, all required. */
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

/** Fields forbidden by the dataset schema (v0.6.0 extras + session identifiers). */
export const FORBIDDEN = new Set([
  "ts", "session_id", "task_id", "user_conf", "dci1", "gap", "src",
  "confidence_delta", "escalations", "questions_count", "alternation",
]);

// ── research_id (port of scripts/record-id.ts) ──

const RESEARCH_ID_RE = /^res-\d{8}-\d{6}-[0-9a-f]{32}$/;

/** Valid v0.6.6 research_id (`res-YYYYMMDD-HHMMSS-<32hex>`). */
export function isValidResearchId(value: unknown): boolean {
  return typeof value === "string" && RESEARCH_ID_RE.test(value);
}

/**
 * One research_id per task: `res-<UTC YYYYMMDD-HHMMSS>-<32hex>` — the readable
 * UTC task-start stamp plus a 128-bit suffix sampled from the platform CSPRNG
 * (`globalThis.crypto.getRandomValues`, 16 bytes), the exact port of
 * scripts/record-id.ts. Generated once at task start and reused verbatim.
 */
export function makeResearchId(now?: Date): string {
  const date = now ?? new Date();
  const pad = (value: number, width: number) => String(value).padStart(width, "0");
  const stamp =
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1, 2)}${pad(date.getUTCDate(), 2)}` +
    `-${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}${pad(date.getUTCSeconds(), 2)}`;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte: number) => byte.toString(16).padStart(2, "0")).join("");
  return `res-${stamp}-${hex}`;
}

// ── slots ──

/** Behavioral A/B slot of a task. */
export type Slot = "A" | "B";

/**
 * Deterministic slot alternation, 0-based activation order: first active task
 * = A, next = B, then A, B, … Negative or non-integer indices throw a
 * `RangeError`.
 */
export function slotForTaskIndex(index: number): Slot {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError("task index must be a non-negative integer");
  }
  return index % 2 === 0 ? "A" : "B";
}

// ── validators (verbatim port of tests/contract-fields.ts + plan hardening) ──

const GATE_TYPES = ["n/a", "NONE", "LIGHT", "DEEP"] as const;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DCI_RE = /^DCI=(\d+)\/(\d+)$/;

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

/**
 * Privacy hardening (v0.6.6+): `plan` is descriptive metadata — a string plan
 * must be "" or a bare id; code, shell fragments and prose are rejected. The
 * error always mentions `plan`.
 */
const BARE_PLAN_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Validate one task event (ResearchTupleV1) against the v0.6.4 contract,
 * with the ratified `plan` privacy hardening. Returns the error strings.
 */
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
  if ("plan" in e && typeof e.plan === "string" && e.plan !== "" && !BARE_PLAN_RE.test(e.plan))
    errs.push('plan must be "" or a bare plan id matching ^[A-Za-z0-9][A-Za-z0-9._-]*$ (no code or prose)');
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

/**
 * Validate one recall event against the v0.6.4 contract. Returns the error
 * strings ([] when valid).
 */
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

// ── controller ──

/**
 * Thrown when a research entry point runs while research mode is inactive.
 * Carries `code: "research-disabled"` so payload producers can map it to the
 * tool error code.
 */
export class ResearchDisabledError extends Error {
  /** Stable machine code mirrored by the tool payload. */
  readonly code = "research-disabled";

  constructor() {
    super("research mode is inactive (config seed or explicit research_set required)");
    this.name = "ResearchDisabledError";
  }
}

/** Snapshot of the consultation state returned by status()/set(). */
export interface ResearchStatus {
  active: boolean;
  /** Where the current state comes from: `default`, `config` or `session`. */
  source: "default" | "config" | "session";
  taskIndex: number;
}

/** Id + slot assigned by `startTask()`. */
export interface ResearchTaskStart {
  research_id: string;
  slot: Slot;
}

/** Result of a successful dataset append (no header, byte-exact line). */
export interface ResearchAppendResult {
  ok: true;
  path: string;
  line: string;
}

const DATASET_RELPATH = join(".context", "research-dataset.jsonl");

/** Options of `ResearchController` (all optional). */
export interface ResearchControllerOptions {
  /** Clock seam used by `startTask()` for the research_id stamp. */
  now?: () => Date;
}

/**
 * Per-base-directory research consultation controller.
 *
 *   - `status()` lazily seeds from `loadComprehensionConfig` (`config` source
 *     when research.enabled is true, else the built-in `default` state) and
 *     never touches the dataset;
 *   - `set(enabled)` flips the state to `session` and resets the slot
 *     alternation counter (no dataset access);
 *   - `startTask()` issues a fresh research_id + slot when active;
 *   - `appendTaskEvent`/`appendRecallEvent` validate (throwing the shared
 *     `TelemetryContractError` on drift) then append one JSONL line.
 *
 * Every entry point throws `ResearchDisabledError` BEFORE any filesystem
 * access while the controller is inactive.
 */
export class ResearchController {
  private readonly baseDir: string;
  private readonly nowFn: (() => Date) | undefined;
  private state: ResearchStatus | null = null;
  private taskIndex = 0;
  private lastTask_: ResearchTaskStart | null = null;

  constructor(baseDir: string, options: ResearchControllerOptions = {}) {
    this.baseDir = baseDir;
    this.nowFn = options.now;
  }

  /** Current state; lazily seeded from the base's config (or the default). */
  status(): ResearchStatus {
    if (this.state === null) {
      const { config } = loadComprehensionConfig(this.baseDir);
      const research = config.research;
      this.state =
        isPlainEvent(research) && research.enabled === true
          ? { active: true, source: "config", taskIndex: 0 }
          : { active: false, source: "default", taskIndex: 0 };
    }
    return { ...this.state };
  }

  /**
   * Session-level activation switch: flips the state, resets the alternation
   * counter to the next slot A, and marks the source `session`. Never touches
   * the dataset.
   */
  async set(enabled: boolean): Promise<ResearchStatus> {
    this.state = { active: enabled, source: "session", taskIndex: 0 };
    this.taskIndex = 0;
    this.lastTask_ = null;
    return { ...this.state };
  }

  /**
   * Records the start of a new task: issues a fresh research_id (UTC stamp of
   * the controller clock + 128-bit CSPRNG suffix) plus the alternating slot,
   * and remembers it (last-issued info only). Zero fs access. Throws
   * `ResearchDisabledError` while inactive, before any fs access.
   */
  async startTask(): Promise<ResearchTaskStart> {
    this.assertActive();
    const research_id = this.nowFn ? makeResearchId(this.nowFn()) : makeResearchId();
    const slot = slotForTaskIndex(this.taskIndex);
    this.taskIndex += 1;
    // `state` is guaranteed non-null here: `assertActive()` above seeds it via
    // `status()`; keep the observable status in sync with the slot counter.
    if (this.state !== null) {
      this.state.taskIndex = this.taskIndex;
    }
    this.lastTask_ = { research_id, slot };
    return { research_id, slot };
  }

  /**
   * Last-issued task info (id + slot), or null before the first task —
   * session memory only, never persisted to the dataset.
   */
  lastTask(): ResearchTaskStart | null {
    return this.lastTask_;
  }

  /**
   * Validates one task event against the dataset contract and appends it as
   * one JSONL line. Zero fs access while inactive; contract drift throws the
   * shared `TelemetryContractError` whose message is the joined error list.
   */
  async appendTaskEvent(event: unknown): Promise<ResearchAppendResult> {
    this.assertActive();
    const errors = validateTaskEvent(asEventRecord(event));
    if (errors.length > 0) {
      throw new TelemetryContractError(errors.join("; "));
    }
    return this.appendLine(event as Record<string, unknown>);
  }

  /**
   * Recall counterpart of `appendTaskEvent`: same research_id correlation,
   * same append-only discipline, same zero-I/O inactive guarantee.
   */
  async appendRecallEvent(event: unknown): Promise<ResearchAppendResult> {
    this.assertActive();
    const errors = validateRecallEvent(asEventRecord(event));
    if (errors.length > 0) {
      throw new TelemetryContractError(errors.join("; "));
    }
    return this.appendLine(event as Record<string, unknown>);
  }

  /** Guard used by every entry point: throws BEFORE any fs access. */
  private assertActive(): void {
    if (!this.status().active) {
      throw new ResearchDisabledError();
    }
  }

  /** Append-only JSONL writer: never reads, never rewrites, no header. */
  private appendLine(event: Record<string, unknown>): ResearchAppendResult {
    const path = join(this.baseDir, DATASET_RELPATH);
    mkdirSync(join(this.baseDir, ".context"), { recursive: true });
    const line = JSON.stringify(event);
    appendFileSync(path, `${line}\n`, { encoding: "utf-8", flag: "a" });
    return { ok: true, path, line };
  }
}

/** Plain-object checker (not re-imported from comprehension for symmetry). */
function isPlainEvent(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Loss-free coercion for validator input: non-objects degrade to a record the
 * validators reject with the canonical "missing field" strings. */
function asEventRecord(event: unknown): Record<string, unknown> {
  return isPlainEvent(event) ? event : {};
}
