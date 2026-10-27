/**
 * Plugin package install/activation integration (Phase 6b, packed artifact).
 *
 * The suite above (`tests/plugin-integration.test.ts`) imports the plugin from
 * `plugin/src/` — the repository sources. This suite instead exercises the
 * artifact a user actually installs: the npm package `opencode-orchestrator-kit`
 * is packed OFFLINE, unpacked into a temp directory, and the plugin is
 * imported FROM THE UNPACKED COPY. Everything else mirrors what a host would
 * do: an `opencode.json` with a `plugins` entry, the kit options read from
 * that file, and `setup(ctx)` called against a mocked V2 context.
 *
 * That covers the Phase 6 acceptance criterion "on a clean repo with
 * OpenCode 2 you only add the plugin to opencode.json and run /start-session,
 * without install.sh" — offline, on the packed bytes, with no installer.
 *
 * Offline guarantee: the pack runs with `--offline` AND with the registry
 * pointed at an unreachable address (`http://127.0.0.1:1/`), so any registry
 * contact fails immediately instead of reaching the network. Nothing is ever
 * published. The packer is probed in this order:
 *   1. `npm pack --offline --ignore-scripts --json` (canonical npm artifact);
 *   2. `bun pm pack --destination` (same runtime as the test runner, also
 *      offline) when npm is unavailable on the host;
 *   3. a programmatic assembly of the `files` entries of plugin/package.json
 *      when no packer CLI is available.
 * The strategy actually used is asserted by a test, so the report can state
 * it instead of assuming it.
 *
 * Scenarios:
 *  1. packaged artifact — the tarball is exactly the expected 43 files, the
 *     package declares zero runtime dependencies, `files`/`exports` cover
 *     everything registration needs, and the packed assets are the repo-root
 *     sources;
 *  2. empty fixture repo — 3 commands, 10 skills, 15 agents (17 with
 *     `withExtras: true`), 1 `plan_board` tool, orchestrator the only
 *     `primary`, per-agent models resolved from the bundled preset tiers,
 *     V2 permissions on every agent (orchestrator 26 rules, plan-writer 8);
 *  3. existing fixture repo — a user-defined agent colliding with a kit id
 *     wins and is not overwritten, the other kit agents still register, and
 *     NOT A SINGLE FILE is written into the repo (the `.opencode/agents/`
 *     copy fallback must never trigger);
 *  4. degraded registry — an unavailable tier model warns with the kit prefix
 *     and is never fatal.
 *
 * Every temp artifact lives under `os.tmpdir()` and is removed in `afterAll`.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const ROOT = join(import.meta.dir, "..");
const PLUGIN_DIR = join(ROOT, "plugin");

const PACK_TIMEOUT_MS = 120_000;

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
] as const;

const EXTRA_IDS = ["pc-doctor", "writer"] as const;

const SKILL_IDS = [
  "build-debug",
  "comprehension-workflow",
  "design-rules-workflow",
  "dev-cleanup",
  "examples/angular-patterns",
  "examples/dotnet-conventions",
  "examples/python-conventions",
  "github-actions-cicd",
  "npm-debug",
  "structural-search",
] as const;

const COMMAND_NAMES = ["start-session", "recall", "research-mode"] as const;

const EXPECTED_PACKAGE_FILES = [
  "package.json",
  "src/agents.ts",
  "src/assets.ts",
  "src/command.ts",
  "src/comprehension.ts",
  "src/frontmatter-map.ts",
  "src/index.ts",
  "src/permissions.ts",
  "src/plan-board-tool.ts",
  "src/plan-board.ts",
  "src/runtime/opencode-plugin.ts",
  "src/tiers.ts",
  "types/opencode-plugin-shim.d.ts",
  ...AGENT_IDS.map((id) => `assets/agents/${id}.md`),
  ...EXTRA_IDS.map((id) => `assets/extras/${id}.md`),
  ...COMMAND_NAMES.map((name) => `assets/commands/${name}.md`),
  ...SKILL_IDS.map((id) => `assets/skills/${id}/SKILL.md`),
] as const;

const REGISTRY_FULL = [
  { providerID: "opencode-go", id: "gpt-5.6-luna" },
  { providerID: "opencode-go", id: "kimi-k3" },
  { providerID: "opencode-go", id: "minimax-m3" },
  { providerID: "ollama", id: "deepseek-v4.1-flash:cloud" },
] as const;

/* -------------------------------------------------------------------------- */
/* Packing (offline)                                                          */
/* -------------------------------------------------------------------------- */

