/**
 * tests/intake-triage.test.ts — issue #198 (Option C, adaptive hybrid)
 *
 * Pins the intake gate shipped in phases A/B:
 *   - the orchestrator's thin pointer section (before routing) and the removal
 *     of the replaced "clarifying questions" sentence;
 *   - the categorical four-signal triage mapped onto NONE/LIGHT/DEEP, with an
 *     explicit negative pin against any numeric complexity score;
 *   - `workflow.mode` (`auto|full|lite`, default `auto`) across the three homes
 *     (router prompt, skill, docs) plus the parsed config template;
 *   - the quick router's ambiguous-request hand-back bullet;
 *   - the skill's restatement protocol, TriageEventV1 tuple, append-only
 *     write-only sink rules and the research-mode privacy invariant.
 *
 * The no-`dispatch*.jsonl` accounting invariant is pinned for the three router
 * documents by tests/dispatch-guard.test.ts (DISPATCH_ACCOUNTING_FILES); the
 * check below extends that same narrow regex to the intake skill rather than
 * duplicating it.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");

/** Same normalization as workflow-hardening's readPrompt: size/compare content,
 * not the Windows checkout's CRLF. */
const readNormalized = (relPath: string): string =>
  readFileSync(join(REPO_ROOT, relPath), "utf-8")
    .split(String.fromCharCode(13))
    .join("");

const ORCH = readNormalized("agents/orchestrator.md");
const QUICK = readNormalized("agents/orchestrator-quick.md");
const AGENTS = readNormalized("AGENTS.md");
const README = readNormalized("README.md");
const SKILL = readNormalized("skills/workflow-intake/SKILL.md");
const DOCS = readNormalized("docs/CONFIGURATION.md");
const START = readNormalized("command/start-session.md");

/** Body of one Markdown heading, up to the next heading of any level. */
const sectionOf = (source: string, heading: string): string => {
  const start = source.indexOf(heading);
  if (start === -1) return "";
  const body = source.slice(start + heading.length);
  const next = body.search(/^#{1,6} /m);
  return next === -1 ? body : body.slice(0, next);
};

/** Slice between two headings (inclusive of the first heading's body only). */
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  if (start === -1) return "";
  const end = source.indexOf(to, start + from.length);
  return end === -1 ? source.slice(start) : source.slice(start, end);
};

const INTAKE_HEADING = "## Workflow intake and adaptive complexity gate";
const ORCH_INTAKE = sectionOf(ORCH, INTAKE_HEADING);
const ORCH_SMALL = sectionOf(
  ORCH,
  "### Small-task triage (before any delegation)",
);
const SKILL_DESCRIPTION = SKILL.slice(0, SKILL.indexOf("\n---", 4)).replace(
  /\s+/g,
  " ",
);
const QUICK_HANDBACK = sectionOf(QUICK, "## Hand back instead of improvising");
const SKILL_TRIAGE = sectionOf(SKILL, "## Categorical complexity triage");
const DOCS_WORKFLOW = between(
  DOCS,
  "## Workflow intake configuration",
  "## Deterministic gates",
);

/** The NONE row of the skill's triage table. */
const SKILL_NONE_ROW =
  SKILL_TRIAGE.split("\n").find((line) =>
    /\|\s*\*\*NONE\*\*\s*\|/.test(line),
  ) ?? "";

