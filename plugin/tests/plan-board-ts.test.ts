import { afterAll, describe, expect, test } from "bun:test";
import {
  cpSync,
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
import { planBoardCli } from "../src/plan-board";

/**
 * Parita' `plugin/src/plan-board.ts` <-> `scripts/plan-board.py`.
 *
 * La porta TypeScript del tool della board deve riprodurre il contratto osservabile
 * dell'originale Python byte-per-byte: stesso exit code, stesso stdout (JSON o output
 * umano), stesso effetto sul filesystem (frontmatter `status`/`id`/`comprehension`).
 *
 * Ogni scenario mutante esegue i due tool su CLONE separati della fixture (la parita'
 * sorage/updated e' esclusa perche' contiene la data odierna); `check` (sola lectura)
 * esegue entrambi sullo stesso clone. Le stringhe con il path della board vengono
 * normalizzate prima del confronto (i due clone hanno path diversi).
 *
 * Interprete Python: `PB_PYTHON` se impostato, altrimenti `python3` o `python`; se
 * nessuno esiste i blocchi di parita' vengono saltati (mai fail).
 */

const REPO_ROOT = join(import.meta.dir, "..", "..");
const PY_SCRIPT = join(REPO_ROOT, "scripts", "plan-board.py");
const TS_SCRIPT = join(REPO_ROOT, "plugin", "src", "plan-board.ts");
const COLUMNS = ["draft", "in-progress", "qa", "complete"] as const;

function pythonBin(): string | null {
  for (const cmd of ["python3", "python"]) {
    if (spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0)
      return cmd;
  }
  return null;
}

const PY = process.env.PB_PYTHON ?? pythonBin() ?? "";
const maybe = PY ? describe : describe.skip;

/** Base per le board usa-e-getta: preferisce /tmp/opencode, ricade su tmpdir(). */
const BASE = (() => {
  try {
    mkdirSync("/tmp/opencode", { recursive: true });
    return "/tmp/opencode";
  } catch {
    return tmpdir();
  }
})();

const SEP9 = [
  "## Goal",
  "## Success Criteria",
  "## Scope",
  "## Safety",
  "## Inputs Available",
  "## Outputs Required",
  "## Test Plan",
  "## Verification",
  "## Notes / Edge Cases",
] as const;

function body(...sections: readonly string[]): string {
  const parts = ["# Body", ""];
  for (const s of SEP9) {
    if (sections.length > 0 && !sections.includes(s)) continue;
    parts.push(s, "", `- contenuto ${s}`, "");
  }
  return parts.join("\n");
}

const BODY_OK = body();
const BODY_BAD = body("## Verification"); // manca "## Test Plan" e "## Verification".

const disposables: string[] = [];

function mkdtemp(prefix: string): string {
  const dir = mkdtempSync(join(BASE, prefix));
  disposables.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// Fixture: board con piani conformi, un legacy, un body incompleto e una
// coppia duplicate-id; i cloni per scenario partono sempre da qui.
// ---------------------------------------------------------------------------

function writePlanFile(
  root: string,
  column: string,
  stem: string,
  text: string,
): void {
  writeFileSync(join(root, column, `${stem}.md`), text, "utf-8");
}

function seedPlan(
  root: string,
  column: string,
  stem: string,
  extra = "",
  extraKeys = "",
): void {
  const fm = [
    "id",
    "title",
    "status",
    "created",
    "updated",
    "owner",
    "executor",
  ]
    .map((k) =>
      k === "id" || k === "title"
        ? `${k}: ${stem}`
        : k === "status"
          ? `status: ${column}`
          : k === "created" || k === "updated"
            ? `${k}: 2026-01-01`
            : k === "owner"
              ? "owner: plan-writer"
              : "executor: developer-fixer",
    )
    .join("\n");
  writePlanFile(
    root,
    column,
    stem,
    `---\n${fm}\n${extraKeys}---\n\n${BODY_OK}`,
  );
}

function seedLegacy(
  root: string,
  column: string,
  stem: string,
  text?: string,
): void {
  writePlanFile(
    root,
    column,
    stem,
    text ?? `# ${stem}\n\nCorpo legacy senza frontmatter.\n`,
  );
}

function seedPartialBody(
  root: string,
  column: string,
  stem: string,
  drop: readonly string[],
): void {
  const fm = `id: ${stem}\ntitle: ${stem}\nstatus: ${column}\ncreated: 2026-01-01
updated: 2026-01-01\nowner: plan-writer\nexecutor: developer-fixer\n`;
  writePlanFile(root, column, stem, `---\n${fm}---\n\n${body(...drop)}`);
}

function buildFixture(): string {
  const root = mkdtemp("pbts-fx-");
  for (const col of COLUMNS) mkdirSync(join(root, col), { recursive: true });
  seedPlan(root, "draft", "2001-move");
  seedLegacy(root, "draft", "0007-legacy");
  seedPartialBody(root, "draft", "0008-partial", [
    "## Test Plan",
    "## Verification",
  ]);
  seedPlan(root, "draft", "1001-dup");
  writePlanFile(
    root,
    "draft",
    "1011-adopt-me",
    "# Titolo derivato\n\nCorpo legacy da normalizzare.\n",
  );
  seedPlan(root, "draft", "2010-good");
  seedPlan(root, "draft", "3001-slot");
  seedPlan(root, "qa", "1001-dup", "comprehension: pass\n");
  seedPlan(root, "qa", "2003-nocomp");
  return root;
}

let fixture: string | null = null;
function getFixture(): string {
  return (fixture ??= buildFixture());
}

function cloneBoard(): string {
  const root = mkdtemp("pbts-bd-");
  cpSync(getFixture(), root, { recursive: true });
  return root;
}

/** Scrittura puntuale dei file body per `new`, fuori dalle board. */
function bodyFile(text: string): string {
  const p = mkdtemp("pbts-body-");
  const file = join(p, "body.md");
  writeFileSync(file, text, "utf-8");
  return file;
}

// ---------------------------------------------------------------------------

type RunResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  json: any;
};

type RunOpts = { root?: string; cwd?: string; json?: boolean };

function rawArgs(args: readonly string[], opts: RunOpts): string[] {
  const out = [...args];
  if (opts.root !== undefined) out.push("--root", opts.root);
  if (opts.json !== false) out.push("--json");
  return out;
}

function parseJsonOr(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function runPy(args: readonly string[], opts: RunOpts = {}): RunResult {
  const r = spawnSync(PY, [PY_SCRIPT, ...rawArgs(args, opts)], {
    encoding: "utf-8",
    cwd: opts.cwd,
  });
  const stdout = r.stdout ?? "";
  return {
    status: r.status,
    stdout,
    stderr: r.stderr ?? "",
    json: parseJsonOr(stdout),
  };
}

function runTs(args: readonly string[], opts: RunOpts = {}): RunResult {
  const r = spawnSync(process.execPath, [TS_SCRIPT, ...rawArgs(args, opts)], {
    encoding: "utf-8",
    cwd: opts.cwd,
  });
  const stdout = r.stdout ?? "";
  return {
    status: r.status,
    stdout,
    stderr: r.stderr ?? "",
    json: parseJsonOr(stdout),
  };
}

/** Rimpiazza il path della board con un placeholder (i cloni hanno path diversi). */
function normText(s: string, roots: readonly string[]): string {
  let out = s;
  for (const r of roots) out = out.split(r).join("<BOARD>");
  return out;
}

/** Parita' byte-level di stdout (dopo le normalizzazioni del path) ed exit code. */
function expectParity(
  pyResult: RunResult,
  tsResult: RunResult,
  rootPy: string,
  rootTs: string,
): void {
  expect(normText(tsResult.stdout, [rootTs])).toBe(
    normText(pyResult.stdout, [rootPy]),
  );
  expect({ ts: tsResult.status }).toEqual({ ts: pyResult.status });
}

/** frontmatter sintetico di un piano su board: solo le chiavi paragonabili. */
function readFm(
  root: string,
  column: string,
  name: string,
): Record<string, string> {
  const text = readFileSync(join(root, column, name), "utf-8");
  expect(text.startsWith("---\n")).toBe(true);
  const fm: Record<string, string> = {};
  for (const line of text.slice(4).split("\n")) {
    if (line === "---") break;
    const i = line.indexOf(":");
    if (i === -1) continue;
    fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return {
    id: fm.id ?? "",
    status: fm.status ?? "",
    comprehension: fm.comprehension ?? "",
  };
}

afterAll(() => {
  for (const d of disposables) rmSync(d, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Parita' read-only: check (stesso clone per entrambi i tool)
// ---------------------------------------------------------------------------

maybe("parita' TS/Python — check", () => {
  test("check-su-board-conforme: exit 0, zero errori e zero warning", () => {
    const rootPy = mkdtemp("pbts-chk-");
    for (const col of COLUMNS)
      mkdirSync(join(rootPy, col), { recursive: true });
    seedPlan(rootPy, "draft", "2002-clean");
    const py = runPy(["check"], { root: rootPy });
    const ts = runTs(["check"], { root: rootPy });
    expectParity(py, ts, rootPy, rootPy);
    expect(ts.status).toBe(0);
    expect(ts.json?.errors).toEqual([]);
    expect(ts.json?.warnings).toEqual([]);
  });

  test("check-su-fixture: exit 1, duplicate-id, warning legacy/incomplete/qa", () => {
    const root = cloneBoard();
    const py = runPy(["check"], { root });
    const ts = runTs(["check"], { root });
    expectParity(py, ts, root, root);
    expect(ts.status).toBe(1);
    expect(ts.json?.errors?.map((e: any) => e.code)).toEqual(["duplicate-id"]);
    const warns: string[] = ts.json?.warnings?.map((w: any) => w.code);
    for (const code of [
      "legacy-no-frontmatter",
      "missing-section",
      "missing-comprehension",
    ]) {
      expect(warns).toContain(code);
    }
  });

  test("check-su-root-inesistente: missing-root, stesso payload", () => {
    const root = join(BASE, "pbts-nessuna-board");
    expect(existsSync(root)).toBe(false);
    const py = runPy(["check"], { root });
    const ts = runTs(["check"], { root });
    expectParity(py, ts, root, root);
    expect(ts.status).toBe(1);
    expect(ts.json?.errors?.map((e: any) => e.code)).toEqual(["missing-root"]);
  });

  test("check senza --json (modalita' umana): byte-level parity", () => {
    const root = cloneBoard();
    const py = runPy(["check"], { root, json: false });
    const ts = runTs(["check"], { root, json: false });
    expectParity(py, ts, root, root);
  });
});

// ---------------------------------------------------------------------------
// Parita' mutating: move (cloni separati per tool)
// ---------------------------------------------------------------------------

maybe("parita' TS/Python — move", () => {
  test("happy path draft->in-progress: payload + frontmatter riscritto", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    for (const root of [rootPy, rootTs]) {
      const before = readFm(root, "draft", "2001-move.md");
      expect(before.status).toBe("draft");
    }
    const py = runPy(["move", "--id", "2001-move", "--to", "in-progress"], {
      root: rootPy,
    });
    const ts = runTs(["move", "--id", "2001-move", "--to", "in-progress"], {
      root: rootTs,
    });
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.verified).toBe(true);
    for (const root of [rootPy, rootTs]) {
      expect(existsSync(join(root, "draft", "2001-move.md"))).toBe(false);
      const fm = readFm(root, "in-progress", "2001-move.md");
      expect(fm).toEqual({
        id: "2001-move",
        status: "in-progress",
        comprehension: "",
      });
    }
  });

  test("qa->complete senza --comprehension: exit 1, nessun cambio filesystem", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const py = runPy(["move", "--id", "2003-nocomp", "--to", "complete"], {
      root: rootPy,
    });
    const ts = runTs(["move", "--id", "2003-nocomp", "--to", "complete"], {
      root: rootTs,
    });
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.code).toBe("comprehension-unrecorded");
    for (const root of [rootPy, rootTs]) {
      expect(existsSync(join(root, "qa", "2003-nocomp.md"))).toBe(true);
      expect(existsSync(join(root, "complete", "2003-nocomp.md"))).toBe(false);
    }
    // (nessuna modifica al filesystem: il piano resta in qa)
  });

  test("qa->complete con --comprehension n/a: esito registrato nella move", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const py = runPy(
      [
        "move",
        "--id",
        "2003-nocomp",
        "--to",
        "complete",
        "--comprehension",
        "n/a",
      ],
      {
        root: rootPy,
      },
    );
    const ts = runTs(
      [
        "move",
        "--id",
        "2003-nocomp",
        "--to",
        "complete",
        "--comprehension",
        "n/a",
      ],
      {
        root: rootTs,
      },
    );
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.verified).toBe(true);
    for (const root of [rootPy, rootTs]) {
      const fm = readFm(root, "complete", "2003-nocomp.md");
      expect(fm).toEqual({
        id: "2003-nocomp",
        status: "complete",
        comprehension: "n/a",
      });
    }
  });

  test("stessa colonna: already-in-column", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const py = runPy(["move", "--id", "2003-nocomp", "--to", "qa"], {
      root: rootPy,
    });
    const ts = runTs(["move", "--id", "2003-nocomp", "--to", "qa"], {
      root: rootTs,
    });
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.code).toBe("already-in-column");
  });

  test("id ignoto: plan-not-found", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const py = runPy(["move", "--id", "nessuna-cosa-9999", "--to", "qa"], {
      root: rootPy,
    });
    const ts = runTs(["move", "--id", "nessuna-cosa-9999", "--to", "qa"], {
      root: rootTs,
    });
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.code).toBe("plan-not-found");
  });

  test("id ambiguo su due colonne: plan-ambiguous", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const py = runPy(["move", "--id", "1001", "--to", "qa"], { root: rootPy });
    const ts = runTs(["move", "--id", "1001", "--to", "qa"], { root: rootTs });
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.code).toBe("plan-ambiguous");
    expect(ts.json?.message).toContain("draft/1001-dup.md, qa/1001-dup.md");
  });

  test("piano legacy: legacy-requires-adopt", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const py = runPy(["move", "--id", "0007-legacy", "--to", "qa"], {
      root: rootPy,
    });
    const ts = runTs(["move", "--id", "0007-legacy", "--to", "qa"], {
      root: rootTs,
    });
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.code).toBe("legacy-requires-adopt");
    for (const root of [rootPy, rootTs]) {
      expect(existsSync(join(root, "draft", "0007-legacy.md"))).toBe(true);
    }
  });

  test("--dry-run: dry_run true, niente verified, filesystem intatto", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const py = runPy(
      ["move", "--id", "2001-move", "--to", "in-progress", "--dry-run"],
      {
        root: rootPy,
      },
    );
    const ts = runTs(
      ["move", "--id", "2001-move", "--to", "in-progress", "--dry-run"],
      {
        root: rootTs,
      },
    );
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.dry_run).toBe(true);
    expect(ts.json?.verified).toBeUndefined();
    for (const root of [rootPy, rootTs]) {
      expect(existsSync(join(root, "draft", "2001-move.md"))).toBe(true);
      expect(existsSync(join(root, "in-progress", "2001-move.md"))).toBe(false);
    }
  });

  test("colonna di destinazione invalida: bad-column ed exit 1 (non argparse 2)", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const py = runPy(["move", "--id", "2001-move", "--to", "bogus"], {
      root: rootPy,
    });
    const ts = runTs(["move", "--id", "2001-move", "--to", "bogus"], {
      root: rootTs,
    });
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.status).toBe(1);
    expect(ts.json?.code).toBe("bad-column");
  });
});

