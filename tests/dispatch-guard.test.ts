/**
 * #203 dispatch guard: both primary routers must refuse to dispatch the same
 * task twice, and dispatch accounting stays in `.context/progress.md` — a JSONL
 * dispatch sink was explicitly rejected. The guard is prompt prose, not
 * executable code, so every pin below asserts the shipped sentence (or its
 * absence) rather than simulating a dispatch.
 *
 * The guard has a producer side: an accepted dispatch is written before the
 * `subagent` call and removed when that task completes, suppressed
 * alternatives are recorded, and no more than one call per assistant turn is
 * made for the same runtime ID and task key. The suppression condition is the
 * same verbatim sentence in all three documents.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

const read = (file: string): string =>
  readFileSync(join(ROOT, file), "utf-8").replace(/\r\n/g, "\n");

/** Body of one Markdown heading, up to the next heading of any level. */
const section = (source: string, heading: string): string => {
  const start = source.indexOf(heading);
  if (start === -1) return "";
  const body = source.slice(start + heading.length);
  const next = body.search(/^#{1,6} /m);
  return next === -1 ? body : body.slice(0, next);
};

const ORCHESTRATOR = read("agents/orchestrator.md");
const QUICK = read("agents/orchestrator-quick.md");
const AGENTS = read("AGENTS.md");
const DISPATCH_ACCOUNTING_FILES = [
  "AGENTS.md",
  "agents/orchestrator.md",
  "agents/orchestrator-quick.md",
] as const;

/** The one suppression condition, copied verbatim into all three documents. */
const UNIFIED_SUPPRESSION =
  "Dispatch only when neither that runtime ID nor that task key is already accepted — one dispatch per task is in flight at a time.";

/** Prefix shared by both routers' one-call-per-turn rule. */
const ONE_CALL_PER_TURN =
  "Never make more than one `subagent` call per assistant turn for the same runtime ID and task key";

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("dispatch guard (#203)", () => {
  test("the orchestrator carries a `### Dispatch guard` subsection", () => {
    expect(ORCHESTRATOR).toMatch(/^### Dispatch guard$/m);
  });

  test("the quick router carries an equivalent `### Dispatch guard` subsection", () => {
    expect(QUICK).toMatch(/^### Dispatch guard$/m);
  });

  test("the guard reads `accepted=<runtime-id>/<task-key>` from progress memory", () => {
    const guard = section(ORCHESTRATOR, "### Dispatch guard");
    expect(guard).toContain("`.context/progress.md`");
    expect(guard).toContain("accepted=<runtime-id>/<task-key>");
  });

  test("accepted dispatches are recorded before the call and cleared on completion", () => {
    const guard = section(ORCHESTRATOR, "### Dispatch guard");
    expect(guard).toContain(
      "write the `accepted=<runtime-id>/<task-key>` entry into `.context/progress.md`",
    );
    expect(guard).toMatch(/remove it when that task completes or is abandoned/);
    expect(guard).toMatch(
      /record a suppressed alternative there with its reason/,
    );
  });

  test("the three documents share one suppression condition verbatim", () => {
    const policies = section(AGENTS, "### Delegation Policies");
    expect(policies).toContain(UNIFIED_SUPPRESSION);
    expect(section(ORCHESTRATOR, "### Dispatch guard")).toContain(
      UNIFIED_SUPPRESSION,
    );
    expect(section(QUICK, "### Dispatch guard")).toContain(UNIFIED_SUPPRESSION);
  });

  test("a dispatch is allowed when the runtime ID or the task key differs", () => {
    for (const doc of [AGENTS, ORCHESTRATOR, QUICK]) {
      expect(doc).toContain("neither that runtime ID nor that task key");
      // The old ambiguous "no matching entry" form is gone: it read as an
      // exact-pair match and could not express the allowed case.
      expect(doc).not.toContain("entry already\n   matches");
      expect(doc).not.toContain("entry already matches");
    }
  });

  test("no more than one subagent call per assistant turn for the same dispatch", () => {
    for (const guard of [
      section(ORCHESTRATOR, "### Dispatch guard"),
      section(QUICK, "### Dispatch guard"),
    ]) {
      expect(guard).toContain(ONE_CALL_PER_TURN);
      expect(guard).toMatch(
        /parallel calls? in that turn are allowed only when both differ|a parallel call is allowed only when both differ/,
      );
    }
  });

  test("a duplicate or self-parallel dispatch is suppressed, not restated", () => {
    const guard = section(ORCHESTRATOR, "### Dispatch guard");
    expect(guard).toMatch(/A duplicate or self-parallel attempt is denied/);
    expect(guard).toMatch(/suppress the call/);
    expect(guard).toMatch(
      /do not restate it as a second dispatch in the same turn/,
    );
  });

  test("one specialist is never split across concurrent dispatches", () => {
    expect(ORCHESTRATOR).toMatch(
      /Parallel `subagent` calls only when specialists are different/,
    );
    expect(ORCHESTRATOR).toMatch(
      /never split one specialist across concurrent calls/,
    );
  });

  test("the quick router stops instead of repeating an in-flight dispatch", () => {
    expect(QUICK).toMatch(/A second delegation means the task was not small/);
    expect(QUICK).toMatch(
      /Never dispatch the same task twice in one turn, not even reworded/,
    );
    expect(QUICK).toMatch(/a duplicate is suppressed, never retried/);
  });

  test("AGENTS.md states the dispatch-guard policy for every delegation", () => {
    const policies = section(AGENTS, "### Delegation Policies");
    expect(policies).toMatch(/\*\*Dispatch guard\*\*/);
    expect(policies).toContain("accepted=<runtime-id>/<task-key>");
    expect(policies).toMatch(/Dispatch accounting stays there/);
    expect(policies).toMatch(/only the user may authorize them/);
  });

  test("dispatch accounting never introduces a JSONL sink", () => {
    for (const file of DISPATCH_ACCOUNTING_FILES) {
      expect(read(file)).not.toMatch(/[\w.-]*dispatch[\w.-]*\.jsonl/i);
    }
    expect(AGENTS).toMatch(/a\s+JSONL dispatch sink is rejected/);
  });

  test("test-engineer denies git and keeps only the five read-only allows", () => {
    const agent = read("agents/test-engineer.md");
    expect(agent).toMatch(/^\s+git \*: deny$/m);
    for (const command of ["status", "diff", "log", "show", "ls-tree"]) {
      expect(agent).toMatch(new RegExp(`^\\s+git ${command} \\*: allow$`, "m"));
    }
  });

  test("test-engineer puts an `--output` deny after every read-only git allow", () => {
    const agent = read("agents/test-engineer.md");
    for (const command of ["status", "diff", "log", "show"]) {
      expect(agent).toMatch(
        new RegExp(
          `^\\s+git ${command} \\*: allow\\n\\s+${escapeRegExp(`git ${command} *--output*: deny`)}$`,
          "m",
        ),
      );
    }
    // Six git denies: `git *`, the four per-command output denies, and the
    // catch-all that covers any other git command writing with `--output`.
    const denies = agent
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^git .*: deny$/.test(line));
    expect(denies).toEqual([
      "git *: deny",
      "git status *--output*: deny",
      "git diff *--output*: deny",
      "git log *--output*: deny",
      "git show *--output*: deny",
      "git *--output*: deny",
    ]);
  });
});
