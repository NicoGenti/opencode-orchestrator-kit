/**
 * scripts/context-budget.ts — deterministic per-role input/output context
 * budget gate for issue #151.
 *
 *   bun scripts/context-budget.ts --manifest <file|-> [--root <dir>] [--config <file>]
 *
 * Reads a JSON budget manifest (`role`, `mode`, `spec`, `files[]`, optional
 * `output` and `scope`), checks it against the limits of the manifest's role
 * and prints one JSON report to stdout. Exit code 0 on `verdict: "pass"`, 1 on
 * `verdict: "fail"` and on any usage/IO error. `--manifest` and `--config` are
 * resolved under `--root` (default `.`); `-` reads the manifest from stdin.
 *
 * Offline and read-only by contract: the pure core `checkContextBudget` never
 * touches the clock, the environment, or the filesystem, and the CLI adapter
 * only reads the manifest and the config. Nothing is modified and no LLM is
 * called; `node:fs` and `node:path` are the only imports.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import {
  BUDGET_MANIFEST_FIELDS,
  BUDGET_MANIFEST_OPTIONAL_FIELDS,
  estimateTokens,
  hasTraversalSegment,
  loadGateConfig,
} from "./lib/check-common";
import type {
  BudgetManifest,
  BudgetManifestFile,
  BudgetReport,
  GateConfig,
  OversizedFile,
  RoleLimits,
} from "./lib/check-common";

// ── pure core ──

/** Declared chars for a file, falling back to the documented `lines × 40`. */
function fileChars(file: BudgetManifestFile): number {
  return file.chars ?? file.lines * 40;
}

/** Count `### Phase` headings in a spec section. */
function countPhaseHeadings(spec: string): number {
  return spec.match(/^### Phase\b/gm)?.length ?? 0;
}

/**
 * Limits for `role`, falling back to the `default` entry for roles without
 * pinned limits (an unknown role is never a blocking error).
 */
export function resolveRoleLimits(
  config: GateConfig,
  role: string,
): RoleLimits {
  return config.roles[role] ?? config.roles.default ?? {};
}

/**
 * Audit one budget manifest against the limits of its role.
 *
 * Checks, in order: file count, per-file declared line count (collected in
 * `oversized_files`), summed extracted lines, `### Phase` heading count, the
 * diff-only scope rule, and the optional input/output token caps. Pure: no
 * clock, environment, filesystem, or mutation of the manifest.
 */
export function checkContextBudget(
  manifest: BudgetManifest,
  limits: RoleLimits,
): BudgetReport {
  const oversizedFiles: OversizedFile[] = [];
  const blockingIssues: string[] = [];

  if (
    limits.maxFiles !== undefined &&
    manifest.files.length > limits.maxFiles
  ) {
    blockingIssues.push(
      `too_many_files: ${manifest.files.length} files (max ${limits.maxFiles})`,
    );
  }

  let extractedLines = 0;
  for (const file of manifest.files) {
    if (limits.maxFileLines !== undefined && file.lines > limits.maxFileLines) {
      oversizedFiles.push({
        path: file.path,
        lines: file.lines,
        reason: "exceeds_max_lines",
      });
    }
    extractedLines += file.extractedLines ?? 0;
  }

  if (
    limits.maxExtractedLines !== undefined &&
    extractedLines > limits.maxExtractedLines
  ) {
    blockingIssues.push(
      `extracted_lines_exceeded: ${extractedLines} lines (max ${limits.maxExtractedLines})`,
    );
  }

  if (limits.maxPhases !== undefined) {
    const phases = countPhaseHeadings(manifest.spec);
    if (phases > limits.maxPhases) {
      blockingIssues.push(
        `phase_count_exceeded: ${phases} phases (max ${limits.maxPhases})`,
      );
    }
  }

  if (limits.diffOnly === true && manifest.scope !== "diff") {
    blockingIssues.push(
      `not_diff_scoped: role "${manifest.role}" is diff-only but the scope is "${manifest.scope ?? "unset"}"`,
    );
  }

  // `estimateTokens`' documented `ceil(chars / 4)` heuristic applied to the
  // assembled input length (spec + per-file chars); the text is not
  // materialised just to measure it.
  const inputChars =
    manifest.spec.length +
    manifest.files.reduce((sum, file) => sum + fileChars(file), 0);
  const inputTokensEstimate = Math.ceil(inputChars / 4);
  const outputTokensEstimate =
    manifest.mode === "output" && manifest.output !== undefined
      ? estimateTokens(manifest.output)
      : 0;

  if (
    limits.maxInputTokens !== undefined &&
    inputTokensEstimate > limits.maxInputTokens
  ) {
    blockingIssues.push(
      `input_tokens_exceeded: ${inputTokensEstimate} tokens (max ${limits.maxInputTokens})`,
    );
  }
  if (
    limits.maxOutputTokens !== undefined &&
    outputTokensEstimate > limits.maxOutputTokens
  ) {
    blockingIssues.push(
      `output_tokens_exceeded: ${outputTokensEstimate} tokens (max ${limits.maxOutputTokens})`,
    );
  }

  return {
    role: manifest.role,
    verdict:
      oversizedFiles.length === 0 && blockingIssues.length === 0
        ? "pass"
        : "fail",
    input_tokens_estimate: inputTokensEstimate,
    output_tokens_estimate: outputTokensEstimate,
    file_count: manifest.files.length,
    oversized_files: oversizedFiles,
    blocking_issues: blockingIssues,
  };
}

// ── manifest validation ──

export interface ManifestParseResult {
  manifest: BudgetManifest | null;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function optionalString(
  value: unknown,
  field: string,
  errors: string[],
): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    errors.push(`${field} must be a string`);
    return null;
  }
  return value;
}