// ---------------------------------------------------------------------------
// Parita' mutating: new / adopt (cloni separati per tool)
// ---------------------------------------------------------------------------

maybe("parita' TS/Python — new", () => {
  test("creazione conforme: frontmatter+body scritti, verified true", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const body = bodyFile(BODY_OK);
    const py = runPy(
      [
        "new",
        "--id",
        "4001-new",
        "--title",
        "Demo",
        "--owner",
        "plan-writer",
        "--executor",
        "developer-fixer",
        "--body",
        body,
      ],
      { root: rootPy },
    );
    const ts = runTs(
      [
        "new",
        "--id",
        "4001-new",
        "--title",
        "Demo",
        "--owner",
        "plan-writer",
        "--executor",
        "developer-fixer",
        "--body",
        body,
      ],
      { root: rootTs },
    );
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.verified).toBe(true);
    for (const root of [rootPy, rootTs]) {
      const fm = readFm(root, "draft", "4001-new.md");
      expect(fm.id).toBe("4001-new");
      expect(fm.status).toBe("draft");
      expect(
        readFileSync(join(root, "draft", "4001-new.md"), "utf-8"),
      ).toContain("- contenuto ## Notes / Edge Cases");
    }
  });

  test("body incompleto: body-incomplete, niente file", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const file = bodyFile(BODY_BAD);
    const py = runPy(
      [
        "new",
        "--id",
        "4002-broken",
        "--title",
        "B",
        "--owner",
        "o",
        "--executor",
        "e",
        "--body",
        file,
      ],
      { root: rootPy },
    );
    const ts = runTs(
      [
        "new",
        "--id",
        "4002-broken",
        "--title",
        "B",
        "--owner",
        "o",
        "--executor",
        "e",
        "--body",
        file,
      ],
      { root: rootTs },
    );
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.code).toBe("body-incomplete");
    expect(ts.json?.message).toContain("## Test Plan");
    for (const root of [rootPy, rootTs]) {
      expect(existsSync(join(root, "draft", "4002-broken.md"))).toBe(false);
    }
  });

  test("id gia' presente: duplicate-id", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const file = bodyFile(BODY_OK);
    const common = [
      "--title",
      "D",
      "--owner",
      "o",
      "--executor",
      "e",
      "--body",
      file,
    ];
    const py = runPy(["new", "--id", "2001", ...common], { root: rootPy });
    const ts = runTs(["new", "--id", "2001", ...common], { root: rootTs });
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.code).toBe("duplicate-id");
  });

  test("target gia' esistente: target-exists", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const file = bodyFile(BODY_OK);
    const common = [
      "--title",
      "D",
      "--owner",
      "o",
      "--executor",
      "e",
      "--body",
      file,
    ];
    const py = runPy(["new", "--id", "3001-slot", ...common], { root: rootPy });
    const ts = runTs(["new", "--id", "3001-slot", ...common], { root: rootTs });
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.code).toBe("target-exists");
  });

  test("--column invalido: bad-column", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const file = bodyFile(BODY_OK);
    const common = [
      "--title",
      "D",
      "--owner",
      "o",
      "--executor",
      "e",
      "--body",
      file,
    ];
    const py = runPy(
      ["new", "--id", "4003-x", "--column", "bogus", ...common],
      { root: rootPy },
    );
    const ts = runTs(
      ["new", "--id", "4003-x", "--column", "bogus", ...common],
      { root: rootTs },
    );
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.status).toBe(1);
    expect(ts.json?.code).toBe("bad-column");
  });

  test("--dry-run su new: payload dry_run true, nessun file", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const file = bodyFile(BODY_OK);
    const common = [
      "--title",
      "D",
      "--owner",
      "o",
      "--executor",
      "e",
      "--body",
      file,
      "--dry-run",
    ];
    const py = runPy(["new", "--id", "4004-dry", ...common], { root: rootPy });
    const ts = runTs(["new", "--id", "4004-dry", ...common], { root: rootTs });
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.dry_run).toBe(true);
    expect(ts.json?.verified).toBeUndefined();
    for (const root of [rootPy, rootTs]) {
      expect(existsSync(join(root, "draft", "4004-dry.md"))).toBe(false);
    }
  });
});

