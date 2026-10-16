import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..");
const ORCH = readFileSync(join(REPO_ROOT, "agents", "orchestrator.md"), "utf8");

function frontmatterValue(raw: string, key: string): unknown {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) throw new Error("frontmatter mancante in agents/orchestrator.md");
  const line = fm[1].split(/\r?\n/).find((l) => l.startsWith(`${key}:`));
  if (!line) throw new Error(`chiave ${key} assente nel frontmatter`);
  return JSON.parse(line.slice(key.length + 1).trim());
}

describe("orchestrator frontmatter — harness contract del free tier", () => {
  // Misurato il 2026-10-16 dal container (opencode v2.0.30, modello
  // opencode/glm-5.3-flash-free): con un deny catch-all `"*": "deny"` al primo
  // livello di `permission` la richiesta parte SENZA i tool standard della
  // harness e il gate server-side del free tier risponde 403 FreeTierError
  // («OpenCode's free tier can only be used from within OpenCode») — anche
  // quando quei tool sono elencati in `tools`. Gli agenti che passano il gate
  // (planner, code-reviewer, comprehension-coach) non hanno alcun catch-all;
  // l'orchestrator è il `default_agent`, quindi il difetto bloccava ogni
  // sessione free-tier aperta dal container.
  // Issue correlate: anomalyco/opencode#55435, #50627, #51241.
  const REQUIRED = ["read", "glob", "grep", "bash"] as const;
  const tools = frontmatterValue(ORCH, "tools") as Record<string, boolean>;
  const permission = frontmatterValue(ORCH, "permission") as Record<string, unknown>;

  test('permission non ha un deny catch-all al primo livello (nessuna chiave "*")', () => {
    expect(Object.keys(permission)).not.toContain("*");
  });

  test("tools dichiara i tool del routing read-only", () => {
    const missing = REQUIRED.filter((t) => tools[t] !== true);
    expect(missing).toEqual([]);
  });

  test("permission concede esplicitamente read/glob/grep", () => {
    for (const t of ["read", "glob", "grep"] as const) {
      expect(permission[t]).toBe("allow");
    }
  });
});