function parseFile(
  entry: unknown,
  index: number,
  errors: string[],
): BudgetManifestFile | null {
  if (!isRecord(entry)) {
    errors.push(`files[${index}] must be an object`);
    return null;
  }
  const { path, lines, chars, extractedLines } = entry;
  if (typeof path !== "string") {
    errors.push(`files[${index}].path must be a string`);
    return null;
  }
  if (!isNonNegativeInteger(lines)) {
    errors.push(`files[${index}].lines must be a non-negative integer`);
    return null;
  }
  const file: BudgetManifestFile = { path, lines };
  if (chars !== undefined) {
    if (!isNonNegativeInteger(chars)) {
      errors.push(`files[${index}].chars must be a non-negative integer`);
      return null;
    }
    file.chars = chars;
  }
  if (extractedLines !== undefined) {
    if (!isNonNegativeInteger(extractedLines)) {
      errors.push(
        `files[${index}].extractedLines must be a non-negative integer`,
      );
      return null;
    }
    file.extractedLines = extractedLines;
  }
  return file;
}

/**
 * Exhaustive validation and typed reconstruction of a budget manifest: the
 * pinned required/optional field sets, then every type. Returns the parsed
 * manifest or the full error list; nothing is accepted on a partial match.
 */
export function parseBudgetManifest(value: unknown): ManifestParseResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { manifest: null, errors: ["manifest must be a JSON object"] };
  }

  for (const field of BUDGET_MANIFEST_FIELDS) {
    if (!(field in value)) errors.push(`missing field: ${field}`);
  }
  const allowed = new Set<string>([
    ...BUDGET_MANIFEST_FIELDS,
    ...BUDGET_MANIFEST_OPTIONAL_FIELDS,
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`unknown field: ${key}`);
  }

  const { role, mode, spec, files } = value;
  if (typeof role !== "string") errors.push("role must be a string");
  if (mode !== "input" && mode !== "output") {
    errors.push("mode must be input|output");
  }
  if (typeof spec !== "string") errors.push("spec must be a string");
  const output = optionalString(value.output, "output", errors);
  const scope = optionalString(value.scope, "scope", errors);

  const parsedFiles: BudgetManifestFile[] = [];
  if (!Array.isArray(files)) {
    errors.push("files must be an array");
  } else {
    files.forEach((entry, index) => {
      const file = parseFile(entry, index, errors);
      if (file !== null) parsedFiles.push(file);
    });
  }

  if (
    errors.length > 0 ||
    typeof role !== "string" ||
    (mode !== "input" && mode !== "output") ||
    typeof spec !== "string" ||
    output === null ||
    scope === null ||
    !Array.isArray(files)
  ) {
    return { manifest: null, errors };
  }

  const manifest: BudgetManifest = {
    role,
    mode,
    spec,
    files: parsedFiles,
  };
  if (output !== undefined) manifest.output = output;
  if (scope !== undefined) manifest.scope = scope;
  return { manifest, errors: [] };
}

// ── CLI adapter ──

interface CliArguments {
  manifest: string;
  root: string;
  config?: string;
}

const USAGE =
  "Usage: bun scripts/context-budget.ts --manifest <file|-> [--root <dir>] [--config <file>]";

function usage(): never {
  console.error(USAGE);
  process.exit(1);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArguments(argv: string[]): CliArguments | null {
  let manifest: string | undefined;
  let root = ".";
  let config: string | undefined;
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined) return null;
    if (flag === "--manifest") manifest = value;
    else if (flag === "--root") root = value;
    else if (flag === "--config") config = value;
    else return null;
  }
  if (manifest === undefined) return null;
  const args: CliArguments = { manifest, root };
  if (config !== undefined) args.config = config;
  return args;
}

function readManifestOrFail(file: string, root: string): string {
  try {
    return file === "-"
      ? readFileSync(0, "utf-8")
      : readFileSync(join(root, file), "utf-8");
  } catch {
    return fail(`Cannot read manifest: ${file}`);
  }
}

function loadConfigOrFail(root: string, explicitPath?: string) {
  try {
    return loadGateConfig(root, explicitPath);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function main(): void {
  const args = parseArguments(
    process.argv.slice(2).filter((arg) => arg !== "--"),
  );
  if (args === null) usage();

  const rawPaths = [
    args.root,
    args.manifest === "-" ? undefined : args.manifest,
    args.config,
  ];
  for (const raw of rawPaths) {
    if (raw !== undefined && hasTraversalSegment(raw)) {
      fail(`Path traversal detected: ${raw}`);
    }
  }

  const source = readManifestOrFail(args.manifest, args.root);
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return fail("Manifest is not valid JSON");
  }

  const result = parseBudgetManifest(parsed);
  if (result.manifest === null) {
    return fail(`Invalid manifest: ${result.errors.join("; ")}`);
  }

  const configPath =
    args.config === undefined
      ? undefined
      : isAbsolute(args.config)
        ? args.config
        : join(args.root, args.config);
  const loaded = loadConfigOrFail(args.root, configPath);
  const limits = resolveRoleLimits(loaded.config, result.manifest.role);
  const report = checkContextBudget(result.manifest, limits);
  const payload: BudgetReport =
    loaded.configWarning === undefined
      ? report
      : { ...report, config_warning: loaded.configWarning };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = payload.verdict === "pass" ? 0 : 1;
}

if (import.meta.main) main();
