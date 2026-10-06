/**
 * tests/recall-command.test.ts — v0.5.0 Comprehension Retention
 *
 * Guards the manual /recall command and the retention sections:
 *   R1  command/recall.md structure (flow, verbatim phrases, format rows)
 *   R2  agents/orchestrator.md retention sections + permissions
 *   R3  command/start-session.md isolation re-affirmation (v0.4.0 regressions)
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const RECALL_PATH = join(REPO_ROOT, "command/recall.md");
const ORCH_PATH = join(REPO_ROOT, "agents/orchestrator.md");
const START_PATH = join(REPO_ROOT, "command/start-session.md");

const recall = readFileSync(RECALL_PATH, "utf-8");
const orchestrator = readFileSync(ORCH_PATH, "utf-8");
const startSession = readFileSync(START_PATH, "utf-8");

describe("recall-command — v0.5.0 Comprehension Retention", () => {
  // ── Group R1: command/recall.md ──────────────────────────────────────────────

  test("command file exists with agent: orchestrator frontmatter", () => {
    const fm = recall.slice(0, recall.indexOf("\n---", 4));
    expect(fm).toContain("agent: orchestrator");
    expect(fm).toContain("description:");
  });

  test("manual-only verbatim phrase present", () => {
    expect(recall).toContain(
      "Manual invocation only. Nothing in this profile may trigger `/recall` automatically."
    );
  });

  test("questions-before-code invariant present", () => {
    expect(recall).toContain("BEFORE any code or explanation");
    expect(recall).toContain("**Flow (9 steps)**:");
  });

  test("v0.3.0 evaluation rules preserved (skip, retry)", () => {
    expect(recall).toContain("skip comprehension");
    expect(recall).toContain("maximum 1 retry");
  });

  test("v0.3.1 slicing cap respected (diff lines, never full files)", () => {
    expect(recall).toContain("maxDiffLines=300");
    expect(recall).toContain("NEVER full files");
  });

  test("dci1 row format + SKIPPED variant present", () => {
    expect(recall).toContain("type=dci1");
    expect(recall).toContain("DCI=<score>/<available_score>");
    expect(recall).toContain("DCI=skipped | outcome=SKIPPED");
    expect(recall).toContain("conf=<1-5>|conf=n/a");
  });

  test("src=reconstructed path + sources whitelist present", () => {
    expect(recall).toContain("src=reconstructed");
    expect(recall).toContain("ONLY the plan document");
    expect(recall).toContain("NO repo-wide scans");
  });

  test("metric caveat (operational, not validated) present", () => {
    expect(recall).toContain("metrica operativa, non una metrica scientificamente validata");
    expect(recall).toContain("DCI₁");
  });

  // ── Group R2: agents/orchestrator.md ─────────────────────────────────────────

  test("retention sections sit between Telemetry writer and Delegation Rules", () => {
    const iTelemetry = orchestrator.indexOf("### Telemetry writer");
    const iRecords = orchestrator.indexOf("### Retention records");
    const iRecall = orchestrator.indexOf("### Manual /recall");
    const iDelegation = orchestrator.indexOf("## Delegation Rules");
    expect(iRecords).toBeGreaterThan(iTelemetry);
    expect(iRecall).toBeGreaterThan(iRecords);
    expect(iDelegation).toBeGreaterThan(iRecall);
  });

  test("frontmatter allows .context/comprehension/*.md in BOTH write and edit", () => {
    const fm = orchestrator.slice(0, orchestrator.indexOf("\n---", 4));
    const count = fm.split(".context/comprehension/*.md").length - 1;
    expect(count).toBeGreaterThanOrEqual(2);
    expect(fm).toContain("allow");
  });

  test("record rule: verbatim questions only, no user answers; NONE writes nothing", () => {
    expect(orchestrator).toContain("NO user answers, NO prose");
    expect(orchestrator).toContain("NONE classification → no record, no file");
  });

  test("orchestrator isolation: manual invocation only, never in bootstrap", () => {
    expect(orchestrator).toContain(
      "Manual invocation only. Nothing in this profile may trigger `/recall` automatically."
    );
    expect(orchestrator).toContain("never at session start, never during bootstrap");
  });

  // ── Group R3: command/start-session.md ───────────────────────────────────────

  test("loaded set regression guard: exactly the 3 memory files (v0.4.0)", () => {
    expect(startSession).toContain(
      "the loaded set stays exactly `.context/progress.md`, `.context/decisions.md`, `.context/issues.md`"
    );
  });

  test("recall reads the log + records only under explicit invocation", () => {
    expect(startSession).toContain("may read the log");
    expect(startSession).toContain("only under explicit user invocation");
    expect(startSession).toContain("never during bootstrap");
  });

  test("start-session loaded-set enumeration adds no comprehension path", () => {
    const i = startSession.indexOf("the loaded set stays exactly");
    expect(i).toBeGreaterThan(-1);
    const end = startSession.indexOf("(the comprehension log is telemetry", i);
    expect(end).toBeGreaterThan(i);
    const enumeration = startSession.slice(i, end);
    expect(enumeration).toContain(".context/issues.md");
    expect(enumeration).not.toContain(".context/comprehension/");
  });
});