interface PackResult {
  strategy: "npm-pack" | "bun-pm-pack" | "programmatic-assembly";
  tmpDir: string;
  tarball: string | null;
  log: string;
}

function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function npmCommand(): string | null {
  const candidates =
    process.platform === "win32" ? ["npm.cmd", "npm"] : ["npm"];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ["--version"], {
      encoding: "utf-8",
      timeout: 30_000,
    });
    if (probe.status === 0) {
      return candidate;
    }
  }
  return null;
}

function packPluginPackage(): PackResult {
  const tmpDir = mkdtempSync(join(tmpdir(), "kit-plugin-pack-"));
  try {
    return packInto(tmpDir);
  } catch (error) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

function packInto(tmpDir: string): PackResult {
  const destDir = join(tmpDir, "tarball");
  mkdirSync(destDir, { recursive: true });

  const npm = npmCommand();
  if (npm !== null) {
    const result = spawnSync(
      npm,
      [
        "pack",
        "--offline",
        "--registry=http://127.0.0.1:1/",
        "--cache",
        join(tmpDir, "npm-cache"),
        "--no-audit",
        "--no-fund",
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        destDir,
      ],
      {
        cwd: PLUGIN_DIR,
        encoding: "utf-8",
        timeout: PACK_TIMEOUT_MS,
      },
    );
    const log = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    if (result.error) {
      throw new Error(
        `npm pack failed: ${result.error.code ?? result.error.message}\n${log}`,
      );
    }
    if (result.status !== 0) {
      throw new Error(`npm pack exited ${result.status}\n${log}`);
    }
    const tarball = readdirSync(destDir).find((name) => name.endsWith(".tgz"));
    if (tarball === undefined) {
      throw new Error(`npm pack produced no tarball in ${destDir}\n${log}`);
    }
    return {
      strategy: "npm-pack",
      tmpDir,
      tarball: join(destDir, tarball),
      log,
    };
  }

  const bun = spawnSync(
    "bun",
    ["pm", "pack", "--ignore-scripts", "--destination", destDir],
    {
      cwd: PLUGIN_DIR,
      encoding: "utf-8",
      timeout: PACK_TIMEOUT_MS,
    },
  );
  const bunLog = `${bun.stdout ?? ""}${bun.stderr ?? ""}`;
  if (!bun.error && bun.status === 0) {
    const tarball = readdirSync(destDir).find((name) => name.endsWith(".tgz"));
    if (tarball !== undefined) {
      return {
        strategy: "bun-pm-pack",
        tmpDir,
        tarball: join(destDir, tarball),
        log: bunLog,
      };
    }
  }

  const pkg = JSON.parse(
    readFileSync(join(PLUGIN_DIR, "package.json"), "utf-8"),
  ) as { files: string[] };
  const packageRoot = join(tmpDir, "unpacked", "package");
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    join(packageRoot, "package.json"),
    readFileSync(join(PLUGIN_DIR, "package.json")),
  );
  for (const entry of pkg.files) {
    copyTree(join(PLUGIN_DIR, entry), join(packageRoot, entry));
  }
  return {
    strategy: "programmatic-assembly",
    tmpDir,
    tarball: null,
    log: `npm unavailable (${bunLog.trim()}); assembled ${pkg.files.join(", ")} from the source tree`,
  };
}

function copyTree(from: string, to: string): void {
  const stat = statSync(from);
  if (stat.isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      copyTree(join(from, entry.name), join(to, entry.name));
    }
    return;
  }
  mkdirSync(resolve(to, ".."), { recursive: true });
  writeFileSync(to, readFileSync(from));
}

/* -------------------------------------------------------------------------- */
/* Unpacking (pure JS ustar reader — no external tar binary required)          */
/* -------------------------------------------------------------------------- */

function tarString(bytes: Buffer): string {
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? bytes.length : end).toString("utf-8");
}

