import { describe, expect, test, afterAll } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

import { kitSetup, nodeIo } from "../src/setup.ts";
import type { KitContext, KitIo, KitSkill } from "../src/types.ts";

mkdirSync("/tmp/opencode", { recursive: true });
const tmpRoot = mkdtempSync("/tmp/opencode/setup-test-");
const roots = new Set<string>([tmpRoot]);
afterAll(() => {
  for (const dir of roots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function freshProject(): string {
  const dir = mkdtempSync("/tmp/opencode/setup-test-project-");
  roots.add(dir);
  return dir;
}

const REPO = join(import.meta.dir, "..", "..");

function listing(dir: string): string[] {
  return readdirSync(dir);
}

interface RecordingIo extends KitIo {
  writes: string[];
}

function recordingIo(): RecordingIo {
  const writes: string[] = [];
  const io: RecordingIo = {
    exists: (path) => nodeIo.exists(path),
    listEntries: (dir) => nodeIo.listEntries(dir),
    isDirectory: (path) => nodeIo.isDirectory(path),
    readFile: (path) => nodeIo.readFile(path),
    mkdirRecursive: (dir) => {
      nodeIo.mkdirRecursive(dir);
    },
    copyFile: (src, dst) => {
      writes.push(dst);
      nodeIo.copyFile(src, dst);
    },
    writes,
  };
  return io;
}

interface AgentAssignment {
  id: string;
  model: { providerID: string; id: string } | undefined;
}

function makeFakeContext(projectPath: string, options: Record<string, unknown> = {}) {
  const agentReloads: number[] = [];
  const commandReloads: number[] = [];
  const defaultCalls: (string | undefined)[] = [];
  const presentAgents: string[] = ["orchestrator", "explorer", "developer-fixer", "test-engineer", "oracle", "planner"];
  const assignments: AgentAssignment[] = [];
  const skillLists: string[][] = [];
  const skillsAdded: KitSkill[] = [];

  const agentEditor = {
    get(id: string): unknown | undefined {
      return presentAgents.includes(id) ? { id } : undefined;
    },
    default(id: string | undefined): void {
      defaultCalls.push(id);
    },
    update(id: string, update: (agent: { model?: { providerID: string; id: string } }) => void): void {
      const draft: { model?: { providerID: string; id: string } } = { id, model: undefined };
      update(draft);
      assignments.push({ id, model: draft.model });
    },
  };

  const ctx: KitContext = {
    location: { directory: projectPath },
    options,
    agent: {
      async reload() {
        agentReloads.push(1);
      },
      async transform(callback) {
        callback(agentEditor);
        return { dispose: async () => {} };
      },
    },
    command: {
      async reload() {
        commandReloads.push(1);
      },
    },
    model: {
      async list() {
        return [{ providerID: "prov", id: "model-a" }];
      },
    },
    skill: {
      async list() {
        return skillLists.at(-1) ?? [];
      },
      async transform(callback) {
        const editor = { add: (skill: KitSkill) => skillsAdded.push(skill) };
        callback(editor);
        return { dispose: async () => {} };
      },
    },
  };

  return {
    ctx,
    agentReloads,
    commandReloads,
    defaultCalls,
    presentAgents,
    assignments,
    skillLists,
    skillsAdded,
    setPreexistingSkills(ids: string[]) {
      skillLists.push(ids);
    },
  };
}

const AVAILABLE_CONFIG = {
  default_preset: "available",
  presets: {
    available: {
      label: "All tiers point at the available fake model",
      models: {
        TIER_ROUTER: "prov/model-a",
        TIER_REASONING: "prov/model-a",
        TIER_CODE: "prov/model-a",
        TIER_FAST: "prov/model-a",
        TIER_REVIEW: "prov/model-a",
      },
    },
  },
};

function writeProjectConfig(projectPath: string, body: unknown): void {
  const dir = join(projectPath, ".opencode");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "models.config.json"), JSON.stringify(body));
}

describe("kitSetup — materialisation (create-if-missing, idempotent)", () => {
  test("first run copies agents and commands into .opencode/ and reloads domains", async () => {
    const project = freshProject();
    const fake = makeFakeContext(project);
    const io = recordingIo();

    await kitSetup(fake.ctx, io);

    const agentsDest = join(project, ".opencode", "agents");
    const commandsDest = join(project, ".opencode", "commands");
    expect(existsSync(join(agentsDest, "orchestrator.md"))).toBe(true);
    expect(existsSync(join(agentsDest, "explorer.md"))).toBe(true);
    expect(existsSync(join(commandsDest, "start-session.md"))).toBe(true);
    // Repo parity: every agents/*.md and command/*.md is materialised.
    expect(listing(agentsDest).sort()).toEqual(listing(join(REPO, "agents")).sort());
    expect(listing(commandsDest).sort()).toEqual(listing(join(REPO, "command")).sort());
    // Extras are NOT part of the default install.
    expect(existsSync(join(agentsDest, "pc-doctor.md"))).toBe(false);
    expect(existsSync(join(agentsDest, "writer.md"))).toBe(false);
    // Domains were reloaded after materialisation.
    expect(fake.agentReloads.length).toBe(1);
    expect(fake.commandReloads.length).toBe(1);
  });

  test("second run performs zero writes and preserves a user-modified file", async () => {
    const project = freshProject();
    const fake = makeFakeContext(project);

    await kitSetup(fake.ctx, recordingIo());

    const target = join(project, ".opencode", "agents", "orchestrator.md");
    const ORIGINAL = readFileSync(target, "utf-8");
    const USER_EDITION = ORIGINAL + "\n<!-- user edit marker -->\n";
    writeFileSync(target, USER_EDITION);

    const io = recordingIo();
    await kitSetup(fake.ctx, io);

    expect(io.writes).toEqual([]);
    expect(readFileSync(target, "utf-8")).toBe(USER_EDITION);
  });

  test("withExtras: true materialises extras into .opencode/agents", async () => {
    const project = freshProject();
    const fake = makeFakeContext(project, { withExtras: true });
    const io = recordingIo();

    await kitSetup(fake.ctx, io);

    const agentsDest = join(project, ".opencode", "agents");
    expect(existsSync(join(agentsDest, "pc-doctor.md"))).toBe(true);
    expect(existsSync(join(agentsDest, "writer.md"))).toBe(true);
    expect(listing(agentsDest).sort()).toEqual([...listing(join(REPO, "agents")), "pc-doctor.md", "writer.md"].sort());
    // Second run still performs zero writes.
    const io2 = recordingIo();
    await kitSetup(fake.ctx, io2);
    expect(io2.writes).toEqual([]);
  });
});

describe("kitSetup — skill registration (in-memory, idempotent)", () => {
  test("registers every skills/**/SKILL.md with id = folder name and raw content", async () => {
    const project = freshProject();
    const fake = makeFakeContext(project);

    const result = await kitSetup(fake.ctx);

    const ids = fake.skillsAdded.map((skill) => skill.id);
    expect(ids).toContain("comprehension-workflow");
    expect(ids).toContain("angular-patterns");
    expect(fake.skillsAdded.length).toBeGreaterThanOrEqual(8);
    const added = fake.skillsAdded.find((skill) => skill.id === "comprehension-workflow");
    expect(added?.name).toBe("comprehension-workflow");
    expect(added?.content).toContain("Comprehension Workflow");
    expect(added?.path).toBe(join(REPO, "skills", "comprehension-workflow", "SKILL.md"));
    // No duplicate registration.
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("skips skill ids already present in ctx.skill.list()", async () => {
    const project = freshProject();
    const fake = makeFakeContext(project);
    fake.setPreexistingSkills(["comprehension-workflow", "angular-patterns", "python-conventions"]);

    const result = await kitSetup(fake.ctx);

    const addedIds = fake.skillsAdded.map((skill) => skill.id);
    expect(addedIds).not.toContain("comprehension-workflow");
    expect(addedIds).not.toContain("angular-patterns");
    expect(result.skillsSkipped).toContain("comprehension-workflow");
    expect(fake.skillsAdded.length).toBeGreaterThanOrEqual(5);
  });
});

describe("kitSetup — tier application via project model config", () => {
  test("applies the resolved model to agents whose target model line is a {{TIER_*}} token", async () => {
    const project = freshProject();
    writeProjectConfig(project, AVAILABLE_CONFIG);
    const fake = makeFakeContext(project);

    const result = await kitSetup(fake.ctx);

    expect(result.tierSource).toBe("project");
    expect(result.tierPreset).toBe("available");
    const orchestrated = fake.assignments.find((assignment) => assignment.id === "orchestrator");
    expect(orchestrated?.model).toEqual({ providerID: "prov", id: "model-a" });
    // Other README-tier agents also receive the tier model.
    expect(result.agentsUpdated).toContain("orchestrator");
    expect(result.warnings.filter((warning) => warning.code === "placeholder" || warning.code === "unavailable")).toEqual([]);
  });

  test("concrete model values in existing target files are left alone", async () => {
    const project = freshProject();
    // Pre-create one agent file with a CONCRETE model; create-if-missing will
    // never overwrite it, and the concrete value must be preserved as-is.
    const agentsDest = join(project, ".opencode", "agents");
    mkdirSync(agentsDest, { recursive: true });
    copyFileSync(join(REPO, "agents", "explorer.md"), join(agentsDest, "explorer.md"));
    const original = readFileSync(join(agentsDest, "explorer.md"), "utf-8");
    const concrete = original.replace(/^model:\s*\S+\s*$/m, "model: prov/my-concrete-model");
    expect(concrete).not.toBe(original);
    writeFileSync(join(agentsDest, "explorer.md"), concrete);

    writeProjectConfig(project, AVAILABLE_CONFIG);
    const fake = makeFakeContext(project);

    const result = await kitSetup(fake.ctx);

    const assignment = fake.assignments.find((entry) => entry.id === "explorer");
    expect(assignment).toBeUndefined();
    expect(result.agentsUpdated).not.toContain("explorer");
  });

  test("unavailable models warn (prefixed) and are NOT assigned", async () => {
    const project = freshProject();
    writeProjectConfig(project, {
      default_preset: "ghost",
      presets: {
        ghost: {
          models: {
            TIER_ROUTER: "ghost/nope",
            TIER_REASONING: "ghost/nope",
            TIER_CODE: "ghost/nope",
            TIER_FAST: "ghost/nope",
            TIER_REVIEW: "ghost/nope",
          },
        },
      },
    });
    const fake = makeFakeContext(project);

    const result = await kitSetup(fake.ctx);

    const unavailable = result.warnings.filter((warning) => warning.code === "unavailable");
    expect(unavailable.length).toBeGreaterThan(0);
    for (const warning of unavailable) {
      expect(warning.tier).toMatch(/^TIER_/);
      expect(warning.value).toBe("ghost/nope");
      expect(warning.message).toContain("[opencode-orchestrator-kit]");
    }
    expect(result.agentsUpdated).toEqual([]);
    expect(fake.assignments).toEqual([]);
  });

  test("placeholder/* values warn (prefixed) and are NOT assigned, with skip unless edited", async () => {
    const project = freshProject();
    // No project config: the repo template's `generic` preset is placeholder/*-based.
    const fake = makeFakeContext(project, { preset: "generic" });

    const result = await kitSetup(fake.ctx);

    expect(result.tierSource).toBe("template");
    expect(result.tierPreset).toBe("generic");
    const placeholders = result.warnings.filter((warning) => warning.code === "placeholder");
    expect(placeholders.length).toBeGreaterThanOrEqual(3);
    for (const warning of placeholders) {
      expect(warning.value).toMatch(/^placeholder\//);
      expect(warning.message).toContain("[opencode-orchestrator-kit]");
    }
    expect(result.agentsUpdated).toEqual([]);
  });

  test("unknown preset option and invalid project config throw clear errors", async () => {
    const project = freshProject();
    writeProjectConfig(project, AVAILABLE_CONFIG);
    const fake = makeFakeContext(project, { preset: "does-not-exist" });
    try {
      await kitSetup(fake.ctx);
      throw new Error("SENTINEL: no error thrown");
    } catch (err) {
      expect((err as Error).message).toContain("does-not-exist");
      expect((err as Error).message).not.toContain("SENTINEL");
    }

    const broken = freshProject();
    writeProjectConfig(broken, { invalid: "structure" });
    try {
      await kitSetup(makeFakeContext(broken).ctx);
      throw new Error("SENTINEL: no error thrown");
    } catch (err) {
      expect((err as Error).message).toContain("presets");
      expect((err as Error).message).not.toContain("SENTINEL");
    }
  });
});

describe("kitSetup — default agent selection", () => {
  test("sets the default agent to orchestrator when present", async () => {
    const project = freshProject();
    writeProjectConfig(project, AVAILABLE_CONFIG);
    const fake = makeFakeContext(project);

    const result = await kitSetup(fake.ctx);

    expect(result.defaultAgent).toBe("orchestrator");
    expect(fake.defaultCalls).toContain("orchestrator");
  });

  test("warns and skips the default agent when orchestrator is absent", async () => {
    const project = freshProject();
    writeProjectConfig(project, AVAILABLE_CONFIG);
    const fake = makeFakeContext(project);
    fake.presentAgents.length = 0;

    const result = await kitSetup(fake.ctx);

    const missing = result.warnings.filter((warning) => warning.code === "default-agent-missing");
    expect(missing.length).toBe(1);
    expect(missing[0].message).toContain("[opencode-orchestrator-kit]");
    expect(fake.defaultCalls).toEqual([]);
    expect(result.defaultAgent).toBeNull();
  });
});
