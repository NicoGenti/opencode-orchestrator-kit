/**
 * plan-board.ts — porta TypeScript dei piani Kanban (draft/in-progress/qa/complete).
 *
 * Parita' osservabile con `scripts/plan-board.py` (libreria std, fonte autoritativa):
 * stessi subcomandi, stessi payload JSON (stessi codici, stessi messaggi, stesso ordine
 * delle chiavi), stesso formato human di `emit()`, stesso effetto sul filesystem.
 *
 * Contratto (AGENTS.md "Plan Board Lifecycle & Owner Contract"): unico modo autorizzato
 * per creare, spostare e normalizzare i file di piano. `runPlanBoard(argv)` e' puro:
 * non scrive su stdout/stderr, non esce, non lancia (ogni fallimento ritorna un payload
 * {ok:false, code, message} — nessun `action` key su un payload di fallimento).
 *
 * Deviazioni documentate dal python (argparse uscirebbe con exit 2 o traceback):
 *  - errori di argomento (subcomando/flag sconosciuto, flag richiesto assente, valore non
 *    ammesso) -> codici `missing-argument`/`bad-argument`, exit 1;
 *  - `move`/`new` non dry-run con colonna di destinazione assente su disco -> `missing-column`
 *    (python traceback), exit 1;
 *  - eccezione inattesa -> payload {ok:false, code:"internal-error"}, exit 1: il tool non lancia mai.
 *
 * Il formato human e' byte-identico a `emit()`: "ok" su un payload ok, "FAIL <code> <message>"
 * solo per i payload di fallimento che portano il codice, la riga "FAIL" per un payload di
 * `check` (che non ha chiave `code`), poi le righe ERROR/WARN.
 *
 * Exit code: 0 se ok (i warning da soli non fanno fallire), 1 per ogni errore bloccante.
 * Si esegue con `bun plugin/src/plan-board.ts <subcommand> [flags]`; `--json` salva il
 * payload JSON su stdout; senza `--json` gli errori di argomento aggiungono sullo stderr
 * un hint d'uso di una riga. Dipendenze: solo node:fs + node:path.
 */
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const COLUMNS = ["draft", "in-progress", "qa", "complete"] as const;
type Column = (typeof COLUMNS)[number];

const SECTIONS = [
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

const FM_KEYS = ["id", "title", "status", "created", "updated", "owner", "executor"] as const;

const COMPREHENSION_VALUES = ["none", "pass", "skipped", "fail", "disabled", "n/a"] as const;

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Stessa regex del python: `^---\r?\n(.*?)\r?\n---\r?\n?` in DOTALL. */
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n)?/;

type Command = "check" | "move" | "new" | "adopt";

type Payload = Record<string, unknown>;

type PlanBoardResult = { ok: boolean; asJson: boolean; payload: Payload };

type Hit = { column: string; name: string };

/** Item su check: `file` e' il path pieno su errori/warning, mentre su `duplicate-id` e' l'id. */
type Item = { file: string; code: string; message: string };

type Inspected = {
  findings: Array<{ severity: "ERROR" | "WARN"; code: string; message: string }>;
  fm: Map<string, string> | null;
};

const USAGE = [
  "uso: bun plugin/src/plan-board.ts <check|move|new|adopt> [flag]",
  "",
  "  check [--root DIR] [--json]",
  "  move  --id ID --to COL [--comprehension V] [--dry-run] [--root DIR] [--json]",
  "  new   --id ID --title T --owner O --executor E --body FILE [--column COL] [--dry-run] [--root DIR] [--json]",
  "  adopt --file NAME [--owner O] [--executor E] [--dry-run] [--root DIR] [--json]",
].join("\n");

const USAGE_HINT = "uso: bun plugin/src/plan-board.ts <check|move|new|adopt> [flag] (vedi --help)";

function isColumn(value: string): value is Column {
  return (COLUMNS as readonly string[]).includes(value);
}

/** Ordine per code-unit (< / > plain, NON localeCompare — identico a sorted() del python). */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Data di calendario LOCALE (python date.today().isoformat()), "YYYY-MM-DD". */
function today(): string {
  const d = new Date();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/** Regola del kit: `id` e' il segmento iniziale dello stem del file. */
function idMatches(planId: string, stem: string): boolean {
  return planId !== "" && (stem === planId || stem.startsWith(planId + "-"));
}

function stemOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(0, i) : name;
}

function suffixOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i) : "";
}

function isFileAt(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    // file/symlink mancante o non leggibile: come Path.is_file() in python, falso
    return false;
  }
}

function isDirAt(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    // path mancante: come Path.is_dir() in python, falso
    return false;
  }
}

/**
 * Ritorna (frontmatter | null, body). null = file legacy senza frontmatter.
 * Chiave/valore divisi dal primo ':', righe vuote/commenti/senza ':' saltate,
 * valore = testo prima del primo '#', con trim.
 */
function splitFrontmatter(text: string): { fm: Map<string, string> | null; body: string } {
  if (!text.startsWith("---")) return { fm: null, body: text };
  const m = FM_RE.exec(text);
  if (!m) return { fm: null, body: text };
  const fm = new Map<string, string>();
  for (const line of m[1].split(/\r\n|\r|\n/)) {
    if (line.trim() === "" || line.trimStart().startsWith("#") || !line.includes(":")) continue;
    const colon = line.indexOf(":");
    fm.set(line.slice(0, colon).trim(), line.slice(colon + 1).split("#")[0].trim());
  }
  return { fm, body: text.slice(m[0].length) };
}

/** Prima `id,title,status,created,updated,owner,executor`, poi le restanti in ordine crescente. */
function renderFrontmatter(fm: Map<string, string>, newline = "\n"): string {
  const keys: string[] = [];
  for (const k of FM_KEYS) if (fm.has(k)) keys.push(k);
  const extras: string[] = [];
  for (const k of fm.keys()) if (!(FM_KEYS as readonly string[]).includes(k)) extras.push(k);
  extras.sort(cmp);
  keys.push(...extras);
  return "---" + newline + keys.map((k) => `${k}: ${fm.get(k) ?? ""}`).join(newline) + newline + "---" + newline;
}

/** Solo il livello piu' alto di ogni colonna: file reali (symlink seguiti), senza `.gitkeep`, per nome. */
function boardFiles(root: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const col of COLUMNS) {
    let names: string[] = [];
    try {
      names = readdirSync(join(root, col))
        .filter((name) => name !== ".gitkeep" && isFileAt(join(root, col, name)))
        .sort(cmp);
    } catch {
      // directory assente: come nel python, glob su directory mancante non produce nulla
    }
    out[col] = names;
  }
  return out;
}

/** Risolve un piano per stem esatto o per id iniziale (`<id>-<slug>.md`), spogliando un eventuale `.md`. */
function findPlan(root: string, ident: string): Hit[] {
  const id = ident.endsWith(".md") ? ident.slice(0, -3) : ident;
  const hits: Hit[] = [];
  const files = boardFiles(root);
  for (const col of COLUMNS) {
    for (const name of files[col]) {
      const stem = stemOf(name);
      if (stem === id || stem.startsWith(id + "-")) hits.push({ column: col, name });
    }
  }
  return hits;
}

function inspectFile(root: string, column: string, name: string): Inspected {
  const path = join(root, column, name);
  const findings: Inspected["findings"] = [];
  const { fm, body } = splitFrontmatter(readFileSync(path, "utf-8"));
  if (fm === null) {
    findings.push({
      severity: "WARN",
      code: "legacy-no-frontmatter",
      message: "file legacy senza frontmatter YAML: normalizzalo con `adopt`",
    });
    return { findings, fm: null };
  }
  const stem = stemOf(name);
  const pid = fm.get("id") ?? "";
  if (pid === "") {
    findings.push({ severity: "ERROR", code: "missing-id", message: "frontmatter senza `id`" });
  } else if (!idMatches(pid, stem)) {
    findings.push({
      severity: "ERROR",
      code: "id-filename-mismatch",
      message: `id '${pid}' non e' il segmento iniziale del nome file '${name}'`,
    });
  }
  const status = fm.get("status") ?? "";
  if (status !== column) {
    findings.push({
      severity: "ERROR",
      code: "status-folder-mismatch",
      message: `status '${status}' non corrisponde alla cartella '${column}'`,
    });
  }
  if (!ID_RE.test(pid || "x")) {
    findings.push({ severity: "ERROR", code: "id-not-slug-safe", message: `id '${pid}' non slug-safe` });
  }
  for (const section of SECTIONS) {
    if (!body.includes(section)) {
      findings.push({ severity: "WARN", code: "missing-section", message: `sezione mancante: ${section}` });
    }
  }
  for (const key of ["title", "created", "updated", "owner", "executor"] as const) {
    if ((fm.get(key) ?? "") === "") {
      findings.push({
        severity: "WARN",
        code: "missing-frontmatter-key",
        message: `chiave frontmatter mancante: ${key}`,
      });
    }
  }
  if ((column === "qa" || column === "complete") && !fm.has("comprehension")) {
    findings.push({
      severity: "WARN",
      code: "missing-comprehension",
      message: "nessun esito di comprensione registrato (chiave `comprehension` assente)",
    });
  }
  return { findings, fm };
}

