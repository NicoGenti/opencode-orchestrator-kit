import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import plugin from "../plugin/src/index.ts";

/**
 * Tool nativo `plan_board` (registrato via ctx.tool.transform).
 *
 * Suite scritta PRIMA dell'implementazione (TDD, passo 1): pinna il contratto
 * osservabile del tool — esattamente un tool `plan_board`, schema input allineato
 * alla CLI di plan-board, execute che ritorna una STRING JSON, comportamento
 * check/move/new/adopt su board usa-e-getta identico a plugin/src/plan-board.ts.
 *
 * Nessun caso tocca la board reale del repo: root e' sempre un path assoluto
 * temporaneo, per nulla dipendente dalla cwd del processo.
 */

const COLUMNS = ["draft", "in-progress", "qa", "complete"] as const;

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
      transform: async (callback) => {
        await callback(noopAgentEditor());
      },
    },
    command: {
      transform: (callback) => {
        void callback({
          add: (entry: Record<string, unknown>) => {
            commands.push(entry);
          },
        });
      },
    },
    skill: {
      transform: (callback) => {
        void callback({
          add: (entry: Record<string, unknown>) => {
            skills.push(entry);
          },
        });
      },
    },
    tool: {
      transform: (callback: (editor: { add(): void }) => void) => {
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

/** Guida il tool attraverso execute() e parsa la STRING JSON di ritorno. */
async function runTool(input: ToolInput): Promise<any> {
  const execute = tools[0].execute as (input: ToolInput) => Promise<unknown>;
  const result = await execute(input);
  expect(typeof result).toBe("string");
  return JSON.parse(result as string);
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
  test("due tool registrati: plan_board primo, comprehension_telemetry secondo", () => {
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe("plan_board");
    expect(tools[1].name).toBe("comprehension_telemetry");
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

  test("input schema: enum allineate a comandi, colonne e comprehension", () => {
    const input = tools[0].input as Record<string, any>;
    expect(input.type).toBe("object");
    expect(input.required).toContain("command");
    expect(input.properties.command.enum).toEqual(["check", "move", "new", "adopt"]);
    expect(input.properties.to.enum).toEqual([...COLUMNS]);
    expect(input.properties.comprehension.enum).toEqual([
      "none",
      "pass",
      "skipped",
      "fail",
      "disabled",
      "n/a",
    ]);
    expect(input.properties.column.enum).toEqual([...COLUMNS]);
    expect(input.properties.root.type).toBe("string");
    expect(input.properties.dryRun.type).toBe("boolean");
  });

  test("execute e' una funzione e ritorna una STRING (payload JSON, non un oggetto)", async () => {
    expect(typeof tools[0].execute).toBe("function");
    const execute = tools[0].execute as (
      input: ToolInput,
    ) => Promise<unknown>;
    const result = await execute({});
    expect(typeof result).toBe("string");
    expect(JSON.parse(result as string).ok).toBe(false);
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
    const text = readFileSync(join(root, "in-progress", "9101-demo.md"), "utf-8");
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
