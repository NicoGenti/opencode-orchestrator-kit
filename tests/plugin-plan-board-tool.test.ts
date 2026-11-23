import { afterAll, describe, expect, test } from "bun:test";
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

import { decode } from "@toon-format/toon";

import plugin from "../plugin/src/index.ts";
import { runPlanBoard } from "../plugin/src/plan-board.ts";
import {
  DEFAULT_TOON_CONFIG,
  loadToonConfig,
} from "../plugin/src/toon-config.ts";

/**
 * Tool nativo `plan_board` (registrato via ctx.tool.transform).
 *
 * Suite scritta PRIMA dell'implementazione (TDD, passo 1): pinna il contratto
 * osservabile del tool — esattamente un tool `plan_board`, schema input allineato
 * alla CLI di plan-board, execute che ritorna una Promise risolta a una STRING
 * JSON (il host fa `execute(input).then(...)`), comportamento
 * check/move/new/adopt su board usa-e-getta identico a plugin/src/plan-board.ts.
 *
 * Nessun caso tocca la board reale del repo: root e' sempre un path assoluto
 * temporaneo, per nulla dipendente dalla cwd del processo.
 */

const COLUMNS = ["draft", "in-progress", "qa", "complete"] as const;

/** Radice del repo kit (per i pin sui due manifest). */
const REPO_ROOT = join(import.meta.dir, "..");

/** Data di calendario LOCALE (non `toISOString()` che e' UTC). */
const TODAY = (() => {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
})();

const FULL_REGISTRY = [
  { providerID: "opencode-go", id: "gpt-5.6-luna" },
  { providerID: "opencode-go", id: "kimi-k3" },
  { providerID: "opencode-go", id: "minimax-m3" },
  { providerID: "ollama", id: "deepseek-v4.1-flash:cloud" },
];

const tools: Array<Record<string, unknown>> = [];
const commands: Array<Record<string, unknown>> = [];
const skills: Array<Record<string, unknown>> = [];

/** Editor agenti minimale: non registra nulla; qui si guarda solo il tool. */
function noopAgentEditor() {
  const agents = new Map<string, Record<string, unknown>>();
  return {
    list: () => [...agents.keys()],
    get: (id: string) => agents.get(id),
    default: (id: string) => void agents.set(id, { id, mode: "primary" }),
    update: (id: string, fn: (agent: Record<string, unknown>) => void) => {
      const agent = agents.get(id) ?? { id, name: id, mode: "primary" };
      fn(agent);
      agents.set(id, agent);
    },
    remove: (id: string) => void agents.delete(id),
  };
}

const warned: string[] = [];
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  warned.push(args.map(String).join(" "));
};

// Setup una sola volta contro un mock ctx che registra il tool in `tools`.
let setupPromise: unknown;
try {
  setupPromise = plugin.setup({
    options: {},
    model: {
      list: async () => [
        { providerID: "opencode-go", id: "gpt-5.6-luna" },
        { providerID: "opencode-go", id: "kimi-k3" },
        { providerID: "opencode-go", id: "minimax-m3" },
        { providerID: "ollama", id: "deepseek-v4.1-flash:cloud" },
      ],
    },
    agent: {
      transform: async (
        callback: (
          editor: ReturnType<typeof noopAgentEditor>,
        ) => void | Promise<void>,
      ) => {
        await callback(noopAgentEditor());
      },
    },
    command: {
      transform: (
        callback: (editor: {
          add: (entry: Record<string, unknown>) => void;
        }) => void,
      ) => {
        void callback({
          add: (entry: Record<string, unknown>) => {
            commands.push(entry);
          },
        });
      },
    },
    skill: {
      transform: (
        callback: (editor: {
          add: (entry: Record<string, unknown>) => void;
        }) => void,
      ) => {
        void callback({
          add: (entry: Record<string, unknown>) => {
            skills.push(entry);
          },
        });
      },
    },
    tool: {
      transform: (
        callback: (editor: {
          add: (entry: Record<string, unknown>) => void;
        }) => void,
      ) => {
        void callback({
          add: (entry: Record<string, unknown>) => {
            tools.push(entry);
          },
        });
      },
    },
  } as never);
} finally {
  console.warn = originalWarn;
}
await setupPromise;

type ToolInput = Record<string, unknown>;

