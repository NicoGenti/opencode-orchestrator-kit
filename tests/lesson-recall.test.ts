/**
 * tests/lesson-recall.test.ts — issue #205, phase P3.
 *
 * Pins the lesson-recall surface shipped in P1 against the REAL repository
 * files, read at test time (never a temp copy, never a hardcoded path):
 *
 *   L1  agents/orchestrator.md — the `### Lesson recall` section: placement
 *       between `### Manual /recall` and `### Research mode (opt-in)`, the
 *       four approved sources, the caps, the grep-only no-match overhead, the
 *       `.context/progress.md` pointer line and the planner hand-off wording.
 *   L2  isolation — the four never-read sinks, the lifecycle exclusion, and
 *       the `/recall` triggering sentence, which must remain the ONLY
 *       sentence describing /recall triggering.
 *   L3  agents/planner.md — the lessons slice arrives as orchestrator input
 *       (Workflow step 1) and is cited under Inputs Available.
 *   L4  agents/plan-writer.md — the frontmatter list carries `tags`/`outcome`.
 *   L5  AGENTS.md — the conforming-file list carries `tags`/`outcome`.
 *   L6  plan/README.md — `tags: alpha,beta` (flat scalar, never a YAML list)
 *       and the optional `outcome` recorded at promotion to `complete`, both in
 *       the Frontmatter block and in the Minimal template.
 *
 * The pins are behavioral: they assert what the prompts and the board
 * contract say, not how the runtime implements them.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

const orchestrator = readFileSync(
  join(REPO_ROOT, "agents/orchestrator.md"),
  "utf-8",
);
const planner = readFileSync(join(REPO_ROOT, "agents/planner.md"), "utf-8");
const planWriter = readFileSync(
  join(REPO_ROOT, "agents/plan-writer.md"),
  "utf-8",
);
const agentsDoc = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf-8");
const boardReadme = readFileSync(join(REPO_ROOT, "plan/README.md"), "utf-8");

/** The `### Lesson recall` section body, from its heading to the next `###`. */
function lessonRecallSection(text: string): string {
  const start = text.indexOf("### Lesson recall");
  expect(start).toBeGreaterThan(-1);
  const rest = text.slice(start + "### Lesson recall".length);
  const end = rest.search(/\n### /);
  return end === -1 ? rest : rest.slice(0, end);
}

const LESSON_RECALL = lessonRecallSection(orchestrator);

/** The four sinks the automatic lesson recall must never read. */
const NEVER_READ_SINKS = [
  ".context/comprehension-log.md",
  ".context/research-dataset.jsonl",
  ".context/triage-dataset.jsonl",
  ".context/comprehension/",
];

/** The four approved lesson sources. */
const LESSON_SOURCES = [
  ".context/decisions.md",
  ".context/issues.md",
  ".context/DESIGN-RULES.md",
  "plan/complete/",
];

/**
 * The pinned sentence that is the ONLY description of how /recall may be
 * triggered. It is asserted verbatim, unchanged, in the two files that carry
 * it (the orchestrator prompt and the recall command).
 */
const RECALL_TRIGGER_SENTENCE =
  "Manual invocation only. Nothing in this profile may trigger `/recall` automatically.";

describe("lesson-recall — orchestrator prompt surface (#205 P1)", () => {
  // ── L1: section placement and content ───────────────────────────────────────

  test("the `### Lesson recall` section sits between `### Manual /recall` and `### Research mode`", () => {
    const iManual = orchestrator.indexOf("### Manual /recall");
    const iLesson = orchestrator.indexOf("### Lesson recall");
    const iResearch = orchestrator.indexOf("### Research mode (opt-in)");
    expect(iManual).toBeGreaterThan(-1);
    expect(iLesson).toBeGreaterThan(-1);
    expect(iResearch).toBeGreaterThan(-1);
    expect(iLesson).toBeGreaterThan(iManual);
    expect(iResearch).toBeGreaterThan(iLesson);
  });

  test("the section names the four approved lesson sources", () => {
    for (const source of LESSON_SOURCES) {
      expect(LESSON_RECALL).toContain(source);
    }
  });

  test("the source list reads `plan/complete/` plan frontmatter, first block only", () => {
    expect(LESSON_RECALL).toContain("plan/complete/");
    expect(LESSON_RECALL).toMatch(/plan\/complete\/[^\n]*frontmatter/);
    expect(LESSON_RECALL).toContain("FIRST frontmatter block only");
  });

  test("the caps are documented: 3 completed plans, 2k tokens, ~30 lines per plan", () => {
    expect(LESSON_RECALL).toContain("3 completed plans");
    expect(LESSON_RECALL).toContain("2k tokens");
    expect(LESSON_RECALL).toMatch(/~?30 lines/);
  });

  test("the per-plan reduction is documented (frontmatter, Goal, Scope, outcome)", () => {
    expect(LESSON_RECALL).toMatch(/frontmatter, Goal, Scope, outcome/);
  });

  test("the no-match path is grep-only: no extra overhead", () => {
    expect(LESSON_RECALL).toContain("Grep only");
    expect(LESSON_RECALL).toMatch(/no match leaves grep-only overhead/);
  });

  test("the recall is automatic at scoping time, before a plan card exists, without a manual command", () => {
    expect(LESSON_RECALL).toMatch(/At scoping time, BEFORE a plan card exists/);
    expect(LESSON_RECALL).toMatch(/no manual command/);
  });

  test("a pointer line is written to `.context/progress.md` with sources and dates", () => {
    expect(LESSON_RECALL).toContain(".context/progress.md");
    expect(LESSON_RECALL).toMatch(/pointer line/);
    expect(LESSON_RECALL).toMatch(/sources and dates/);
  });

  test("the recency rule is stated: the latest dated decision supersedes", () => {
    expect(LESSON_RECALL).toMatch(/latest dated decision supersedes/);
  });

  test("the planner receives the slice under Inputs Available and never re-runs it", () => {
    expect(LESSON_RECALL).toContain(
      "`planner` receives the slice under Inputs Available",
    );
    expect(LESSON_RECALL).toContain("never re-runs it");
  });
});

describe("lesson-recall — isolation invariants (#205 AC3)", () => {
  test("the section names the four never-read sinks explicitly", () => {
    for (const sink of NEVER_READ_SINKS) {
      expect(LESSON_RECALL).toContain(sink);
    }
  });

  test("the section states the sinks are never read", () => {
    expect(LESSON_RECALL).toMatch(/never reads/);
  });

  test("the section states the recall never runs inside a task lifecycle", () => {
    expect(LESSON_RECALL).toContain("never runs inside a task lifecycle");
  });

  test("the section keeps `/recall` manual", () => {
    expect(LESSON_RECALL).toContain("`/recall` stays manual");
  });

  test("the section does not contradict the pinned `/recall` isolation sentence", () => {
    // The section must not claim an automatic trigger for /recall.
    expect(LESSON_RECALL).not.toMatch(/trigger[s]? `\/recall` automatically/);
    expect(LESSON_RECALL).not.toMatch(/auto-?trigger/);
  });

  test("the pinned /recall triggering sentence survives verbatim in the orchestrator prompt", () => {
    expect(orchestrator).toContain(RECALL_TRIGGER_SENTENCE);
  });

  test("the pinned /recall triggering sentence remains the ONLY sentence describing /recall triggering", () => {
    // The orchestrator prompt may mention /recall for many reasons (its
    // budget, its sources, the skill that documents it). The requirement is
    // narrower and sharper: no sentence may ASSERT that /recall can be
    // triggered automatically, and the pinned sentence must exist verbatim.
    //
    // An "automatic trigger assertion" is a sentence that pairs /recall with
    // an automatic-activation verb ("may trigger", "triggers automatically",
    // "runs automatically", "is invoked automatically", ...). A sentence that
    // NEGATES such a claim ("may trigger `/recall` automatically" inside a
    // prohibition) is the pinned sentence itself and is allowed.
    // Split on sentence boundaries, keeping the trailing punctuation. A
    // period inside an abbreviation (`profile.`) is not a boundary here: the
    // file writes prose with spaces after sentence periods, and the pinned
    // sentence is checked as a whole below, so a coarse split is enough to
    // catch any OTHER automatic-trigger assertion.
    const sentences = orchestrator
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.includes("/recall"));

    const autoTrigger =
      /(?:may|can|will|auto)?\s*trigger(?:s|ed)?\b[^.\n]*automatically|automatically\s+(?:trigger|invoke|run|activat)\w*/i;
    const assertions = sentences.filter(
      (s) =>
        autoTrigger.test(s) &&
        !/may not|never|nothing in this profile/i.test(s),
    );

    expect({
      // every remaining assertion must be the pinned sentence itself
      unexpected: assertions.filter(
        (s) => !s.includes(RECALL_TRIGGER_SENTENCE),
      ),
    }).toEqual({ unexpected: [] });

    // The pinned sentence is really present, verbatim, in the prompt.
    expect(orchestrator).toContain(RECALL_TRIGGER_SENTENCE);
    // ...and no OTHER sentence asserts an automatic trigger for /recall: the
    // pinned sentence is the only trigger description in the file.
    const triggerLines = orchestrator
      .split("\n")
      .filter((line) => autoTrigger.test(line));
    expect({
      triggerLines: triggerLines.map((l) => l.trim()),
    }).toEqual({
      triggerLines: triggerLines
        .map((l) => l.trim())
        .filter((l) => l.includes(RECALL_TRIGGER_SENTENCE)),
    });
  });

  test("the `/recall` command file keeps the same pinned sentence", () => {
    const recallCmd = readFileSync(
      join(REPO_ROOT, "command/recall.md"),
      "utf-8",
    );
    expect(recallCmd).toContain(RECALL_TRIGGER_SENTENCE);
  });
});