describe("intake-triage — orchestrator pointer (issue #198)", () => {
  test("the intake section exists and sits before routing", () => {
    expect(ORCH).toContain(INTAKE_HEADING);
    const intakeAt = ORCH.indexOf(INTAKE_HEADING);
    const routingAt = ORCH.indexOf("## Agent Routing");
    expect(intakeAt).toBeGreaterThan(-1);
    expect(routingAt).toBeGreaterThan(intakeAt);
  });

  test("the intake section points at the workflow-intake skill as canonical", () => {
    expect(ORCH_INTAKE).toContain("`workflow-intake` skill");
    expect(ORCH_INTAKE).toMatch(/restatement trigger/);
    expect(ORCH_INTAKE).toMatch(/NONE\/LIGHT\/DEEP triage/);
  });

  test("clear requests keep the unchanged path (zero added round-trips)", () => {
    expect(ORCH_INTAKE).toMatch(/Clear requests route unchanged/);
  });

  test("the replaced clarifying-questions sentence is gone (negative pin)", () => {
    expect(ORCH).not.toContain("up to 3 targeted clarifying questions");
  });

  test("the restatement trigger anchors the delegation rules to the skill", () => {
    expect(ORCH).toMatch(
      /critical information is missing \(goal, scope, affected files, or constraints\), restate and confirm the spec before delegating — `workflow-intake`/,
    );
  });

  test("the skill is loaded on demand, never for a clear request under auto (M1)", () => {
    expect(ORCH_INTAKE).toMatch(
      /Load the `workflow-intake` skill ONLY for an ambiguous request or a `workflow\.mode` decision/,
    );
    expect(ORCH_INTAKE).toMatch(/never for a clear request under `auto`/);
    expect(SKILL_DESCRIPTION).toMatch(
      /Load only when a request is ambiguous or a routing-mode decision is needed/,
    );
    expect(SKILL_DESCRIPTION).toMatch(
      /a clear request under auto routes exactly as today, with no skill load/,
    );
    expect(DOCS_WORKFLOW).toMatch(
      /The skill is loaded only for an\s+ambiguous request/,
    );
    expect(DOCS_WORKFLOW).toMatch(/with no skill load and no announce line/);
    // NEW-4: the mirror homes carry the same conditional-load semantic.
    expect(AGENTS).toMatch(
      /the `workflow-intake` skill is loaded only when a request\s+is ambiguous or a `workflow\.mode` decision is needed/,
    );
    expect(README).toMatch(
      /the `workflow-intake` skill is loaded only for an ambiguous request or a `workflow\.mode` decision/,
    );
  });

  test("no home claims the skill loads before routing or always (NEW-4 negative)", () => {
    for (const [name, doc] of [
      ["orchestrator", ORCH],
      ["workflow-intake skill", SKILL],
      ["AGENTS.md", AGENTS],
      ["README.md", README],
      ["docs/CONFIGURATION.md", DOCS],
    ] as const) {
      expect(
        doc,
        `${name} must not claim an unconditional or pre-routing skill load`,
      ).not.toMatch(/always load|load the .*skill before routing/i);
    }
  });
});

