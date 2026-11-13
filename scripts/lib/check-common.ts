/**
 * scripts/lib/check-common.ts — shared, pure helpers for the two deterministic
 * gates of issue #151: `scripts/context-budget.ts` (per-role input/output
 * context budget) and `scripts/evidence-check.ts` (marker-only claim check).
 *
 * Everything here is deterministic and offline: the only filesystem read is
 * `loadGateConfig`, and only for the config file. No clock, no environment, no
 * network, no `child_process`, no mutation of caller data.
 *
 * `ROLE_DEFAULTS` is the built-in copy of `templates/gates.config.json`
 * `gates.roles` (structural deep-equal, pinned by
 * `tests/check-common.test.ts`); `.opencode/gates.config.json` is the
 * user-local override, merged per role entry.
 */

import { readFileSync } from "node:fs";
import { join, posix, win32 } from "node:path";

// ── limits + config ──

/** Limits for one agent role. Absent keys mean "no limit of that kind". */
export interface RoleLimits {
  maxFiles?: number;
  maxExtractedLines?: number;
  maxFileLines?: number;
  maxPhases?: number;
  diffOnly?: boolean;
  maxInputTokens?: number;
  maxOutputTokens?: number;
}

/** Shape of `templates/gates.config.json` (canonical defaults). */
export interface GateConfig {
  roles: Record<string, RoleLimits>;
}

/**
 * Built-in defaults: structural deep-equal of `templates/gates.config.json`
 * `gates.roles` (the `plugin/src/comprehension.ts` defaults precedent).
 */
export const ROLE_DEFAULTS: Record<string, RoleLimits> = {
  explorer: { maxFiles: 8, maxExtractedLines: 300, maxFileLines: 400 },
  planner: { maxFiles: 2, maxPhases: 1 },
  "developer-fixer": { maxFiles: 5, maxPhases: 1 },
  "code-reviewer": { diffOnly: true },
  default: { maxFiles: 12, maxExtractedLines: 500, maxFileLines: 400 },
};

// ── manifests + reports ──

/** One file entry of a budget manifest. Line/char counts are author-declared. */
export interface BudgetManifestFile {
  path: string;
  lines: number;
  chars?: number;
  extractedLines?: number;
}

/** Input of `scripts/context-budget.ts`. */
export interface BudgetManifest {
  role: string;
  mode: "input" | "output";
  spec: string;
  files: BudgetManifestFile[];
  output?: string;
  scope?: string;
}

/** One oversized-file entry of a budget report. */
export interface OversizedFile {
  path: string;
  lines: number;
  reason: string;
}

/** Output of `scripts/context-budget.ts` (canonical field order below). */
export interface BudgetReport {
  role: string;
  verdict: "pass" | "fail";
  input_tokens_estimate: number;
  output_tokens_estimate: number;
  file_count: number;
  oversized_files: OversizedFile[];
  blocking_issues: string[];
  config_warning?: string;
}

/** One claim as authored in a claims manifest. */
export interface EvidenceClaim {
  claim: string;
  evidence?: string | null;
  marker?: string;
  counterMarker?: string;
  securitySensitive?: boolean;
}

/** One classified claim of an evidence report. */
export interface ClaimResult {
  claim: string;
  status: "verified" | "unverified" | "contradicted";
  evidence: string | null;
  resolved_evidence?: string;
  note?: string;
}

/** Output of `scripts/evidence-check.ts` (canonical field order below). */
export interface EvidenceReport {
  verdict: "pass" | "fail";
  claims: ClaimResult[];
  blocking_issues: string[];
  config_warning?: string;
}

// ── canonical field lists (pinned order, exhaustive for validators) ──

export const BUDGET_REPORT_FIELDS = [
  "role",
  "verdict",
  "input_tokens_estimate",
  "output_tokens_estimate",
  "file_count",
  "oversized_files",
  "blocking_issues",
] as const;

export const BUDGET_REPORT_OPTIONAL_FIELDS = ["config_warning"] as const;

export const OVERSIZED_FILE_FIELDS = ["path", "lines", "reason"] as const;

export const EVIDENCE_REPORT_FIELDS = [
  "verdict",
  "claims",
  "blocking_issues",
] as const;

export const EVIDENCE_REPORT_OPTIONAL_FIELDS = ["config_warning"] as const;

export const CLAIM_FIELDS = ["claim", "status", "evidence"] as const;

export const CLAIM_OPTIONAL_FIELDS = ["resolved_evidence", "note"] as const;

export const BUDGET_MANIFEST_FIELDS = [
  "role",
  "mode",
  "spec",
  "files",
] as const;

export const BUDGET_MANIFEST_OPTIONAL_FIELDS = ["output", "scope"] as const;

export const CLAIMS_MANIFEST_FIELDS = ["claims"] as const;

// ── pure helpers ──

/**
 * Rough token estimate: `ceil(text.length / 4)` (the documented `chars / 4`
 * heuristic). Informational only — the gates never enforce it unless a config
 * sets an explicit token cap.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Lexical path-traversal guard: true when any exact `..` segment is present
 * after splitting on both `/` and `\`. Checked before any filesystem access;
 * no `resolve()`-based bypass.
 */
