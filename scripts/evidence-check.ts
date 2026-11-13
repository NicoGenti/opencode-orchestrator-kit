/**
 * scripts/evidence-check.ts — deterministic, marker-only claim verification
 * against repository files for issue #151.
 *
 *   bun scripts/evidence-check.ts --claims <file.json> [--root <dir>]
 *   bun scripts/evidence-check.ts --doc <file.md> [--root <dir>]
 *
 * Claims mode reads `{"claims": [...]}`; doc mode scans a markdown file for
 * `path:line` citations outside fenced code blocks. Every cited file and line
 * is resolved under `--root` (default `.`) and every marker is matched
 * literally: the gate never judges semantics, never rewrites a file, and never
 * calls an LLM. One JSON report goes to stdout; exit code 0 on
 * `verdict: "pass"`, 1 on `verdict: "fail"` and on any usage/IO error.
 *
 * The pure cores (`checkEvidenceClaims`, `extractCitations`) receive file text
 * through an injected reader and touch no filesystem, clock, or environment;
 * the CLI adapter performs every `node:fs` read.
 */

import { readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import {
  CLAIMS_MANIFEST_FIELDS,
  hasTraversalSegment,
} from "./lib/check-common";
import type {
  ClaimResult,
  EvidenceClaim,
  EvidenceReport,
} from "./lib/check-common";

// ── injected content ──

/** Content of one cited file, as returned by an injected reader. */
export interface FileContent {
  exists: boolean;
  text: string | null;
}

/** Reads repository-relative file content. Never called by the pure core. */
export type ContentReader = (relPath: string) => FileContent;

/** Manifest-side claim fields (the authored shape, validated on input). */
const CLAIM_INPUT_FIELDS = [
  "claim",
  "evidence",
  "marker",
  "counterMarker",
  "securitySensitive",
] as const;

// ── evidence parsing ──

export interface ParsedEvidence {
  path: string;
  line: number;
}

/**
 * Split a `path:line` citation at its last colon. Returns `null` when the
 * string carries no numeric line suffix (the caller classifies that as
 * missing evidence).
 */
export function splitEvidence(evidence: string): ParsedEvidence | null {
  const separator = evidence.lastIndexOf(":");
  if (separator <= 0) return null;
  const rawLine = evidence.slice(separator + 1);
  if (!/^\d+$/.test(rawLine)) return null;
  return { path: evidence.slice(0, separator), line: Number(rawLine) };
}

/** Lines of a file: 1-based numbering, one trailing newline ignored. */
function toLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** The evidence as reported: trimmed, and `null` when blank or absent. */
function normaliseEvidence(evidence: EvidenceClaim["evidence"]): string | null {
  if (typeof evidence !== "string") return null;
  const trimmed = evidence.trim();
  return trimmed === "" ? null : trimmed;
}

// ── classification ──

const UNVERIFIED_GUIDANCE =
  "route the task back to explorer with a narrow question";

const BLOCKING_REASONS: Record<string, string> = {
  "missing-evidence": "no file:line evidence was provided",
  "path-traversal": "the evidence path contains a `..` segment",
  "file-not-found": "the cited file does not exist",
  "line-out-of-range": "the cited line is outside the file",
  "marker-not-found": "the cited marker does not appear in the file",
  "strict-evidence-required":
    "a security-sensitive claim needs the marker on the exact cited line",
  "counter-marker-present":
    "the cited file contains the declared counterMarker",
};

interface Classification {
  status: ClaimResult["status"];
  note?: string;
  resolvedEvidence?: string;
  detail?: string;
}

/**
 * Classify one claim. Marker-only and citation-scoped by contract: a marker
 * found in another file never counts, and semantics are never judged.
 */
function classifyClaim(
  claim: EvidenceClaim,
  contentOf: ContentReader,
): Classification {
  const evidence = normaliseEvidence(claim.evidence);
  if (evidence === null) {
    return { status: "unverified", note: "missing-evidence" };
  }

  const parsed = splitEvidence(evidence);
  if (parsed === null) {
    return {
      status: "unverified",
      note: "missing-evidence",
      detail: `"${evidence}" is not a path:line citation`,
    };
  }
  if (hasTraversalSegment(parsed.path)) {
    return {
      status: "unverified",
      note: "path-traversal",
      detail: parsed.path,
    };
  }

  const content = contentOf(parsed.path);
  if (!content.exists || content.text === null) {
    return {
      status: "unverified",
      note: "file-not-found",
      detail: parsed.path,
    };
  }

  const lines = toLines(content.text);
  if (parsed.line < 1 || parsed.line > lines.length) {
    return {
      status: "unverified",
      note: "line-out-of-range",
      detail: `${parsed.path} has ${lines.length} line(s), cited ${parsed.line}`,
    };
  }

  const counterMarker = claim.counterMarker;
  if (
    counterMarker !== undefined &&
    counterMarker !== "" &&
    lines.some((line) => line.includes(counterMarker))
  ) {
    return {
      status: "contradicted",
      note: "counter-marker-present",
      detail: `counterMarker "${counterMarker}" found in ${parsed.path}`,
    };
  }

  const marker =
    claim.marker !== undefined && claim.marker !== ""
      ? claim.marker
      : undefined;
  if (marker === undefined) {
    return claim.securitySensitive === true
      ? {
          status: "unverified",
          note: "strict-evidence-required",
          detail: "no marker was declared",
        }
      : { status: "verified", note: "location-only" };
  }

  if (lines[parsed.line - 1].includes(marker)) {
    return { status: "verified" };
  }

  const matchIndex = lines.findIndex((line) => line.includes(marker));
  if (matchIndex === -1) {
    return claim.securitySensitive === true
      ? {
          status: "unverified",
          note: "strict-evidence-required",
          detail: `marker "${marker}" does not appear in ${parsed.path}`,
        }
      : {
          status: "unverified",
          note: "marker-not-found",
          detail: parsed.path,
        };
  }

  const resolvedEvidence = `${parsed.path}:${matchIndex + 1}`;
  if (claim.securitySensitive === true) {
    return {
      status: "unverified",
      note: "strict-evidence-required",
      resolvedEvidence,
      detail: `marker "${marker}" is at ${resolvedEvidence}, not at the cited line ${parsed.line}`,
    };
  }
  return {
    status: "verified",
    note: "citation-imprecise",
    resolvedEvidence,
  };
}

/** One blocking-issue line: code, claim, reason, and the next action. */
function formatBlockingIssue(
  result: ClaimResult,
  classification: Classification,
): string {
  const code = classification.note ?? "unverified";
  const reason = BLOCKING_REASONS[code] ?? "the claim could not be verified";
  const detail =
    classification.detail === undefined ? "" : ` (${classification.detail})`;
  const guidance =
    result.status === "contradicted"
      ? "correct the claim before proceeding"
      : UNVERIFIED_GUIDANCE;
  return `${code}: ${result.claim} - ${reason}${detail}; ${guidance}`;
}

/**
 * Verify every claim against the files supplied by `contentOf`.
 *
 * Verdict is `fail` when any claim is not `verified`. Pure: no clock,
 * environment, filesystem, or mutation of the input claims.
 */
export function checkEvidenceClaims(
  claims: EvidenceClaim[],
  contentOf: ContentReader,
): EvidenceReport {
  const results: ClaimResult[] = [];
  const blockingIssues: string[] = [];

  for (const claim of claims) {
    const classification = classifyClaim(claim, contentOf);
    const result: ClaimResult = {
      claim: claim.claim,
      status: classification.status,
      evidence: normaliseEvidence(claim.evidence),
    };
    if (classification.resolvedEvidence !== undefined) {
      result.resolved_evidence = classification.resolvedEvidence;
    }
    if (classification.note !== undefined) result.note = classification.note;
    results.push(result);
    if (classification.status !== "verified") {
      blockingIssues.push(formatBlockingIssue(result, classification));
    }
  }

  return {
    verdict: blockingIssues.length === 0 ? "pass" : "fail",
    claims: results,
    blocking_issues: blockingIssues,
  };
}

// ── doc mode ──

/**
 * `path:line` citations, conservative on purpose: a path with a 1-8 character
 * alphanumeric extension that itself contains a letter (so version numbers are
 * not citations), preceded by whitespace, a bracket, a quote, or the line
 * start.
 */
const CITATION_PATTERN = /(?:^|[\s(`"'<])([\w./-]+\.[A-Za-z0-9]{1,8}):(\d+)/g;

/**
 * Scan a markdown document for `path:line` citations outside fenced code
 * blocks. Each citation becomes a location-only claim whose text is the
 * trimmed source line; no marker is available in prose, so the same
 * classification rules apply without a marker.
 */
export function extractCitations(markdown: string): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [];
  let inFence = false;

  for (const rawLine of markdown.split(/\r\n|\r|\n/)) {
    if (/^\s*```/.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const text = rawLine.trim();
    if (text === "") continue;

    for (const match of text.matchAll(CITATION_PATTERN)) {
      const path = match[1];
      const line = match[2];
      // URLs and absolute paths are not repository-relative citations.
      if (path.includes("://") || path.startsWith("/")) continue;
      const extension = path.slice(path.lastIndexOf(".") + 1);
      if (!/[A-Za-z]/.test(extension)) continue;
      claims.push({ claim: text, evidence: `${path}:${line}` });
    }
  }

  return claims;
}

// ── claims manifest validation ──

export interface ClaimsParseResult {
  claims: EvidenceClaim[] | null;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function parseClaim(
  entry: unknown,
  index: number,
  errors: string[],
): EvidenceClaim | null {
  if (!isRecord(entry)) {
    errors.push(`claims[${index}] must be an object`);
    return null;
  }

  let invalid = false;
  const allowed = new Set<string>(CLAIM_INPUT_FIELDS);
  for (const key of Object.keys(entry)) {
    if (!allowed.has(key)) {
      invalid = true;
      errors.push(`claims[${index}] unknown field: ${key}`);
    }
  }

  const { claim, evidence, marker, counterMarker, securitySensitive } = entry;
  if (typeof claim !== "string") {
    invalid = true;
    errors.push(`claims[${index}].claim must be a string`);
  }

  let parsedEvidence: string | null | undefined;
  if (evidence === undefined) {
    parsedEvidence = undefined;
  } else if (evidence === null) {
    parsedEvidence = null;
  } else if (typeof evidence === "string") {
    parsedEvidence = evidence;
  } else {
    invalid = true;
    errors.push(`claims[${index}].evidence must be a string or null`);
  }

  const parsedMarker = optionalString(
    marker,
    `claims[${index}].marker`,
    errors,
  );
  if (parsedMarker === null) invalid = true;
  const parsedCounterMarker = optionalString(
    counterMarker,
    `claims[${index}].counterMarker`,
    errors,
  );
  if (parsedCounterMarker === null) invalid = true;
  if (
    securitySensitive !== undefined &&
    typeof securitySensitive !== "boolean"
  ) {
    invalid = true;
    errors.push(`claims[${index}].securitySensitive must be a boolean`);
  }

  if (invalid || typeof claim !== "string") return null;

  const result: EvidenceClaim = { claim };
  if (parsedEvidence !== undefined) result.evidence = parsedEvidence;
  if (parsedMarker !== undefined && parsedMarker !== null) {
    result.marker = parsedMarker;
  }
  if (parsedCounterMarker !== undefined && parsedCounterMarker !== null) {
    result.counterMarker = parsedCounterMarker;
  }
  if (securitySensitive === true) result.securitySensitive = true;
  return result;
}

/**
 * Exhaustive validation and typed reconstruction of a claims manifest: the
 * pinned `claims` field, then every authored claim field and type. Returns the
 * parsed claims or the full error list; nothing is accepted on a partial match.
 */
export function parseClaimsManifest(value: unknown): ClaimsParseResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { claims: null, errors: ["manifest must be a JSON object"] };
  }

  for (const field of CLAIMS_MANIFEST_FIELDS) {
    if (!(field in value)) errors.push(`missing field: ${field}`);
  }
  const allowed = new Set<string>(CLAIMS_MANIFEST_FIELDS);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`unknown field: ${key}`);
  }

  const entries = value.claims;
  const parsedClaims: EvidenceClaim[] = [];
  if (!Array.isArray(entries)) {
    errors.push("claims must be an array");
  } else {
    entries.forEach((entry, index) => {
      const claim = parseClaim(entry, index, errors);
      if (claim !== null) parsedClaims.push(claim);
    });
  }

  if (errors.length > 0 || !Array.isArray(entries)) {
    return { claims: null, errors };
  }
  return { claims: parsedClaims, errors: [] };
}

