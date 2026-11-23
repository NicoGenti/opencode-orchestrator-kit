import { describe, expect, test, afterAll } from "bun:test";
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
 *  - la sostituzione avviene sulla forma ESCAPATA del path: `JSON.stringify`
 *    raddoppia ogni `\` in `\\`, quindi il path grezzo non compare mai
 *    letteralmente nel payload serializzato (dividere per il path grezzo
 *    sarebbe un no-op silenzioso: il confronto fallirebbe sempre su Windows);
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
 * pattern di tests/plan-board.test.ts; quando l'unico interprete disponibile
 * non consegna un argomento con newline (shim `.cmd` di Windows) salta il solo
 * caso [15], che dipende da quel round-trip.
 */

const REPO_ROOT = join(import.meta.dir, "..");
const PY_SCRIPT = join(REPO_ROOT, "scripts", "plan-board.py");
const TS_SCRIPT = join(REPO_ROOT, "plugin", "src", "plan-board.ts");
const COLUMNS = ["draft", "in-progress", "qa", "complete"] as const;

type PythonInfo = { bin: string; newlineSafe: boolean };

const NEWLINE_PROBE =
  "import sys; sys.exit(0 if len(sys.argv) == 2 and chr(10) in sys.argv[1] else 1)";

/** True quando `cmd` consegna a Python un argomento con newline intatto. */
function roundTripsNewline(cmd: string): boolean {
  return (
    spawnSync(cmd, ["-c", NEWLINE_PROBE, "probe\nline"], { stdio: "ignore" })
      .status === 0
  );
}

/** True quando `cmd` esiste e riporta una versione. */
function isPython(cmd: string): boolean {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
}

/**
 * L'interprete per le esecuzioni differenziali, con l'indicazione se
 * consegna intatto un argomento con newline.
 *
 * Uno shim `.cmd` di Windows ri-analizza la command line: un argomento che
 * contiene un newline viene troncato e gli argomenti successivi vengono
 * scartati. Tale interprete esegue comunque tutti gli altri scenari, quindi un
 * candidato disponibile ma non newline-safe viene restituito come fallback
 * invece di saltare l'intero file: salta solo il caso [15], l'unico che deve
 * consegnare esattamente quell'argomento.
 */
function pythonBin(): PythonInfo | null {
  const override = process.env.PB_PYTHON;
  const candidates = override ? [override] : ["python3", "python"];
  let fallback: string | null = null;
  for (const cmd of candidates) {
    if (!isPython(cmd)) continue;
    if (roundTripsNewline(cmd)) return { bin: cmd, newlineSafe: true };
    fallback ??= cmd;
  }
  return fallback === null ? null : { bin: fallback, newlineSafe: false };
}

const PY_INFO = pythonBin();
const PY = PY_INFO?.bin ?? "";
const NEWLINE_SAFE = PY_INFO?.newlineSafe ?? false;
const IS_SET = PY !== "";
const maybe = IS_SET ? describe : describe.skip;
/** Solo il caso che dipende dal round-trip del newline segue il probe. */
const maybeNewline = IS_SET && NEWLINE_SAFE ? describe : describe.skip;

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
function makePairedRoots(
  seed: (root: string) => void = () => {},
): [string, string] {
  const pyRoot = makeEmptyRoot("py");
  const tsRoot = makeEmptyRoot("ts");
  for (const root of [pyRoot, tsRoot]) {
    for (const col of COLUMNS) mkdirSync(join(root, col), { recursive: true });
    seed(root);
  }
  return [pyRoot, tsRoot];
}

/** Un piano conforme minimo gia' presente in una colonna (senza passare dal tool). */
function seedPlan(
  root: string,
  column: string,
  stem: string,
  extra = "",
): void {
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

type RunResult = {
  status: number | null;
  json: any;
  stdout: string;
  stderr: string;
};

function asText(value: string | Buffer | null | undefined): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return value.toString("utf-8");
}

function toResult(r: ReturnType<typeof spawnSync>): RunResult {
  const stdout = asText(r.stdout);
  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  return { status: r.status, json, stdout, stderr: asText(r.stderr) };
}

function runPy(args: string[], root: string): RunResult {
  return toResult(
    spawnSync(PY, [PY_SCRIPT, ...args, "--root", root, "--json"], {
      encoding: "utf-8",
    }),
  );
}

function runTs(args: string[], root: string): RunResult {
  return toResult(
    spawnSync(
      process.execPath,
      [TS_SCRIPT, ...args, "--root", root, "--json"],
      { encoding: "utf-8" },
    ),
  );
}

/**
 * Sostituisce il path della radice con il token `<ROOT>` nel payload gia'
 * serializzato.
 *
 * `JSON.stringify` scappa ogni backslash in `\\`: il path assoluto della radice
 * (es. `C:\Users\...\pb-parity-pyXXXX`) non compare MAI letteralmente nel
 * testo serializzato, solo nella sua forma ESCAPATA. Dividere per il path grezzo
 * e' quindi un no-op silenzioso. Qui si divide per la forma escapata (senza le
 * virgolette, cosi' il risultato resta JSON valido) e si sostituisce ogni
 * occorrenza: i path dei campi `root`, `path` ed `errors/warnings[].file` sono
 * tutti sotto la radice, quindi il prefisso radice li copre tutti.
 */
function normalizeRoot(serialized: string, root: string): string {
  const escaped = JSON.stringify(root).slice(1, -1);
  return serialized.split(escaped).join("<ROOT>");
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
  const pyText = normalizeRoot(JSON.stringify(py.json), pyRoot);
  const tsText = normalizeRoot(JSON.stringify(ts.json), tsRoot);
  expect(JSON.parse(pyText), label).toEqual(JSON.parse(tsText));
}

/**
 * Parita' ANCHE nell'ORDINE DELLE CHIAVI del payload serializzato.
 *
 * `expectParity` confronta il payload深度 (deep equality), che ignora l'ordine
 * delle chiavi: due implementazioni che emettono le stesse coppie in ordine
 * diverso passerebbero quel confronto. Qui si confronta la SERIALIZZAZIONE
 * normalizzata, che preserva l'ordine di inserimento delle chiavi.
 */
function expectPayloadKeyOrderParity(
  py: RunResult,
  ts: RunResult,
  pyRoot: string,
  tsRoot: string,
  label: string,
): void {
  const pyText = normalizeRoot(JSON.stringify(py.json), pyRoot);
  const tsText = normalizeRoot(JSON.stringify(ts.json), tsRoot);
  expect({ [label]: pyText === tsText }).toEqual({ [label]: true });
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
      writeFileSync(
        join(root, "draft", "0002-legacy.md"),
        "# Legacy\n\nSenza frontmatter.\n",
        "utf-8",
      );
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
      expect.arrayContaining([
        "legacy-no-frontmatter",
        "unexpected-file",
        "missing-comprehension",
      ]),
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
    expect(py.json?.errors?.map((e: any) => e.code)).toContain(
      "status-folder-mismatch",
    );
  });

  test("[5] new reale (non dry-run), poi check sul risultato", () => {
    const body = writeBody(BODY_OK);
    const makeArgs = () => [
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
    const py = runPy(makeArgs(), pyRoot);
    const ts = runTs(makeArgs(), tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "new");
    expect(py.json?.verified).toBe(true);
    const pyCheck = runPy(["check"], pyRoot);
    const tsCheck = runTs(["check"], tsRoot);
    expectParity(pyCheck, tsCheck, pyRoot, tsRoot, "check dopo new");
    expect(pyCheck.json?.plans?.draft?.map((p: any) => p.id)).toEqual([
      "9001-demo",
    ]);
  });

  test("[6] move --to qa --comprehension skipped su un piano di draft, poi check", () => {
    const [pyRoot, tsRoot] = makePairedRoots((root) => {
      seedPlan(root, "draft", "9002-move");
    });
    const argv = [
      "move",
      "--id",
      "9002-move",
      "--to",
      "qa",
      "--comprehension",
      "skipped",
    ];
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
      writeFileSync(
        join(root, "draft", "0020-legacy.md"),
        "# Nuovo titolo\n\nCorpo legacy.\n",
        "utf-8",
      );
    });
    const argv = [
      "adopt",
      "--file",
      "0020-legacy",
      "--owner",
      "plan-writer",
      "--executor",
      "developer-fixer",
    ];
    const py = runPy(argv, pyRoot);
    const ts = runTs(argv, tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "adopt legacy");
    expect(py.json?.action).toBe("adopt");
    expect(py.json?.id).toBe("0020-legacy");
    // entrambe hanno riscritto il file conservando il body
    expect(
      readFileSync(join(pyRoot, "draft", "0020-legacy.md"), "utf-8"),
    ).toContain("# Nuovo titolo");
    expect(
      readFileSync(join(tsRoot, "draft", "0020-legacy.md"), "utf-8"),
    ).toContain("# Nuovo titolo");
  });

  test("[9] new --dry-run: nessun file scritto ma payload di parita'", () => {
    const body = writeBody(BODY_OK);
    const [pyRoot, tsRoot] = makePairedRoots();
    const makeArgs = () => [
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
    const py = runPy(makeArgs(), pyRoot);
    const ts = runTs(makeArgs(), tsRoot);
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

  // ── #205 P2: la chiave `outcome` (lesson outcome) ───────────────────────────

  test("[11] move --to complete con --comprehension e --outcome: payload e file identici", () => {
    const [pyRoot, tsRoot] = makePairedRoots((root) => {
      seedPlan(root, "qa", "9010-outcome");
    });
    const argv = [
      "move",
      "--id",
      "9010-outcome",
      "--to",
      "complete",
      "--comprehension",
      "pass",
      "--outcome",
      "lesson: pin the file before the refactor",
    ];
    const py = runPy(argv, pyRoot);
    const ts = runTs(argv, tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "move to complete con outcome");
    expectPayloadKeyOrderParity(
      py,
      ts,
      pyRoot,
      tsRoot,
      "move to complete con outcome",
    );
    expect(py.json?.verified).toBe(true);
    expect(py.json?.outcome).toBe("lesson: pin the file before the refactor");
    // `outcome` occupa la posizione attesa nel payload: dopo `dry_run`.
    expect(Object.keys(py.json ?? {})).toEqual([
      "ok",
      "action",
      "id",
      "from",
      "to",
      "path",
      "dry_run",
      "outcome",
      "verified",
    ]);
    // il file scritto e' byte-identico fra le due implementazioni
    const pyText = readFileSync(
      join(pyRoot, "complete", "9010-outcome.md"),
      "utf-8",
    );
    const tsText = readFileSync(
      join(tsRoot, "complete", "9010-outcome.md"),
      "utf-8",
    );
    expect(tsText).toBe(pyText);
    expect(pyText).toContain(
      "outcome: lesson: pin the file before the refactor",
    );
  });

  test("[12] move --to complete con --outcome ma senza --comprehension: rifiuto identico", () => {
    const [pyRoot, tsRoot] = makePairedRoots((root) => {
      seedPlan(root, "qa", "9011-refused");
    });
    const argv = [
      "move",
      "--id",
      "9011-refused",
      "--to",
      "complete",
      "--outcome",
      "lesson: never written",
    ];
    const py = runPy(argv, pyRoot);
    const ts = runTs(argv, tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "rifiuto outcome senza comprehension");
    expectPayloadKeyOrderParity(
      py,
      ts,
      pyRoot,
      tsRoot,
      "rifiuto outcome senza comprehension",
    );
    expect(py.status).toBe(1);
    expect(py.json?.code).toBe("comprehension-unrecorded");
    // nessuna scrittura su nessuna delle due radici
    expect(existsSync(join(pyRoot, "complete", "9011-refused.md"))).toBe(false);
    expect(existsSync(join(tsRoot, "complete", "9011-refused.md"))).toBe(false);
    // il frontmatter resta intatto e senza chiave outcome
    const pyText = readFileSync(join(pyRoot, "qa", "9011-refused.md"), "utf-8");
    const tsText = readFileSync(join(tsRoot, "qa", "9011-refused.md"), "utf-8");
    expect(tsText).toBe(pyText);
    expect(pyText).not.toContain("outcome:");
  });

  test("[13] move --outcome che NON atterra su complete: accettata, non scritta, payload identico", () => {
    const [pyRoot, tsRoot] = makePairedRoots((root) => {
      seedPlan(root, "in-progress", "9012-drop");
    });
    const argv = [
      "move",
      "--id",
      "9012-drop",
      "--to",
      "qa",
      "--outcome",
      "lesson: dropped",
    ];
    const py = runPy(argv, pyRoot);
    const ts = runTs(argv, tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "outcome su move non-complete");
    expectPayloadKeyOrderParity(
      py,
      ts,
      pyRoot,
      tsRoot,
      "outcome su move non-complete",
    );
    expect(py.status).toBe(0);
    expect(py.json?.verified).toBe(true);
    // il payload non porta `outcome` fuori da `complete`
    expect("outcome" in (py.json ?? {})).toBe(false);
    expect("outcome" in (ts.json ?? {})).toBe(false);
    // ...e quindi la chiave non compare nell'ordine delle chiavi atteso
    expect(Object.keys(py.json ?? {})).not.toContain("outcome");
    // il frontmatter non contiene la chiave outcome
    const pyText = readFileSync(join(pyRoot, "qa", "9012-drop.md"), "utf-8");
    const tsText = readFileSync(join(tsRoot, "qa", "9012-drop.md"), "utf-8");
    expect(tsText).toBe(pyText);
    expect(pyText).not.toContain("outcome:");
  });

  test("[14] check su draft con e senza tags/outcome: payload di parita' e nessun warning nuovo", () => {
    const [pyRoot, tsRoot] = makePairedRoots((root) => {
      seedPlan(root, "draft", "9013-plain");
      seedPlan(
        root,
        "draft",
        "9014-tagged",
        "tags: alpha,beta\noutcome: lesson recorded\n",
      );
    });
    const py = runPy(["check"], pyRoot);
    const ts = runTs(["check"], tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "check con tags/outcome");
    expect(py.json?.ok).toBe(true);
    const warnings = py.json?.warnings ?? [];
    expect(
      warnings.filter((w: any) => /tags|outcome/i.test(String(w?.code ?? ""))),
    ).toEqual([]);
  });

  // ── #205 fix round 1 (B1): `--outcome` e' uno scalare piatto ──────────────────

  // Unico caso dipendente dal round-trip del newline: su un interprete che non
  // lo consegna (shim `.cmd` di Windows) viene saltato in modo VISIBILE, mentre
  // gli altri 15 scenari restano attivi.
  maybeNewline("[15] round-trip del newline nell'argomento", () => {
    test("[15] --outcome con newline: bad-argument su entrambe le parti, nessuna scrittura", () => {
      const [pyRoot, tsRoot] = makePairedRoots((root) => {
        seedPlan(root, "qa", "9015-multiline");
      });
      const argv = [
        "move",
        "--id",
        "9015-multiline",
        "--to",
        "complete",
        "--comprehension",
        "pass",
        "--outcome",
        "riga uno\nriga due",
      ];
      const py = runPy(argv, pyRoot);
      const ts = runTs(argv, tsRoot);
      expectParity(py, ts, pyRoot, tsRoot, "outcome con newline");
      expectPayloadKeyOrderParity(py, ts, pyRoot, tsRoot, "outcome con newline");
      expect(py.status).toBe(1);
      expect(py.json).toEqual({
        ok: false,
        code: "bad-argument",
        message: "--outcome must be a single line",
      });
      // rifiuto PRIMA di ogni modifica: nessuna move, frontmatter intatto
      expect(existsSync(join(pyRoot, "qa", "9015-multiline.md"))).toBe(true);
      expect(existsSync(join(pyRoot, "complete", "9015-multiline.md"))).toBe(
        false,
      );
      expect(existsSync(join(tsRoot, "qa", "9015-multiline.md"))).toBe(true);
      expect(existsSync(join(tsRoot, "complete", "9015-multiline.md"))).toBe(
        false,
      );
      const pyText = readFileSync(
        join(pyRoot, "qa", "9015-multiline.md"),
        "utf-8",
      );
      const tsText = readFileSync(
        join(tsRoot, "qa", "9015-multiline.md"),
        "utf-8",
      );
      expect(tsText).toBe(pyText);
      expect(pyText).not.toContain("outcome:");
    });
  });

  test("[16] --outcome troncato al primo '#': payload e riga scritta identici", () => {
    const [pyRoot, tsRoot] = makePairedRoots((root) => {
      seedPlan(root, "qa", "9016-hash");
    });
    const argv = [
      "move",
      "--id",
      "9016-hash",
      "--to",
      "complete",
      "--comprehension",
      "pass",
      "--outcome",
      "baseline from LF blobs (#201)",
    ];
    const py = runPy(argv, pyRoot);
    const ts = runTs(argv, tsRoot);
    expectParity(py, ts, pyRoot, tsRoot, "outcome con #");
    expectPayloadKeyOrderParity(py, ts, pyRoot, tsRoot, "outcome con #");
    // il payload riporta il valore SANIFICATO (quello che finisce su disco)
    expect(py.json?.outcome).toBe("baseline from LF blobs (");
    expect(ts.json?.outcome).toBe("baseline from LF blobs (");
    for (const root of [pyRoot, tsRoot]) {
      const line = readFileSync(join(root, "complete", "9016-hash.md"), "utf-8")
        .split(/\r?\n/)
        .find((l) => l.startsWith("outcome:"));
      expect(line).toBe("outcome: baseline from LF blobs (");
    }
  });
});
