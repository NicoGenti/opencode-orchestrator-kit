import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const ORCHESTRATOR_PATH = join(REPO_ROOT, "agents/orchestrator.md");
const START_SESSION_PATH = join(REPO_ROOT, "command/start-session.md");
const CONFIG_DOC_PATH = join(REPO_ROOT, "docs/CONFIGURATION.md");
const RESEARCH_DATASET_PATH = ".context/research-dataset.jsonl";
const RAW_ORCHESTRATOR = readFileSync(ORCHESTRATOR_PATH, "utf-8");

function sectionBetween(raw: string, startMarker: string, endMarker: string): string {
  const start = raw.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = raw.indexOf(endMarker, start + 1);
  return raw.slice(start, end === -1 ? raw.length : end);
}

// ── v0.4.0 Group G — telemetry writer contract ──────────────────────────────

describe("telemetry writer — orchestrator contract (v0.4.0)", () => {
  const raw = readFileSync(ORCHESTRATOR_PATH, "utf-8");

  test("### Telemetry writer section exists before ## Delegation Rules", () => {
    const idxT = raw.indexOf("### Telemetry writer");
    const idxD = raw.indexOf("## Delegation Rules");
    expect(idxT).toBeGreaterThanOrEqual(0);
    expect(idxD).toBeGreaterThan(idxT);
  });

  test("log path verbatim .context/comprehension-log.md (append-only wording)", () => {
    expect(raw).toMatch(/\.context\/comprehension-log\.md/);
    expect(raw).toMatch(/append-only/i);
  });

  test("exactly one line per evaluation; write happens AFTER the verdict is final", () => {
    const sec = sectionBetween(raw, "### Telemetry writer", "## Delegation Rules");
    expect(sec).toMatch(/EXACTLY ONE line/i);
    expect(sec).toMatch(/AFTER the verdict is final/i);
    expect(sec).toMatch(/never during bootstrap/i);
  });

  test("creation header comment verbatim, emitted once per file", () => {
    const sec = sectionBetween(raw, "### Telemetry writer", "## Delegation Rules");
    expect(sec).toContain("# comprehension telemetry (one line per evaluation; no user answers)");
    expect(sec).toMatch(/exactly once per session|once per file/i);
  });

  test("line format: mode + DCI score/skipped + confidence + outcome, no user-answer content", () => {
    const sec = sectionBetween(raw, "### Telemetry writer", "## Delegation Rules");
    expect(sec).toMatch(/DCI=<score>\/<available_score>\|skipped/);
    expect(sec).toMatch(/conf=<1-5>\|n\/a/);
    expect(sec).toMatch(/outcome=<PASS\|FAIL\|RETRY\|SKIPPED>/);
    expect(sec).toMatch(/MUST NOT include any user answer text|no user answers|privacy/i);
  });

  test("NONE-classified sessions: no line, no file creation (zero cost)", () => {
    const sec = sectionBetween(raw, "### Telemetry writer", "## Delegation Rules");
    expect(sec).toMatch(/NONE-classified sessions/i);
    expect(sec).toMatch(/MUST NOT create the file|MUST NOT write/i);
  });

  test("SKIPPED outcome: DCI=skipped + conf=n/a verbatim", () => {
    const sec = sectionBetween(raw, "### Telemetry writer", "## Delegation Rules");
    expect(sec).toContain("DCI=skipped");
    expect(sec).toContain("conf=n/a");
  });
});

// ── v0.4.0 Group G2 — start-session isolation + docs policy ────────────────
//
// The comprehension log is telemetry, NOT session memory:
// - /start-session loads only progress.md, decisions.md, issues.md
// - the log file is untracked by design via .gitignore (.context/ + 3 negations)
// - docs/CONFIGURATION.md documents the telemetry policy

describe("telemetry isolation — start-session + docs policy (v0.4.0)", () => {
  const sess = readFileSync(START_SESSION_PATH, "utf-8");
  const docs = readFileSync(CONFIG_DOC_PATH, "utf-8");
  const gitignore = readFileSync(join(REPO_ROOT, ".gitignore"), "utf-8");

  test("loaded set unchanged: progress, decisions, issues — no comprehension log in step 2", () => {
    const step2 = sess.split(/\r?\n/).find(l => l.trim().startsWith("2."));
    expect(step2).toBeDefined();
    expect(step2).toMatch(/\.context\/progress\.md/);
    expect(step2).toMatch(/\.context\/decisions\.md/);
    expect(step2).toMatch(/\.context\/issues\.md/);
    expect(step2).not.toMatch(/comprehension-log/);
  });

  test("bootstrap explicitly refuses telemetry writes (and loads)", () => {
    expect(sess).toMatch(/NOT part of bootstrap/);
    expect(sess).toMatch(/never loaded during bootstrap/);
  });

  test("docs CONFIGURATION.md: telemetry policy present (untracked by design)", () => {
    expect(docs).toMatch(/### Telemetry log/);
    expect(docs).toMatch(/untracked by design/);
    expect(docs).toMatch(/never add the comprehension log to that negation list/i);
  });

  test(".gitignore: .context/ ignored; the 3 memory files explicitly negated", () => {
    expect(gitignore).toMatch(/^\.context\/$/m);
    for (const f of ["progress", "decisions", "issues"]) {
      expect(gitignore).toMatch(new RegExp(`^!\\.context/${f}\\.md$`, "m"));
    }
    expect(gitignore).not.toMatch(/^!\.context\/comprehension-log\.md$/m);
  });

  test("start-session: step 2 lists only the three memory files (log never loaded in steps)", () => {
    const ctxPaths = sess
      .split(/\r?\n/)
      .filter(l => /^[0-9]+\./.test(l.trim()))
      .join(" ")
      .match(/\.context\/[a-z-]+\.md/g) ?? [];
    expect([...new Set(ctxPaths)].sort()).toEqual([
      ".context/decisions.md",
      ".context/issues.md",
      ".context/progress.md",
    ]);
  });
});

describe("telemetry-writer — P0 research dataset sink (v0.6.2)", () => {
  test("research dataset is listed as an orchestrator metric sink with append-only handling", () => {
    expect(RAW_ORCHESTRATOR).toContain(".context/research-dataset.jsonl");
    const hard = RAW_ORCHESTRATOR.indexOf("Hard boundary");
    expect(hard).toBeGreaterThan(-1);
    expect(RAW_ORCHESTRATOR.slice(hard, hard + 600)).toContain("append-only");
  });
});
