import { describe, expect, test, afterAll } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const COMPREHENSION_VALUES = ["none", "pass", "skipped", "fail", "disabled", "n/a"];

function pythonBin(): string | null {
  for (const cmd of ["python3", "python"]) {
    if (spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0) return cmd;
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

type RunResult = { status: number | null; json: any; stdout: string; stderr: string };

function run(args: string[], root: string): RunResult {
  const r = spawnSync(PY, [SCRIPT, ...args, "--root", root, "--json"], { encoding: "utf-8" });
  const stdout = r.stdout ?? "";
  let json: any = null;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = null;
  }
  return { status: r.status, json, stdout, stderr: r.stderr ?? "" };
}

/** Un piano conforme minimo gia' presente in una colonna (senza passare dal tool). */
function seedPlan(root: string, column: string, stem: string, extra = ""): string {
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
      const r = run(["move", "--id", "9001-gate", "--to", "complete", "--comprehension", value], root);
      expect({ value, status: r.status }).toEqual({ value, status: 0 });
      expect(r.json?.verified).toBe(true);
      const dst = join(root, "complete", "9001-gate.md");
      expect({ value, exists: existsSync(dst) }).toEqual({ value, exists: true });
      const text = readFileSync(dst, "utf-8");
      expect({ value, has: text.includes(`comprehension: ${value}`) }).toEqual({ value, has: true });
    }
  });

  test("check segnala WARN missing-comprehension su un file qa privo della chiave (exit 0)", () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9001-gate");
    const r = run(["check"], root);
    expect(r.status).toBe(0);
    expect(r.json?.warnings?.map((w: any) => w.code)).toContain("missing-comprehension");
  });

  test("draft -> in-progress non richiede --comprehension", () => {
    const root = makeBoard();
    const r = run([
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
    ], root);
    expect(r.status).toBe(0);
    const m = run(["move", "--id", "9002-demo", "--to", "in-progress"], root);
    expect(m.status).toBe(0);
    expect(m.json?.verified).toBe(true);
    expect(existsSync(join(root, "in-progress", "9002-demo.md"))).toBe(true);
  });

  test("un valore --comprehension non valido e' rifiutato (exit non-zero, nessuno spostamento)", () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9001-gate");
    const r = run(["move", "--id", "9001-gate", "--to", "complete", "--comprehension", "bogus"], root);
    expect(r.status).not.toBe(0);
    expect(existsSync(join(root, "qa", "9001-gate.md"))).toBe(true);
    expect(existsSync(join(root, "complete", "9001-gate.md"))).toBe(false);
  });
});
