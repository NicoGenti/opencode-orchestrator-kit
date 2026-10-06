import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const COACH_PATH = join(REPO_ROOT, "agents/comprehension-coach.md");

/** Extracts the frontmatter block body (between the first `---` delimiters). */
function extractFrontmatter(raw: string): string {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error("No YAML frontmatter block found");
  return match[1];
}

/** Returns top-level frontmatter keys (lines beginning with `key:` at column 0). */
function topLevelKeys(frontmatter: string): string[] {
  const keys: string[] = [];
  for (const line of frontmatter.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

const CANONICAL_ORDER = [
  "description",
  "mode",
  "model",
  "temperature",
  "tools",
  "permission",
] as const;

function checkSubsequence(keys: readonly string[]): string | null {
  let cursor = 0;
  for (const key of keys) {
    const expected = CANONICAL_ORDER[cursor];
    if (key === expected) {
      cursor++;
      continue;
    }
    const expectedIdx = CANONICAL_ORDER.indexOf(key as (typeof CANONICAL_ORDER)[number]);
    if (expectedIdx === -1) {
      return `unknown key "${key}"`;
    }
    if (expectedIdx < cursor) {
      return `key "${key}" out of order (expected [${CANONICAL_ORDER.join(", ")}]; got [${keys.join(", ")}])`;
    }
    cursor = expectedIdx + 1;
  }
  return null;
}

describe("comprehension-coach — Phase 1 agent + baseline", () => {
  // ── Group 1: File existence + frontmatter structural checks ──────────────

  test("agents/comprehension-coach.md exists", () => {
    expect(existsSync(COACH_PATH)).toBe(true);
  });

  test("frontmatter keys are in canonical subsequence order", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    const fm = extractFrontmatter(raw);
    const keys = topLevelKeys(fm);
    const problem = checkSubsequence(keys);
    if (problem !== null) throw new Error(problem);
    expect(keys.length).toBeGreaterThan(0);
  });

  test("mode is subagent", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/^mode:\s*subagent/m);
  });

  test("model is {{TIER_FAST}}", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/^model:\s*\{\{TIER_FAST\}\}/m);
  });

  // ── Group 2: Permission / tool surface — read-only enforcement ───────────

  test("webfetch is denied in permission block", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    // Look for webfetch: deny somewhere in the permission block
    const lines = raw.split(/\r?\n/);
    let inPermission = false;
    let found = false;
    for (const line of lines) {
      if (line.startsWith("permission:")) { inPermission = true; continue; }
      if (inPermission && /^[^ ]/.test(line) && !line.startsWith("permission")) break;
      if (inPermission && /webfetch:\s*deny/.test(line)) { found = true; }
    }
    expect(found).toBe(true);
  });

  test("write is denied in permission block", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    const lines = raw.split(/\r?\n/);
    let inPermission = false;
    let found = false;
    for (const line of lines) {
      if (line.startsWith("permission:")) { inPermission = true; continue; }
      if (inPermission && /^[^ ]/.test(line) && !line.startsWith("permission")) break;
      if (inPermission && /write:\s*deny/.test(line)) { found = true; }
    }
    expect(found).toBe(true);
  });

  test("edit is denied in permission block", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    const lines = raw.split(/\r?\n/);
    let inPermission = false;
    let found = false;
    for (const line of lines) {
      if (line.startsWith("permission:")) { inPermission = true; continue; }
      if (inPermission && /^[^ ]/.test(line) && !line.startsWith("permission")) break;
      if (inPermission && /edit:\s*deny/.test(line)) { found = true; }
    }
    expect(found).toBe(true);
  });

  test("task: deny is present", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/task:\s*deny/);
  });

  // ── Group 3: Agent body — phases, dimension tags, no numeric scoring ─────

  test("body contains CHALLENGE section", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/^##?\s*CHALLENGE/m);
  });

  test("body contains EVALUATE section", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/^##?\s*EVALUATE/m);
  });

  test("body contains FLOW dimension tag", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/FLOW/);
  });

  test("body contains RATIONALE dimension tag", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/RATIONALE/);
  });

  test("body contains PREDICTION dimension tag", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/PREDICTION/);
  });

  test("body contains LOCALIZATION dimension tag", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/LOCALIZATION/);
  });

  test("DCI scoring confined to ## EVALUATE (no numeric range pattern outside it)", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    // Since v0.4.0 the coach DOES score DCI — but only inside ## EVALUATE
    // (positive assertions live in the "v0.4.0 DCI + calibration" describe
    // below). This guard locks the confinement: outside the EVALUATE
    // section no numeric range pattern may appear.
    const start = raw.indexOf("## EVALUATE");
    const end = raw.indexOf("## Retry Protocol");
    const outside =
      raw.slice(0, start) + raw.slice(end === -1 ? raw.length : end);
    expect(outside).not.toMatch(/[0-9]\s*-\s*[0-9]/);
  });

  test("DCI references confined to ## EVALUATE (no 'DCI' outside it)", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    const start = raw.indexOf("## EVALUATE");
    const end = raw.indexOf("## Retry Protocol");
    const outside =
      raw.slice(0, start) + raw.slice(end === -1 ? raw.length : end);
    expect(outside).not.toMatch(/\bDCI\b/);
  });

  // ── Group 4: Forbidden-context list + input whitelist ─────────────────────

  test("body contains forbidden-context list (whole conversation)", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw.toLowerCase()).toMatch(/whole conversation/);
  });

  test("body contains forbidden-context list (whole plan)", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw.toLowerCase()).toMatch(/whole plan/);
  });

  test("body contains forbidden-context list (whole repository)", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw.toLowerCase()).toMatch(/whole repository/);
  });

  test("body contains forbidden-context list (previous agent transcripts)", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw.toLowerCase()).toMatch(/previous agent transcripts/);
  });

  test("body contains input whitelist: goal, changed file list, focused diff, symbols", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw.toLowerCase()).toMatch(/goal/);
    expect(raw.toLowerCase()).toMatch(/changed file/);
    expect(raw.toLowerCase()).toMatch(/focused diff/);
    expect(raw.toLowerCase()).toMatch(/symbols/);
  });

  // ── Group 5: Skip protocol ───────────────────────────────────────────────

  test("skip phrase 'skip comprehension' is present", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw.toLowerCase()).toMatch(/skip comprehension/);
  });

  test("SKIPPED outcome is documented distinct from PASS", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    // Both must appear and SKIPPED must not be merged into PASS
    expect(raw).toMatch(/SKIPPED/);
    expect(raw).toMatch(/PASS/);
    // They should not be concatenated in a way that makes them indistinguishable
    expect(raw).not.toMatch(/PASSSKIPPED|SKIPPEDPASS|PASS\s*SKIPPED/);
  });

  // ── Group 6: Retry protocol ─────────────────────────────────────────────

  test("retry max 1 is documented", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/max.*1.*retry|retry.*max.*1|1.*retry/i);
  });

  test("one follow-up after retry is documented", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/follow.up/i);
  });

  test("no unbounded loop wording (no 'repeat' or 'loop' without limit)", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    // Unbounded: "keep asking", "repeat until", "loop indefinitely"
    expect(raw).not.toMatch(/keep asking/i);
    expect(raw).not.toMatch(/loop indefinitely/i);
  });
});

