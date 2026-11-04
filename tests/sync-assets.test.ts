/**
 * scripts/sync-assets.ts — the packaged mirror stays regenerable.
 *
 * Content identity of the real tree is tests/plugin-assets-parity.test.ts.
 * These cases exercise --check against that tree and the writer against a
 * throwaway root so they never race with the parity test.
 */
import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { syncAssets } from "../scripts/sync-assets.ts";

const ROOT = join(import.meta.dir, "..");
const SCRIPT = join(ROOT, "scripts", "sync-assets.ts");

function writeFixture(root: string): void {
  mkdirSync(join(root, "command"), { recursive: true });
  mkdirSync(join(root, "skills", "demo"), { recursive: true });
  mkdirSync(join(root, "agents"), { recursive: true });
  mkdirSync(join(root, "extras"), { recursive: true });
  writeFileSync(join(root, "command", "start-session.md"), "start\n");
  writeFileSync(join(root, "command", "recall.md"), "recall\n");
  writeFileSync(join(root, "command", "quick.md"), "recall\n");
  writeFileSync(join(root, "command", "research-mode.md"), "research\n");
  writeFileSync(join(root, "command", "close-session.md"), "close\n");
  writeFileSync(join(root, "command", "not-packaged.md"), "not packaged\n");
  writeFileSync(join(root, "skills", "demo", "SKILL.md"), "skill\n");
  writeFileSync(join(root, "agents", "orchestrator.md"), "agent\n");
  writeFileSync(join(root, "extras", "writer.md"), "extra\n");
}

describe("sync-assets", () => {
  test("--check passes when plugin/assets matches the sources", () => {
    const result = spawnSync("bun", [SCRIPT, "--check"], {
      cwd: ROOT,
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("plugin/assets matches");
  });

  test("write mode copies the addressable sources and drops stale files", () => {
    const root = mkdtempSync(join(tmpdir(), "sync-assets-"));
    try {
      writeFixture(root);
      const stale = join(root, "plugin", "assets", "commands", "extra.md");
      mkdirSync(join(root, "plugin", "assets", "commands"), {
        recursive: true,
      });
      writeFileSync(stale, "stale\n");

      const drifted = syncAssets(root, true);
      expect(drifted.problems).toContain("commands/start-session.md");
      expect(drifted.problems).toContain("stale commands/extra.md");
      expect(existsSync(stale)).toBe(true);

      const written = syncAssets(root, false);
      expect(written.problems.length).toBeGreaterThan(0);
      expect(
        readFileSync(
          join(root, "plugin", "assets", "commands", "start-session.md"),
          "utf-8",
        ),
      ).toBe("start\n");
      expect(
        readFileSync(
          join(root, "plugin", "assets", "skills", "demo", "SKILL.md"),
          "utf-8",
        ),
      ).toBe("skill\n");
      expect(
        readFileSync(
          join(root, "plugin", "assets", "agents", "orchestrator.md"),
          "utf-8",
        ),
      ).toBe("agent\n");
      expect(
        readFileSync(
          join(root, "plugin", "assets", "extras", "writer.md"),
          "utf-8",
        ),
      ).toBe("extra\n");
      expect(existsSync(stale)).toBe(false);
      expect(
        readFileSync(
          join(root, "plugin", "assets", "commands", "close-session.md"),
          "utf-8",
        ),
      ).toBe("close\n");
      expect(
        existsSync(
          join(root, "plugin", "assets", "commands", "not-packaged.md"),
        ),
      ).toBe(false);

      const clean = syncAssets(root, true);
      expect(clean.problems).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
