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
 *  1. packaged artifact — the tarball is exactly the expected 42 files, the
 *     package declares zero runtime dependencies, `files`/`exports` cover
 *     everything registration needs, and the packed assets are the repo-root
 *     sources;
 *  2. empty fixture repo — 3 commands, 9 skills, 15 agents (17 with
 *     `withExtras: true`), 1 `plan_board` tool, orchestrator the only
 *     `primary`, per-agent models resolved from the bundled preset tiers,
 *     V2 permissions on every agent (orchestrator 25 rules, plan-writer 8);
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

/** Hard ceiling for the pack subprocess: a hung pack must never wedge CI. */
const PACK_TIMEOUT_MS = 120_000;

/** The kit agent ids shipped in plugin/assets/agents/ (15). */
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

/** The opt-in extras shipped in plugin/assets/extras/ (2). */
const EXTRA_IDS = ["pc-doctor", "writer"] as const;

/** The 9 kit skills, as ids derived from plugin/assets/skills/<id>/SKILL.md. */
const SKILL_IDS = [
  "build-debug",
  "comprehension-workflow",
  "dev-cleanup",
  "examples/angular-patterns",
  "examples/dotnet-conventions",
  "examples/python-conventions",
  "github-actions-cicd",
  "npm-debug",
  "structural-search",
] as const;

/** The 3 kit commands. */
const COMMAND_NAMES = ["start-session", "recall", "research-mode"] as const;

/**
 * The exact file surface of the published package (42 entries, relative to
 * the package root). Any drift is a packaging change that must be reviewed
 * explicitly — the plugin is self-contained and ships nothing else.
 */
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

/** The runtime model registry used by the mock ctx (covers every default tier). */
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
  /** Which packer produced the artifact. */
  strategy: "npm-pack" | "bun-pm-pack" | "programmatic-assembly";
  /** Temp root holding the tarball, the unpacked tree and the npm cache. */
  tmpDir: string;
  /** Absolute path of the produced tarball (null for the assembly fallback). */
  tarball: string | null;
  /** stdout/stderr of the pack subprocess, kept for diagnostics. */
  log: string;
}

/** Normalize CRLF to LF so comparisons are host-EOL independent. */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * The `npm` CLI to use on this host, or null when it is not available.
 * On Windows the shim is `npm.cmd`. Bun resolves a bare `npm` through
 * PATHEXT only when the child inherits the environment, so the pack always
 * runs with the DEFAULT environment and the offline settings travel as CLI
 * flags (never as an `env` override).
 */
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

/**
 * Pack the plugin package offline. Never contacts the registry: `--offline`
 * forbids it and the registry is pointed at an unreachable address so a
 * stray lookup fails loudly instead of leaving the machine.
 */
