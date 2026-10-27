import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf-8");

const CANONICAL_SECTIONS = [
  "## Purpose",
  "## Users and Use Cases",
  "## Constraints",
  "## Architectural Style",
  "## Module Boundaries",
  "## Data and Integrations",
  "## Non-Functional Requirements",
  "## Design Rules",
  "## Decision Log",
];

describe("design rules contract", () => {
  test("template defines the canonical sections", () => {
    const tpl = read("templates/design-rules.md");
    for (const s of CANONICAL_SECTIONS) expect(tpl).toContain(s);
  });

  test("profiler seed uses the canonical headings", () => {
    const profiler = read("agents/profiler.md");
    for (const s of CANONICAL_SECTIONS) expect(profiler).toContain(s);
  });

  test("design-rules-workflow skill exists and is allowed for the orchestrator", () => {
    const skill = read("skills/design-rules-workflow/SKILL.md");
    expect(skill).toContain("# Design Rules Workflow");
    const orch = read("agents/orchestrator.md");
    expect(orch).toContain('"design-rules-workflow":"allow"');
  });

  test("oracle can research but never write", () => {
    const oracle = read("agents/oracle.md");
    expect(oracle).toContain("webfetch: allow");
    expect(oracle).toContain("edit: deny");
    expect(oracle).toContain("Design Rules");
  });

  test("planner and code-reviewer reference the design-rules artifact", () => {
    expect(read("agents/planner.md")).toContain("DESIGN-RULES");
    expect(read("agents/code-reviewer.md")).toContain("Design Rules Compliance");
  });

  test("plugin asset mirrors are byte-identical", () => {
    for (const f of ["profiler", "orchestrator", "oracle", "planner", "code-reviewer"]) {
      expect(read(`plugin/assets/agents/${f}.md`)).toBe(read(`agents/${f}.md`));
    }
    expect(read("plugin/assets/skills/design-rules-workflow/SKILL.md")).toBe(
      read("skills/design-rules-workflow/SKILL.md")
    );
  });

  test("orchestrator prompt stays within the 24k budget", () => {
    const orch = read("agents/orchestrator.md");
    expect(orch.length).toBeLessThanOrEqual(24000);
  });
});
