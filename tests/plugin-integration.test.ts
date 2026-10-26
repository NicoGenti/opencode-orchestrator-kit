import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import plugin from "../plugin/src/index.ts";
import { collectPackagedAgents } from "../plugin/src/agents.ts";
import { assetsDir, readAsset } from "../plugin/src/assets.ts";
import { TierConfigError, resolveTierMap } from "../plugin/src/tiers.ts";
import { runPlanBoard } from "../plugin/src/plan-board.ts";

/**
 * Plugin integration (Phase 6b): consumo del pacchetto `opencode-orchestrator-kit`
 * come farebbe un host OpenCode 2.
 *
 * Ogni scenario scrive una repo temp con un `opencode.json` contenente la
 * sezione `plugins`, legge le opzioni da quel file (come farebbe l'host),
 * esegue `plugin.setup` su un mock PluginContext nello stile delle suite
 * esistenti (tests/plugin-skeleton.test.ts, tests/plugin-agents.test.ts) e
 * asserisce verso i registri mock.
 *
 * Nota sulla repo temp: ospita SOLO la configurazione host — il plugin non
 * riceve mai il cwd della repo, quindi l'asserzione "no filesystem writes"
 * confronta l'elenco ricorsivo della repo prima e dopo il setup.
 *
 * Scenari:
 *  1. repo vuota, preset default: 15 agenti (senza extras), orchestrator unico
 *     primary, tutti i 5 tier risolti (nessun `{{TIER_*}}`/`placeholder/*`
 *     residuo), 3 comandi + 9 skill, esattamente un tool `plan_board` che
 *     esegue `check` su una board vuota ritornando JSON parseabile;
 *  2. repo esistente: un agente utente pre-configurato (explorer con modello
 *     custom) non viene sovrascritto, gli altri 14 si registrano e il plugin
 *     non scrive nulla nella repo (snapshot prima/dopo);
 *  3. sanity di pubblicazione: package.json exports/files coprono davvero
 *     runtime, tipi e asset (senza `npm pack` e senza network).
 */

const ROOT = join(import.meta.dir, "..");
const PLUGIN_DIR = join(ROOT, "plugin");

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

const REGISTRY_FULL = [
  { providerID: "opencode-go", id: "gpt-5.6-luna" },
  { providerID: "opencode-go", id: "kimi-k3" },
  { providerID: "opencode-go", id: "minimax-m3" },
  { providerID: "ollama", id: "deepseek-v4.1-flash:cloud" },
];

/** Default preset risolto: i 5 tier puntano a modelli concreti (fonte tiers.ts). */
const resolvedDefault = resolveTierMap();

interface Harness {
  get: (id: string) => Record<string, unknown> | undefined;
  touched: string[];
  commands: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
  warned: string[];
}

type Editor = {
  get(id: string): Record<string, unknown> | undefined;
  update(id: string, fn: (agent: Record<string, unknown>) => void): void;
  default(id: string): void;
  remove(id: string): void;
};

/**
 * Esegue `plugin.setup` con un editor agent seedato opzionale e cattura
 * registri + warning di console. `withPluginsOptions` sono le opzioni host.
 */
async function setupWith(options: Record<string, unknown>, seed?: Map<string, Record<string, unknown>>): Promise<Harness> {
  const agents = new Map<string, Record<string, unknown>>(seed ?? []);
  const touched: string[] = [];
  const commands: Array<Record<string, unknown>> = [];
  const skills: Array<Record<string, unknown>> = [];
  const tools: Array<Record<string, unknown>> = [];
  const editor: Editor = {
    get: (id) => agents.get(id),
    update(id, fn) {
      let agent = agents.get(id);
      const fresh = agent === undefined;
      if (!agent) agent = { id, name: id, mode: "primary" };
      fn(agent);
      agents.set(id, agent);
      if (fresh) touched.push(id);
    },
    default: () => {},
    remove: (id) => void agents.delete(id),
  };
  const recording = (slot: Array<Record<string, unknown>>) => ({
    transform: (cb: (e: { add(a: Record<string, unknown>): void }) => void) => {
      void cb({ add: (a) => void slot.push(a) });
    },
  });
  const ctx = {
    options,
    model: { list: async () => REGISTRY_FULL },
    agent: {
      transform: async (cb: (e: Editor) => Promise<void>) => {
        await cb(editor);
      },
    },
    command: recording(commands),
    skill: recording(skills),
    tool: recording(tools),
  } as never;

  const warned: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => void warned.push(args.map(String).join(" "));
  try {
    await plugin.setup(ctx);
  } finally {
    console.warn = original;
  }
  return {
    get: (id) => agents.get(id),
    touched,
    commands,
    skills,
    tools,
    warned,
  };
}