describe("comprehension-coach — v0.4.0 DCI + calibration", () => {
  // Uses the same COACH_PATH and readFileSync pattern as Phase 1

  test("DCI rubric present: Score each dimension 0-2", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/Score each dimension 0-2/);
  });

  test("DCI rubric contains all four dimension names", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/FLOW/);
    expect(raw).toMatch(/RATIONALE/);
    expect(raw).toMatch(/PREDICTION/);
    expect(raw).toMatch(/LOCALIZATION/);
  });

  test("DCI emission format: DCI=<score>/<available_score>", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/DCI=<score>\/<available_score>/);
  });

  test("DCI emission format: DEEP variant DCI=<score>/8", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/DCI=<score>\/8/);
  });

  test("calibration question is inside CHALLENGE section (before EVALUATE)", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    const idxChallenge = raw.indexOf("## CHALLENGE");
    const idxEvaluate = raw.indexOf("## EVALUATE");
    const idxCalibration = raw.indexOf("Quanto pensi di aver compreso la modifica?");
    expect(idxCalibration).toBeGreaterThan(idxChallenge);
    expect(idxCalibration).toBeLessThan(idxEvaluate);
  });

  test("calibration question is NOT in EVALUATE section", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    const idxEvaluate = raw.indexOf("## EVALUATE");
    const idxDciScoring = raw.indexOf("### DCI scoring");
    const idxCalibration = raw.indexOf("Quanto pensi di aver compreso la modifica?");
    // calibration question must be before EVALUATE or after DCI scoring section ends
    // DCI scoring section starts at ### DCI scoring; it ends before ## Retry Protocol
    const idxRetryProtocol = raw.indexOf("## Retry Protocol");
    const afterEvaluateAndBeforeDciScoring = idxCalibration > idxEvaluate && idxCalibration < idxDciScoring;
    const afterDciScoring = idxCalibration > idxDciScoring && idxCalibration < idxRetryProtocol;
    expect(afterEvaluateAndBeforeDciScoring || afterDciScoring).toBe(false);
  });

  test("NONE verbatim: NONE-classified sessions never reach the gate", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/NONE-classified sessions never reach the gate and are never asked the calibration question/);
  });

  test("LIGHT mode N/A concession present in rubric", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    // The DCI scoring section must mention N/A in the context of LIGHT mode
    const idxDciScoring = raw.indexOf("### DCI scoring");
    const idxRetryProtocol = raw.indexOf("## Retry Protocol");
    const dciSection = raw.substring(idxDciScoring, idxRetryProtocol);
    expect(dciSection).toMatch(/N\/A/);
    expect(dciSection).toMatch(/LIGHT/);
  });

  test("RETRY invariant: exactly one focused hint preserved", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/exactly one focused hint/);
  });

  test("Retry Protocol invariant: Maximum 1 retry preserved", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/Maximum 1 retry/);
  });

  test("Output Format invariant: Comprehension: PASS | SKIPPED preserved", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    expect(raw).toMatch(/Comprehension: PASS \| SKIPPED/);
  });

  test("DCI does NOT influence verdict — mention in rubric", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    const idxDciScoring = raw.indexOf("### DCI scoring");
    const idxRetryProtocol = raw.indexOf("## Retry Protocol");
    const dciSection = raw.substring(idxDciScoring, idxRetryProtocol);
    expect(dciSection).toMatch(/does NOT influence the verdict/);
  });

  test("SKIPPED: coach does NOT emit DCI — mention in rubric", () => {
    const raw = readFileSync(COACH_PATH, "utf-8");
    const idxDciScoring = raw.indexOf("### DCI scoring");
    const idxRetryProtocol = raw.indexOf("## Retry Protocol");
    const dciSection = raw.substring(idxDciScoring, idxRetryProtocol);
    expect(dciSection).toMatch(/SKIPPED.*does NOT emit DCI|On SKIPPED.*does NOT emit DCI/);
  });
});