function packPluginPackage(): PackResult {
  const tmpDir = mkdtempSync(join(tmpdir(), "kit-plugin-pack-"));
  try {
    return packInto(tmpDir);
  } catch (error) {
    // Never leak a temp dir when the pack fails.
    rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

/** Produce the artifact inside `tmpDir` (see packPluginPackage). */
function packInto(tmpDir: string): PackResult {
  const destDir = join(tmpDir, "tarball");
  mkdirSync(destDir, { recursive: true });

  // 1. npm pack --offline (canonical npm artifact).
  const npm = npmCommand();
  if (npm !== null) {
    const result = spawnSync(
      npm,
      [
        "pack",
        "--offline",
        // Unreachable on purpose: a registry contact fails fast instead of
        // leaving the host. The pack must succeed without it.
        "--registry=http://127.0.0.1:1/",
        // Hermetic cache: the pack never reads or writes the user cache.
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

  // 2. bun pm pack (same runtime as the test runner, inherently offline).
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

  // 3. Programmatic assembly of the `files` entries (last-resort, still offline).
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

/** Recursively copy a file or directory. */
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

/** Read a NUL-terminated string field of a tar header. */
function tarString(bytes: Buffer): string {
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? bytes.length : end).toString("utf-8");
}

/**
 * Extract a gzipped tar archive into `destRoot`, preserving the archive's
 * internal `package/` prefix. Entries with an unsafe path are rejected: the
 * archive is untrusted input and must not escape the destination.
 */
function extractTarGz(tarball: string, destRoot: string): string[] {
  const archive = gunzipSync(readFileSync(tarball));
  const written: string[] = [];
  let offset = 0;
  let pendingName: string | null = null;

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      continue; // end-of-archive padding
    }
    const name = tarString(header.subarray(0, 100));
    const prefix = tarString(header.subarray(345, 500));
    const size = parseInt(tarString(header.subarray(124, 136)).trim(), 8) || 0;
    const type = String.fromCharCode(header[156]);
    const data = archive.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512;

    if (type === "L") {
      pendingName = data.toString("utf-8").replace(/\0.*/, ""); // GNU long name
      continue;
    }
    if (type === "x" || type === "g") {
      continue; // pax headers carry no payload for this package
    }
    if (type !== "0" && type !== "\0" && type !== "5") {
      continue; // symlinks and other special entries are not shipped
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

/** Root of the unpacked package (the `package/` folder of the tarball). */
const packageRoot = join(unpackDir, "package");

/** Every file of the unpacked package, relative to the package root, sorted. */
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

/** The package.json as it ships inside the artifact. */
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
  /** Packaged path relative to plugin/assets/ (e.g. "agents/orchestrator.md"). */
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
  /** Final state of the agent registry. */
  agents: Map<string, AgentRecord>;
  /** Ids the kit upserted (a pre-existing id is never upserted). */
  registered: string[];
  /** Times `editor.default(...)` was called (must stay 0). */
  defaultCalls: number;
  commands: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
  /** Console warnings emitted during the setup. */
  warned: string[];
  /** Prompts delivered through `ctx.session.prompt()`. */
  prompts: Array<Record<string, unknown>>;
  /** Agent switches requested through `ctx.session.switchAgent()`. */
  switched: Array<Record<string, unknown>>;
}

/**
 * Run the packed plugin's `setup(ctx)` against a mock V2 context.
 * `seed` holds the agents the host already knows about (user config).
 */
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
  /** Prompts delivered through `ctx.session.prompt()`. */
  const prompts: Array<Record<string, unknown>> = [];
  /** Agent switches requested through `ctx.session.switchAgent()`. */
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
        // The V2 upsert seeds a fresh agent with mode "primary" — the plugin
        // must set the mode explicitly on every update.
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
    // OpenCode 2.2: a command's `execute` delivers its prompt through the
    // session client instead of returning the markdown body.
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

/** A temp directory removed in `afterAll`. */
function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** The `plugins` entry a user writes in `opencode.json`. */
function pluginEntry(options: Record<string, unknown>): Record<string, unknown> {
  return { package: "opencode-orchestrator-kit", options };
}

/** Read the kit options back from `opencode.json`, like the host does. */
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

/**
 * The empty fixture: a repo that only declares the plugin. This is the
 * Phase 6 acceptance scenario — add the plugin, run /start-session, no
 * install.sh.
 */
function makeEmptyFixture(options: Record<string, unknown> = {}): string {
  const repo = makeTempDir("kit-plugin-empty-");
  writeFileSync(
    join(repo, "opencode.json"),
    `${JSON.stringify({ plugins: [pluginEntry(options)] }, null, 2)}\n`,
    "utf-8",
  );
  return repo;
}

/**
 * The existing fixture: a repo that already has a user configuration, with
 * one user agent colliding with a kit agent id and one kit-unrelated agent.
 */
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

/** Content snapshot of a directory tree: relative path -> sha256. */
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
    // The packer is probed (npm → bun → programmatic); the strategy is
    // asserted so the run is reproducible and never silently networked.
    expect(["npm-pack", "bun-pm-pack", "programmatic-assembly"]).toContain(
      pack.strategy,
    );
    if (pack.strategy === "npm-pack") {
      // `--offline` plus an unreachable registry: a registry contact would
      // have failed the pack instead of reaching the network.
      expect(pack.log).toContain("opencode-orchestrator-kit-");
    }
    expect(packageFiles()).toEqual([...EXPECTED_PACKAGE_FILES].sort());
    expect(packageFiles()).toHaveLength(42);
    if (extractedFiles !== null) {
      expect(extractedFiles).toEqual([...EXPECTED_PACKAGE_FILES].sort());
    }
  });

  test("the plugin under test is the one shipped inside the artifact", () => {
    expect(packedPlugin.id).toBe("opencode-orchestrator-kit");
    expect(typeof packedPlugin.setup).toBe("function");
    // Provenance: the module was imported from the UNPACKED tree, so the
    // assets it resolves at runtime are the packed ones — never the repo
    // sources under plugin/assets/.
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
    // The modules the plugin imports at runtime, as shipped.
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
      // EOL-normalized: the repository content is the contract, the working
      // tree's CRLF/LF is a host artifact (core.autocrlf), not a difference.
      expect(normalizeEol(shipped)).toBe(normalizeEol(original));
    }
  });

  test("the unpacked package ships no node_modules and no tooling files", () => {
    const files = packageFiles();
    expect(files.some((file) => file.includes("node_modules"))).toBe(false);
    expect(files.some((file) => file.startsWith("test/"))).toBe(false);
    expect(files.some((file) => file.includes(".git"))).toBe(false);
    expect(files.some((file) => file.endsWith(".log"))).toBe(false);
    expect(files.every((file) => !file.includes("\\"))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Empty fixture repo                                                       */
/* -------------------------------------------------------------------------- */

describe("plugin activation — empty fixture repo", () => {
  test("the packed plugin registers 3 commands, 9 skills and 1 plan_board tool", async () => {
    const repo = makeEmptyFixture({ withExtras: false });
    const options = readKitOptions(repo);
    const harness = await setupPackedPlugin(options);

    // Commands — the bodies come from the PACKED assets.
    expect(harness.commands.map((c) => String(c.name)).sort()).toEqual([
      "recall",
      "research-mode",
      "start-session",
    ]);
    for (const command of harness.commands) {
      // OpenCode 2.2: the command entry carries NO `agent` field anymore.
      // The agent is applied at execute time through `ctx.session.switchAgent`.
      expect(command.agent).toBeUndefined();
      const shipped = readFileSync(
        join(packageRoot, "assets", "commands", `${String(command.name)}.md`),
        "utf-8",
      );
      const body = shipped.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim();
      const execute = command.execute as (input: unknown) => Promise<void>;
      const returned = execute({
        sessionID: "ses_fixture",
        prompt: { text: "ignored" },
        delivery: "queue",
      });
      // The host chains `.then()` on the returned value: it MUST be a promise.
      expect(typeof (returned as { then?: unknown } | undefined)?.then).toBe(
        "function",
      );
      await returned;
      // The markdown body is DELIVERED to the session, not returned.
      expect(harness.prompts.at(-1)?.text).toBe(body);
      expect(harness.prompts.at(-1)?.sessionID).toBe("ses_fixture");
      expect(harness.prompts.at(-1)?.delivery).toBe("queue");
      expect(harness.switched.at(-1)).toEqual({
        sessionID: "ses_fixture",
        agent: "orchestrator",
      });
    }

    // Skills — every path points inside the UNPACKED tree, not the repo.
    expect(harness.skills).toHaveLength(9);
    expect(harness.skills.map((s) => String(s.id)).sort()).toEqual(
      [...SKILL_IDS].sort(),
    );
    for (const skill of harness.skills) {
      const path = String(skill.path);
      expect(resolve(path).startsWith(resolve(packageRoot))).toBe(true);
      expect(existsSync(path)).toBe(true);
      expect(skill.content).toBe(readFileSync(path, "utf-8"));
    }

    // Tool — exactly one, executable against a real board.
    expect(harness.tools).toHaveLength(1);
    expect(harness.tools[0].name).toBe("plan_board");
    const board = makeTempDir("kit-plugin-board-");
    for (const column of ["draft", "in-progress", "qa", "complete"]) {
      mkdirSync(join(board, column), { recursive: true });
    }
    const execute = harness.tools[0].execute as (input: unknown) => string;
    const payload = JSON.parse(execute({ command: "check", root: board })) as {
      ok: boolean;
      action: string;
    };
    expect(payload.ok).toBe(true);
    expect(payload.action).toBe("check");
  });

  test("the packed plugin registers the 15 kit agents, 17 with withExtras", async () => {
    const defaultRepo = makeEmptyFixture({ withExtras: false });
    const defaults = await setupPackedPlugin(readKitOptions(defaultRepo));
    expect(defaults.registered).toHaveLength(15);
    expect([...defaults.registered].sort()).toEqual([...AGENT_IDS].sort());
    expect(defaults.registered).not.toContain("pc-doctor");
    expect(defaults.registered).not.toContain("writer");

    const extrasRepo = makeEmptyFixture({ withExtras: true });
    const extras = await setupPackedPlugin(readKitOptions(extrasRepo));
    expect(extras.registered).toHaveLength(17);
    expect([...extras.registered].sort()).toEqual(
      [...AGENT_IDS, ...EXTRA_IDS].sort(),
    );
  });

  test("orchestrator is the only primary agent", async () => {
    const repo = makeEmptyFixture({ withExtras: true });
    const harness = await setupPackedPlugin(readKitOptions(repo));

    const primaries = harness.registered.filter(
      (id) => harness.agents.get(id)?.mode === "primary",
    );
    expect(primaries).toEqual(["orchestrator"]);
    for (const id of harness.registered) {
      if (id !== "orchestrator") {
        expect(harness.agents.get(id)?.mode).toBe("subagent");
      }
    }
    // The kit never hijacks the user's startup agent.
    expect(harness.defaultCalls).toBe(0);
  });

  test("every agent gets a concrete model resolved from the bundled preset tiers", async () => {
    const repo = makeEmptyFixture({ withExtras: true });
    const options = readKitOptions(repo);
    const harness = await setupPackedPlugin(options);

    const tierMap = resolveTierMap(
      typeof options.preset === "string" ? options.preset : undefined,
    );
    expect(tierMap.preset).toBe("default");
    const packaged = collectPackagedAgents(true);
    expect(packaged).toHaveLength(17);

    for (const agent of packaged) {
      const registered = harness.agents.get(agent.id);
      expect(registered).toBeDefined();
      const token = /^\{\{(TIER_[A-Z_]+)\}\}$/.exec(agent.model)?.[1];
      expect(token).toBeDefined();
      const value = tierMap.models[token!];
      expect(value).toBeDefined();
      expect(value).not.toContain("{{");
      expect(value).not.toContain("placeholder/");
      const [providerID, ...rest] = value.split("/");
      expect(registered!.model).toEqual({ providerID, id: rest.join("/") });
    }

    // Spot-checks on the documented tier mapping.
    expect(harness.agents.get("orchestrator")?.model).toEqual({
      providerID: "opencode-go",
      id: "gpt-5.6-luna",
    });
    expect(harness.agents.get("plan-writer")?.model).toEqual({
      providerID: "opencode-go",
      id: "kimi-k3",
    });
    expect(harness.agents.get("developer-fixer")?.model).toEqual({
      providerID: "opencode-go",
      id: "minimax-m3",
    });
    expect(harness.agents.get("code-reviewer")?.model).toEqual({
      providerID: "opencode-go",
      id: "minimax-m3",
    });
    expect(harness.agents.get("explorer")?.model).toEqual({
      providerID: "ollama",
      id: "deepseek-v4.1-flash:cloud",
    });
  });

  test("every agent carries V2 permissions (orchestrator 25 rules, plan-writer 8)", async () => {
    const repo = makeEmptyFixture({ withExtras: true });
    const harness = await setupPackedPlugin(readKitOptions(repo));

    for (const id of harness.registered) {
      const rules = harness.agents.get(id)?.permissions;
      expect(Array.isArray(rules)).toBe(true);
      expect(rules!.length).toBeGreaterThan(0);
      for (const rule of rules!) {
        expect(["allow", "ask", "deny"]).toContain(rule.effect);
      }
    }

    const orchestrator = harness.agents.get("orchestrator")!.permissions!;
    expect(orchestrator).toHaveLength(25);
    expect(orchestrator[orchestrator.length - 1]).toEqual({
      action: "edit",
      resource: "plan/*.md",
      effect: "deny",
    });
    expect(resolveEffect(orchestrator, "edit", "src/app.ts")).toBe("deny");
    expect(resolveEffect(orchestrator, "edit", ".context/progress.md")).toBe(
      "allow",
    );

    const planWriter = harness.agents.get("plan-writer")!.permissions!;
    expect(planWriter).toHaveLength(8);
    expect(resolveEffect(planWriter, "edit", "plan/qa/13-example.md")).toBe(
      "allow",
    );
    expect(resolveEffect(planWriter, "edit", "src/app.ts")).toBe("deny");

    // Only the board owner may edit the board root.
    for (const id of harness.registered) {
      const effect = resolveEffect(
        harness.agents.get(id)!.permissions!,
        "edit",
        "plan/qa/13-example.md",
      );
      expect(`${id}=${effect}`).toBe(
        id === "plan-writer" ? "plan-writer=allow" : `${id}=deny`,
      );
    }
  });

  test("the registered system prompts come from the packed assets", async () => {
    const repo = makeEmptyFixture({ withExtras: true });
    const harness = await setupPackedPlugin(readKitOptions(repo));

    for (const agent of collectPackagedAgents(true)) {
      const registered = harness.agents.get(agent.id);
      expect(registered).toBeDefined();
      const shipped = readFileSync(
        join(packageRoot, "assets", ...agent.assetRel.split("/")),
        "utf-8",
      );
      const body = shipped.replace(/^---\r?\n[\s\S]*?\r?\n---/, "").trim();
      expect(registered!.system).toBe(body);
      expect(String(registered!.system)).not.toContain("{{TIER_");
    }
  });

  test("the empty fixture repo is left untouched (no .opencode/ copy fallback)", async () => {
    const repo = makeEmptyFixture({ withExtras: false });
    const before = snapshotTree(repo);
    await setupPackedPlugin(readKitOptions(repo));
    const after = snapshotTree(repo);

    expect([...after.keys()]).toEqual([...before.keys()]);
    expect(after).toEqual(before);
    // The V1-style copy fallback must never trigger on a successful registration.
    expect(existsSync(join(repo, ".opencode"))).toBe(false);
    expect(existsSync(join(repo, ".opencode", "agents"))).toBe(false);
    expect(existsSync(join(repo, "agents"))).toBe(false);
    expect(existsSync(join(repo, "skills"))).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Existing fixture repo — user config wins                                 */
/* -------------------------------------------------------------------------- */

describe("plugin activation — existing fixture repo (user config wins)", () => {
  test("a user-defined agent colliding with a kit id is not overwritten", async () => {
    const repo = makeExistingFixture({ withExtras: false });
    const userAgent: AgentRecord = {
      id: "orchestrator",
      name: "orchestrator",
      mode: "primary",
      description: "user-defined orchestrator",
      model: { providerID: "user", id: "custom-orchestrator" },
    };
    const seed = new Map<string, AgentRecord>([["orchestrator", userAgent]]);

    const harness = await setupPackedPlugin(readKitOptions(repo), seed);

    // The kit skipped it entirely (the `editor.get(id)` guard).
    expect(harness.registered).not.toContain("orchestrator");
    expect(harness.registered).toHaveLength(14);
    // The user configuration is intact, field by field.
    expect(harness.agents.get("orchestrator")).toEqual(userAgent);
  });

  test("the other kit agents still register and a user-only agent is untouched", async () => {
    const repo = makeExistingFixture({ withExtras: false });
    const seed = new Map<string, AgentRecord>([
      [
        "orchestrator",
        { id: "orchestrator", name: "orchestrator", mode: "primary" },
      ],
      [
        "my-reviewer",
        { id: "my-reviewer", name: "my-reviewer", mode: "subagent" },
      ],
    ]);

    const harness = await setupPackedPlugin(readKitOptions(repo), seed);

    expect([...harness.registered].sort()).toEqual(
      AGENT_IDS.filter((id) => id !== "orchestrator").sort(),
    );
    expect(harness.registered).not.toContain("my-reviewer");
    // The user-only agent is still exactly as the host loaded it.
    expect(harness.agents.get("my-reviewer")).toEqual({
      id: "my-reviewer",
      name: "my-reviewer",
      mode: "subagent",
    });
  });

  test("the existing fixture repo is byte-identical after setup (no writes at all)", async () => {
    const repo = makeExistingFixture({ withExtras: false });
    const before = snapshotTree(repo);
    await setupPackedPlugin(readKitOptions(repo), new Map());
    const after = snapshotTree(repo);

    expect([...after.keys()].sort()).toEqual([
      ".context/progress.md",
      ".opencode/agents/my-reviewer.md",
      "opencode.json",
    ]);
    expect(after).toEqual(before);
    // No kit agent was copied into the user's .opencode/agents/.
    expect(readdirSync(join(repo, ".opencode", "agents"))).toEqual([
      "my-reviewer.md",
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Degraded runtime registry                                                */
/* -------------------------------------------------------------------------- */

describe("plugin activation — degraded runtime registry", () => {
  test("an unavailable tier model warns with the kit prefix and is not fatal", async () => {
    const repo = makeEmptyFixture({ withExtras: false });
    // The ollama provider is absent → TIER_FAST is unavailable.
    const harness = await setupPackedPlugin(
      readKitOptions(repo),
      new Map(),
      REGISTRY_FULL.filter((entry) => entry.providerID !== "ollama"),
    );

    expect(harness.registered).toHaveLength(15);
    const fastWarnings = harness.warned.filter((message) =>
      message.includes("TIER_FAST"),
    );
    expect(fastWarnings).toHaveLength(1);
    expect(fastWarnings[0]).toContain("[opencode-orchestrator-kit]");
    expect(fastWarnings[0]).toContain("ollama/deepseek-v4.1-flash:cloud");
    // Every warning carries the kit prefix — the console is never polluted
    // by unprefixed noise.
    for (const message of harness.warned) {
      expect(message.startsWith("[opencode-orchestrator-kit]")).toBe(true);
    }
  });
});
