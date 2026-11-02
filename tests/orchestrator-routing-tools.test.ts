import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseFrontmatterMap } from "../plugin/src/frontmatter-map.ts";

const REPO_ROOT = join(import.meta.dir, "..");
const ORCH = readFileSync(join(REPO_ROOT, "agents", "orchestrator.md"), "utf8");

function frontmatterBody(raw: string): string {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) throw new Error("frontmatter mancante in agents/orchestrator.md");
  return fm[1];
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
  const tools = parseFrontmatterMap(frontmatterBody(ORCH), "tools") as Record<
    string,
    boolean
  >;
  const permission = parseFrontmatterMap(
    frontmatterBody(ORCH),
    "permission",
  ) as Record<string, unknown>;

  test('permission non ha un deny catch-all al primo livello (nessuna chiave "*")', () => {
    expect(Object.keys(permission)).not.toContain("*");
  });

  test("tools dichiara i tool del routing read-only", () => {
    const missing = REQUIRED.filter((t) => tools[t] !== true);
    expect(missing).toEqual([]);
  });

  test("tools does not claim webfetch, write, or edit are unconditionally on", () => {
    // `true` is ignored by the V2 translator. These three contradicted
    // permission (webfetch is deny; write and edit are not blanket allows).
    // bash stays: the shell tool is present and permission allowlists commands.
    expect(tools.webfetch).toBeUndefined();
    expect(tools.write).toBeUndefined();
    expect(tools.edit).toBeUndefined();
  });

  test("permission uses the V1 name task, which the translator maps to subagent", () => {
    expect(permission.task).toBe("allow");
    expect(permission.subagent).toBeUndefined();
  });

  test("permission concede esplicitamente read/glob/grep", () => {
    for (const t of ["read", "glob", "grep"] as const) {
      expect(permission[t]).toBe("allow");
    }
  });
});