/** Guida il tool attraverso execute() ed estrae il payload JSON dai content parts. */
async function runTool(input: ToolInput): Promise<any> {
  const execute = tools[0].execute as (
    input: ToolInput,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
  const result = await execute(input);
  expect(Array.isArray(result.content)).toBe(true);
  return JSON.parse(result.content.map((part) => part.text).join(""));
}

/** Testo grezzo del risultato (nessuna assunzione JSON: il branch TOON non lo e'). */
async function runToolText(input: ToolInput): Promise<string> {
  const execute = tools[0].execute as (
    input: ToolInput,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;
  const result = await execute(input);
  expect(Array.isArray(result.content)).toBe(true);
  return result.content.map((part) => part.text).join("");
}

const boards: string[] = [];
let bodyCount = 0;

/** Crea una board usa-e-getta con le quattro colonne, assoluta e temporanea. */
function makeBoard(): string {
  const root = mkdtempSync(join(tmpdir(), "pb-tool-"));
  for (const col of COLUMNS) mkdirSync(join(root, col), { recursive: true });
  boards.push(root);
  return root;
}

/** Un piano conforme minimo gia' presente in una colonna (senza comprehension). */
function seedPlan(root: string, column: string, stem: string): string {
  const p = join(root, column, `${stem}.md`);
  writeFileSync(
    p,
    `---\nid: ${stem}\ntitle: ${stem}\nstatus: ${column}\ncreated: 2026-01-01\nupdated: 2026-01-01\n` +
      `owner: plan-writer\nexecutor: developer-fixer\n---\n\n## Goal\n\nseed\n`,
    "utf-8",
  );
  return p;
}

/** Body a nove sezioni valido, scritto FUORI dalla board (come il flag --body). */
function writeBody(text: string): string {
  bodyCount += 1;
  const p = join(tmpdir(), `pb-tool-body-${process.pid}-${bodyCount}.md`);
  writeFileSync(p, text, "utf-8");
  return p;
}

/**
 * Scrive `.opencode/toon.config.json` sotto la board temporanea. Il file muore
 * con la board in `afterAll`, quindi nessun test tocca la config reale.
 */
function writeToonConfig(root: string, value: unknown): void {
  const dir = join(root, ".opencode");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "toon.config.json"), JSON.stringify(value), "utf-8");
}

/** Esegue `fn` con la cwd sul progetto indicato, poi la ripristina. */
async function inProject<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await fn();
  } finally {
    process.chdir(previous);
  }
}

const BODY_OK = [
  "# Probe",
  "",
  "## Goal",
  "",
  "Esercitare il tool nativo della board.",
  "",
  "## Success Criteria",
  "",
  "- il tool risponde in JSON",
  "",
  "## Scope",
  "",
  "- In: plan/",
  "- Out: sorgenti applicative",
  "",
  "## Safety",
  "",
  "- nessuna cancellazione",
  "",
  "## Inputs Available",
  "",
  "- nessuno",
  "",
  "## Outputs Required",
  "",
  "- un file di piano conforme",
  "",
  "## Test Plan",
  "",
  "- bun test tests/plugin-plan-board-tool.test.ts",
  "",
  "## Verification",
  "",
  "- exit 0",
  "",
  "## Notes / Edge Cases",
  "",
  "- solo board temporanee",
  "",
].join("\n");

afterAll(() => {
  for (const b of boards) rmSync(b, { recursive: true, force: true });
});