describe("intake-triage — categorical triage, no numeric score", () => {
  const SIGNALS = [
    /≤1 file|at most one file/i,
    /no plan needed/i,
    /no security sensitivity/i,
    /no cross-module impact/i,
  ] as const;

  test("the four categorical signals are stated in the skill", () => {
    for (const signal of SIGNALS) {
      expect(SKILL_TRIAGE, `skill must name ${signal}`).toMatch(signal);
    }
  });

  test("the skill maps the signals onto NONE/LIGHT/DEEP", () => {
    for (const cls of ["NONE", "LIGHT", "DEEP"]) {
      expect(SKILL_TRIAGE).toMatch(
        new RegExp(`\\|\\s*\\*\\*${cls}\\*\\*\\s*\\|`),
      );
    }
    expect(SKILL_TRIAGE).toMatch(
      /After NONE, DEEP takes precedence over LIGHT/,
    );
  });

  test("the skill NONE row is the small-task OR condition, not an all-signals test (B1)", () => {
    expect(SKILL_NONE_ROW).toMatch(
      /the request touches at most one file \*\*or\*\* needs no plan/,
    );
    expect(SKILL_NONE_ROW).not.toMatch(/all four signals/);
    expect(SKILL_NONE_ROW).not.toMatch(/no security sensitivity/);
  });

  test("the small-task triage section and the skill NONE row share one condition (B1)", () => {
    expect(ORCH_SMALL).toMatch(/touches at most one file or needs no plan/);
    expect(ORCH_SMALL).toMatch(/`NONE` branch of the intake triage/);
    expect(SKILL_TRIAGE).toMatch(/`≤1 file` \*\*or\*\* `no plan needed`/);
    expect(SKILL_NONE_ROW).toMatch(
      /touches at most one file \*\*or\*\* needs no plan/,
    );
  });

  test("the three classes are disjoint, non-empty and jointly exhaustive (NEW-1)", () => {
    const row = (cls: string): string =>
      SKILL_TRIAGE.split("\n").find((line) =>
        new RegExp(`\\|\\s*\\*\\*${cls}\\*\\*\\s*\\|`).test(line),
      ) ?? "";
    const noneRow = row("NONE");
    const lightRow = row("LIGHT");
    const deepRow = row("DEEP");

    // none of the three rows is absent (no class is an empty set)
    for (const [cls, text] of [
      ["NONE", noneRow],
      ["LIGHT", lightRow],
      ["DEEP", deepRow],
    ] as const) {
      expect(text, `${cls} row must be defined`).not.toBe("");
    }

    // LIGHT is explicitly the complement band, not a plan-card-less NONE
    expect(lightRow).toMatch(/not NONE and not DEEP/);
    expect(lightRow).toMatch(/single-module work beyond the shortcut/);
    expect(lightRow).toMatch(/without a plan card/i);
    expect(lightRow).not.toMatch(/no plan card unless asked/);

    // DEEP is the plan-card band; "plan needed" is implied by not-NONE and
    // must not reappear as a DEEP condition (that is what emptied LIGHT).
    expect(deepRow).toMatch(/not NONE, and any of/);
    expect(deepRow).toMatch(/security sensitivity/);
    expect(deepRow).toMatch(/cross-module impact/);
    expect(deepRow).toMatch(/multi-phase/);
    expect(deepRow).not.toMatch(/plan needed/);
    expect(deepRow).toMatch(/WITH a plan card/i);
  });

  test("the docs table mirrors the disjoint class mapping (NEW-1)", () => {
    const row = (cls: string): string =>
      DOCS_WORKFLOW.split("\n").find((line) =>
        new RegExp(`\\|\\s*\\*\\*${cls}\\*\\*\\s*\\|`).test(line),
      ) ?? "";
    expect(row("LIGHT")).toMatch(/not NONE and not DEEP/);
    expect(row("LIGHT")).toMatch(/WITHOUT a plan card/);
    expect(row("DEEP")).toMatch(/multi-phase\/multi-session scope/);
    expect(row("DEEP")).not.toMatch(/plan needed/);
  });

  test("missing means not stated and not inferable from context (M2)", () => {
    expect(SKILL).toMatch(
      /\*\*"Missing" means not stated AND not inferable\*\*/,
    );
    expect(SKILL).toMatch(/inferred value counts as supplied/);
    expect(SKILL).toMatch(/material ambiguity that would change routing/);
    expect(SKILL_DESCRIPTION).toBeTruthy();
    // NEW-4: the same inference rule is mirrored in AGENTS.md and the docs.
    expect(AGENTS).toMatch(
      /neither stated nor inferable from the request, session memory,\s+the project profile, or the repository/,
    );
    expect(DOCS_WORKFLOW).toMatch(
      /neither stated nor\s+inferable from the request, session memory, project profile, or repository/,
    );
  });

  test("absent config is a silent default and invalid config warns once (M3)", () => {
    expect(SKILL).toMatch(
      /An absent file means the documented default \(`auto`, telemetry off\) and NO warning/,
    );
    expect(SKILL).toMatch(
      /present-but-empty or invalid file falls back to that same default with exactly ONE warning/,
    );
    expect(DOCS_WORKFLOW).toMatch(/An \*\*absent\*\* file is not an error/);
    expect(DOCS_WORKFLOW).toMatch(/applied silently with no warning/);
    expect(DOCS_WORKFLOW).toMatch(
      /A \*\*present but empty or invalid\*\* file falls back to `auto` with telemetry off and exactly ONE warning/,
    );
  });

  test("the docs workflow section states the same four signals and mapping", () => {
    for (const signal of SIGNALS) {
      expect(DOCS_WORKFLOW, `docs must name ${signal}`).toMatch(signal);
    }
    for (const cls of ["NONE", "LIGHT", "DEEP"]) {
      expect(DOCS_WORKFLOW).toMatch(
        new RegExp(`\\|\\s*\\*\\*${cls}\\*\\*\\s*\\|`),
      );
    }
  });

  test("both the skill and the docs state that no numeric score exists", () => {
    expect(SKILL).toMatch(/never a numeric score/i);
    expect(DOCS_WORKFLOW).toMatch(/no numeric complexity score/i);
  });

  test("no numeric complexity-score scheme leaks into the intake homes", () => {
    // Only triage/complexity lines are scanned, so unrelated numeric prose
    // elsewhere in these documents cannot false-fail the pin.
    const homes: Array<[string, string]> = [
      ["orchestrator", ORCH],
      ["orchestrator-quick", QUICK],
      ["workflow-intake skill", SKILL],
      ["docs workflow section", DOCS_WORKFLOW],
    ];
    for (const [name, doc] of homes) {
      const triageLines = doc
        .split("\n")
        .filter((line) => /triage|complexity/i.test(line))
        .join("\n");
      expect(
        triageLines,
        `${name} must not define a 0-100 / out-of-100 scale`,
      ).not.toMatch(/\b(?:0\s*[-–]\s*100|out of 100|\d{1,3}\s*\/\s*100)\b/i);
      expect(
        triageLines,
        `${name} must not assign a numeric complexity score`,
      ).not.toMatch(/\b(?:complexity\s*(?:score|rating)|score)\s*[:=]\s*\d/i);
      expect(
        triageLines,
        `${name} must not define a weighted numeric sum`,
      ).not.toMatch(/\bweighted\s+sum\s+of\s+\d/i);
    }
  });
});