describe("lesson-recall — planner intake surface (#205 P1)", () => {
  test("Workflow step 1 receives the orchestrator-supplied lessons slice", () => {
    const workflow = planner.slice(
      planner.indexOf("## Workflow"),
      planner.indexOf("## Code Graph"),
    );
    expect(workflow).toContain("orchestrator-supplied lessons slice");
    expect(workflow).toMatch(/never re-run that recall/);
  });

  test("the slice is cited under Inputs Available with the four sources", () => {
    const inputs = planner.slice(
      planner.indexOf("## Quality Rules"),
      planner.indexOf("## Tool Surface"),
    );
    expect(inputs).toContain("Inputs Available");
    expect(inputs).toMatch(/recalled-lesson source with its date/);
    for (const source of LESSON_SOURCES) {
      expect(planner).toContain(source);
    }
  });
});

describe("lesson-recall — board contract surface (#205 AC4)", () => {
  test("agents/plan-writer.md lists `tags` and `outcome` as board keys", () => {
    const conventions = planWriter.slice(
      planWriter.indexOf("## Board conventions"),
      planWriter.indexOf("## Board root"),
    );
    expect(conventions).toContain("Frontmatter");
    expect(conventions).toContain("`tags`");
    expect(conventions).toContain("`outcome`");
    expect(conventions).toContain("flat scalars");
  });

  test("agents/plan-writer.md records the optional outcome on the qa -> complete move", () => {
    expect(planWriter).toContain("comprehension-unrecorded");
    expect(planWriter).toMatch(/qa`? → `?complete/);
  });

  test("AGENTS.md conforming-file list carries `tags` and `outcome`", () => {
    const conforming = agentsDoc.slice(
      agentsDoc.indexOf("**Conforming file**"),
      agentsDoc.indexOf("**Standing authorization"),
    );
    expect(conforming).toContain(
      "`id/title/status/created/updated/owner/executor`",
    );
    expect(conforming).toContain("`tags`");
    expect(conforming).toContain("`outcome`");
    expect(conforming).toContain("flat scalars");
  });

  test("plan/README.md Frontmatter block documents `tags: alpha,beta` as a flat scalar", () => {
    const frontmatter = boardReadme.slice(
      boardReadme.indexOf("## Frontmatter"),
      boardReadme.indexOf("## Plan body"),
    );
    expect(frontmatter).toContain("tags: alpha,beta");
    expect(frontmatter).toContain("never a YAML list");
    expect(frontmatter).toMatch(/comma-separated flat scalar/);
  });

  test("plan/README.md Frontmatter block documents the optional `outcome` at promotion to complete", () => {
    const frontmatter = boardReadme.slice(
      boardReadme.indexOf("## Frontmatter"),
      boardReadme.indexOf("## Plan body"),
    );
    expect(frontmatter).toContain("outcome:");
    expect(frontmatter).toMatch(
      /promoted to `complete`|written at promotion to complete/,
    );
  });

  test("plan/README.md Minimal template carries both keys", () => {
    const template = boardReadme.slice(
      boardReadme.indexOf("## Minimal template"),
    );
    expect(template).toContain("tags: alpha,beta");
    expect(template).toContain("outcome:");
    expect(template).toMatch(/promotion to complete/);
  });

  test("plan/README.md never presents `tags` as a YAML list", () => {
    // A YAML list would render as a block sequence under the key.
    expect(boardReadme).not.toMatch(/^tags:\s*\n\s*-\s+\S/m);
    expect(boardReadme).not.toMatch(/^tags:\s*\[/m);
  });
});