describe("registrazione del tool nativo plan_board", () => {
  test("esattamente un tool, nominato plan_board", () => {
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("plan_board");
  });

  test("(h) il tool e' esposto fuori da Code Mode (options.codemode === false)", () => {
    expect(tools).toHaveLength(1);
    expect(tools[0].options).toEqual({ codemode: false });
  });

  test("description documenta l'autorizzazione standing e i codici di uscita (0 ok, 1 bloccante)", () => {
    const description = tools[0].description as string;
    expect(typeof description).toBe("string");
    expect((description as string).length).toBeGreaterThan(0);
    for (const needle of [
      "plan-board-standing-v1",
      "Mutation Summary",
      "check",
      "move",
      "new",
      "adopt",
      "0",
      "1",
    ]) {
      expect(description).toContain(needle);
    }
  });

  test("(i) la description del tool non contiene il refuso '***' e nomina check", () => {
    const description = String(tools[0].description ?? "");
    expect(description).not.toContain("***");
    expect(description).toContain("`check`");
  });

  test("input schema: enum allineate a comandi, colonne e comprehension", () => {
    const input = tools[0].input as Record<string, any>;
    expect(input.type).toBe("object");
    expect(input.required).toContain("command");
    expect(input.properties.command.enum).toEqual([
      "check",
      "move",
      "new",
      "adopt",
    ]);
    expect(input.properties.to.enum).toEqual([...COLUMNS]);
    expect(input.properties.comprehension.enum).toEqual([
      "none",
      "pass",
      "skipped",
      "needs_review",
      "fail",
      "disabled",
      "n/a",
    ]);
    expect(input.properties.column.enum).toEqual([...COLUMNS]);
    expect(input.properties.root.type).toBe("string");
    expect(input.properties.dryRun.type).toBe("boolean");
  });

  test("#205 lo schema dichiara `outcome` come stringa opzionale con descrizione", () => {
    const input = tools[0].input as Record<string, any>;
    expect(input.properties.outcome).toBeDefined();
    expect(input.properties.outcome.type).toBe("string");
    expect(typeof input.properties.outcome.description).toBe("string");
    expect(input.properties.outcome.description.length).toBeGreaterThan(0);
    expect(input.properties.outcome.description).toContain("outcome");
    // `outcome` e' opzionale: non entra fra le chiavi required.
    expect(input.required).toEqual(["command"]);
  });

  test("(j) execute ritorna una Promise: il host chiama `.then` sul valore", async () => {
    const returned = (tools[0].execute as (input: ToolInput) => unknown)({});
    expect(typeof (returned as { then?: unknown }).then).toBe("function");
    await returned;
  });

  test("execute risolve a { content: [{ type: 'text', text }] } con il payload JSON", async () => {
    expect(typeof tools[0].execute).toBe("function");
    const execute = tools[0].execute as (
      input: ToolInput,
    ) => Promise<{ content: Array<{ type: string; text: string }> }>;
    // root esplicito: il formato non dipende dalla config utente del repo.
    const result = await execute({ root: makeBoard() });
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text).ok).toBe(false);
  });
});

describe("comportamento del tool — contratto check", () => {
  test("vuota con le quattro colonne: ok, zero errori, zero warning e tutte le colonne in plans", async () => {
    const root = makeBoard();
    const json = await runTool({ command: "check", root });
    expect(json.ok).toBe(true);
    expect(json.errors).toEqual([]);
    expect(json.warnings).toEqual([]);
    expect(Object.keys(json.plans).sort()).toEqual([...COLUMNS].sort());
  });
});

