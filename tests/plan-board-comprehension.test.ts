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
 * scripts/plan-board.py — esito di comprensione obbligatorio al `qa` -> `complete`.
 *
 * Il gate di comprensione viene registrato nel frontmatter dal tool: una `move --to complete`
 * senza `--comprehension <valore>` e' rifiutata (exit 1, `comprehension-unrecorded`) prima di
 * qualunque modifica al filesystem; il valore fornito e' scritto atomicamente con la move.
 * `check` segnala `missing-comprehension` come WARN (exit 0) per i file qa/complete privi della
 * chiave. Board usa-e-getta (mkdtemp) — nessun caso tocca la board reale del repo.
 *
 * Interprete: `PB_PYTHON` se impostato, altrimenti `python3` o `python`; se nessuno dei due
 * esiste il blocco viene saltato (mai fail).
 */

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPT = join(REPO_ROOT, "scripts", "plan-board.py");
const COLUMNS = ["draft", "in-progress", "qa", "complete"] as const;
const COMPREHENSION_VALUES = [
  "none",
  "pass",
  "skipped",
  "needs_review",
  "fail",
  "disabled",
  "n/a",
];

function pythonBin(): string | null {
  for (const cmd of ["python3", "python"]) {
    if (spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0)
      return cmd;
  }
  return null;
}

const PY = process.env.PB_PYTHON ?? pythonBin() ?? "";
const maybe = PY ? describe : describe.skip;

const BODY_OK = [
  "# Probe",
  "",
  "## Goal",
  "",
  "Esercitare il gate di comprensione della board.",
  "",
  "## Success Criteria",
  "",
  "- la move verso complete registra l'esito",
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
  "- bun test tests/plan-board-comprehension.test.ts",
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
let bodyCount = 0;

function makeBoard(): string {
  const root = mkdtempSync(join(tmpdir(), "pbc-board-"));
  for (const col of COLUMNS) mkdirSync(join(root, col), { recursive: true });
  boards.push(root);
  return root;
}

function writeBody(text: string): string {
  bodyCount += 1;
  const p = join(tmpdir(), `pbc-body-${process.pid}-${bodyCount}.md`);
  writeFileSync(p, text, "utf-8");
  return p;
}

type RunResult = {
  status: number | null;
  json: any;
  stdout: string;
  stderr: string;
};

function run(args: string[], root: string): RunResult {
  const r = spawnSync(PY, [SCRIPT, ...args, "--root", root, "--json"], {
    encoding: "utf-8",
  });
  const stdout = r.stdout ?? "";
  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  return { status: r.status, json, stdout, stderr: r.stderr ?? "" };
}

/** Un piano conforme minimo gia' presente in una colonna (senza passare dal tool). */
function seedPlan(
  root: string,
  column: string,
  stem: string,
  extra = "",
): string {
  const p = join(root, column, `${stem}.md`);
  writeFileSync(
    p,
    `---\nid: ${stem}\ntitle: ${stem}\nstatus: ${column}\ncreated: 2026-01-01\nupdated: 2026-01-01\n` +
      `owner: plan-writer\nexecutor: developer-fixer\n${extra}---\n\n## Goal\n\nseed\n`,
    "utf-8",
  );
  return p;
}

afterAll(() => {
  for (const b of boards) rmSync(b, { recursive: true, force: true });
});

maybe("plan-board.py — gate comprensione su qa -> complete", () => {
  test("move --to complete senza --comprehension: comprehension-unrecorded, nessuno spostamento", () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9001-gate");
    const r = run(["move", "--id", "9001-gate", "--to", "complete"], root);
    expect(r.status).toBe(1);
    expect(r.json?.code).toBe("comprehension-unrecorded");
    expect(existsSync(join(root, "qa", "9001-gate.md"))).toBe(true);
    expect(existsSync(join(root, "complete", "9001-gate.md"))).toBe(false);
  });

  test("ogni valore dell'enum e' accettato, scrive la chiave e sposta il file", () => {
    for (const value of COMPREHENSION_VALUES) {
      const root = makeBoard();
      seedPlan(root, "qa", "9001-gate");
      const r = run(
        [
          "move",
          "--id",
          "9001-gate",
          "--to",
          "complete",
          "--comprehension",
          value,
        ],
        root,
      );
      expect({ value, status: r.status }).toEqual({ value, status: 0 });
      expect(r.json?.verified).toBe(true);
      const dst = join(root, "complete", "9001-gate.md");
      expect({ value, exists: existsSync(dst) }).toEqual({
        value,
        exists: true,
      });
      const text = readFileSync(dst, "utf-8");
      expect({ value, has: text.includes(`comprehension: ${value}`) }).toEqual({
        value,
        has: true,
      });
    }
  });

  test("check segnala WARN missing-comprehension su un file qa privo della chiave (exit 0)", () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9001-gate");
    const r = run(["check"], root);
    expect(r.status).toBe(0);
    expect(r.json?.warnings?.map((w: any) => w.code)).toContain(
      "missing-comprehension",
    );
  });

  test("draft -> in-progress non richiede --comprehension", () => {
    const root = makeBoard();
    const r = run(
      [
        "new",
        "--id",
        "9002-demo",
        "--title",
        "Demo",
        "--owner",
        "plan-writer",
        "--executor",
        "developer-fixer",
        "--body",
        writeBody(BODY_OK),
      ],
      root,
    );
    expect(r.status).toBe(0);
    const m = run(["move", "--id", "9002-demo", "--to", "in-progress"], root);
    expect(m.status).toBe(0);
    expect(m.json?.verified).toBe(true);
    expect(existsSync(join(root, "in-progress", "9002-demo.md"))).toBe(true);
  });

  test("un valore --comprehension non valido e' rifiutato (exit non-zero, nessuno spostamento)", () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9001-gate");
    const r = run(
      [
        "move",
        "--id",
        "9001-gate",
        "--to",
        "complete",
        "--comprehension",
        "bogus",
      ],
      root,
    );
    expect(r.status).not.toBe(0);
    expect(existsSync(join(root, "qa", "9001-gate.md"))).toBe(true);
    expect(existsSync(join(root, "complete", "9001-gate.md"))).toBe(false);
  });
});

