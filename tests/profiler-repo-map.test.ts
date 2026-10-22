import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const PROFILER = readFileSync(join(REPO_ROOT, "agents/profiler.md"), "utf-8");

describe("profiler repo map contract", () => {
  test("frontmatter grants write permission for .context/repo-map.md", () => {
    const fm = PROFILER.slice(0, PROFILER.indexOf("\n---", 4));
    expect(fm).toContain('".context/repo-map.md": allow');
  });

  test("repo map is a derived artifact refreshed on every run", () => {
    expect(PROFILER).toMatch(/derived,\s*regenerable artifact/i);
    expect(PROFILER).toMatch(/MUST overwrite it on every profiler run/i);
  });

  test("repo map has a hard 300-line budget", () => {
    expect(PROFILER).toContain("300 lines");
  });

  test("repo map sections and truncation rule are specified", () => {
    expect(PROFILER).toContain("## Stack");
    expect(PROFILER).toContain("## Directory Layout");
    expect(PROFILER).toContain("## Key Entry Points");
    expect(PROFILER).toContain("## Notable Modules");
    expect(PROFILER).toContain("Truncated:");
  });

  test("repo map is a navigation aid, not evidence", () => {
    expect(PROFILER).toMatch(/navigation aid.*never a substitute for reading source files/is);
  });
});