function failPayload(code: string, message: string): Payload {
  return { ok: false, code, message };
}

type PlanEntry = { file: string; id: string; status: string; comprehension: string };

function cmdCheck(root: string): Payload {
  const errors: Item[] = [];
  const warnings: Item[] = [];
  const plans: Record<Column, PlanEntry[]> = { draft: [], "in-progress": [], qa: [], complete: [] };
  const seen = new Map<string, string[]>();
  const rootExists = isDirAt(root);
  if (!rootExists) {
    errors.push({
      file: root,
      code: "missing-root",
      message: "root della board inesistente: nessun piano verificabile",
    });
  }
  const files = boardFiles(root);
  for (const col of COLUMNS) {
    const columnDir = join(root, col);
    if (rootExists && !isDirAt(columnDir)) {
      warnings.push({ file: columnDir, code: "missing-column", message: `colonna mancante: ${col}` });
    }
    for (const name of files[col]) {
      const path = join(root, col, name);
      if (suffixOf(name).toLowerCase() !== ".md") {
        warnings.push({ file: path, code: "unexpected-file", message: "file non .md presente in una colonna" });
        continue;
      }
      const inspected = inspectFile(root, col, name);
      const fm = inspected.fm;
      plans[col].push({
        file: name,
        id: fm?.get("id") ?? "",
        status: fm?.get("status") ?? "",
        comprehension: fm?.get("comprehension") ?? "",
      });
      const pid = fm === null ? "" : (fm.get("id") ?? "");
      if (pid !== "") {
        const acc = seen.get(pid) ?? [];
        acc.push(path);
        seen.set(pid, acc);
      }
      for (const finding of inspected.findings) {
        const item: Item = { file: path, code: finding.code, message: finding.message };
        (finding.severity === "ERROR" ? errors : warnings).push(item);
      }
    }
  }
  for (const pid of Array.from(seen.keys()).sort(cmp)) {
    const paths = seen.get(pid) ?? [];
    if (paths.length > 1) {
      errors.push({
        file: pid,
        code: "duplicate-id",
        message: "id presente in piu' colonne: " + paths.join(", "),
      });
    }
  }
  const payload: Payload = { ok: errors.length === 0, action: "check", root, errors, warnings, plans };
  return payload;
}

function updateStatus(path: string, fm: Map<string, string>, status: string, comprehension: string | null): string {
  const text = readFileSync(path, "utf-8");
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const { body } = splitFrontmatter(text);
  const updated = new Map(fm);
  updated.set("status", status);
  updated.set("updated", today());
  if (comprehension !== null) updated.set("comprehension", comprehension);
  return renderFrontmatter(updated, newline) + body;
}