maybe("parita' TS/Python — adopt", () => {
  test("file legacy: frontmatter derivato + warning, titolo dal primo heading", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const py = runPy(
      ["adopt", "--file", "1011-adopt-me", "--owner", "o", "--executor", "e"],
      {
        root: rootPy,
      },
    );
    const ts = runTs(
      ["adopt", "--file", "1011-adopt-me", "--owner", "o", "--executor", "e"],
      {
        root: rootTs,
      },
    );
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.warnings?.map((w: any) => w.code)).toEqual([
      "derived-frontmatter",
    ]);
    for (const root of [rootPy, rootTs]) {
      const fm = readFm(root, "draft", "1011-adopt-me.md");
      expect(fm.id).toBe("1011-adopt-me");
      expect(fm.status).toBe("draft");
      const text = readFileSync(
        join(root, "draft", "1011-adopt-me.md"),
        "utf-8",
      );
      expect(text).toContain("title: Titolo derivato");
    }
  });

  test("file gia' conforme: already-has-frontmatter, nessuna riscrittura", () => {
    const rootPy = cloneBoard();
    const rootTs = cloneBoard();
    const py = runPy(
      ["adopt", "--file", "2010-good", "--owner", "o", "--executor", "e"],
      { root: rootPy },
    );
    const ts = runTs(
      ["adopt", "--file", "2010-good", "--owner", "o", "--executor", "e"],
      { root: rootTs },
    );
    expectParity(py, ts, rootPy, rootTs);
    expect(ts.json?.code).toBe("already-has-frontmatter");
    for (const root of [rootPy, rootTs]) {
      expect(readFm(root, "draft", "2010-good.md")).toEqual({
        id: "2010-good",
        status: "draft",
        comprehension: "",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Parita' argparse: rifiuti di sintassi -> exit 2, stdout vuoto (empirico)
// ---------------------------------------------------------------------------

maybe("parita' TS/Python — argparse exit 2", () => {
  test("sottocomando invalido", () => {
    const py = runPy(["frobnicate"]);
    const ts = runTs(["frobnicate"]);
    expectParity(py, ts, "", "");
    expect(ts.status).toBe(2);
    expect(ts.stdout).toBe("");
    expect(ts.stderr).toContain("invalid choice");
  });

  test("nessun sottocomando", () => {
    const py = runPy([]);
    const ts = runTs([]);
    expectParity(py, ts, "", "");
    expect(ts.status).toBe(2);
    expect(ts.stdout).toBe("");
  });

  test("move senza --id", () => {
    const py = runPy(["move", "--to", "qa"]);
    const ts = runTs(["move", "--to", "qa"]);
    expectParity(py, ts, "", "");
    expect(ts.status).toBe(2);
    expect(ts.stdout).toBe("");
  });

  test("--comprehension fuori dall'enum", () => {
    const py = runPy([
      "move",
      "--id",
      "x",
      "--to",
      "complete",
      "--comprehension",
      "bogus",
    ]);
    const ts = runTs([
      "move",
      "--id",
      "x",
      "--to",
      "complete",
      "--comprehension",
      "bogus",
    ]);
    expectParity(py, ts, "", "");
    expect(ts.status).toBe(2);
    expect(ts.stdout).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Parita' root predefinita (cwd relativa, niente --root)
// ---------------------------------------------------------------------------

maybe("parita' TS/Python — root predefinita", () => {
  test("check --json con cwd = directory di lavoro: root 'plan'", () => {
    for (const tag of ["pbts-cwd-py", "pbts-cwd-ts"]) {
      const work = mkdtemp(tag);
      const root = join(work, "plan");
      for (const col of COLUMNS)
        mkdirSync(join(root, col), { recursive: true });
      seedPlan(root, "draft", "9100-default");
    }
    const roots = disposables.filter(
      (d) => d.includes("pbts-cwd-py") || d.includes("pbts-cwd-ts"),
    );
    const [workPy, workTs] = roots;
    const py = runPy(["check"], { cwd: workPy });
    const ts = runTs(["check"], { cwd: workTs });
    expectParity(py, ts, workPy, workTs);
    expect(ts.status).toBe(0);
    expect(py.json?.root).toBe("plan");
    expect(py.json?.plans?.draft?.[0]?.id).toBe("9100-default");
  });
});

// ---------------------------------------------------------------------------
// Solo TS: rifiuti e API in-process (python NON richiesto)
// ---------------------------------------------------------------------------

describe("planBoardCli (solo TS) — argparse-style", () => {
  test("sottocomando invalido -> exit 2, stdout vuoto", () => {
    expect(planBoardCli(["frobnicate"])).toEqual({ stdout: "", code: 2 });
  });

  test("move senza --id -> exit 2", () => {
    expect(planBoardCli(["move", "--to", "qa"])).toEqual({
      stdout: "",
      code: 2,
    });
  });

  test("--comprehension fuori enum -> exit 2", () => {
    expect(
      planBoardCli([
        "move",
        "--id",
        "x",
        "--to",
        "complete",
        "--comprehension",
        "bogus",
      ]),
    ).toEqual({ stdout: "", code: 2 });
  });
});

describe("planBoardCli (solo TS) — contratto di ritorno", () => {
  test("check su root inesistente: JSON payload con missing-root, exit 1", () => {
    const root = join(BASE, "pbts-ts-solo-nessuna");
    const r = planBoardCli(["check", "--root", root, "--json"]);
    expect(r.code).toBe(1);
    const payload = JSON.parse(r.stdout);
    expect(payload.ok).toBe(false);
    expect(payload.action).toBe("check");
    expect(payload.errors[0].code).toBe("missing-root");
  });

  test("move happy path su clone della fixture: verified + filesystem", () => {
    const root = cloneBoard();
    const r = planBoardCli([
      "move",
      "--id",
      "2001-move",
      "--to",
      "in-progress",
      "--root",
      root,
      "--json",
    ]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).verified).toBe(true);
    expect(existsSync(join(root, "draft", "2001-move.md"))).toBe(false);
  });
});

describe("entry CLI bundariano (solo TS) — bun plugin/src/plan-board.ts", () => {
  test("il subprocess ricalca planBoardCli per exit code e stdout", () => {
    const root = cloneBoard();
    const direct = planBoardCli([
      "move",
      "--id",
      "2010-good",
      "--to",
      "qa",
      "--root",
      root,
      "--json",
      "--dry-run",
    ]);
    const viaEntry = runTs(
      ["move", "--id", "2010-good", "--to", "qa", "--dry-run"],
      { root },
    );
    expect(viaEntry.status).toBe(direct.code);
    expect(viaEntry.stdout).toBe(direct.stdout);
  });
});

describe("plugin/src/plan-board.ts — zero dipendenze", () => {
  test("importa solo builtin node: (nessuna dipendenza npm)", () => {
    const src = readFileSync(TS_SCRIPT, "utf-8");
    const imports = [...src.matchAll(/(?:from\s+|require\()\s*"([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(imports.length).toBeGreaterThan(0);
    for (const spec of imports) {
      expect(spec.startsWith("node:")).toBe(true);
    }
  });
});