export function hasTraversalSegment(raw: string): boolean {
  return raw.replace(/\\/g, "/").split("/").includes("..");
}

/**
 * Lexical absolute-path guard: true for a POSIX absolute path (`/...`), a
 * drive-qualified Windows path (`C:\...`, `C:/...`, and drive-relative
 * `C:...`), a UNC path (`\\server\share`), or a Windows root-relative path
 * (`\foo`). Both separators and both platforms are checked, so the verdict
 * never depends on the host OS. Checked before any filesystem access.
 */
export function isAbsolutePath(raw: string): boolean {
  return (
    /^[A-Za-z]:/.test(raw) || posix.isAbsolute(raw) || win32.isAbsolute(raw)
  );
}

/** Narrow an unknown value to a plain (non-array) object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const LIMIT_KEYS = [
  "maxFiles",
  "maxExtractedLines",
  "maxFileLines",
  "maxPhases",
  "maxInputTokens",
  "maxOutputTokens",
] as const;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Per-entry merge of an override over the defaults: a role entry replaces only
 * the keys it declares; every other role and key keeps its default. Neither
 * input is mutated.
 */
export function mergeGateConfig(
  defaults: GateConfig,
  override: { roles?: Record<string, RoleLimits> },
): GateConfig {
  const roles: Record<string, RoleLimits> = {};
  for (const [role, limits] of Object.entries(defaults.roles)) {
    roles[role] = { ...limits };
  }
  for (const [role, limits] of Object.entries(override.roles ?? {})) {
    roles[role] = { ...roles[role], ...limits };
  }
  return { roles };
}

/** Validated role entry, or null when the entry has a wrong-typed limit. */
function toRoleLimits(value: unknown): RoleLimits | null {
  if (!isPlainObject(value)) return null;
  const limits: RoleLimits = {};
  for (const key of LIMIT_KEYS) {
    const field = value[key];
    if (field === undefined) continue;
    if (!isPositiveInteger(field)) return null;
    limits[key] = field;
  }
  const diffOnly = value.diffOnly;
  if (diffOnly !== undefined) {
    if (typeof diffOnly !== "boolean") return null;
    limits.diffOnly = diffOnly;
  }
  return limits;
}

export interface LoadGateConfigResult {
  config: GateConfig;
  configWarning?: "invalid-config";
}

const CONFIG_DIR = ".opencode";
const CONFIG_FILE = "gates.config.json";

/**
 * Load the gate configuration for `root`.
 *
 * Precedence: `.opencode/gates.config.json` (or the explicit path) over the
 * built-in `ROLE_DEFAULTS`. An absent/unreadable file yields pure defaults with
 * no warning; invalid JSON or an invalid shape yields defaults plus
 * `configWarning: "invalid-config"` (never throws for content). Traversal is
 * rejected on the raw `root` and on the path that is actually read, before any
 * filesystem access, so neither a traversing root nor a traversing explicit
 * path can reach a file outside the tree.
 */
export function loadGateConfig(
  root = ".",
  explicitPath?: string,
): LoadGateConfigResult {
  const configPath = explicitPath ?? join(root, CONFIG_DIR, CONFIG_FILE);
  // `join` normalizes a `..` segment away, so the raw root is checked too: a
  // root ending in `..` would otherwise resolve outside itself. Both checks
  // run before any filesystem access; the message names the path to be read.
  if (hasTraversalSegment(root) || hasTraversalSegment(configPath)) {
    throw new Error(`Path traversal detected: ${configPath}`);
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    // Absent (or unreadable) file: pure defaults, zero warnings.
    return { config: { roles: structuredClone(ROLE_DEFAULTS) } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      config: { roles: structuredClone(ROLE_DEFAULTS) },
      configWarning: "invalid-config",
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      config: { roles: structuredClone(ROLE_DEFAULTS) },
      configWarning: "invalid-config",
    };
  }
  const gates = parsed.gates;
  if (gates !== undefined && !isPlainObject(gates)) {
    return {
      config: { roles: structuredClone(ROLE_DEFAULTS) },
      configWarning: "invalid-config",
    };
  }
  const rawRoles = isPlainObject(gates) ? gates.roles : undefined;
  if (rawRoles !== undefined && !isPlainObject(rawRoles)) {
    return {
      config: { roles: structuredClone(ROLE_DEFAULTS) },
      configWarning: "invalid-config",
    };
  }

  const overrideRoles: Record<string, RoleLimits> = {};
  for (const [role, entry] of Object.entries(rawRoles ?? {})) {
    const limits = toRoleLimits(entry);
    if (limits === null) {
      return {
        config: { roles: structuredClone(ROLE_DEFAULTS) },
        configWarning: "invalid-config",
      };
    }
    overrideRoles[role] = limits;
  }

  return {
    config: mergeGateConfig(
      { roles: structuredClone(ROLE_DEFAULTS) },
      { roles: overrideRoles },
    ),
  };
}