describe("comportamento del tool — contratto move", () => {
  test("draft -> in-progress: verified, file spostato, status e updated riscritti", async () => {
    const root = makeBoard();
    seedPlan(root, "draft", "9101-demo");
    const json = await runTool({
      command: "move",
      id: "9101-demo",
      to: "in-progress",
      root,
    });
    expect(json.ok).toBe(true);
    expect(json.verified).toBe(true);
    expect(json.action).toBe("move");
    expect(existsSync(join(root, "in-progress", "9101-demo.md"))).toBe(true);
    expect(existsSync(join(root, "draft", "9101-demo.md"))).toBe(false);
    const text = readFileSync(
      join(root, "in-progress", "9101-demo.md"),
      "utf-8",
    );
    expect(text).toContain("status: in-progress");
    expect(text).toContain(`updated: ${TODAY}`);
  });

  test("id inesistente: plan-not-found", async () => {
    const root = makeBoard();
    const json = await runTool({
      command: "move",
      id: "does-not-exist",
      to: "qa",
      root,
    });
    expect(json.ok).toBe(false);
    expect(json.code).toBe("plan-not-found");
  });

  test("verso complete senza comprehension: comprehension-unrecorded, nessuno spostamento", async () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9102-comp");
    const json = await runTool({
      command: "move",
      id: "9102-comp",
      to: "complete",
      root,
    });
    expect(json.ok).toBe(false);
    expect(json.code).toBe("comprehension-unrecorded");
    expect(existsSync(join(root, "qa", "9102-comp.md"))).toBe(true);
    expect(existsSync(join(root, "complete", "9102-comp.md"))).toBe(false);
  });

  test("dryRun: true — ok senza alcuno spostamento", async () => {
    const root = makeBoard();
    seedPlan(root, "draft", "9103-dry");
    const json = await runTool({
      command: "move",
      id: "9103-dry",
      to: "in-progress",
      root,
      dryRun: true,
    });
    expect(json.ok).toBe(true);
    expect(json.dry_run).toBe(true);
    expect(existsSync(join(root, "draft", "9103-dry.md"))).toBe(true);
    expect(existsSync(join(root, "in-progress", "9103-dry.md"))).toBe(false);
  });

  // ── #205 P2: la chiave `outcome` (lesson outcome) ───────────────────────────

  test("#205 verso complete con comprehension e outcome: scrive la chiave e la riporta nel payload", async () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9104-outcome");
    const json = await runTool({
      command: "move",
      id: "9104-outcome",
      to: "complete",
      comprehension: "pass",
      outcome: "lesson: pin the file before the refactor",
      root,
    });
    expect(json.ok).toBe(true);
    expect(json.verified).toBe(true);
    expect(json.outcome).toBe("lesson: pin the file before the refactor");
    const dst = join(root, "complete", "9104-outcome.md");
    expect(existsSync(dst)).toBe(true);
    const text = readFileSync(dst, "utf-8");
    expect(text).toContain("outcome: lesson: pin the file before the refactor");
    // la chiave `outcome` sta dopo `executor` e prima delle chiavi sconosciute
    const lines = text
      .split("\n")
      .filter((l) => l.trim() !== "" && l !== "---");
    const iExecutor = lines.findIndex((l) => l.startsWith("executor:"));
    const iOutcome = lines.findIndex((l) => l.startsWith("outcome:"));
    const iComprehension = lines.findIndex((l) =>
      l.startsWith("comprehension:"),
    );
    expect(iExecutor).toBeGreaterThan(-1);
    expect(iOutcome).toBeGreaterThan(iExecutor);
    expect(iComprehension).toBeGreaterThan(iOutcome);
  });

  test("#205 verso complete con outcome ma SENZA comprehension: rifiuta e non scrive", async () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9105-refused");
    const json = await runTool({
      command: "move",
      id: "9105-refused",
      to: "complete",
      outcome: "lesson: never written",
      root,
    });
    expect(json.ok).toBe(false);
    expect(json.code).toBe("comprehension-unrecorded");
    expect(existsSync(join(root, "qa", "9105-refused.md"))).toBe(true);
    expect(existsSync(join(root, "complete", "9105-refused.md"))).toBe(false);
    const text = readFileSync(join(root, "qa", "9105-refused.md"), "utf-8");
    expect(text).not.toContain("outcome:");
  });

  test("#205 un outcome non-stringa non viene emesso come flag: la chiave resta assente", async () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9106-nonstring");
    const json = await runTool({
      command: "move",
      id: "9106-nonstring",
      to: "complete",
      comprehension: "pass",
      outcome: 42,
      root,
    });
    expect(json.ok).toBe(true);
    // un valore non-stringa non e' un flag: non viene serializzato
    expect(json.outcome).toBeNull();
    const text = readFileSync(
      join(root, "complete", "9106-nonstring.md"),
      "utf-8",
    );
    expect(text).not.toContain("outcome:");
  });

  test("#205 outcome su una move che NON atterra su complete: non scritto", async () => {
    const root = makeBoard();
    seedPlan(root, "in-progress", "9107-drop");
    const json = await runTool({
      command: "move",
      id: "9107-drop",
      to: "qa",
      outcome: "lesson: dropped",
      root,
    });
    expect(json.ok).toBe(true);
    expect(json.verified).toBe(true);
    expect("outcome" in json).toBe(false);
    const text = readFileSync(join(root, "qa", "9107-drop.md"), "utf-8");
    expect(text).not.toContain("outcome:");
  });
});

describe("comportamento del tool — contratto new", () => {
  test("crea il piano in draft dal body a nove sezioni (verified: true)", async () => {
    const root = makeBoard();
    const json = await runTool({
      command: "new",
      id: "9201-tool",
      title: "Tool",
      owner: "plan-writer",
      executor: "developer-fixer",
      body: writeBody(BODY_OK),
      root,
    });
    expect(json.ok).toBe(true);
    expect(json.verified).toBe(true);
    expect(existsSync(join(root, "draft", "9201-tool.md"))).toBe(true);
  });
});

describe("comportamento del tool — contratto adopt", () => {
  test("file legacy: ok con il warning derived-frontmatter", async () => {
    const root = makeBoard();
    writeFileSync(
      join(root, "draft", "0009-adopt.md"),
      "# Nuovo titolo\n\nCorpo legacy.\n",
      "utf-8",
    );
    const json = await runTool({
      command: "adopt",
      file: "0009-adopt",
      owner: "plan-writer",
      executor: "developer-fixer",
      root,
    });
    expect(json.ok).toBe(true);
    expect(json.warnings.map((w: any) => w.code)).toContain(
      "derived-frontmatter",
    );
  });
});