describe("intake-triage — workflow.mode across the three homes", () => {
  test("the config template parses to mode auto and telemetry off", () => {
    const config = JSON.parse(
      readFileSync(join(REPO_ROOT, "templates/workflow.config.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect(Object.keys(config).sort()).toEqual(["triageTelemetry", "workflow"]);
    expect(config.workflow).toEqual({ mode: "auto" });
    expect(config.triageTelemetry).toEqual({ enabled: false });
  });

  test("auto|full|lite are documented together, with auto as the default", () => {
    const homes: Array<[string, string]> = [
      ["orchestrator intake section", ORCH_INTAKE],
      ["workflow-intake skill", SKILL],
      ["docs workflow section", DOCS_WORKFLOW],
    ];
    for (const [name, text] of homes) {
      for (const mode of ["auto", "full", "lite"]) {
        expect(text, `${name} must document workflow.mode=${mode}`).toContain(
          `\`${mode}\``,
        );
      }
      expect(text, `${name} must state auto as the default`).toMatch(
        /`auto`[^.\n]*default|default[^.\n]*`auto`/i,
      );
    }
  });

  test("full forces the standard flow and lite is never silent", () => {
    for (const text of [SKILL, DOCS_WORKFLOW]) {
      expect(text).toMatch(/`full`[^\n]*Always the standard flow/i);
      expect(text).toMatch(/`lite`[^\n]*never silently/i);
    }
  });

  test("the docs state the prompt-level read and the absent → defaults fallback", () => {
    expect(DOCS_WORKFLOW).toMatch(/no runtime loader/i);
    expect(DOCS_WORKFLOW).toMatch(/falls back to `auto`/);
    expect(DOCS_WORKFLOW).toMatch(/telemetry (?:stays )?off|telemetry to off/i);
  });
});

describe("intake-triage — quick router hand-back", () => {
  test("the ambiguous-request bullet hands back and never restates (N1)", () => {
    expect(QUICK_HANDBACK).toMatch(
      /ambiguous or underspecified: hand back, never restate or delegate/,
    );
    expect(QUICK_HANDBACK).not.toMatch(/restate and confirm/);
    expect(QUICK_HANDBACK).toMatch(/hand back/);
  });

  test("the quick router keeps its small-task hand-back contract", () => {
    expect(QUICK_HANDBACK).toMatch(
      /the work needs more than one phase, or a plan file would be justified/,
    );
    expect(QUICK_HANDBACK).toMatch(
      /Never start a task you cannot finish in one delegation/,
    );
  });
});

describe("intake-triage — skill protocol and telemetry contract", () => {
  test("restatement requires explicit confirmation before any delegation", () => {
    expect(SKILL).toMatch(/## Restatement protocol/);
    expect(SKILL).toMatch(
      /wait for explicit confirmation BEFORE any `subagent` call/,
    );
    expect(SKILL).toMatch(/Never rewrite silently/);
    const protocol = sectionOf(SKILL, "## Restatement protocol");
    expect(protocol.indexOf("explicit confirmation")).toBeLessThan(
      protocol.indexOf("`subagent`"),
    );
  });

  test("TriageEventV1 and its tuple are documented", () => {
    expect(SKILL).toContain("TriageEventV1");
    expect(SKILL).toMatch(/"event":"triage"/);
    expect(SKILL).toMatch(/"schema_version":1/);
    expect(SKILL).toMatch(/"class":"NONE\|LIGHT\|DEEP"/);
    expect(SKILL).toMatch(/"signals":\{"files":"one\|many"/);
  });

  test("the sink is append-only, never read at bootstrap, write-allow-listed with no edit rule (N2)", () => {
    expect(SKILL).toContain(".context/triage-dataset.jsonl");
    expect(SKILL).toMatch(/Append only: never overwrite, edit, delete/);
    expect(SKILL).toMatch(/Never read at bootstrap/);
    expect(SKILL).toMatch(
      /write surface allow-lists the sink and defines no edit rule/,
    );
    expect(SKILL).toMatch(/`write` folds into the `edit` action/);
    expect(SKILL).toMatch(/append-only is enforced by the hard-boundary rule/);
  });

  test("the privacy invariant matches the research-mode wording", () => {
    const INVARIANT =
      "No source code and no personal answers are ever written to the dataset.";
    expect(SKILL).toContain(INVARIANT);
    const research = readNormalized("command/research-mode.md");
    expect(research).toContain(INVARIANT);
    expect(SKILL).toMatch(/\*\*What never enters the dataset\*\*/);
  });

  test("no dispatch JSONL sink appears in the intake surface", () => {
    // The three router documents are already pinned by dispatch-guard.test.ts;
    // this extends the same narrow regex to the skill that carries the sink.
    for (const [name, doc] of [
      ["orchestrator", ORCH],
      ["orchestrator-quick", QUICK],
      ["AGENTS.md", AGENTS],
      ["workflow-intake skill", SKILL],
    ] as const) {
      expect(
        doc,
        `${name} must not introduce a dispatch JSONL sink`,
      ).not.toMatch(/[\w.-]*dispatch[\w.-]*\.jsonl/i);
    }
  });
});

describe("intake-triage — docs and session-start consistency", () => {
  test("the docs section points at the canonical skill for the tuple", () => {
    expect(DOCS_WORKFLOW).toMatch(/TriageEventV1/);
    expect(DOCS_WORKFLOW).toContain("skills/workflow-intake/SKILL.md");
  });

  test("the docs record the opt-in telemetry default and the untracked sink", () => {
    expect(DOCS_WORKFLOW).toMatch(/opt-in and off by default/);
    expect(DOCS_WORKFLOW).toContain(".context/triage-dataset.jsonl");
    expect(DOCS_WORKFLOW).toMatch(/untracked by design/);
  });

  test("start-session keeps the triage dataset out of the loaded set", () => {
    expect(START).toContain(".context/triage-dataset.jsonl");
    expect(START).toMatch(
      /The triage dataset \(`\.context\/triage-dataset\.jsonl`\) follows the same isolation rule/,
    );
    expect(START).toMatch(/never read during session start or bootstrap/);
  });
});
