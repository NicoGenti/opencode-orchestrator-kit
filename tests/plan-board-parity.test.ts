import { describe, expect, test, afterAll } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Test differenziale python <-> TypeScript del plan-board (Phase 6a).
 *
 * Per ogni scenario della matrice si costruiscono DUE radici board
 * usa-e-getta identiche (stessi seed, stessi argv), se ne esegue una con
 * `scripts/plan-board.py` (fonte autoritativa) e una con
 * `plugin/src/plan-board.ts`, e i payload `--json` dei due stdout vengono
 * confrontati in profondita' dopo la normalizzazione dei path.
 *
 * Normalizzazione e motivazione:
 *  - le due esecuzioni girano su radici mkdtemp diverse che differiscono
 *    SOLO per il path assoluto -> ogni occorrenza del path della propria
 *    radice viene sostituita dal token `<ROOT>` prima del confronto;
 *  - nessun campo volatile viene scartato: `created`/`updated` derivano da
 *    `today()` (data locale, identica per entrambe le esecuzioni) e i
 *    payload non contengono timestamp.
 *
 * Deviazioni documentate NON entrate nella matrice (e perche'):
 *  - errori di argomento: argparse esce 2, la porta TS esce 1 (contratto
 *    documentato) — gli scenari della matrice restano dentro i codici di
 *    exit comuni (0/1) e non affrontano la casistica argparse;
 *  - move su file CRLF: il python (read_text universal newlines) riscrive
 *    il file in LF, la porta TS preserva i CRLF — deviazione documentata,
 *    quindi nessuno scenario CRLF mutante entra nella matrice.
 *
 * Skip pulito quando nessun interprete python e' disponibile, stesso
 * pattern di tests/plan-board.test.ts.
 */

const REPO_ROOT = join(import.meta.dir, "..");
const PY_SCRIPT = join(REPO_ROOT, "scripts", "plan-board.py");
const TS_SCRIPT = join(REPO_ROOT, "plugin", "src", "plan-board.ts");
const COLUMNS = ["draft", "in-progress", "qa", "complete"] as const;

function pythonBin(): string | null {
  for (const cmd of ["python3", "python"]) {
    if (spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0) return cmd;
  }
  return null;
}

const PY = process.env.PB_PYTHON ?? pythonBin() ?? "";
const IS_SET = PY !== "";
const maybe = IS_SET ? describe : describe.skip;

const BODY_OK = [
  "# Probe",
  "",
  "## Goal",
  "",
  "Esercitare la board dei piani.",
  "",
  "## Success Criteria",
  "",
  "- payload identici",
  "",
  "## Scope",
  "",
  "- In: board temporanee",
  "- Out: niente",
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
  "- parita' python/ts",
  "",
  "## Test Plan",
  "",
  "- bun test tests/plan-board-parity.test.ts",
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

const boards: string[] = [];
const bodyFiles: string[] = [];
let bodyCount = 0;

/** Radice board usa-e-getta, registrata per la pulizia finale. */
function makeEmptyRoot(tag: string): string {
  const root = mkdtempSync(join(tmpdir(), `pb-parity-${tag}`));
  boards.push(root);
  return root;
}

/**
 * Due radici indipendenti con lo stesso seed: [radice python, radice ts].
 */
function makePairedRoots(seed: (root: string) => void = () => {}): [string, string] {
  const pyRoot = makeEmptyRoot("py");
  const tsRoot = makeEmptyRoot("ts");
  for (const root of [pyRoot, tsRoot]) {
    for (const col of COLUMNS) mkdirSync(join(root, col), { recursive: true });
    seed(root);
  }
  return [pyRoot, tsRoot];
}

/** Un piano conforme minimo gia' presente in una colonna (senza passare dal tool). */
function seedPlan(root: string, column: string, stem: string, extra = ""): void {
  writeFileSync(
    join(root, column, `${stem}.md`),
    `---\nid: ${stem}\ntitle: ${stem}\nstatus: ${column}\ncreated: 2026-01-01\nupdated: 2026-01-01\n` +
      `owner: plan-writer\nexecutor: developer-fixer\n${extra}---\n\n## Goal\n\nseed\n`,
    "utf-8",
  );
}

/** Un body fuori dalle board (il path del body non entra mai in un payload). */
function writeBody(text: string): string {
  bodyCount += 1;
  const p = join(tmpdir(), `pb-parity-body-${process.pid}-${bodyCount}.md`);
  writeFileSync(p, text, "utf-8");
  bodyFiles.push(p);
  return p;
}

type RunResult = { status: number | null; json: any; stdout: string; stderr: string };

function toResult(r: ReturnType<typeof spawnSync>): RunResult {
  const stdout = r.stdout ?? "";
  let json: any = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  return { status: r.status, json, stdout, stderr: r.stderr ?? "" };
}

function runPy(args: string[], root: string): RunResult {
  return toResult(spawnSync(PY, [PY_SCRIPT, ...args, "--root", root, "--json"], { encoding: "utf-8" }));
}

function runTs(args: string[], root: string): RunResult {
  return toResult(
    spawnSync(process.execPath, [TS_SCRIPT, ...args, "--root", root, "--json"], { encoding: "utf-8" }),
  );
}

/**
 * Aspetta la parita' di una coppia di esecuzioni: exit code identici, JSON
 * valido su entrambi gli stdout e payload normalizzati profondamente uguali.
 */
function expectParity(
  py: RunResult,
  ts: RunResult,
  pyRoot: string,
  tsRoot: string,
  label: string,
): void {
  expect(py.status, `${label}: exit python`).toBe(ts.status);
  expect(py.json, `${label}: stdout python non e' JSON`).not.toBeNull();
  expect(ts.json, `${label}: stdout ts non e' JSON`).not.toBeNull();
  const pyText = JSON.stringify(py.json).split(pyRoot).join("<ROOT>");
  const tsText = JSON.stringify(ts.json).split(tsRoot).join("<ROOT>");
  expect(JSON.parse(pyText), label).toEqual(JSON.parse(tsText));
}

afterAll(() => {
  for (const b of boards) rmSync(b, { recursive: true, force: true });
  for (const b of bodyFiles) rmSync(b, { force: true });
});

maybe("plan-board parity python <-> typescript", () => {
  test("[1] check su una radice senza colonne", () => {
    const pyRoot = makeEmptyRoot("py");
    const tsRoot = makeEmptyRoot("ts");
    const py = runPy(["check"], pyRoot);
    const ts = runTs(["check"], tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "check radice senza colonne");
    expect(py.json?.ok).toBe(true); // i 4 warning di colonna mancante non fanno fallire
    expect(py.status).toBe(0);
    expect(py.json?.warnings?.map((w: any) => w.code)).toEqual([
      "missing-column",
      "missing-column",
      "missing-column",
      "missing-column",
    ]);
  });

  test("[2] check su board conforme (frontmatter + sezioni nel body di seed)", () => {
    const [pyRoot, tsRoot] = makePairedRoots((root) => {
      seedPlan(root, "draft", "0001-demo");
    });
    const py = runPy(["check"], pyRoot);
    const ts = runTs(["check"], tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "check board conforme");
    expect(py.json?.ok).toBe(true);
    expect(py.json?.plans?.draft?.map((p: any) => p.id)).toEqual(["0001-demo"]);
  });

  test("[3] check con condizioni di warning (legacy + stray file + comprehension assente)", () => {
    const [pyRoot, tsRoot] = makePairedRoots((root) => {
      writeFileSync(join(root, "draft", "0002-legacy.md"), "# Legacy\n\nSenza frontmatter.\n", "utf-8");
      writeFileSync(join(root, "qa", "notes.txt"), "stray", "utf-8");
      seedPlan(root, "complete", "0003-no-comp");
    });
    const py = runPy(["check"], pyRoot);
    const ts = runTs(["check"], tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "check con warning");
    expect(py.json?.ok).toBe(true); // i warning non fanno fallire
    expect(py.status).toBe(0);
    const warnings: string[] = py.json?.warnings?.map((w: any) => w.code) ?? [];
    expect(warnings).toEqual(
      expect.arrayContaining(["legacy-no-frontmatter", "unexpected-file", "missing-comprehension"]),
    );
  });

  test("[4] check con errore bloccante (status-folder-mismatch): exit 1 da entrambe", () => {
    const [pyRoot, tsRoot] = makePairedRoots((root) => {
      const p = join(root, "qa", "0004-drift.md");
      writeFileSync(
        p,
        `---\nid: 0004-drift\ntitle: 0004-drift\nstatus: draft\ncreated: 2026-01-01\nupdated: 2026-01-01\n` +
          `owner: plan-writer\nexecutor: developer-fixer\n---\n\n## Goal\n\nseed\n`,
        "utf-8",
      );
    });
    const py = runPy(["check"], pyRoot);
    const ts = runTs(["check"], tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "check con errore");
    expect(py.status).toBe(1);
    expect(py.json?.ok).toBe(false);
    expect(py.json?.errors?.map((e: any) => e.code)).toContain("status-folder-mismatch");
  });

  test("[5] new reale (non dry-run), poi check sul risultato", () => {
    const body = writeBody(BODY_OK);
    const makeArgs = (root: string) => [
      "new",
      "--id",
      "9001-demo",
      "--title",
      "Demo",
      "--owner",
      "plan-writer",
      "--executor",
      "developer-fixer",
      "--body",
      body,
    ];
    const [pyRoot, tsRoot] = makePairedRoots(() => {});
    const py = runPy(makeArgs(pyRoot), pyRoot);
    const ts = runTs(makeArgs(tsRoot), tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "new");
    expect(py.json?.verified).toBe(true);
    const pyCheck = runPy(["check"], pyRoot);
    const tsCheck = runTs(["check"], tsRoot);
    expectParity(pyCheck, tsCheck, pyRoot, tsRoot, "check dopo new");
    expect(pyCheck.json?.plans?.draft?.map((p: any) => p.id)).toEqual(["9001-demo"]);
  });

  test("[6] move --to qa --comprehension skipped su un piano di draft, poi check", () => {
    const [pyRoot, tsRoot] = makePairedRoots((root) => {
      seedPlan(root, "draft", "9002-move");
    });
    const argv = ["move", "--id", "9002-move", "--to", "qa", "--comprehension", "skipped"];
    const py = runPy(argv, pyRoot);
    const ts = runTs(argv, tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "move to qa");
    expect(py.json?.verified).toBe(true);
    const pyCheck = runPy(["check"], pyRoot);
    const tsCheck = runTs(["check"], tsRoot);
    expectParity(pyCheck, tsCheck, pyRoot, tsRoot, "check dopo move");
    expect(pyCheck.json?.plans?.qa?.[0]?.comprehension).toBe("skipped");
  });

  test("[7] move di un piano inesistente: exit 1 da entrambe", () => {
    const [pyRoot, tsRoot] = makePairedRoots();
    const argv = ["move", "--id", "nope", "--to", "qa"];
    const py = runPy(argv, pyRoot);
    const ts = runTs(argv, tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "move piano inesistente");
    expect(py.json?.code).toBe("plan-not-found");
    expect(py.status).toBe(1);
  });

  test("[8] adopt su un file legacy (senza frontmatter): frontmatter derivato + warning", () => {
    const [pyRoot, tsRoot] = makePairedRoots((root) => {
      writeFileSync(join(root, "draft", "0020-legacy.md"), "# Nuovo titolo\n\nCorpo legacy.\n", "utf-8");
    });
    const argv = ["adopt", "--file", "0020-legacy", "--owner", "plan-writer", "--executor", "developer-fixer"];
    const py = runPy(argv, pyRoot);
    const ts = runTs(argv, tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "adopt legacy");
    expect(py.json?.action).toBe("adopt");
    expect(py.json?.id).toBe("0020-legacy");
    // entrambe hanno riscritto il file conservando il body
    expect(readFileSync(join(pyRoot, "draft", "0020-legacy.md"), "utf-8")).toContain("# Nuovo titolo");
    expect(readFileSync(join(tsRoot, "draft", "0020-legacy.md"), "utf-8")).toContain("# Nuovo titolo");
  });

  test("[9] new --dry-run: nessun file scritto ma payload di parita'", () => {
    const body = writeBody(BODY_OK);
    const [pyRoot, tsRoot] = makePairedRoots();
    const makeArgs = (root: string) => [
      "new",
      "--id",
      "9005-dry",
      "--title",
      "Dry",
      "--owner",
      "plan-writer",
      "--executor",
      "developer-fixer",
      "--body",
      body,
      "--dry-run",
    ];
    const py = runPy(makeArgs(pyRoot), pyRoot);
    const ts = runTs(makeArgs(tsRoot), tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "new dry-run");
    expect(py.json?.dry_run).toBe(true);
    expect(existsSync(join(pyRoot, "draft", "9005-dry.md"))).toBe(false);
    expect(existsSync(join(tsRoot, "draft", "9005-dry.md"))).toBe(false);
  });

  test("[10] move --dry-run su piano conforme: nessun file spostato ma payload di parita'", () => {
    const [pyRoot, tsRoot] = makePairedRoots((root) => {
      seedPlan(root, "draft", "9006-dry");
    });
    const argv = ["move", "--id", "9006-dry", "--to", "qa", "--dry-run"];
    const py = runPy(argv, pyRoot);
    const ts = runTs(argv, tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "move dry-run");
    expect(py.json?.dry_run).toBe(true);
    expect(existsSync(join(pyRoot, "qa", "9006-dry.md"))).toBe(false);
    expect(existsSync(join(tsRoot, "qa", "9006-dry.md"))).toBe(false);
  });
});