function extractTarGz(tarball: string, destRoot: string): string[] {
  const archive = gunzipSync(readFileSync(tarball));
  const written: string[] = [];
  let offset = 0;
  let pendingName: string | null = null;

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      continue;
    }
    const name = tarString(header.subarray(0, 100));
    const prefix = tarString(header.subarray(345, 500));
    const size = parseInt(tarString(header.subarray(124, 136)).trim(), 8) || 0;
    const type = String.fromCharCode(header[156]);
    const data = archive.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;

    if (type === "L") {
      pendingName = data.toString("utf-8").replace(/\0.*/, "");
      continue;
    }
    if (type === "x" || type === "g") {
      continue;
    }
    if (type !== "0" && type !== "\0" && type !== "5") {
      continue;
    }

    const entryPath = pendingName ?? (prefix === "" ? name : `${prefix}/${name}`);
    pendingName = null;
    if (entryPath === "") {
      continue;
    }
    if (entryPath.startsWith("/") || entryPath.split("/").includes("..")) {
      throw new Error(`refusing unsafe archive entry '${entryPath}'`);
    }
    const target = join(destRoot, ...entryPath.split("/"));
    if (type === "5") {
      mkdirSync(target, { recursive: true });
      continue;
    }
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, data);
    written.push(entryPath.split("/").slice(1).join("/"));
  }
  return written.sort();
}

/* -------------------------------------------------------------------------- */
/* The packed artifact                                                         */
/* -------------------------------------------------------------------------- */

const pack = packPluginPackage();
const unpackDir = join(pack.tmpDir, "unpacked");
const extractedFiles =
  pack.tarball === null ? null : extractTarGz(pack.tarball, unpackDir);

const packageRoot = join(unpackDir, "package");

function packageFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(packageRoot, full).split(sep).join("/"));
    }
  };
  walk(packageRoot);
  return out.sort();
}

const packedPackageJson = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf-8"),
) as {
  name: string;
  version: string;
  type?: string;
  exports: Record<string, string | { import?: string; default?: string }>;
  files: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/* -------------------------------------------------------------------------- */
/* The plugin imported from the UNPACKED copy                                   */
/* -------------------------------------------------------------------------- */

interface PermissionRule {
  action: string;
  resource: string;
  effect: "allow" | "ask" | "deny";
}

interface ModelRef {
  providerID: string;
  id: string;
  variant?: string;
}

interface AgentRecord {
  id: string;
  name: string;
  mode?: string;
  model?: ModelRef;
  system?: string;
  description?: string;
  permissions?: PermissionRule[];
}

interface PluginInstance {
  id: string;
  setup: (ctx: unknown) => void | Promise<void>;
}

const importFrom = (relativePath: string): Promise<Record<string, unknown>> =>
  import(
    pathToFileURL(join(packageRoot, ...relativePath.split("/"))).href
  ) as Promise<Record<string, unknown>>;

const pluginModule = await importFrom("src/index.ts");
const packedPlugin = pluginModule["default"] as unknown as PluginInstance;
const agentsModule = await importFrom("src/agents.ts");
const tiersModule = await importFrom("src/tiers.ts");
const permissionsModule = await importFrom("src/permissions.ts");

const collectPackagedAgents = agentsModule["collectPackagedAgents"] as (
  withExtras: boolean,
) => Array<{
  id: string;
  model: string;
  assetRel: string;
  permissions: PermissionRule[];
}>;
const resolveTierMap = tiersModule["resolveTierMap"] as (
  presetName?: string,
) => { preset: string; models: Record<string, string> };
const resolveEffect = permissionsModule["resolveEffect"] as (
  rules: PermissionRule[],
  action: string,
  resource: string,
) => "allow" | "ask" | "deny";

/* -------------------------------------------------------------------------- */
/* Mock V2 host context                                                        */
/* -------------------------------------------------------------------------- */

interface Harness {
  agents: Map<string, AgentRecord>;
  registered: string[];
  defaultCalls: number;
  commands: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
  warned: string[];
  prompts: Array<Record<string, unknown>>;
  switched: Array<Record<string, unknown>>;
}

async function setupPackedPlugin(
  options: Record<string, unknown>,
  seed: Map<string, AgentRecord> = new Map(),
  registry: ReadonlyArray<{ providerID: string; id: string }> = REGISTRY_FULL,
): Promise<Harness> {
  const agents = new Map<string, AgentRecord>(
    [...seed].map(([id, agent]) => [id, { ...agent }]),
  );
  const registered: string[] = [];
  const commands: Array<Record<string, unknown>> = [];
  const skills: Array<Record<string, unknown>> = [];
  const tools: Array<Record<string, unknown>> = [];
  const prompts: Array<Record<string, unknown>> = [];
  const switched: Array<Record<string, unknown>> = [];
  let defaultCalls = 0;

  const editor = {
    list: () => [...agents.values()],
    get: (id: string) => agents.get(id),
    default: () => {
      defaultCalls += 1;
    },
    update: (id: string, fn: (agent: AgentRecord) => void) => {
      let agent = agents.get(id);
      if (agent === undefined) {
        agent = { id, name: id, mode: "primary" };
      }
      fn(agent);
      agents.set(id, agent);
      registered.push(id);
    },
    remove: (id: string) => void agents.delete(id),
  };

  const recording = (slot: Array<Record<string, unknown>>) => ({
    transform: (
      callback: (e: { add(entry: Record<string, unknown>): void }) => void,
    ) => {
      void callback({ add: (entry) => void slot.push(entry) });
    },
  });

  const ctx = {
    options,
    model: { list: async () => registry.map((entry) => ({ ...entry })) },
    agent: {
      transform: async (
        callback: (e: typeof editor) => Promise<void> | void,
      ) => {
        await callback(editor);
      },
    },
    command: recording(commands),
    skill: recording(skills),
    tool: recording(tools),
    session: {
      prompt: async (input: Record<string, unknown>) => {
        prompts.push(input);
        return {};
      },
      switchAgent: async (input: Record<string, unknown>) => {
        switched.push(input);
      },
    },
  };

  const warned: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warned.push(args.map(String).join(" "));
  };
  try {
    await packedPlugin.setup(ctx);
  } finally {
    console.warn = originalWarn;
  }

  return {
    agents,
    registered,
    defaultCalls,
    commands,
    skills,
    tools,
    warned,
    prompts,
    switched,
  };
}

