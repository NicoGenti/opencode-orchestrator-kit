import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { collectPackagedAgents } from "../plugin/src/agents.ts";
import { resolveEffect } from "../plugin/src/permissions.ts";
import type { PermissionRule } from "../plugin/src/permissions.ts";
import { TierConfigError, resolveTierMap } from "../plugin/src/tiers.ts";
import plugin from "../plugin/src/index.ts";

const ROOT = join(import.meta.dir, "..");

const AGENT_IDS = [
  "build-helper",
  "code-reviewer",
  "comprehension-coach",
  "deploy-helper",
  "developer-fixer",
  "explorer",
  "librarian",
  "npm-helper",
  "oracle",
  "orchestrator",
  "plan-writer",
  "planner",
  "profiler",
  "security",
  "test-engineer",
];

const EXTRA_IDS = ["pc-doctor", "writer"];

const resolvedDefault = resolveTierMap();

/** Repo source body for an agent (frontmatter stripped, trimmed). */
function sourceBody(sourceRel: string): string {
  return readFileSync(join(ROOT, sourceRel), "utf-8")
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, "")
    .trim();
}

/** Top-level scalar (inline or `>-` folded block) from a repo agent file. */
function sourceScalar(sourceRel: string, key: string): string {
  const raw = readFileSync(join(ROOT, sourceRel), "utf-8");
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) {
    throw new Error(`${sourceRel} has no frontmatter block`);
  }
  const inline = new RegExp(`^${key}:[ \\t]+(\\S.*)$`, "m").exec(fm[1]);
  if (inline) {
    return inline[1].trim();
  }
  const block = new RegExp(
    `^${key}:[ \\t]*>-[ \\t]*\\r?\\n((?:[ \\t]+[^\\r\\n]*\\r?\\n?)+)`,
    "m",
  ).exec(fm[1]);
  if (block) {
    return block[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  throw new Error(`${sourceRel} frontmatter has no "${key}"`);
}

interface FakeAgentEditor {
  updates: Map<string, Record<string, unknown>>;
  updateIds: string[];
  registered: () => string[];
  defaultCount: () => number;
  list(): string[];
  get(id: string): Record<string, unknown> | undefined;
  default(id: string): void;
  update(id: string, fn: (agent: Record<string, unknown>) => void): void;
  remove(id: string): void;
}

function makeFakeEditor(seed: string[] = []): FakeAgentEditor {
  const registry = new Map<string, Record<string, unknown>>(
    seed.map((id) => [id, { id, name: id, mode: "primary" }]),
  );
  const updates = new Map<string, Record<string, unknown>>();
  const updateIds: string[] = [];
  let defaults = 0;
  return {
    updates,
    updateIds,
    registered: () => [...registry.keys()],
    defaultCount: () => defaults,
    list: () => [...registry.keys()],
    get: (id) => registry.get(id),
    default: () => {
      defaults++;
    },
    update(id, fn) {
      let agent = registry.get(id);
      const fresh = agent === undefined;
      if (!agent) {
        agent = { id, name: id, mode: "primary" };
      }
      fn(agent);
      registry.set(id, agent);
      if (fresh) {
        updates.set(id, agent);
        updateIds.push(id);
      } else {
        updateIds.push(id);
      }
    },
    remove: () => {},
  };
}

interface CtxHarnessOptions {
  options?: Record<string, unknown>;
  models: Array<{ providerID: string; id: string }>;
  seededAgents?: string[];
}

function makeHarness({
  options = {},
  models,
  seededAgents = [],
}: CtxHarnessOptions) {
  const editor = makeFakeEditor(seededAgents);
  const ctx = {
    options,
    model: {
      list: async () => models,
    },
    agent: {
      transform: async (
        callback: (editor: FakeAgentEditor) => Promise<void>,
      ) => {
        await callback(editor);
      },
    },
    command: {
      transform: (callback: (editor: { add(): void }) => void) => {
        void callback({ add: () => {} });
      },
    },
    skill: {
      transform: (callback: (editor: { add(): void }) => void) => {
        void callback({ add: () => {} });
      },
    },
  };
  return { ctx, editor };
}

function captureWarn(): { warnings: string[]; restore: () => void } {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  return {
    warnings,
    restore: () => {
      console.warn = original;
    },
  };
}

function setup(harness: ReturnType<typeof makeHarness>): Promise<unknown> {
  return plugin.setup(harness.ctx as never) as Promise<unknown>;
}

const REGISTRY_FULL = [
  { providerID: "opencode-go", id: "gpt-5.6-luna" },
  { providerID: "opencode-go", id: "kimi-k3" },
  { providerID: "opencode-go", id: "minimax-m3" },
  { providerID: "ollama", id: "deepseek-v4.1-flash:cloud" },
];

describe("agent registration (defaults)", () => {
  test("(a) default options register exactly the 15 agents by id", async () => {
    const harness = makeHarness({ models: REGISTRY_FULL });
    const result = await setup(harness);
    await Promise.resolve(result);
    expect(harness.editor.updateIds).toHaveLength(15);
    expect([...harness.editor.updateIds].sort()).toEqual(AGENT_IDS);
  });

  test("(b) withExtras: true additionally registers the 2 extras", async () => {
    const harness = makeHarness({
      options: { withExtras: true },
      models: REGISTRY_FULL,
    });
    await setup(harness);
    expect(harness.editor.updateIds).toHaveLength(17);
    expect([...harness.editor.updateIds].sort()).toEqual(
      [...AGENT_IDS, ...EXTRA_IDS].sort(),
    );
  });

  test("(c) each agent gets model/system/description/mode from sources", async () => {
    const harness = makeHarness({
      options: { withExtras: true },
      models: REGISTRY_FULL,
    });
    await setup(harness);

    for (const packaged of collectPackagedAgents(true)) {
      const agent = harness.editor.updates.get(packaged.id);
      expect(agent).toBeDefined();

      // model: the resolved Model.Ref for the frontmatter tier token.
      const match = /^\{\{(TIER_[A-Z]+)\}\}$/.exec(packaged.model);
      if (!match) {
        throw new Error(`${packaged.source} model is not a tier token`);
      }
      const resolvedValue = resolvedDefault.models[match[1]];
      const [providerID, ...rest] = resolvedValue.split("/");
      expect(agent!.model).toEqual({ providerID, id: rest.join("/") });

      // system: the mirrored repo body, frontmatter-free and token-free.
      expect(agent!.system).toBe(sourceBody(packaged.source));
      expect(agent!.system).toBe(packaged.system);
      expect(String(agent!.system)).not.toContain("{{");

      // description and mode straight from frontmatter (parity with repo).
      expect(agent!.description).toBe(
        sourceScalar(packaged.source, "description"),
      );
      expect(agent!.mode).toBe(sourceScalar(packaged.source, "mode"));
    }
  });

  test("(c2) spot-check known tier mappings", async () => {
    const harness = makeHarness({ models: REGISTRY_FULL });
    await setup(harness);
    expect(harness.editor.updates.get("orchestrator")!.model).toEqual({
      providerID: "opencode-go",
      id: "gpt-5.6-luna",
    });
    expect(harness.editor.updates.get("developer-fixer")!.model).toEqual({
      providerID: "opencode-go",
      id: "minimax-m3",
    });
    expect(harness.editor.updates.get("code-reviewer")!.model).toEqual({
      providerID: "opencode-go",
      id: "minimax-m3",
    });
    expect(harness.editor.updates.get("explorer")!.model).toEqual({
      providerID: "ollama",
      id: "deepseek-v4.1-flash:cloud",
    });
  });

  test("(d) exactly one primary agent and it is orchestrator", async () => {
    const harness = makeHarness({
      options: { withExtras: true },
      models: REGISTRY_FULL,
    });
    await setup(harness);
    const primaries = [...harness.editor.updates.entries()].filter(
      ([, agent]) => agent.mode === "primary",
    );
    expect(primaries.map(([id]) => id)).toEqual(["orchestrator"]);
    for (const [id, agent] of harness.editor.updates) {
      if (id !== "orchestrator") {
        expect(agent.mode).toBe("subagent");
      }
    }
  });

  test("(e) a pre-existing same-id agent is skipped (user config wins)", async () => {
    const harness = makeHarness({
      models: REGISTRY_FULL,
      seededAgents: ["oracle"],
    });
    await setup(harness);
    expect(harness.editor.updateIds).toHaveLength(14);
    expect(harness.editor.updateIds).not.toContain("oracle");
    expect(harness.editor.updates.has("oracle")).toBe(false);
  });
});

describe("agent registration (options)", () => {
  test("(g) placeholder preset rejects with TierConfigError and no updates", async () => {
    const harness = makeHarness({
      options: { preset: "generic" },
      models: REGISTRY_FULL,
    });
    let error: unknown;
    try {
      await setup(harness);
    } catch (thrown) {
      error = thrown;
    }
    await Promise.resolve();
    expect(error).toBeInstanceOf(TierConfigError);
    expect(harness.editor.updateIds).toHaveLength(0);
  });

  test("(h) editor.default is never called", async () => {
    const harness = makeHarness({ models: REGISTRY_FULL });
    await setup(harness);
    expect(harness.editor.defaultCount()).toBe(0);
  });
});

describe("model availability signaling", () => {
  test("(f) a missing tier model warns once with prefix, tier and model; setup resolves", async () => {
    const harness = makeHarness({
      models: [
        { providerID: "opencode-go", id: "gpt-5.6-luna" },
        { providerID: "opencode-go", id: "kimi-k3" },
        { providerID: "opencode-go", id: "minimax-m3" },
        // ollama provider absent → TIER_FAST unavailable
      ],
    });
    const captured = captureWarn();
    try {
      await setup(harness); // must NOT throw
    } finally {
      captured.restore();
    }
    expect(harness.editor.updateIds.sort()).toEqual(AGENT_IDS);
    const fastWarnings = captured.warnings.filter((message) =>
      message.includes("TIER_FAST"),
    );
    expect(fastWarnings).toHaveLength(1);
    expect(fastWarnings[0]).toContain("[opencode-orchestrator-kit]");
    expect(fastWarnings[0]).toContain("ollama/deepseek-v4.1-flash:cloud");
    expect(fastWarnings[0]).toContain("default");
  });

  test("(f2) empty registry emits exactly one warning, no per-tier spam", async () => {
    const harness = makeHarness({ models: [] });
    const captured = captureWarn();
    try {
      await setup(harness);
    } finally {
      captured.restore();
    }
    expect(harness.editor.updateIds).toHaveLength(15);
    expect(captured.warnings).toHaveLength(1);
    expect(captured.warnings[0]).toContain("[opencode-orchestrator-kit]");
    expect(captured.warnings[0]).toContain("empty");
  });
});

describe("agent registration (permissions, Phase 5)", () => {
  test("(i) every registered agent carries the packaged V2 rules", async () => {
    const harness = makeHarness({
      options: { withExtras: true },
      models: REGISTRY_FULL,
    });
    await setup(harness);
    for (const packaged of collectPackagedAgents(true)) {
      const registered = harness.editor.updates.get(packaged.id);
      expect(registered).toBeDefined();
      expect(registered!.permissions).toEqual(packaged.permissions);
    }
  });

  test("(j) orchestrator cannot edit application code but keeps session-memory writes", async () => {
    const harness = makeHarness({ models: REGISTRY_FULL });
    await setup(harness);
    const rules = harness.editor.updates.get("orchestrator")!.permissions as PermissionRule[];
    expect(resolveEffect(rules, "edit", "src/app.ts")).toBe("deny");
    expect(resolveEffect(rules, "edit", ".context/progress.md")).toBe("allow");
    expect(resolveEffect(rules, "edit", ".context/decisions.md")).toBe("allow");
    expect(resolveEffect(rules, "shell", "git status --short")).toBe("allow");
    expect(resolveEffect(rules, "shell", "rm -rf .")).toBe("deny");
    expect(resolveEffect(rules, "webfetch", "https://example.com")).toBe("deny");
  });

  test("(k) only plan-writer may edit under the board root", async () => {
    const harness = makeHarness({
      options: { withExtras: true },
      models: REGISTRY_FULL,
    });
    await setup(harness);
    for (const [id, agent] of harness.editor.updates) {
      const effect = resolveEffect(
        agent.permissions as PermissionRule[],
        "edit",
        "plan/qa/13-example.md",
      );
      expect(`${id}=${effect}`).toBe(id === "plan-writer" ? "plan-writer=allow" : `${id}=deny`);
    }
  });
});
