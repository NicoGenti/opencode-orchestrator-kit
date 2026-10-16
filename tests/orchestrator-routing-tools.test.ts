import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const ORCH = readFileSync(join(REPO_ROOT, "agents", "orchestrator.md"), "utf8");

function frontmatter(raw: string): string {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error("frontmatter mancante in agents/orchestrator.md");
  return m[1];
}

describe("orchestrator frontmatter — harness contract del free tier", () => {
  // Il free tier (provider Console) risponde 403 FreeTierError
  // ("free tier can only be used from within OpenCode") a ogni richiesta il cui
  // elenco di tool non contenga i tool standard della harness. agents/orchestrator.md
  // è il default_agent del container: se qui manca un tool, ogni sessione
  // free-tier dell'orchestrator fallisce (issue anomalyco/opencode#55435, #50627, #51241).
  const REQUIRED = ["read", "glob", "grep", "bash"] as const;

  test("tools dichiara i tool che il corpo (routing read-only) promette", () => {
    const toolsLine = frontmatter(ORCH).split(/\r?\n/).find((l) => l.startsWith("tools:"));
    expect(toolsLine).toBeDefined();
    const missing = REQUIRED.filter((t) => !new RegExp(`"${t}"\\s*:\\s*true`).test(toolsLine!));
    expect(missing).toEqual([]);
  });

  test("permission cita esplicitamente i quattro tool (nessun deny totale)", () => {
    const permLine = frontmatter(ORCH).split(/\r?\n/).find((l) => l.startsWith("permission:"));
    expect(permLine).toBeDefined();
    for (const t of REQUIRED) expect(permLine!).toContain(`"${t}"`);
  });
});