// ── report validators ──

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

function checkFieldSet(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
): string[] {
  const errors: string[] = [];
  for (const field of required) {
    if (!(field in value)) errors.push(`missing field: ${field}`);
  }
  const allowed = new Set<string>([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`unknown field: ${key}`);
  }
  return errors;
}

function isStringArray(value: unknown): boolean {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Exhaustive field-set + type + enum check of a budget report. */
export function validateBudgetReport(value: unknown): ValidationResult {
  if (!isPlainObject(value)) {
    return { valid: false, errors: ["report must be a JSON object"] };
  }
  const errors = checkFieldSet(
    value,
    BUDGET_REPORT_FIELDS,
    BUDGET_REPORT_OPTIONAL_FIELDS,
  );
  if ("role" in value && typeof value.role !== "string") {
    errors.push("role must be a string");
  }
  if (
    "verdict" in value &&
    value.verdict !== "pass" &&
    value.verdict !== "fail"
  ) {
    errors.push("verdict must be pass|fail");
  }
  for (const key of [
    "input_tokens_estimate",
    "output_tokens_estimate",
    "file_count",
  ] as const) {
    if (key in value && !isNonNegativeInteger(value[key])) {
      errors.push(`${key} must be a non-negative integer`);
    }
  }
  if ("oversized_files" in value) {
    if (!Array.isArray(value.oversized_files)) {
      errors.push("oversized_files must be an array");
    } else {
      value.oversized_files.forEach((entry: unknown, index: number) => {
        if (!isPlainObject(entry)) {
          errors.push(`oversized_files[${index}] must be an object`);
          return;
        }
        errors.push(
          ...checkFieldSet(entry, OVERSIZED_FILE_FIELDS, []).map(
            (error) => `oversized_files[${index}] ${error}`,
          ),
        );
        if ("path" in entry && typeof entry.path !== "string") {
          errors.push(`oversized_files[${index}].path must be a string`);
        }
        if ("lines" in entry && !isNonNegativeInteger(entry.lines)) {
          errors.push(
            `oversized_files[${index}].lines must be a non-negative integer`,
          );
        }
        if ("reason" in entry && typeof entry.reason !== "string") {
          errors.push(`oversized_files[${index}].reason must be a string`);
        }
      });
    }
  }
  if ("blocking_issues" in value && !isStringArray(value.blocking_issues)) {
    errors.push("blocking_issues must be an array of strings");
  }
  if ("config_warning" in value && typeof value.config_warning !== "string") {
    errors.push("config_warning must be a string");
  }
  return { valid: errors.length === 0, errors };
}

/** Exhaustive field-set + type + enum check of an evidence report. */
export function validateEvidenceReport(value: unknown): ValidationResult {
  if (!isPlainObject(value)) {
    return { valid: false, errors: ["report must be a JSON object"] };
  }
  const errors = checkFieldSet(
    value,
    EVIDENCE_REPORT_FIELDS,
    EVIDENCE_REPORT_OPTIONAL_FIELDS,
  );
  if (
    "verdict" in value &&
    value.verdict !== "pass" &&
    value.verdict !== "fail"
  ) {
    errors.push("verdict must be pass|fail");
  }
  if ("claims" in value) {
    if (!Array.isArray(value.claims)) {
      errors.push("claims must be an array");
    } else {
      value.claims.forEach((entry: unknown, index: number) => {
        if (!isPlainObject(entry)) {
          errors.push(`claims[${index}] must be an object`);
          return;
        }
        errors.push(
          ...checkFieldSet(entry, CLAIM_FIELDS, CLAIM_OPTIONAL_FIELDS).map(
            (error) => `claims[${index}] ${error}`,
          ),
        );
        if ("claim" in entry && typeof entry.claim !== "string") {
          errors.push(`claims[${index}].claim must be a string`);
        }
        if (
          "status" in entry &&
          entry.status !== "verified" &&
          entry.status !== "unverified" &&
          entry.status !== "contradicted"
        ) {
          errors.push(
            `claims[${index}].status must be verified|unverified|contradicted`,
          );
        }
        if (
          "evidence" in entry &&
          entry.evidence !== null &&
          typeof entry.evidence !== "string"
        ) {
          errors.push(`claims[${index}].evidence must be a string or null`);
        }
        if (
          "resolved_evidence" in entry &&
          typeof entry.resolved_evidence !== "string"
        ) {
          errors.push(`claims[${index}].resolved_evidence must be a string`);
        }
        if ("note" in entry && typeof entry.note !== "string") {
          errors.push(`claims[${index}].note must be a string`);
        }
      });
    }
  }
  if ("blocking_issues" in value && !isStringArray(value.blocking_issues)) {
    errors.push("blocking_issues must be an array of strings");
  }
  if ("config_warning" in value && typeof value.config_warning !== "string") {
    errors.push("config_warning must be a string");
  }
  return { valid: errors.length === 0, errors };
}