/** Repo temp con un `opencode.json` exhaustive in forma host-like. */
function makeTmpRepo(options: Record<string, unknown>): string {
  const repo = mkdtempSync(join("/tmp", "plugin-integration-"));
  writeFileSync(
    join(repo, "opencode.json"),
    JSON.stringify(
      { plugins: [{ package: "opencode-orchestrator-kit", options }] },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
  return repo;
}

/** Le opzioni dell'entry del kit estratte da opencode.json, come farebbe l'host. */
function readKitOptions(repo: string): Record<string, unknown> {
  const config = JSON.parse(readFileSync(join(repo, "opencode.json"), "utf-8"));
  const entry = config.plugins.find(
    (p: { package: string }) => p.package === "opencode-orchestrator-kit",
  );
  expect(entry).toBeDefined();
  return entry.options ?? {};
}

/** Snapshot ricorsivo dell'albero della repo (percorsi relativi ordinati). */
function snapshot(repo: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(repo, full).split(sep).join("/"));
    }
  };
  walk(repo);
  return out.sort();
}

describe("plugin integration — empty repo", () => {
  test("(1a) preset 'generic' fail-early con TierConfigError: nessuna registrazione", async () => {
    const repo = makeTmpRepo({ preset: "generic", withExtras: false });
    const options = readKitOptions(repo);
    let error: unknown;
    try {
      await setupWith(options);
    } catch (thrown) {
      error = thrown;
    }
    // actual behavior: il placeholder/* del preset generic e' rifiutato da
    // resolveTierMap (fail-early, runtime intatto) — vedi anche
    // tests/plugin-agents.test.ts "(g)".
    expect(error).toBeInstanceOf(TierConfigError);
    expect(String(error)).toContain("placeholder/");
    // nessun fallimento tardivo: tutte le scritture della repo restano l'opencode.json (creata dal test)
    expect(snapshot(repo)).toEqual(["opencode.json"]);
  });

  test("(1b) preset default: 15 agenti, orchestrator unico primary, tier risolti", async () => {
    const repo = makeTmpRepo({ withExtras: false });
    const options = readKitOptions(repo);
    const { get, touched, warned } = await setupWith(options);

    expect(warned).toEqual([]); // registry completo: nessun segnale di tier mancante

    // 15 agenti, nessun extra
    expect(touched).toHaveLength(15);
    expect([...touched].sort()).toEqual(AGENT_IDS);
    for (const extra of EXTRA_IDS) {
      expect(touched.includes(extra)).toBe(false);
    }

    // orchestrator e' l'unico primary
    const primaries = touched.filter((id) => get(id)?.mode === "primary");
    expect(primaries).toEqual(["orchestrator"]);

    // tutti i 5 tier della mappa default sono riferimenti concreti (non token},
    // non placeholder/*) e ogni agente registrato porta un ref di un tier reale.
    for (const token of Object.keys(resolvedDefault.models)) {
      const value = resolvedDefault.models[token];
      expect(value.startsWith("placeholder/")).toBe(false);
      expect(value.includes("{{")).toBe(false);
    }
    for (const id of touched) {
      const model = get(id)!["model"] as { providerID: string; id: string };
      expect(typeof model?.providerID).toBe("string");
      const ref = `${model.providerID}/${model.id}`;
      expect(ref).not.toContain("{{TIER_");
      expect(ref).not.toContain("placeholder/");
      // ref risolto = un modello reale del registry runtime
      expect(
        REGISTRY_FULL.some((m) => m.providerID === model.providerID && m.id === model.id),
      ).toBe(true);
    }
  });

  test("(1c) 3 comandi, 9 skill, esattamente un tool plan_board eseguibile", async () => {
    const repo = makeTmpRepo({});
    const board = join(repo, "plan");
    for (const col of ["draft", "in-progress", "qa", "complete"]) {
      mkdirSync(join(board, col), { recursive: true });
    }
    const { commands, skills, tools } = await setupWith(readKitOptions(repo));

    expect(commands.map((c) => String(c.name)).sort()).toEqual([
      "recall",
      "research-mode",
      "start-session",
    ]);
    expect(skills).toHaveLength(9);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("plan_board");
    const execute = tools[0].execute as (input: unknown) => string;
    const payload = JSON.parse(execute({ command: "check", root: board }));
    // coerente con runPlanBoard (stesso percorso di codice, stessa semantica ok)
    expect(payload).toEqual(runPlanBoard(["check", "--root", board, "--json"]).payload);
    expect(payload.ok).toBe(true);
    expect(payload.plans?.draft).toEqual([]);
  });
});