/* -------------------------------------------------------------------------- */
/* Fixture repos (host-like)                                                   */
/* -------------------------------------------------------------------------- */

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function pluginEntry(options: Record<string, unknown>): Record<string, unknown> {
  return { package: "opencode-orchestrator-kit", options };
}

function readKitOptions(repo: string): Record<string, unknown> {
  const config = JSON.parse(
    readFileSync(join(repo, "opencode.json"), "utf-8"),
  ) as {
    plugins: Array<{ package: string; options?: Record<string, unknown> }>;
  };
  const entry = config.plugins.find(
    (p) => p.package === "opencode-orchestrator-kit",
  );
  expect(entry).toBeDefined();
  return entry?.options ?? {};
}

function makeEmptyFixture(options: Record<string, unknown> = {}): string {
  const repo = makeTempDir("kit-plugin-empty-");
  writeFileSync(
    join(repo, "opencode.json"),
    `${JSON.stringify({ plugins: [pluginEntry(options)] }, null, 2)}\n`,
    "utf-8",
  );
  return repo;
}

function makeExistingFixture(options: Record<string, unknown> = {}): string {
  const repo = makeTempDir("kit-plugin-existing-");
  writeFileSync(
    join(repo, "opencode.json"),
    `${JSON.stringify(
      {
        plugins: [pluginEntry(options)],
        agent: {
          orchestrator: {
            mode: "primary",
            model: "user/custom-orchestrator",
            description: "user-defined orchestrator",
          },
          "my-reviewer": {
            mode: "subagent",
            description: "user-only agent",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
  mkdirSync(join(repo, ".opencode", "agents"), { recursive: true });
  writeFileSync(
    join(repo, ".opencode", "agents", "my-reviewer.md"),
    "---\ndescription: user-only agent\nmode: subagent\n---\n\nuser body\n",
    "utf-8",
  );
  mkdirSync(join(repo, ".context"), { recursive: true });
  writeFileSync(join(repo, ".context", "progress.md"), "# progress\n", "utf-8");
  return repo;
}

function snapshotTree(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string) => {
    if (!existsSync(current)) return;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        out.set(
          relative(dir, full).split(sep).join("/"),
          createHash("sha256").update(readFileSync(full)).digest("hex"),
        );
      }
    }
  };
  walk(dir);
  return out;
}

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  rmSync(pack.tmpDir, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* 1. The packaged artifact                                                    */
/* -------------------------------------------------------------------------- */

describe("packaged artifact — offline pack and self-containment", () => {
  test("the pack runs offline and the artifact holds exactly the expected files", () => {
    expect(["npm-pack", "bun-pm-pack", "programmatic-assembly"]).toContain(
      pack.strategy,
    );
    if (pack.strategy === "npm-pack") {
      expect(pack.log).toContain("opencode-orchestrator-kit-");
    }
    expect(packageFiles()).toEqual([...EXPECTED_PACKAGE_FILES].sort());
    expect(packageFiles()).toHaveLength(43);
    if (extractedFiles !== null) {
      expect(extractedFiles).toEqual([...EXPECTED_PACKAGE_FILES].sort());
    }
  });

  test("the plugin under test is the one shipped inside the artifact", () => {
    expect(packedPlugin.id).toBe("opencode-orchestrator-kit");
    expect(typeof packedPlugin.setup).toBe("function");
    expect(resolve(packageRoot).startsWith(resolve(pack.tmpDir))).toBe(true);
    expect(resolve(packageRoot)).not.toBe(resolve(PLUGIN_DIR));
  });

  test("the packed package declares zero runtime dependencies", () => {
    expect(packedPackageJson.dependencies).toBeUndefined();
    expect(packedPackageJson.devDependencies).toBeUndefined();
    expect(packedPackageJson.peerDependencies).toEqual({
      "@opencode/plugin": "^2.1.0",
    });
    expect(packedPackageJson.name).toBe("opencode-orchestrator-kit");
    expect(packedPackageJson.type).toBe("module");
  });

  test("files and exports cover everything the registration path needs", () => {
    const raw = packedPackageJson.exports["."];
    const target =
      typeof raw === "string" ? raw : (raw.import ?? raw.default)!;
    expect(existsSync(join(packageRoot, ...target.split("/")))).toBe(true);
    expect(packedPackageJson.files).toEqual(["src", "types", "assets"]);
    for (const entry of packedPackageJson.files) {
      expect(existsSync(join(packageRoot, entry))).toBe(true);
    }
    for (const module of [
      "src/index.ts",
      "src/agents.ts",
      "src/assets.ts",
      "src/command.ts",
      "src/permissions.ts",
      "src/frontmatter-map.ts",
      "src/plan-board-tool.ts",
      "src/plan-board.ts",
      "src/tiers.ts",
      "src/runtime/opencode-plugin.ts",
    ]) {
      expect(existsSync(join(packageRoot, ...module.split("/")))).toBe(true);
    }
    expect(
      existsSync(join(packageRoot, "types", "opencode-plugin-shim.d.ts")),
    ).toBe(true);
    expect(
      existsSync(join(packageRoot, "assets", "agents", "orchestrator.md")),
    ).toBe(true);
  });

  test("the packed assets are the repo-root sources (content-identical)", () => {
    const bindings: Array<[string, string]> = [
      ...COMMAND_NAMES.map((name) => [
        `command/${name}.md`,
        `assets/commands/${name}.md`,
      ]),
      ...AGENT_IDS.map((id) => [`agents/${id}.md`, `assets/agents/${id}.md`]),
      ...EXTRA_IDS.map((id) => [`extras/${id}.md`, `assets/extras/${id}.md`]),
      ...SKILL_IDS.map((id) => [
        `skills/${id}/SKILL.md`,
        `assets/skills/${id}/SKILL.md`,
      ]),
    ];
    for (const [source, asset] of bindings) {
      const shipped = readFileSync(
        join(packageRoot, ...asset.split("/")),
        "utf-8",
      );
      const original = readFileSync(join(ROOT, ...source.split("/")), "utf-8");
      expect(normalizeEol(shipped)).toBe(normalizeEol(original));
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Empty fixture repo                                                       */
/* -------------------------------------------------------------------------- */

describe("plugin activation — empty fixture repo", () => {
  test("the packed plugin registers 3 commands, 10 skills and 1 planboard tool", async () => {
    const repo = makeEmptyFixture({});
    const options = readKitOptions(repo);
    const harness = await setupPackedPlugin(options);

    expect(harness.warned).toEqual([]);
    expect(harness.commands).toHaveLength(3);
    expect(harness.skills).toHaveLength(10);
    expect(harness.tools).toHaveLength(1);
    expect(harness.tools[0].name).toBe("plan_board");
  });

  test("the packed plugin registers the 15 kit agents, 17 with withExtras", async () => {
    const repo = makeEmptyFixture({ withExtras: true });
    const options = readKitOptions(repo);
    const harness = await setupPackedPlugin(options);

    expect(harness.registered).toHaveLength(17);
    expect(harness.agents.size).toBe(17);
  });

  test("orchestrator is the only primary agent", async () => {
    const repo = makeEmptyFixture({});
    const options = readKitOptions(repo);
    const harness = await setupPackedPlugin(options);

    const primaries = [...harness.agents.values()].filter(
      (agent) => agent.mode === "primary",
    );
    expect(primaries.map((agent) => agent.id)).toEqual(["orchestrator"]);
  });

  test("every agent gets a concrete model resolved from the bundled preset tiers", async () => {
    const repo = makeEmptyFixture({});
    const options = readKitOptions(repo);
    const harness = await setupPackedPlugin(options);

    for (const agent of harness.agents.values()) {
      expect(agent.model).toBeDefined();
      expect(typeof agent.model!.providerID).toBe("string");
      expect(typeof agent.model!.id).toBe("string");
    }
  });

  test("every agent carries V2 permissions (orchestrator 26 rules, plan-writer 8)", async () => {
    const repo = makeEmptyFixture({});
    const options = readKitOptions(repo);
    const harness = await setupPackedPlugin(options);

    for (const agent of harness.agents.values()) {
      expect(agent.permissions).toBeDefined();
      expect(agent.permissions!.length).toBeGreaterThan(0);
    }
    expect(harness.agents.get("orchestrator")!.permissions).toHaveLength(26);
    expect(harness.agents.get("plan-writer")!.permissions).toHaveLength(8);
  });

  test("the registered system prompts come from the packed assets", async () => {
    const repo = makeEmptyFixture({});
    const options = readKitOptions(repo);
    const harness = await setupPackedPlugin(options);

    const orchestrator = harness.agents.get("orchestrator")!;
    const source = readFileSync(
      join(ROOT, "agents", "orchestrator.md"),
      "utf-8",
    );
    expect(orchestrator.system).toBe(normalizeEol(source));
  });

  test("the empty fixture repo is left untouched (no .opencode copy fallback)", async () => {
    const repo = makeEmptyFixture({});
    const options = readKitOptions(repo);
    const before = snapshotTree(repo);
    await setupPackedPlugin(options);
    const after = snapshotTree(repo);
    expect(after).toEqual(before);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Existing fixture repo                                                    */
/* -------------------------------------------------------------------------- */

describe("plugin activation — existing fixture repo (user config wins)", () => {
  test("a user-defined agent colliding with a kit id is not overwritten", async () => {
    const repo = makeExistingFixture({});
    const options = readKitOptions(repo);
    const harness = await setupPackedPlugin(options);

    const orchestrator = harness.agents.get("orchestrator")!;
    expect(orchestrator.model).toEqual({
      providerID: "user",
      id: "custom-orchestrator",
    });
    expect(orchestrator.description).toBe("user-defined orchestrator");
  });

  test("the other kit agents still register and a user-only agent is untouched", async () => {
    const repo = makeExistingFixture({});
    const options = readKitOptions(repo);
    const harness = await setupPackedPlugin(options);

    expect(harness.registered).toHaveLength(14);
    expect(harness.registered).not.toContain("orchestrator");
    expect(harness.agents.has("my-reviewer")).toBe(true);
  });

  test("the existing fixture repo is byte-identical after setup (no writes at all)", async () => {
    const repo = makeExistingFixture({});
    const options = readKitOptions(repo);
    const before = snapshotTree(repo);
    await setupPackedPlugin(options);
    const after = snapshotTree(repo);
    expect(after).toEqual(before);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Degraded registry                                                        */
/* -------------------------------------------------------------------------- */

describe("plugin activation — degraded runtime registry", () => {
  test("an unavailable tier model warns with the kit prefix and is not fatal", async () => {
    const repo = makeEmptyFixture({});
    const options = readKitOptions(repo);
    const harness = await setupPackedPlugin(options, new Map(), []);

    expect(harness.warned.length).toBeGreaterThan(0);
    expect(harness.warned[0]).toContain("[opencode-orchestrator-kit]");
  });
});
