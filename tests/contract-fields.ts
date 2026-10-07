import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** ResearchTupleV1 field order (v0.6.3 contract, research-mode.md). */
export const TUPLE_FIELDS = [
  "date", "plan", "slot", "task_type", "gate_type", "duration_min", "agent_calls",
  "input_tokens", "output_tokens", "user_confidence", "evaluator_confidence",
  "dci_immediate", "dci_delayed", "retries", "skipped", "bugfix_ref", "tokens_source",
] as const;

export type ResearchTupleV1 = {
  date: string; plan: string; slot: "A" | "B"; task_type: string;
  gate_type: "n/a" | "NONE" | "LIGHT" | "DEEP"; duration_min: number; agent_calls: number;
  input_tokens: number; output_tokens: number;
  user_confidence: number | "n/a"; evaluator_confidence: number | "n/a";
  dci_immediate: string; dci_delayed: string; retries: number; skipped: boolean;
  bugfix_ref: string | null; tokens_source: "estimated" | "exact";
};

/** Fields forbidden by the v0.6.3 schema (v0.6.0 extras + session_id). */
export const FORBIDDEN = new Set([
  "ts", "session_id", "task_id", "user_conf", "dci1", "gap", "src",
  "confidence_delta", "escalations", "questions_count", "alternation",
] as const);

/** Parse every example tuple line from research-mode.md (slot A and slot B). */
function readExampleLines(): Record<string, unknown>[] {
  const md = readFileSync(join(repoRoot, "command/research-mode.md"), "utf8");
  const out: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const start = md.indexOf('{"date"', from);
    if (start < 0) break;
    out.push(JSON.parse(md.slice(start, md.indexOf("}", start) + 1)) as Record<string, unknown>);
    from = start + 1;
  }
  if (out.length < 2) throw new Error(`expected slot A + slot B example tuples, found ${out.length}`);
  return out;
}

export const EXAMPLES: Record<string, unknown>[] = readExampleLines();

export function makeTuple(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...structuredClone(EXAMPLES[1]), ...overrides };
}

/** Validate one tuple against the v0.6.3 contract. Returns [] when valid. */
export function validateTuple(t: Record<string, unknown>): string[] {
  const errs: string[] = [];
  for (const f of TUPLE_FIELDS) if (!(f in t)) errs.push(`missing field: ${f}`);
  for (const k of Object.keys(t)) {
    if (!(TUPLE_FIELDS as readonly string[]).includes(k)) errs.push(`unknown field: ${k}`);
    if (FORBIDDEN.has(k)) errs.push(`forbidden field: ${k}`);
  }
  if ("slot" in t && !["A", "B"].includes(t.slot as string)) errs.push("slot must be A|B");
  if ("gate_type" in t && !["n/a", "NONE", "LIGHT", "DEEP"].includes(t.gate_type as string)) errs.push("gate_type must be n/a|NONE|LIGHT|DEEP");
  if ("slot" in t && "gate_type" in t && t.slot === "A" && t.gate_type !== "n/a") errs.push("slot A records gate_type n/a");
  if ("slot" in t && "user_confidence" in t && t.slot === "A" && t.user_confidence !== "n/a") errs.push("user_confidence is n/a in slot A");
  const est = t.tokens_source;
  if ("tokens_source" in t && est !== "estimated" && est !== "exact") errs.push("tokens_source must be estimated|exact");
  const isNonNegInt = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
  if (!isNonNegInt(t.input_tokens) || !isNonNegInt(t.output_tokens))
    errs.push("input_tokens/output_tokens must be non-negative integers");
  const uc = t.user_confidence;
  if ("user_confidence" in t && uc !== "n/a" && (typeof uc !== "number" || (uc as number) < 1 || (uc as number) > 5)) errs.push("user_confidence must be 1-5 or n/a");
  const ec = t.evaluator_confidence;
  if ("evaluator_confidence" in t && ec !== "n/a" && (typeof ec !== "number" || (ec as number) < 1 || (ec as number) > 5)) errs.push("evaluator_confidence must be 1-5 or n/a");
  if ("dci_immediate" in t && t.dci_immediate !== "n/a") {
    const m = /^DCI=(\d+)\/(\d+)$/.exec(String(t.dci_immediate));
    if (!m) {
      errs.push("dci_immediate must be n/a or DCI=<score>/<even denominator 2-8>");
    } else {
      const avail = Number(m[2]);
      if (avail < 2 || avail > 8 || avail % 2 !== 0) errs.push("dci_immediate denominator must be even 2-8");
      if (Number(m[1]) > avail) errs.push("dci_immediate score exceeds available");
    }
  }
  const dd = t.dci_delayed;
  if ("dci_delayed" in t && dd !== "n/a") {
    const m = /^DCI=(\d+)\/(\d+)$/.exec(String(dd));
    if (!m) errs.push("dci_delayed must be n/a or DCI=<score>/<even denominator 2-8>");
    else {
      const avail = Number(m[2]);
      if (avail < 2 || avail > 8 || avail % 2 !== 0) errs.push("dci_delayed denominator must be even 2-8");
      if (Number(m[1]) > avail) errs.push("dci_delayed score exceeds available");
    }
  }
  if ("retries" in t) { if (typeof t.retries !== "number" || !Number.isInteger(t.retries) || t.retries < 0) errs.push("retries must be a non-negative integer"); }
  return errs;
}