describe("plugin integration — existing repo (user config wins)", () => {
  test("(2) explorer pre-configurato intatto, 14 altri registrati, zero write", async () => {
    const repo = makeTmpRepo({ withExtras: false });
    const before = snapshot(repo);
    const userAgent = { id: "explorer", name: "explorer", mode: "subagent", model: "user/custom-model" };
    const seed = new Map<string, Record<string, unknown>>([
      ["explorer", { ...userAgent }],
    ]);

    const { touched } = await setupWith(readKitOptions(repo), seed);

    // l'agente utente resta esattamente com'era (update non chiamato per lui)
    expect(await Promise.resolve(seed.get("explorer"))).toEqual({ ...userAgent });

    // upsert solo gli altri 14
    expect(touched).toHaveLength(14);
    expect(touched).not.toContain("explorer");
    expect([...touched].sort()).toEqual(AGENT_IDS.filter((id) => id !== "explorer"));

    // nessun filesystem write nella repo
    expect(snapshot(repo)).toEqual(before);
  });
});

describe("plugin integration — publish sanity", () => {
  test("(3) package.json exports/files coprono runtime, tipi e asset packeteid", () => {
    const pkg = JSON.parse(readFileSync(join(PLUGIN_DIR, "package.json"), "utf-8"));
    // exports["."] punta a un file esistente (stringa diretta o mappa esport)
    const target = typeof pkg.exports["."] === "string" ? pkg.exports["."] : pkg.exports["."].import;
    expect(existsSync(join(PLUGIN_DIR, target))).toBe(true);
    // files copre le directory del runtime, tipii, asset — esistono tutte
    expect(pkg.files).toEqual(expect.arrayContaining(["src", "types", "assets"]));
    for (const dir of pkg.files) {
      expect(existsSync(join(PLUGIN_DIR, dir))).toBe(true);
    }
    // ogni asset referenziato da assets.ts esiste su disco: assetsDir risolta
    expect(existsSync(join(assetsDir, "commands", "start-session.md"))).toBe(true);
    // i 9 SKILL.md pacchettizzati + agents/extras/commands in assets
    const skillFiles = walkFiles(join(PLUGIN_DIR, "assets", "skills")).filter((f) => f.endsWith("SKILL.md"));
    expect(skillFiles).toHaveLength(9);
    expect(collectPackagedAgents(false).length).toBe(15);
    expect(collectPackagedAgents(true).length).toBe(17);
    expect(existsSync(join(PLUGIN_DIR, "assets", "agents", "orchestrator.md"))).toBe(true);
    expect(existsSync(join(PLUGIN_DIR, "assets", "extras", "writer.md"))).toBe(true);
    expect(existsSync(join(PLUGIN_DIR, "types", "opencode-plugin-shim.d.ts"))).toBe(true);
  });
});

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}