function cmdMove(root: string, ident: string, to: string, dryRun: boolean, comprehension: string | null): Payload {
  if (!isColumn(to)) {
    return failPayload("bad-column", `colonna '${to}' non valida (usare: ${COLUMNS.join(", ")})`);
  }
  const hits = findPlan(root, ident);
  if (hits.length === 0) {
    return failPayload("plan-not-found", `nessun piano '${ident}' nelle colonne di ${root}`);
  }
  if (hits.length > 1) {
    return failPayload(
      "plan-ambiguous",
      `'${ident}' presente in piu' colonne: ` + hits.map((h) => `${h.column}/${h.name}`).join(", "),
    );
  }
  const hit = hits[0];
  const srcPath = join(root, hit.column, hit.name);
  const stem = stemOf(hit.name);
  if (hit.column === to) {
    return failPayload("already-in-column", `'${hit.name}' e' gia' in '${to}'`);
  }
  const { fm } = splitFrontmatter(readFileSync(srcPath, "utf-8"));
  if (fm === null) {
    return failPayload("legacy-requires-adopt", `'${hit.name}' non ha frontmatter: esegui prima \`adopt\``);
  }
  if (!idMatches(fm.get("id") ?? "", stem)) {
    // python: fm.get("id") interpolato; senza chiave id stampa "None"
    const planId = fm.has("id") ? (fm.get("id") ?? "") : "None";
    return failPayload(
      "id-filename-mismatch",
      `id '${planId}' non e' il segmento iniziale del nome file '${hit.name}': move rifiutata`,
    );
  }
  const dstPath = join(root, to, hit.name);
  if (existsSync(dstPath)) {
    return failPayload("target-exists", `${dstPath} esiste gia'`);
  }
  if (to === "complete" && comprehension === null) {
    return failPayload(
      "comprehension-unrecorded",
      "move to complete requires --comprehension <none|pass|skipped|fail|disabled|n/a>: " +
        "record the announced comprehension outcome",
    );
  }
  if (!dryRun && !isDirAt(join(root, to))) {
    // deviazione dal python: colonna assente non fa esplodere la write con un traceback
    return failPayload("missing-column", `colonna mancante: ${to}`);
  }
  const payload: Payload = {
    ok: true,
    action: "move",
    id: stem,
    from: hit.column,
    to,
    path: dstPath,
    dry_run: dryRun,
  };
  if (!dryRun) {
    writeFileSync(srcPath, updateStatus(srcPath, fm, to, comprehension), "utf-8");
    renameSync(srcPath, dstPath);
    payload["verified"] = isFileAt(dstPath) && !existsSync(srcPath);
  }
  return payload;
}

function cmdNew(
  root: string,
  ident: string,
  title: string,
  owner: string,
  executor: string,
  bodyFile: string,
  column: string,
  dryRun: boolean,
): Payload {
  if (!isColumn(column)) {
    return failPayload("bad-column", `colonna '${column}' non valida`);
  }
  if (!ID_RE.test(ident)) {
    return failPayload("bad-id", `id '${ident}' non slug-safe (ammessi [A-Za-z0-9._-])`);
  }
  if (!isFileAt(bodyFile)) {
    return failPayload("body-missing", `body file non trovato: ${bodyFile}`);
  }
  const body = readFileSync(bodyFile, "utf-8");
  const missing = (SECTIONS as readonly string[]).filter((section) => !body.includes(section));
  if (missing.length > 0) {
    return failPayload("body-incomplete", "sezioni mancanti nel body: " + missing.join(", "));
  }
  const dstPath = join(root, column, `${ident}.md`);
  if (existsSync(dstPath)) {
    return failPayload("target-exists", `${dstPath} esiste gia'`);
  }
  const dup = findPlan(root, ident);
  if (dup.length > 0) {
    return failPayload("duplicate-id", `'${ident}' esiste gia' in ${dup[0].column}`);
  }
  if (!dryRun && !isDirAt(join(root, column))) {
    // deviazione dal python: colonna assente non fa esplodere la write con un traceback
    return failPayload("missing-column", `colonna mancante: ${column}`);
  }
  const fm = new Map<string, string>([
    ["id", ident],
    ["title", title],
    ["status", column],
    ["created", today()],
    ["updated", today()],
    ["owner", owner],
    ["executor", executor],
  ]);
  const payload: Payload = {
    ok: true,
    action: "new",
    id: ident,
    column,
    path: dstPath,
    dry_run: dryRun,
  };
  if (!dryRun) {
    writeFileSync(dstPath, renderFrontmatter(fm) + "\n" + body.replace(/^\n+/, ""), "utf-8");
    payload["verified"] = isFileAt(dstPath);
  }
  return payload;
}