describe("comportamento del tool — argomenti invalidi", () => {
  test("senza command: missing-argument", async () => {
    const root = makeBoard();
    const json = await runTool({ root });
    expect(json.ok).toBe(false);
    expect(json.code).toBe("missing-argument");
  });

  test("command sconosciuto: bad-argument", async () => {
    const root = makeBoard();
    const json = await runTool({ command: "frobnicate", root });
    expect(json.ok).toBe(false);
    expect(json.code).toBe("bad-argument");
  });
});

describe("degrado silenzioso della registrazione", () => {
  test("un secondo setup senza ctx.tool si risolve senza warning", async () => {
    const warnings: string[] = [];
    const capturedWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      await plugin.setup({
        options: {},
        model: { list: async () => FULL_REGISTRY },
        agent: {
          transform: async (callback: (editor: unknown) => Promise<void>) => {
            await callback(noopAgentEditor());
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
        // NB: nessuna chiave `tool` — la registrazione si degrada in silenzio.
      } as never);
    } finally {
      console.warn = capturedWarn;
    }
    expect(warnings).toHaveLength(0);
  });
});

describe("#208 loadToonConfig — default e fallback", () => {
  test("file assente: defaults, zero warning", () => {
    const root = makeBoard();
    const result = loadToonConfig(root);
    expect(result.config).toEqual(DEFAULT_TOON_CONFIG);
    expect(result.warnings).toEqual([]);
  });

  test("JSON invalido: defaults + UNA warning che nomina il file", () => {
    const root = makeBoard();
    mkdirSync(join(root, ".opencode"), { recursive: true });
    writeFileSync(
      join(root, ".opencode", "toon.config.json"),
      "{ nope",
      "utf-8",
    );
    const result = loadToonConfig(root);
    expect(result.config).toEqual(DEFAULT_TOON_CONFIG);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("toon.config.json");
  });

  test("shape invalida (surfaces non-stringa): defaults + UNA warning", () => {
    const root = makeBoard();
    writeToonConfig(root, { toon: { enabled: true, surfaces: [42] } });
    const result = loadToonConfig(root);
    expect(result.config).toEqual(DEFAULT_TOON_CONFIG);
    expect(result.warnings).toHaveLength(1);
  });

  test("config valida: enabled e surfaces sovrascrivono i default senza warning", () => {
    const root = makeBoard();
    writeToonConfig(root, {
      toon: { enabled: true, surfaces: ["plan_board"] },
    });
    const result = loadToonConfig(root);
    expect(result.config).toEqual({
      toon: { enabled: true, surfaces: ["plan_board"] },
    });
    expect(result.warnings).toEqual([]);
  });
});

describe("#208 branch TOON del tool plan_board", () => {
  test("senza file di config: output byte-identico al JSON.stringify(payload, null, 2) di oggi", async () => {
    const root = makeBoard();
    seedPlan(root, "draft", "9301-json");
    // cwd vuota: la fallback di progetto non puo' trovare una config utente.
    const emptyProject = mkdtempSync(join(tmpdir(), "pb-tool-empty-"));
    boards.push(emptyProject);
    const text = await inProject(emptyProject, () =>
      runToolText({ command: "check", root }),
    );
    const { payload } = runPlanBoard(["check", "--root", root, "--json"]);
    expect(text).toBe(JSON.stringify(payload, null, 2));
    expect("configWarning" in JSON.parse(text)).toBe(false);
  });

  test("enabled + surface plan_board: output TOON che decodifica al payload JSON", async () => {
    const root = makeBoard();
    seedPlan(root, "draft", "9302-toon");
    const jsonText = await runToolText({ command: "check", root });
    const expected = JSON.parse(jsonText);

    writeToonConfig(root, {
      toon: { enabled: true, surfaces: ["plan_board"] },
    });
    const toonText = await runToolText({ command: "check", root });

    expect(toonText).not.toBe(jsonText);
    const decoded = decode(toonText);
    expect(decoded).toEqual(expected);
    expect(decoded).not.toBeNull();
    expect("configWarning" in (decoded as Record<string, unknown>)).toBe(false);
  });

  test("enabled ma surface assente: resta il JSON di default", async () => {
    const root = makeBoard();
    seedPlan(root, "draft", "9303-surface");
    writeToonConfig(root, { toon: { enabled: true, surfaces: ["other"] } });
    const text = await runToolText({ command: "check", root });
    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect("configWarning" in json).toBe(false);
  });

  test("config invalido: JSON di default + configWarning descrittivo (nome file, nessun path)", async () => {
    const root = makeBoard();
    writeToonConfig(root, { toon: { enabled: "yes" } });
    const text = await runToolText({ command: "check", root });
    const json = JSON.parse(text);
    expect(json.ok).toBe(true);
    expect(typeof json.configWarning).toBe("string");
    expect(json.configWarning).toContain("toon.config.json");
    expect(json.configWarning).not.toContain(root);
  });

  test("root 'plan': la config del project root (cwd) e' letta; il board override vince", async () => {
    const project = mkdtempSync(join(tmpdir(), "pb-tool-project-"));
    boards.push(project);
    for (const col of COLUMNS) {
      mkdirSync(join(project, "plan", col), { recursive: true });
    }
    seedPlan(join(project, "plan"), "draft", "9304-project");
    mkdirSync(join(project, ".opencode"), { recursive: true });
    writeFileSync(
      join(project, ".opencode", "toon.config.json"),
      JSON.stringify({ toon: { enabled: true, surfaces: ["plan_board"] } }),
      "utf-8",
    );

    const { payload } = await inProject(project, async () =>
      runPlanBoard(["check", "--root", "plan", "--json"]),
    );
    const text = await inProject(project, () =>
      runToolText({ command: "check", root: "plan" }),
    );
    expect(() => JSON.parse(text)).toThrow();
    expect(decode(text) as Record<string, unknown>).toEqual(payload);

    // override opzionale ancorato alla board: la sua config vince.
    writeToonConfig(join(project, "plan"), { toon: { enabled: false } });
    const overridden = await inProject(project, () =>
      runToolText({ command: "check", root: "plan" }),
    );
    expect(JSON.parse(overridden).ok).toBe(true);
  });

  test("round-trip TOON per payload move e adopt (chiavi fuori dal bench)", async () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9305-move");
    const moveArgs = {
      command: "move",
      id: "9305-move",
      to: "complete",
      comprehension: "pass",
      outcome: "lesson: round-trip",
      root,
    };
    const { payload: dryMove } = runPlanBoard([
      "move",
      "--id",
      "9305-move",
      "--to",
      "complete",
      "--comprehension",
      "pass",
      "--outcome",
      "lesson: round-trip",
      "--dry-run",
      "--root",
      root,
      "--json",
    ]);
    writeToonConfig(root, {
      toon: { enabled: true, surfaces: ["plan_board"] },
    });
    const moveToon = await runToolText(moveArgs);
    const decodedMove = decode(moveToon) as Record<string, unknown>;
    expect(decodedMove).toEqual({
      ...dryMove,
      dry_run: false,
      verified: true,
    });

    // adopt: `warnings` e' un array di oggetti, assente dal bench.
    const adoptRoot = makeBoard();
    writeFileSync(
      join(adoptRoot, "draft", "9306-adopt.md"),
      "# Legacy\n\nCorpo legacy.\n",
      "utf-8",
    );
    writeToonConfig(adoptRoot, {
      toon: { enabled: true, surfaces: ["plan_board"] },
    });
    const { payload: expectedAdopt } = runPlanBoard([
      "adopt",
      "--file",
      "9306-adopt",
      "--owner",
      "plan-writer",
      "--executor",
      "developer-fixer",
      "--dry-run",
      "--root",
      adoptRoot,
      "--json",
    ]);
    const adoptToon = await runToolText({
      command: "adopt",
      file: "9306-adopt",
      owner: "plan-writer",
      executor: "developer-fixer",
      dryRun: true,
      root: adoptRoot,
    });
    const decodedAdopt = decode(adoptToon) as Record<string, unknown>;
    expect(decodedAdopt).toEqual(expectedAdopt);
    expect(Array.isArray(decodedAdopt["warnings"])).toBe(true);
  });
});

describe("#208 pin anti-drift della dipendenza TOON", () => {
  test("root devDependency e plugin dependency dichiarano la stessa versione", () => {
    const rootPkg = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf-8"),
    );
    const pluginPkg = JSON.parse(
      readFileSync(join(REPO_ROOT, "plugin", "package.json"), "utf-8"),
    );
    expect(rootPkg.devDependencies["@toon-format/toon"]).toBeDefined();
    expect(pluginPkg.dependencies["@toon-format/toon"]).toBe(
      rootPkg.devDependencies["@toon-format/toon"],
    );
  });
});