// ── CLI adapter ──

interface CliArguments {
  claims?: string;
  doc?: string;
  root: string;
}

const USAGE =
  "Usage: bun scripts/evidence-check.ts (--claims <file.json> | --doc <file.md>) [--root <dir>]";

function usage(): never {
  console.error(USAGE);
  process.exit(1);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseArguments(argv: string[]): CliArguments | null {
  let claims: string | undefined;
  let doc: string | undefined;
  let root = ".";
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (value === undefined) return null;
    if (flag === "--claims") claims = value;
    else if (flag === "--doc") doc = value;
    else if (flag === "--root") root = value;
    else return null;
  }
  // Exactly one of the two modes, never both and never neither.
  if ((claims === undefined) === (doc === undefined)) return null;
  const args: CliArguments = { root };
  if (claims !== undefined) args.claims = claims;
  if (doc !== undefined) args.doc = doc;
  return args;
}

function resolvePath(file: string, root: string): string {
  return isAbsolute(file) ? file : join(root, file);
}

function readSourceOrFail(file: string, root: string): string {
  const resolved = resolvePath(file, root);
  try {
    return readFileSync(resolved, "utf-8");
  } catch {
    return fail(`Cannot read ${file}`);
  }
}

/**
 * Filesystem-backed reader for the CLI. Evidence paths resolve under `root`;
 * a traversing path is refused here as well, so the guard does not depend on
 * the caller (the pure core refuses it first).
 */
