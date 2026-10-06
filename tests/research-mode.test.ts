/**
 * tests/research-mode.test.ts — v0.6.0 Cognitive Research Mode
 *
 * Guards the opt-in research mode (A/B crossover + COR metrics):
 *   RM1  command/research-mode.md structure (on/off, confirmation phrase)
 *   RM2  agents/orchestrator.md research section (placement, invariants)
 *   RM3  command/start-session.md dataset exclusion
 *   RM4  dataset contract (JSONL format, 16-field tuple, alternation)
 *   RM5  mode-off regression: no research artifacts in normal-path sections
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const RESEARCH_PATH = join(REPO_ROOT, "command/research-mode.md");
const ORCH_PATH = join(REPO_ROOT, "agents/orchestrator.md");
const START_PATH = join(REPO_ROOT, "command/start-session.md");
const CONFIG_PATH = join(REPO_ROOT, "templates/comprehension.config.json");

const researchCmd = readFileSync(RESEARCH_PATH, "utf-8");
const orchestrator = readFileSync(ORCH_PATH, "utf-8");
const startSession = readFileSync(START_PATH, "utf-8");
const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));

const SECTION = "### Research mode (opt-in)";
const section = orchestrator.slice(
  orchestrator.indexOf(SECTION),
  orchestrator.indexOf("## Delegation Rules"),
);

const TUPLE_FIELDS = [
  "date",
  "plan",
  "slot",
  "task_type",
  "gate_type",
  "duration_min",
  "agent_calls",
  "input_tokens",
  "output_tokens",
  "confidence",
  "dci_immediate",
  "dci_delayed",
  "retries",
  "skipped",
  "bugfix_ref",
  "tokens_source",
];

describe("research-mode — v0.6.0 Cognitive Research Mode", () => {
  // ── Config guard ─────────────────────────────────────────────────────────────

  test("top-level config keys are exactly comprehension + recall + research", () => {
    expect(Object.keys(parsed)).toEqual(["comprehension", "recall", "research"]);
  });

  test("research.enabled default is false (explicit activation only)", () => {
    expect(parsed.research.enabled).toBe(false);
  });

  // ── Group RM1: command/research-mode.md ──────────────────────────────────────

  test("command file exists with agent: orchestrator frontmatter", () => {
    const fm = researchCmd.slice(0, researchCmd.indexOf("\n---", 4));
    expect(fm).toContain("agent: orchestrator");
    expect(fm).toContain("description:");
  });

  test("ON requires the exact confirmation phrase before enabling", () => {
    expect(researchCmd).toContain(
      "Research mode changes session behavior. Confirm activation?"
    );
    expect(researchCmd).toContain("Requires explicit user confirmation before enabling");
  });

  test("OFF stops recording with no partial tuples", () => {
    expect(researchCmd).toContain("Immediately stops all recording");
    expect(researchCmd).toContain("No partial tuple is completed or written");
  });

  // ── Group RM2: agents/orchestrator.md research section ───────────────────────

  test("research section sits between Manual /recall and Delegation Rules", () => {
    const recallIdx = orchestrator.indexOf("### Manual /recall");
    const researchIdx = orchestrator.indexOf(SECTION);
    const delegationIdx = orchestrator.indexOf("## Delegation Rules");
    expect(recallIdx).toBeGreaterThan(-1);
    expect(researchIdx).toBeGreaterThan(recallIdx);
    expect(delegationIdx).toBeGreaterThan(researchIdx);
  });

  test("privacy invariant verbatim present in section and command file", () => {
    const INVARIANT =
      "No source code and no personal answers are ever written to the dataset.";
    expect(section).toContain(INVARIANT);
    expect(researchCmd).toContain(INVARIANT);
  });

  test("zero overhead when inactive: never read, never written, no token cost", () => {
    expect(section).toContain("zero overhead when inactive");
    expect(section).toContain("never read, never written, and no token cost");
  });

  test("dataset never loaded by start-session or bootstrap per orchestrator isolation", () => {
    expect(section).toContain("NEVER loaded by `/start-session` or by any bootstrap procedure");
  });

  // ── Group RM3: command/start-session.md dataset exclusion ────────────────────

  test("start-session excludes the research dataset from bootstrap loaded set", () => {
    expect(startSession).toContain("research-dataset.jsonl");
    expect(startSession).toContain("NOT part of bootstrap");
  });

  // ── Group RM4: dataset contract ──────────────────────────────────────────────

  test("JSONL format: one JSON object per line, no header, no prose, append-only", () => {
    expect(section).toContain("exactly one JSON object as one line");
    expect(section).toContain("No header, no prose, append-only");
  });

  test("metric tuple declares all 16 fields", () => {
    for (const field of TUPLE_FIELDS) {
      expect(new RegExp(`^${field}\\s`, "m").test(section)).toBe(true);
    }
  });

  test("slot alternates deterministically in activation order", () => {
    expect(section).toContain("alternates deterministically in activation order");
    expect(section).toContain("first active task = A");
  });

  test("bugfix_ref convention and tokens_source honesty field present", () => {
    expect(section).toContain('plan=<earlierNNNN>');
    expect(section).toContain("tokens_source");
    expect(section).toContain("honesty field");
  });

  // ── Group RM5: mode-off regression ───────────────────────────────────────────

  test("normal-path sections declare no research artifacts", () => {
    const preResearch = orchestrator.slice(0, orchestrator.indexOf(SECTION));
    expect(preResearch).not.toContain("research-dataset");
  });
});