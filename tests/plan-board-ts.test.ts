import { describe, expect, test, afterAll } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * plugin/src/plan-board.ts — porta TypeScript del tool della board dei piani.
 *
 * Rispecchia 1:1 il contratto osservabile di tests/plan-board.test.ts (scripts/plan-board.py)
 * piu' quattro casi nuovi della migrazione: flag sconosciuto, --comprehension non valido
 * (exit 1, non 2), formato human di un check fallito, move su file CRLF.
 *
 * A differenza della suite python NON e' condizionato alla presenza di python: guida sempre
 * la CLI reale (`bun plugin/src/plan-board.ts`) con board usa-e-getta mkdtemp. Nessun caso
 * tocca la board reale del repo.
 */

const REPO_ROOT = join(import.meta.dir, "..");
const SCRIPT = join(REPO_ROOT, "plugin", "src", "plan-board.ts");
const COLUMNS = ["draft", "in-progress", "qa", "complete"] as const;

/** Data di calendario LOCALE (la cli usa la data locale, non `toISOString()` che e' UTC). */
const TODAY = (() => {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
})();

const BODY_OK = [
  "# Probe",
  "",
  "## Goal",
  "",
  "Esercitare la board dei piani.",
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
  "- bun test tests/plan-board-ts.test.ts",
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

/** Crea una board usa-e-getta con le quattro colonne e la registra per la pulizia finale. */
function makeBoard(): string {
  const root = mkdtempSync(join(tmpdir(), "pb-ts-board-"));
  for (const col of COLUMNS) mkdirSync(join(root, col), { recursive: true });
  boards.push(root);
  return root;
}

/** Scrive un body fuori dalla board (la board e' la sottocartella `plan/`). */
function writeBody(text: string): string {
  bodyCount += 1;
  const p = join(tmpdir(), `pb-ts-body-${process.pid}-${bodyCount}.md`);
  writeFileSync(p, text, "utf-8");
  return p;
}

type RunResult = { status: number | null; json: any; stdout: string; stderr: string };

function run(args: string[], root: string): RunResult {
  const r = spawnSync(process.execPath, [SCRIPT, ...args, "--root", root, "--json"], {
    encoding: "utf-8",
  });
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

describe("plan-board.ts — contratto check", () => {
  test("board vuota con le quattro colonne: ok, zero errori, zero warning", () => {
    const r = run(["check"], makeBoard());
    expect(r.status).toBe(0);
    expect(r.json?.ok).toBe(true);
    expect(r.json?.errors).toEqual([]);
    expect(r.json?.warnings).toEqual([]);
  });

  test("root inesistente: missing-root ed exit 1", () => {
    const r = run(["check"], join(tmpdir(), "pb-ts-board-does-not-exist"));
    expect(r.status).toBe(1);
    expect(r.json?.errors?.map((e: any) => e.code)).toContain("missing-root");
  });

  test("status diverso dalla cartella: status-folder-mismatch ed exit 1", () => {
    const root = makeBoard();
    const p = seedPlan(root, "qa", "0008-drift");
    writeFileSync(p, readFileSync(p, "utf-8").replace("status: qa", "status: draft"), "utf-8");
    const r = run(["check"], root);
    expect(r.status).toBe(1);
    expect(r.json?.errors?.map((e: any) => e.code)).toContain("status-folder-mismatch");
  });

  test("file legacy senza frontmatter: solo warning, exit 0", () => {
    const root = makeBoard();
    writeFileSync(join(root, "draft", "0007-legacy.md"), "# Legacy\n\nSenza frontmatter.\n", "utf-8");
    const r = run(["check"], root);
    expect(r.status).toBe(0);
    expect(r.json?.warnings?.map((w: any) => w.code)).toContain("legacy-no-frontmatter");
  });
});

describe("plan-board.ts — contratto new", () => {
  test("crea il piano e riscrive il frontmatter (verified: true)", () => {
    const root = makeBoard();
    const r = run([
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
      writeBody(BODY_OK),
    ], root);
    expect(r.status).toBe(0);
    expect(r.json?.action).toBe("new");
    expect(r.json?.verified).toBe(true);
    const dst = join(root, "draft", "9001-demo.md");
    expect(existsSync(dst)).toBe(true);
    const text = readFileSync(dst, "utf-8");
    expect(text.startsWith("---\nid: 9001-demo\n")).toBe(true);
    expect(text).toContain("status: draft");
    expect(text).toContain(`created: ${TODAY}`);
    expect(text).toContain("owner: plan-writer");
  });

  test("body senza una delle nove sezioni: body-incomplete, nessun file creato", () => {
    const root = makeBoard();
    const r = run([
      "new",
      "--id",
      "9002-broken",
      "--title",
      "Broken",
      "--owner",
      "plan-writer",
      "--executor",
      "developer-fixer",
      "--body",
      writeBody(BODY_OK.replace("## Verification", "## Verifica")),
    ], root);
    expect(r.status).toBe(1);
    expect(r.json?.code).toBe("body-incomplete");
    expect(r.json?.message).toContain("## Verification");
    expect(existsSync(join(root, "draft", "9002-broken.md"))).toBe(false);
  });

  test("id non slug-safe: bad-id", () => {
    const root = makeBoard();
    const r = run([
      "new",
      "--id",
      "9003 bad id",
      "--title",
      "Bad",
      "--owner",
      "plan-writer",
      "--executor",
      "developer-fixer",
      "--body",
      writeBody(BODY_OK),
    ], root);
    expect(r.status).toBe(1);
    expect(r.json?.code).toBe("bad-id");
  });

  test("id gia' presente come segmento iniziale di un altro piano: duplicate-id", () => {
    const root = makeBoard();
    seedPlan(root, "draft", "9001-alpha");
    const r = run([
      "new",
      "--id",
      "9001",
      "--title",
      "Duplicato",
      "--owner",
      "plan-writer",
      "--executor",
      "developer-fixer",
      "--body",
      writeBody(BODY_OK),
    ], root);
    expect(r.status).toBe(1);
    expect(r.json?.code).toBe("duplicate-id");
  });

  test("target gia' esistente nella stessa colonna: target-exists", () => {
    const root = makeBoard();
    seedPlan(root, "draft", "9005-same");
    const r = run([
      "new",
      "--id",
      "9005-same",
      "--title",
      "Duplicato",
      "--owner",
      "plan-writer",
      "--executor",
      "developer-fixer",
      "--body",
      writeBody(BODY_OK),
    ], root);
    expect(r.status).toBe(1);
    expect(r.json?.code).toBe("target-exists");
  });

  test("colonna di destinazione inesistente in new: bad-column, niente traceback", () => {
    const root = makeBoard();
    const r = run([
      "new",
      "--id",
      "9001-demo",
      "--title",
      "Demo",
      "--owner",
      "plan-writer",
      "--executor",
      "developer-fixer",
      "--column",
      "bogus",
      "--body",
      writeBody(BODY_OK),
    ], root);
    expect(r.status).toBe(1);
    expect(r.json?.code).toBe("bad-column");
  });
});

describe("plan-board.ts — contratto move", () => {
  test("draft -> in-progress: verified, status e updated riscritti, vecchio path rimosso", () => {
    const root = makeBoard();
    seedPlan(root, "draft", "9001-demo");
    const r = run(["move", "--id", "9001-demo", "--to", "in-progress"], root);
    expect(r.status).toBe(0);
    expect(r.json?.verified).toBe(true);
    expect(r.json?.from).toBe("draft");
    expect(r.json?.to).toBe("in-progress");
    const dst = join(root, "in-progress", "9001-demo.md");
    expect(existsSync(dst)).toBe(true);
    expect(existsSync(join(root, "draft", "9001-demo.md"))).toBe(false);
    const text = readFileSync(dst, "utf-8");
    expect(text).toContain("status: in-progress");
    expect(text).toContain(`updated: ${TODAY}`);
  });

  test("stessa colonna: already-in-column ed exit 1", () => {
    const root = makeBoard();
    seedPlan(root, "qa", "9001-demo");
    const r = run(["move", "--id", "9001-demo", "--to", "qa"], root);
    expect(r.status).toBe(1);
    expect(r.json?.code).toBe("already-in-column");
  });

  test("piano legacy senza frontmatter: legacy-requires-adopt, nessuno spostamento", () => {
    const root = makeBoard();
    writeFileSync(join(root, "qa", "0007-legacy.md"), "# Legacy\n", "utf-8");
    const r = run(["move", "--id", "0007-legacy", "--to", "complete"], root);
    expect(r.status).toBe(1);
    expect(r.json?.code).toBe("legacy-requires-adopt");
    expect(existsSync(join(root, "complete", "0007-legacy.md"))).toBe(false);
  });

  test("id presente in due colonne: plan-ambiguous, nessuno spostamento", () => {
    const root = makeBoard();
    seedPlan(root, "draft", "9002-alpha");
    seedPlan(root, "complete", "9002-beta");
    const r = run(["move", "--id", "9002", "--to", "qa"], root);
    expect(r.status).toBe(1);
    expect(r.json?.code).toBe("plan-ambiguous");
    expect(r.json?.message).toContain("9002-alpha.md");
    expect(r.json?.message).toContain("9002-beta.md");
    expect(existsSync(join(root, "qa", "9002-alpha.md"))).toBe(false);
  });

  test("id risolto dal solo segmento iniziale del nome file (id-aware find_plan)", () => {
    const root = makeBoard();
    seedPlan(root, "draft", "0006-branching-strategy");
    const r = run(["move", "--id", "0006", "--to", "qa"], root);
    expect(r.status).toBe(0);
    expect(r.json?.verified).toBe(true);
    expect(existsSync(join(root, "qa", "0006-branching-strategy.md"))).toBe(true);
  });

  test("colonna inesistente: bad-column ed exit 1", () => {
    const root = makeBoard();
    seedPlan(root, "draft", "9001-demo");
    const r = run(["move", "--id", "9001-demo", "--to", "bogus"], root);
    expect(r.status).toBe(1);
    expect(r.json?.code).toBe("bad-column");
  });
});

describe("plan-board.ts — contratto adopt", () => {
  test("file legacy: frontmatter creato, titolo dal primo heading, warning dichiarato", () => {
    const root = makeBoard();
    writeFileSync(join(root, "draft", "0009-adopt.md"), "# Nuovo titolo\n\nCorpo legacy.\n", "utf-8");
    const r = run([
      "adopt",
      "--file",
      "0009-adopt",
      "--owner",
      "plan-writer",
      "--executor",
      "developer-fixer",
    ], root);
    expect(r.status).toBe(0);
    expect(r.json?.action).toBe("adopt");
    expect(r.json?.verified).toBe(true);
    expect(r.json?.warnings?.map((w: any) => w.code)).toContain("derived-frontmatter");
    const text = readFileSync(join(root, "draft", "0009-adopt.md"), "utf-8");
    expect(text.startsWith("---\nid: 0009-adopt\n")).toBe(true);
    expect(text).toContain("title: Nuovo titolo");
    expect(text).toContain("status: draft");
    expect(text).toContain("# Nuovo titolo");
  });

  test("file gia' conforme: already-has-frontmatter, nessuna riscrittura", () => {
    const root = makeBoard();
    const p = seedPlan(root, "draft", "0010-conforme");
    const before = readFileSync(p, "utf-8");
    const r = run(["adopt", "--file", "0010-conforme", "--owner", "plan-writer", "--executor", "developer-fixer"], root);
    expect(r.status).toBe(1);
    expect(r.json?.code).toBe("already-has-frontmatter");
    expect(readFileSync(p, "utf-8")).toBe(before);
  });
});

describe("plan-board.ts — root predefinito", () => {
  test("--root omesso: la board e' 'plan' relativa alla cwd, non un path del manutentore", () => {
    const work = mkdtempSync(join(tmpdir(), "pb-ts-cwd-"));
    boards.push(work);
    const root = join(work, "plan");
    for (const col of COLUMNS) mkdirSync(join(root, col), { recursive: true });
    seedPlan(root, "draft", "9100-default");

    const r = spawnSync(process.execPath, [SCRIPT, "check", "--json"], { cwd: work, encoding: "utf-8" });
    const json = JSON.parse(r.stdout ?? "{}");
    expect(r.status).toBe(0);
    expect(json.plans?.draft?.map((p: any) => p.id)).toEqual(["9100-default"]);
  });
});

describe("plan-board.ts — deviazioni documentate dalla migrazione", () => {
  test("flag sconosciuto: bad-argument con exit 1 (non 2)", () => {
    const root = makeBoard();
    const r = run(["move", "--bogus", "--id", "9001", "--to", "qa"], root);
    expect(r.status).toBe(1);
    expect(r.json?.ok).toBe(false);
    expect(r.json?.code).toBe("bad-argument");
    expect(r.json?.message).toContain("--bogus");
  });

  test("--comprehension non valido: bad-argument con exit 1 (argparse uscirebbe con 2)", () => {
    const root = makeBoard();
    seedPlan(root, "draft", "9006-comp");
    const r = run(["move", "--id", "9006-comp", "--to", "qa", "--comprehension", "maybe"], root);
    expect(r.status).toBe(1);
    expect(r.json?.ok).toBe(false);
    expect(r.json?.code).toBe("bad-argument");
    expect(r.json?.message).toContain("maybe");
  });

  test("formato human di un check fallito: riga FAIL sola (come emit() del python) e righe ERROR", () => {
    const root = makeBoard();
    const p = seedPlan(root, "qa", "0011-human");
    writeFileSync(p, readFileSync(p, "utf-8").replace("status: qa", "status: draft"), "utf-8");
    const r = spawnSync(process.execPath, [SCRIPT, "check", "--root", root], { encoding: "utf-8" });
    expect(r.status).toBe(1);
    const lines = (r.stdout ?? "").split("\n");
    expect(lines[0]).toBe("FAIL");
    expect(r.stdout).toContain("  ERROR status-folder-mismatch  ");
    expect(r.stdout).not.toContain('"');
  });

  test("formato human di un fallimento con codice: riga FAIL <codice> <message> (come fail() del python)", () => {
    const root = makeBoard();
    seedPlan(root, "draft", "9007-code-line");
    const r = spawnSync(process.execPath, [SCRIPT, "move", "--id", "9007-code-line", "--to", "bogus", "--root", root], {
      encoding: "utf-8",
    });
    expect(r.status).toBe(1);
    expect((r.stdout ?? "").split("\n")[0]).toBe(
      "FAIL bad-column colonna 'bogus' non valida (usare: draft, in-progress, qa, complete)",
    );
  });

  test("move su file CRLF: preserva i fine riga e riscrive status/updated", () => {
    const root = makeBoard();
    const p = join(root, "draft", "9004-crlf.md");
    writeFileSync(
      p,
      "---\r\nid: 9004-crlf\r\ntitle: CRLF\r\nstatus: draft\r\ncreated: 2026-01-01\r\n" +
        "updated: 2026-01-01\r\nowner: plan-writer\r\nexecutor: developer-fixer\r\n---\r\n\r\n## Goal\r\n\r\nseed\r\n",
      "utf-8",
    );
    const r = run(["move", "--id", "9004-crlf", "--to", "in-progress"], root);
    expect(r.status).toBe(0);
    expect(r.json?.verified).toBe(true);
    const text = readFileSync(join(root, "in-progress", "9004-crlf.md"), "utf-8");
    expect(text.startsWith("---\r\nid: 9004-crlf\r\n")).toBe(true);
    expect(text).toContain("status: in-progress");
    expect(text).toContain(`updated: ${TODAY}`);
    expect(text).not.toContain("status: draft");
    expect(text).toContain("## Goal");
  });
});