function makeContentReader(root: string): ContentReader {
  return (relPath: string): FileContent => {
    if (hasTraversalSegment(relPath)) return { exists: false, text: null };
    const resolved = resolvePath(relPath, root);
    try {
      return { exists: true, text: readFileSync(resolved, "utf-8") };
    } catch {
      return { exists: false, text: null };
    }
  };
}

function claimsFromManifest(file: string, root: string): EvidenceClaim[] {
  const source = readSourceOrFail(file, root);
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return fail("Claims manifest is not valid JSON");
  }
  const result = parseClaimsManifest(parsed);
  if (result.claims === null) {
    return fail(`Invalid claims manifest: ${result.errors.join("; ")}`);
  }
  return result.claims;
}

function main(): void {
  const args = parseArguments(
    process.argv.slice(2).filter((arg) => arg !== "--"),
  );
  if (args === null) usage();

  for (const raw of [args.root, args.claims, args.doc]) {
    if (raw !== undefined && hasTraversalSegment(raw)) {
      fail(`Path traversal detected: ${raw}`);
    }
  }

  const contentOf = makeContentReader(args.root);
  let claims: EvidenceClaim[];
  if (args.claims !== undefined) {
    claims = claimsFromManifest(args.claims, args.root);
  } else if (args.doc !== undefined) {
    claims = extractCitations(readSourceOrFail(args.doc, args.root));
  } else {
    return usage();
  }
  const report = checkEvidenceClaims(claims, contentOf);

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.verdict === "pass" ? 0 : 1;
}

if (import.meta.main) main();