/**
 * #205 P2 — la chiave `outcome` (lesson outcome) sulla move verso `complete`.
 *
 * `outcome` e' uno scalare piatto opzionale: viene scritto nel frontmatter
 * SOLO quando la move atterra su `complete` e il valore non e' nullo. Il
 * rifiuto `comprehension-unrecorded` avviene prima di qualsiasi scrittura, quindi
 * un `--outcome` senza `--comprehension` non lascia tracce sul filesystem.
 */
maybe("plan-board.py — chiave outcome sulla move verso complete", () => {
  test("move --to complete con --comprehension e --outcome: scrive `outcome` nel frontmatter", () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9100-outcome");
    const r = run(
      [
        "move",
        "--id",
        "9100-outcome",
        "--to",
        "complete",
        "--comprehension",
        "pass",
        "--outcome",
        "lesson: pin the file before the refactor",
      ],
      root,
    );
    expect(r.status).toBe(0);
    expect(r.json?.verified).toBe(true);
    expect(r.json?.outcome).toBe("lesson: pin the file before the refactor");
    const dst = join(root, "complete", "9100-outcome.md");
    expect(existsSync(dst)).toBe(true);
    const text = readFileSync(dst, "utf-8");
    expect(text).toContain(
      "outcome: lesson: pin the file before the refactor",
    );
  });

  test("la chiave `outcome` occupa la posizione FM_KEYS: dopo executor, prima delle chiavi sconosciute", () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9101-order");
    const r = run(
      [
        "move",
        "--id",
        "9101-order",
        "--to",
        "complete",
        "--comprehension",
        "pass",
        "--outcome",
        "lesson: ordered",
      ],
      root,
    );
    expect(r.status).toBe(0);
    const text = readFileSync(join(root, "complete", "9101-order.md"), "utf-8");
    const lines = text.split("\n").filter((l) => l.trim() !== "" && l !== "---");
    const iExecutor = lines.findIndex((l) => l.startsWith("executor:"));
    const iOutcome = lines.findIndex((l) => l.startsWith("outcome:"));
    const iComprehension = lines.findIndex((l) =>
      l.startsWith("comprehension:"),
    );
    expect({ iExecutor, iOutcome, iComprehension }).toEqual({
      iExecutor,
      iOutcome,
      iComprehension,
    });
    expect(iExecutor).toBeGreaterThan(-1);
    expect(iOutcome).toBeGreaterThan(iExecutor);
    // `comprehension` non e' una chiave FM_KEYS: viene reso DOPO, in ordine
    // alfabetico fra le chiavi sconosciute.
    expect(iComprehension).toBeGreaterThan(iOutcome);
  });

  test("move --to complete con --outcome ma SENZA --comprehension: rifiutata, nessuna scrittura", () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9102-refused");
    const before = readFileSync(join(root, "qa", "9102-refused.md"), "utf-8");
    const r = run(
      [
        "move",
        "--id",
        "9102-refused",
        "--to",
        "complete",
        "--outcome",
        "lesson: never written",
      ],
      root,
    );
    expect(r.status).toBe(1);
    expect(r.json?.code).toBe("comprehension-unrecorded");
    // nessun movimento
    expect(existsSync(join(root, "qa", "9102-refused.md"))).toBe(true);
    expect(existsSync(join(root, "complete", "9102-refused.md"))).toBe(false);
    // frontmatter intatto: nessuna chiave outcome, nessun status/status change
    const after = readFileSync(join(root, "qa", "9102-refused.md"), "utf-8");
    expect(after).toBe(before);
    expect(after).not.toContain("outcome:");
  });

  test("--outcome su una move che NON atterra su complete: accettata ma non scritta", () => {
    const root = makeBoard();
    seedPlan(root, "in-progress", "9103-drop");
    const r = run(
      [
        "move",
        "--id",
        "9103-drop",
        "--to",
        "qa",
        "--outcome",
        "lesson: dropped",
      ],
      root,
    );
    expect(r.status).toBe(0);
    expect(r.json?.verified).toBe(true);
    // il payload non porta `outcome` su una destinazione non-complete
    expect("outcome" in (r.json ?? {})).toBe(false);
    const dst = join(root, "qa", "9103-drop.md");
    expect(existsSync(dst)).toBe(true);
    const text = readFileSync(dst, "utf-8");
    expect(text).not.toContain("outcome:");
    expect(text).toContain("status: qa");
  });

  test("check: nessun NUOVO warning per tags/outcome (draft con e senza)", () => {
    const root = makeBoard();
    seedPlan(root, "draft", "9104-plain");
    seedPlan(
      root,
      "draft",
      "9105-tagged",
      "tags: alpha,beta\noutcome: lesson recorded\n",
    );
    const r = run(["check"], root);
    expect(r.status).toBe(0);
    expect(r.json?.ok).toBe(true);
    const warnings = r.json?.warnings ?? [];
    // nessun warning menziona le nuove chiavi
    const mentionsTags = warnings.filter((w: any) =>
      /tags|outcome/i.test(String(w?.code ?? "") + String(w?.message ?? "")),
    );
    expect(mentionsTags).toEqual([]);
    // i due draft producono lo STESSO insieme di warning (nessun warning
    // aggiuntivo introdotto dalle chiavi opzionali)
    const byFile = new Map<string, string[]>();
    for (const w of warnings) {
      const file = String(w?.file ?? "");
      const key = file.split(/[\\/]/).pop() ?? "";
      const list = byFile.get(key) ?? [];
      list.push(String(w?.code ?? ""));
      byFile.set(key, list);
    }
    const codesFor = (stem: string) =>
      (byFile.get(`${stem}.md`) ?? []).slice().sort();
    expect(codesFor("9104-plain")).toEqual(codesFor("9105-tagged"));
  });
});