function cmdAdopt(root: string, name: string, owner: string, executor: string, dryRun: boolean): Payload {
  const hits = findPlan(root, name);
  if (hits.length === 0) {
    return failPayload("plan-not-found", `nessun piano '${name}' nelle colonne di ${root}`);
  }
  if (hits.length > 1) {
    return failPayload("plan-ambiguous", `'${name}' presente in piu' colonne`);
  }
  const hit = hits[0];
  const path = join(root, hit.column, hit.name);
  const { fm, body } = splitFrontmatter(readFileSync(path, "utf-8"));
  if (fm !== null) {
    return failPayload("already-has-frontmatter", `'${hit.name}' ha gia' un frontmatter`);
  }
  const stem = stemOf(hit.name);
  if (!ID_RE.test(stem)) {
    return failPayload("bad-id", `nome file '${stem}' non slug-safe`);
  }
  let title = stem;
  for (const line of body.split(/\r\n|\r|\n/)) {
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
      break;
    }
  }
  const derived = new Map<string, string>([
    ["id", stem],
    ["title", title],
    ["status", hit.column],
    ["created", today()],
    ["updated", today()],
    ["owner", owner],
    ["executor", executor],
  ]);
  const payload: Payload = {
    ok: true,
    action: "adopt",
    id: stem,
    column: hit.column,
    path,
    dry_run: dryRun,
    warnings: [
      {
        file: path,
        code: "derived-frontmatter",
        message: "title/owner/executor dedotti: verifica il frontmatter dopo l'adopt",
      },
    ],
  };
  if (!dryRun) {
    writeFileSync(path, renderFrontmatter(derived) + "\n" + body.replace(/^\n+/, ""), "utf-8");
    payload["verified"] = splitFrontmatter(readFileSync(path, "utf-8")).fm !== null;
  }
  return payload;
}

/** Flag che consumano il token successivo, per subcomando. */
const VALUE_FLAGS: Record<Command, readonly string[]> = {
  check: ["root"],
  move: ["id", "to", "comprehension", "root"],
  new: ["id", "title", "owner", "executor", "body", "column", "root"],
  adopt: ["file", "owner", "executor", "root"],
};

const BOOLEAN_FLAGS: Record<Command, readonly string[]> = {
  check: [],
  move: ["dry-run"],
  new: ["dry-run"],
  adopt: ["dry-run"],
};

const REQUIRED_FLAGS: Record<Command, readonly string[]> = {
  check: [],
  move: ["id", "to"],
  new: ["id", "title", "owner", "executor", "body"],
  adopt: ["file"],
};

type ParseError = { code: "bad-argument" | "missing-argument"; message: string };
type Parsed = { values: Map<string, string>; error?: ParseError };

/**
 * Analizza `--flag valore` e i flag booleani; i flag possono seguire in qualunque
 * ordine e ripetersi (vince l'ultimo). `--json` e' globale e non passa da qui.
 */
function parseCommandArgs(command: Command, tokens: string[]): Parsed {
  const values = new Map<string, string>();
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.startsWith("--") && token.length > 2) {
      const name = token.slice(2);
      if (name === "json") {
        i += 1;
        continue;
      }
      if ((BOOLEAN_FLAGS[command] as readonly string[]).includes(name)) {
        values.set(name, "");
        i += 1;
        continue;
      }
      if ((VALUE_FLAGS[command] as readonly string[]).includes(name)) {
        if (i + 1 >= tokens.length) {
          return { values, error: { code: "missing-argument", message: `valore mancante per il flag '--${name}'` } };
        }
        values.set(name, tokens[i + 1]);
        i += 2;
        continue;
      }
      return { values, error: { code: "bad-argument", message: `flag non riconosciuto: '${token}'` } };
    }
    return { values, error: { code: "bad-argument", message: `argomento non riconosciuto: '${token}'` } };
  }
  for (const required of REQUIRED_FLAGS[command]) {
    if (!values.has(required)) {
      return {
        values,
        error: {
          code: "missing-argument",
          message: `flag '--${required}' richiesto per il comando '${command}'`,
        },
      };
    }
  }
  if (command === "move") {
    const comprehension = values.get("comprehension");
    if (comprehension !== undefined && !(COMPREHENSION_VALUES as readonly string[]).includes(comprehension)) {
      return {
        values,
        error: {
          code: "bad-argument",
          message: `valore '--comprehension' non valido: '${comprehension}' (scelte: ${COMPREHENSION_VALUES.join(", ")})`,
        },
      };
    }
  }
  return { values };
}

function runPlanBoardInner(argv: string[]): PlanBoardResult {
  const asJson = argv.includes("--json");
  if (argv.length === 0) {
    return {
      ok: false,
      asJson,
      payload: failPayload("missing-argument", "nessun comando: usare check|move|new|adopt (vedi --help)"),
    };
  }
  const first = argv[0] as string;
  if (first === "--help" || first === "-h") {
    return { ok: true, asJson, payload: { ok: true, action: "help", usage: USAGE } };
  }
  if (first !== "check" && first !== "move" && first !== "new" && first !== "adopt") {
    return {
      ok: false,
      asJson,
      payload: failPayload(
        "bad-argument",
        `sottocomando non riconosciuto: '${first}' (comandi: check, move, new, adopt)`,
      ),
    };
  }
  const command = first as Command;
  const parsed = parseCommandArgs(command, argv.slice(1));
  if (parsed.error !== undefined) {
    return { ok: false, asJson, payload: failPayload(parsed.error.code, parsed.error.message) };
  }
  const values = parsed.values;
  const rootValue = values.get("root");
  const root = rootValue === undefined ? "plan" : rootValue === "" ? "." : rootValue; // python: Path("") e' "."
  const dryRun = values.has("dry-run");
  let payload: Payload;
  if (command === "check") {
    payload = cmdCheck(root);
  } else if (command === "move") {
    const comprehension = values.get("comprehension");
    payload = cmdMove(root, values.get("id") ?? "", values.get("to") ?? "", dryRun, comprehension ?? null);
  } else if (command === "new") {
    payload = cmdNew(
      root,
      values.get("id") ?? "",
      values.get("title") ?? "",
      values.get("owner") ?? "",
      values.get("executor") ?? "",
      values.get("body") ?? "",
      values.get("column") ?? "draft",
      dryRun,
    );
  } else {
    payload = cmdAdopt(
      root,
      values.get("file") ?? "",
      values.get("owner") ?? "unknown",
      values.get("executor") ?? "unknown",
      dryRun,
    );
  }
  return { ok: payload["ok"] === true, asJson, payload };
}

/** API pubblica pura: mai stdout/stderr, mai `process.exit`, mai throw. */
export function runPlanBoard(argv: string[]): PlanBoardResult {
  try {
    return runPlanBoardInner(argv);
  } catch (err) {
    return {
      ok: false,
      asJson: argv.includes("--json"),
      payload: failPayload("internal-error", err instanceof Error ? err.message : String(err)),
    };
  }
}

function firstLine(payload: Payload): string {
  if (payload["ok"] === true) return "ok";
  const code = payload["code"];
  if (typeof code === "string" && code !== "") {
    return ("FAIL " + code + " " + (typeof payload["message"] === "string" ? payload["message"] : "")).replace(
      /\s+$/,
      "",
    );
  }
  // python: i payload di `check` non hanno `code` -> riga "FAIL" sola (poi le righe ERROR)
  return "FAIL";
}

/** Formato human identico a `emit()` del python: "ok" o "FAIL <code> <message>" (rstrip),
 * poi due spazi prima di ERROR/WARN e due spazi dopo il codice e il file. */
function formatHuman(payload: Payload): string {
  const lines = [firstLine(payload)];
  const errors = Array.isArray(payload["errors"]) ? (payload["errors"] as Item[]) : [];
  const warnings = Array.isArray(payload["warnings"]) ? (payload["warnings"] as Item[]) : [];
  for (const e of errors) lines.push(`  ERROR ${e.code}  ${e.file}  ${e.message}`);
  for (const w of warnings) lines.push(`  WARN  ${w.code}  ${w.file}  ${w.message}`);
  return lines.join("\n");
}

if (import.meta.main) {
  try {
    const result = runPlanBoard(process.argv.slice(2));
    const isHelp = result.payload["action"] === "help";
    const out = isHelp
      ? result.asJson
        ? JSON.stringify(result.payload, null, 2)
        : String(result.payload["usage"] ?? USAGE)
      : result.asJson
        ? JSON.stringify(result.payload, null, 2)
        : formatHuman(result.payload);
    process.stdout.write(out + "\n");
    if (!result.ok && !result.asJson) {
      const code = result.payload["code"];
      if (code === "bad-argument" || code === "missing-argument") {
        process.stderr.write(USAGE_HINT + "\n");
      }
    }
    process.exit(result.ok ? 0 : 1);
  } catch (err) {
    process.stderr.write(`internal-error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  }
}
