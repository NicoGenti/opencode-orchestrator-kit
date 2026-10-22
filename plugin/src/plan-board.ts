#!/usr/bin/env bun
/**
 * plan-board.ts — port di scripts/plan-board.py (Python 3 stdlib) su TypeScript.
 *
 * Sottocomandi:
 *   check  [--root DIR] [--json]
 *   move   --id <id> --to <column> [--comprehension V] [--root DIR] [--dry-run] [--json]
 *   new    --id <id> --title T --owner O --executor E --body FILE [--column draft] [--root DIR] [--dry-run] [--json]
 *   adopt  --file NAME --owner O --executor E [--root DIR] [--dry-run] [--json]
 *
 * Exit 0 = ok (i warning non fanno fallire), 1 = errore bloccante,
 * 2 = rifiuto alla argparse (sottocomando/flag/valore invalido, stderr = usage).
 * Solo builtin `node:` (nessuna dipendenza npm).
 */

import {
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
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

const FM_KEYS = [
  "id",
  "title",
  "status",
  "created",
  "updated",
  "owner",
  "executor",
] as const;

const COMPREHENSION_VALUES = [
  "none",
  "pass",
  "skipped",
  "fail",
  "disabled",
  "n/a",
] as const;

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

type Finding = [sev: "ERROR" | "WARN", code: string, message: string];

type Payload = {
  [key: string]:
    | string
    | boolean
    | null
    | Payload[]
    | { [key: string]: Payload | Payload[] };
};

// ---------------------------------------------------------------------------
// Riproduzione dell'output di `json.dumps(payload, indent=2)` (ensure_ascii)
// ---------------------------------------------------------------------------

function hex4(cp: number): string {
  return cp.toString(16).padStart(4, "0");
}

function pyStr(s: string): string {
  let out = '"';
  for (const ch of s) {
    switch (ch) {
      case "\\":
        out += "\\\\";
        break;
      case '"':
        out += '\\"';
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      case "\b":
        out += "\\b";
        break;
      case "\f":
        out += "\\f";
        break;
      default: {
        const cp = ch.codePointAt(0)!;
        if (cp < 0x20 || cp > 0x7e) {
          if (cp <= 0xffff) out += `\\u${hex4(cp)}`;
          else {
            const v = cp - 0x10000;
            out += `\\u${hex4(0xd800 + (v >> 10))}\\u${hex4(0xdc00 + (v & 0x3ff))}`;
          }
        } else {
          out += ch;
        }
      }
    }
  }
  return out + '"';
}

function pyDump(value: unknown, level = 0): string {
  const pad = "  ".repeat(level);
  const padIn = "  ".repeat(level + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => padIn + pyDump(v, level + 1)).join(",\n");
    return `[\n${items}\n${pad}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const items = entries
      .map(([k, v]) => `${padIn}${pyStr(k)}: ${pyDump(v, level + 1)}`)
      .join(",\n");
    return `{\n${items}\n${pad}}`;
  }
  if (typeof value === "string") return pyStr(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return "null";
}

// ---------------------------------------------------------------------------
// Primitive file (translate universal-newline come pathlib.read_text)
// ---------------------------------------------------------------------------

/** Equivalente di `Path.read_text(encoding="utf-8")`: universal newlines -> "\n". */
function readText(path: string): string {
  return readFileSync(path, "utf-8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

/** Equivalente di `Path.write_text(..., newline="")`: nessuna traduzione. */
function writeText(path: string, text: string): void {
  writeFileSync(path, text, "utf-8");
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** `Path.suffix` di pathlib: punto non iniziale/ne finale. */
function suffixOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i) : "";
}

/** `Path.stem` di pathlib. */
function stemOf(name: string): string {
  const suffix = suffixOf(name);
  return suffix ? name.slice(0, name.length - suffix.length) : name;
}

/** Normalizza il root come farebbe `str(Path(x))` (segmenti vuoti e "."). */
function normalizeRoot(input: string): string {
  const segs = input.split("/").filter((s) => s !== "" && s !== ".");
  if (input.startsWith("/")) return "/" + segs.join("/");
  return segs.length === 0 ? "." : segs.join("/");
}

function today(): string {
  const now = new Date();
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Parsing frontmatter / regole del kit
// ---------------------------------------------------------------------------

type Fm = Record<string, string>;

function splitFrontmatter(text: string): { fm: Fm | null; body: string } {
  if (!text.startsWith("---")) return { fm: null, body: text };
  const m = FM_RE.exec(text);
  if (!m) return { fm: null, body: text };
  const fm: Fm = {};
  for (const line of m[1].split("\n")) {
    if (
      line.trim() === "" ||
      line.trimStart().startsWith("#") ||
      !line.includes(":")
    ) {
      continue;
    }
    const i = line.indexOf(":");
    fm[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .split("#")[0]
      .trim();
  }
  return { fm, body: text.slice(m[0].length) };
}

function renderFrontmatter(fm: Fm, nl = "\n"): string {
  const extra = Object.keys(fm)
    .filter((k) => !(FM_KEYS as readonly string[]).includes(k))
    .sort();
  const ordered = (FM_KEYS as readonly string[])
    .filter((k) => k in fm)
    .concat(extra);
  return (
    "---" + nl + ordered.map((k) => `${k}: ${fm[k]}`).join(nl) + nl + "---" + nl
  );
}

/** Regola del kit: `id` e' il segmento iniziale dello stem del file. */
function idMatches(pid: string, stem: string): boolean {
  return Boolean(pid) && (stem === pid || stem.startsWith(pid + "-"));
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

/** Colonne -> file (non .gitkeep, solo file), in ordine di nome. */
function boardFiles(root: string): Record<Column, string[]> {
  const out = {} as Record<Column, string[]>;
  for (const col of COLUMNS) {
    const dir = join(root, col);
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      names = [];
    }
    out[col] = names
      .filter((n) => n !== ".gitkeep" && n !== "." && n !== "..")
      .filter((n) => isFile(join(dir, n)))
      .sort();
  }
  return out;
}

/** Ritorna (findings, frontmatter | null). null = file legacy senza frontmatter. */
function inspectFile(
  path: string,
  column: string,
): { findings: Finding[]; fm: Fm | null } {
  const findings: Finding[] = [];
  const text = readText(path);
  const { fm, body } = splitFrontmatter(text);
  if (fm === null) {
    findings.push([
      "WARN",
      "legacy-no-frontmatter",
      "file legacy senza frontmatter YAML: normalizzalo con `adopt`",
    ]);
    return { findings, fm: null };
  }
  const name = path.split("/").pop() ?? path;
  const stem = stemOf(name);
  const pid = fm["id"] ?? "";
  if (!pid) {
    findings.push(["ERROR", "missing-id", "frontmatter senza `id`"]);
  } else if (!idMatches(pid, stem)) {
    findings.push([
      "ERROR",
      "id-filename-mismatch",
      `id '${pid}' non e' il segmento iniziale del nome file '${name}'`,
    ]);
  }
  const status = fm["status"] ?? "";
  if (status !== column) {
    findings.push([
      "ERROR",
      "status-folder-mismatch",
      `status '${status}' non corrisponde alla cartella '${column}'`,
    ]);
  }
  if (!ID_RE.test(pid || "x")) {
    findings.push(["ERROR", "id-not-slug-safe", `id '${pid}' non slug-safe`]);
  }
  for (const s of SECTIONS) {
    if (!body.includes(s)) {
      findings.push(["WARN", "missing-section", `sezione mancante: ${s}`]);
    }
  }
  for (const k of ["title", "created", "updated", "owner", "executor"]) {
    if (!fm[k]) {
      findings.push([
        "WARN",
        "missing-frontmatter-key",
        `chiave frontmatter mancante: ${k}`,
      ]);
    }
  }
  if ((column === "qa" || column === "complete") && !("comprehension" in fm)) {
    findings.push([
      "WARN",
      "missing-comprehension",
      "nessun esito di comprensione registrato (chiave `comprehension` assente)",
    ]);
  }
  return { findings, fm };
}

/** Risolve un piano per stem esatto o per id iniziale (`<id>-<slug>.md`). */
function findPlan(
  root: string,
  ident: string,
): Array<{ col: string; name: string }> {
  const needle = ident.endsWith(".md") ? ident.slice(0, -3) : ident;
  const files = boardFiles(root);
  const out: Array<{ col: string; name: string }> = [];
  for (const col of COLUMNS) {
    for (const name of files[col]) {
      const stem = stemOf(name);
      if (stem === needle || stem.startsWith(needle + "-"))
        out.push({ col, name });
    }
  }
  return out;
}

function updateStatus(
  path: string,
  fm: Fm,
  status: string,
  comprehension: string | null,
): string {
  const text = readText(path);
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const body = splitFrontmatter(text).body;
  const next: Fm = { ...fm };
  next["status"] = status;
  next["updated"] = today();
  if (comprehension !== null) next["comprehension"] = comprehension;
  return renderFrontmatter(next, nl) + body;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

type CommandResult = { stdout: string; stderr: string; code: number };

function emitJson(payload: Payload): string {
  return pyDump(payload) + "\n";
}

function emitHuman(payload: Payload, key: string): string {
  const p = payload as Record<string, unknown>;
  const prefix = p["ok"] ? "ok  " : "FAIL";
  const code = (p["code"] as string | undefined) ?? "";
  const message = (p["message"] as string | undefined) ?? "";
  let out = `${prefix} ${code} ${message}`.replace(/\s+$/, "") + "\n";
  const errors =
    (p["errors"] as Array<Record<string, string>> | undefined) ?? [];
  const warnings =
    (p["warnings"] as Array<Record<string, string>> | undefined) ?? [];
  for (const e of errors)
    out += `  ERROR ${e["code"]}  ${e["file"]}  ${e["message"]}\n`;
  for (const w of warnings)
    out += `  WARN  ${w["code"]}  ${w["file"]}  ${w["message"]}\n`;
  return out;
}

/** `--json` assente: output umano del tool Python. */
function emit(payload: Payload, asJson: boolean): CommandResult {
  return asJson
    ? { stdout: emitJson(payload), stderr: "", code: 0 }
    : { stdout: emitHuman(payload), stderr: "", code: 0 };
}

function fail(code: string, message: string, asJson: boolean): CommandResult {
  const r = emit({ ok: false, code, message } as Payload, asJson);
  return { ...r, code: 1 };
}

// ---------------------------------------------------------------------------
// Sottocomandi
// ---------------------------------------------------------------------------

function cmdCheck(root: string, asJson: boolean): CommandResult {
  const payload: Payload = {
    ok: true,
    action: "check",
    root,
    errors: [],
    warnings: [],
    plans: {},
  };
  const p = payload as Record<
    string,
    | string
    | boolean
    | Array<{ file: string; code: string; message: string }>
    | Record<
        string,
        Array<{
          file: string;
          id: string;
          status: string;
          comprehension: string;
        }>
      >
  >;
  const errors = [] as Array<{ file: string; code: string; message: string }>;
  const warnings = [] as Array<{ file: string; code: string; message: string }>;
  const plans: Record<
    string,
    Array<{ file: string; id: string; status: string; comprehension: string }>
  > = {};
  const seen: Record<string, string[]> = {};

  const rootIsDir = isDir(root);
  if (!rootIsDir) {
    errors.push({
      file: root,
      code: "missing-root",
      message: "root della board inesistente: nessun piano verificabile",
    });
  }
  const files = boardFiles(root);
  for (const col of COLUMNS) {
    const colDir = join(root, col);
    if (rootIsDir && !isDir(colDir)) {
      warnings.push({
        file: colDir,
        code: "missing-column",
        message: `colonna mancante: ${col}`,
      });
    }
    plans[col] = [];
    for (const name of files[col]) {
      const path = join(root, col, name);
      if (suffixOf(name).toLowerCase() !== ".md") {
        warnings.push({
          file: path,
          code: "unexpected-file",
          message: "file non .md presente in una colonna",
        });
        continue;
      }
      const { findings, fm } = inspectFile(path, col);
      plans[col].push({
        file: name,
        id: fm?.["id"] ?? "",
        status: fm?.["status"] ?? "",
        comprehension: fm?.["comprehension"] ?? "",
      });
      const pid = fm?.["id"] ?? "";
      if (fm !== null && pid) (seen[pid] ??= []).push(path);
      for (const [sev, code, message] of findings) {
        if (sev === "ERROR") errors.push({ file: path, code, message });
        else warnings.push({ file: path, code, message });
      }
    }
  }
  const pids = Object.keys(seen).sort();
  for (const pid of pids) {
    const paths = seen[pid]! ?? [];
    if (paths.length > 1) {
      errors.push({
        file: pid,
        code: "duplicate-id",
        message: "id presente in piu' colonne: " + paths.join(", "),
      });
    }
  }
  p["errors"] = errors;
  p["warnings"] = warnings;
  p["plans"] = plans;
  p["ok"] = errors.length === 0;
  const r = emit(payload, asJson);
  return { ...r, code: p["ok"] ? 0 : 1 };
}

function cmdMove(
  root: string,
  ident: string,
  to: string,
  dryRun: boolean,
  asJson: boolean,
  comprehension: string | null,
): CommandResult {
  if (!(COLUMNS as readonly string[]).includes(to)) {
    return fail(
      "bad-column",
      `colonna '${to}' non valida (usare: ${COLUMNS.join(", ")})`,
      asJson,
    );
  }
  const hits = findPlan(root, ident);
  if (hits.length === 0) {
    return fail(
      "plan-not-found",
      `nessun piano '${ident}' nelle colonne di ${root}`,
      asJson,
    );
  }
  if (hits.length > 1) {
    return fail(
      "plan-ambiguous",
      `'${ident}' presente in piu' colonne: ` +
        hits.map((h) => `${h.col}/${h.name}`).join(", "),
      asJson,
    );
  }
  const hit = hits[0]!;
  const col = hit.col;
  const name = hit.name;
  if (col === to) {
    return fail("already-in-column", `'${name}' e' gia' in '${to}'`, asJson);
  }
  const path = join(root, col, name);
  const text = readText(path);
  const { fm } = splitFrontmatter(text);
  if (fm === null) {
    return fail(
      "legacy-requires-adopt",
      `'${name}' non ha frontmatter: esegui prima \`adopt\``,
      asJson,
    );
  }
  if (!idMatches(fm["id"] ?? "", stemOf(name))) {
    const pidRepr = "id" in fm ? fm["id"] : "None";
    return fail(
      "id-filename-mismatch",
      `id '${pidRepr}' non e' il segmento iniziale del nome file '${name}': move rifiutata`,
      asJson,
    );
  }
  const dst = join(root, to, name);
  if (isFile(dst) || isDir(dst)) {
    return fail("target-exists", `${dst} esiste gia'`, asJson);
  }
  if (to === "complete" && comprehension === null) {
    return fail(
      "comprehension-unrecorded",
      "move to complete requires --comprehension <none|pass|skipped|fail|disabled|n/a>: " +
        "record the announced comprehension outcome",
      asJson,
    );
  }
  const payload: Payload = {
    ok: true,
    action: "move",
    id: stemOf(name),
    from: col,
    to,
    path: dst,
    dry_run: dryRun,
  };
  if (!dryRun) {
    writeText(path, updateStatus(path, fm, to, comprehension));
    renameSync(path, dst);
    (payload as Record<string, unknown>)["verified"] =
      isFile(dst) && !isFile(path);
  }
  return emit(payload, asJson);
}

function cmdNew(
  root: string,
  ident: string,
  title: string,
  owner: string,
  executor: string,
  bodyFileArg: string,
  column: string,
  dryRun: boolean,
  asJson: boolean,
): CommandResult {
  if (!(COLUMNS as readonly string[]).includes(column)) {
    return fail("bad-column", `colonna '${column}' non valida`, asJson);
  }
  if (!ID_RE.test(ident)) {
    return fail(
      "bad-id",
      `id '${ident}' non slug-safe (ammessi [A-Za-z0-9._-])`,
      asJson,
    );
  }
  if (!isFile(bodyFileArg)) {
    return fail(
      "body-missing",
      `body file non trovato: ${bodyFileArg}`,
      asJson,
    );
  }
  const body = readText(bodyFileArg);
  const missing = SECTIONS.filter((s) => !body.includes(s));
  if (missing.length > 0) {
    return fail(
      "body-incomplete",
      "sezioni mancanti nel body: " + missing.join(", "),
      asJson,
    );
  }
  const dst = join(root, column, `${ident}.md`);
  if (isFile(dst) || isDir(dst)) {
    return fail("target-exists", `${dst} esiste gia'`, asJson);
  }
  const dup = findPlan(root, ident);
  if (dup.length > 0) {
    return fail(
      "duplicate-id",
      `'${ident}' esiste gia' in ${dup[0]!.col}`,
      asJson,
    );
  }
  const fm: Fm = {
    id: ident,
    title,
    status: column,
    created: today(),
    updated: today(),
    owner,
    executor,
  };
  const payload: Payload = {
    ok: true,
    action: "new",
    id: ident,
    column,
    path: dst,
    dry_run: dryRun,
  };
  if (!dryRun) {
    writeText(dst, renderFrontmatter(fm) + "\n" + body.replace(/^\n+/, ""));
    (payload as Record<string, unknown>)["verified"] = isFile(dst);
  }
  return emit(payload, asJson);
}

function cmdAdopt(
  root: string,
  name: string,
  owner: string,
  executor: string,
  dryRun: boolean,
  asJson: boolean,
): CommandResult {
  const hits = findPlan(root, name);
  if (hits.length === 0) {
    return fail(
      "plan-not-found",
      `nessun piano '${name}' nelle colonne di ${root}`,
      asJson,
    );
  }
  if (hits.length > 1) {
    return fail("plan-ambiguous", `'${name}' presente in piu' colonne`, asJson);
  }
  const hit = hits[0]!;
  const col = hit.col;
  const path = join(root, col, hit.name);
  const text = readText(path);
  const { fm, body } = splitFrontmatter(text);
  if (fm !== null) {
    return fail(
      "already-has-frontmatter",
      `'${hit.name}' ha gia' un frontmatter`,
      asJson,
    );
  }
  const stem = stemOf(hit.name);
  if (!ID_RE.test(stem)) {
    return fail("bad-id", `nome file '${stem}' non slug-safe`, asJson);
  }
  let title = stem;
  for (const line of body.split("\n")) {
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
      break;
    }
  }
  const newFm: Fm = {
    id: stem,
    title,
    status: col,
    created: today(),
    updated: today(),
    owner,
    executor,
  };
  const payload: Payload = {
    ok: true,
    action: "adopt",
    id: stem,
    column: col,
    path,
    dry_run: dryRun,
    warnings: [
      {
        file: path,
        code: "derived-frontmatter",
        message:
          "title/owner/executor dedotti: verifica il frontmatter dopo l'adopt",
      },
    ],
  };
  if (!dryRun) {
    writeText(path, renderFrontmatter(newFm) + "\n" + body.replace(/^\n+/, ""));
    (payload as Record<string, unknown>)["verified"] =
      splitFrontmatter(readText(path)).fm !== null;
  }
  return emit(payload, asJson);
}

// ---------------------------------------------------------------------------
// Argparse (subset: le rifiuti di sintassi producono exit 2, stdout vuoto)
// ---------------------------------------------------------------------------

type OptSpec = {
  name: string;
  store: string;
  kind: "value" | "flag";
  required?: boolean;
  choices?: readonly string[];
  def?: string;
};

const COMMON: readonly OptSpec[] = [
  { name: "root", store: "root", kind: "value", def: "plan" },
  { name: "json", store: "json", kind: "flag" },
];

function opt(
  name: string,
  store: string,
  extra: Partial<OptSpec> = {},
): OptSpec {
  return { name, store, kind: "value", ...extra };
}

const SUB_OPTIONS: Record<string, readonly OptSpec[]> = {
  check: [...COMMON],
  move: [
    opt("id", "id", { required: true }),
    opt("to", "to", { required: true }),
    opt("comprehension", "comprehension", { choices: COMPREHENSION_VALUES }),
    { name: "dry-run", store: "dry_run", kind: "flag" },
    ...COMMON,
  ],
  new: [
    opt("id", "id", { required: true }),
    opt("title", "title", { required: true }),
    opt("owner", "owner", { required: true }),
    opt("executor", "executor", { required: true }),
    opt("body", "body", { required: true }),
    opt("column", "column", { def: "draft" }),
    { name: "dry-run", store: "dry_run", kind: "flag" },
    ...COMMON,
  ],
  adopt: [
    opt("file", "file", { required: true }),
    opt("owner", "owner", { def: "unknown" }),
    opt("executor", "executor", { def: "unknown" }),
    { name: "dry-run", store: "dry_run", kind: "flag" },
    ...COMMON,
  ],
};

const SUBCOMMANDS = Object.keys(SUB_OPTIONS);

const USAGE =
  "usage: plan-board.ts [-h] {check,move,new,adopt} ...\n" +
  `positional arguments: {check,move,new,adopt}\n` +
  "  check   kanban check [--root DIR] [--json]\n" +
  "  move    --id ID --to TO [--comprehension V] [--dry-run] [--root DIR] [--json]\n" +
  "  new     --id ID --title T --owner O --executor E --body FILE [--column C] [--dry-run] [--root DIR] [--json]\n" +
  "  adopt   --file NAME [--owner O] [--executor E] [--dry-run] [--root DIR] [--json]\n";

type Parsed =
  | { ok: true; cmd: string; flags: Record<string, string | boolean> }
  | { ok: false; stderr: string };

function parseArgs(argv: readonly string[]): Parsed {
  if (argv.length === 0) {
    return {
      ok: false,
      stderr:
        USAGE +
        "plan-board.ts: error: the following arguments are required: cmd\n",
    };
  }
  const head = argv[0]!;
  if (head === "-h" || head === "--help") {
    return { ok: true, cmd: "help", flags: {} };
  }
  if (!SUBCOMMANDS.includes(head)) {
    return {
      ok: false,
      stderr:
        USAGE.replace("plan-board.ts", "plan-board.ts") +
        `plan-board.ts: error: argument cmd: invalid choice: '${head}' (choose from ${SUBCOMMANDS.join(", ")})\n`,
    };
  }
  const specs = SUB_OPTIONS[head]!;
  const flags: Record<string, string | boolean> = {};
  for (let i = 1; i < argv.length; i++) {
    const tok = argv[i]!;
    if (!tok.startsWith("--")) {
      return {
        ok: false,
        stderr:
          USAGE +
          `plan-board.ts ${head}: error: unrecognized arguments: ${tok}\n`,
      };
    }
    const eq = tok.indexOf("=");
    const name = eq === -1 ? tok.slice(2) : tok.slice(2, eq);
    const spec = specs.find((s) => s.name === name);
    if (!spec) {
      return {
        ok: false,
        stderr:
          USAGE +
          `plan-board.ts ${head}: error: unrecognized arguments: ${tok}\n`,
      };
    }
    if (spec.kind === "flag") {
      if (eq !== -1) {
        return {
          ok: false,
          stderr:
            USAGE +
            `plan-board.ts ${head}: error: argument --${spec.name}: ignored explicit argument '${tok.slice(eq + 1)}'\n`,
        };
      }
      flags[spec.store] = true;
      continue;
    }
    let value: string;
    if (eq !== -1) {
      value = tok.slice(eq + 1);
    } else {
      const next = i + 1 < argv.length ? argv[i + 1] : null;
      if (next === null || next.startsWith("-")) {
        return {
          ok: false,
          stderr:
            USAGE +
            `plan-board.ts ${head}: error: argument --${spec.name}: expected one argument\n`,
        };
      }
      value = next;
      i += 1;
    }
    if (spec.choices && !(spec.choices as readonly string[]).includes(value)) {
      return {
        ok: false,
        stderr:
          USAGE +
          `plan-board.ts ${head}: error: argument --${spec.name}: invalid choice: '${value}' (choose from ${spec.choices.join(", ")})\n`,
      };
    }
    flags[spec.store] = value;
  }
  for (const spec of specs) {
    if (spec.required && !(spec.store in flags)) {
      return {
        ok: false,
        stderr:
          USAGE +
          `plan-board.ts ${head}: error: the following arguments are required: --${spec.name}\n`,
      };
    }
    if (spec.def !== undefined && !(spec.store in flags)) {
      flags[spec.store] = spec.def;
    }
  }
  return { ok: true, cmd: head, flags };
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

function runCli(argv: readonly string[]): CommandResult {
  const parsed = parseArgs(argv);
  if (!parsed.ok) return { stdout: "", stderr: parsed.stderr, code: 2 };
  if (parsed.cmd === "help") return { stdout: USAGE, stderr: "", code: 0 };
  const flags = parsed.flags;
  const asJson = flags["json"] === true;
  const dryRun = flags["dry_run"] === true;
  const root = normalizeRoot(String(flags["root"] ?? "plan"));
  try {
    if (parsed.cmd === "check") return cmdCheck(root, asJson);
    if (parsed.cmd === "move") {
      return cmdMove(
        root,
        String(flags["id"]),
        String(flags["to"]),
        dryRun,
        asJson,
        typeof flags["comprehension"] === "string"
          ? flags["comprehension"]
          : null,
      );
    }
    if (parsed.cmd === "new") {
      return cmdNew(
        root,
        String(flags["id"]),
        String(flags["title"]),
        String(flags["owner"]),
        String(flags["executor"]),
        String(flags["body"]),
        String(flags["column"] ?? "draft"),
        dryRun,
        asJson,
      );
    }
    return cmdAdopt(
      root,
      String(flags["file"]),
      String(flags["owner"]),
      String(flags["executor"]),
      dryRun,
      asJson,
    );
  } catch (e) {
    return {
      stdout: "",
      stderr: `plan-board.ts: errore interno: ${String(e)}\n`,
      code: 1,
    };
  }
}

/**
 * Contratto per l'integrazione nel plugin: ground-truth del tool della board.
 * `argv` NON contiene binary/script path (solo gli argomenti di argparse, es.
 * `["check", "--root", "plan", "--json"]`); stdout = tutto cio' che python
 * stamperebbe su stdout, `code` = exit code del processo (0 ok/warning, 1
 * errore bloccante, 2 rifiuto alla argparse senza payload JSON).
 */
export function planBoardCli(argv: readonly string[]): {
  stdout: string;
  code: number;
} {
  const r = runCli(argv);
  return { stdout: r.stdout, code: r.code };
}

if (import.meta.main) {
  const args =
    typeof Bun !== "undefined" ? Bun.argv.slice(2) : process.argv.slice(2);
  const r = runCli(args);
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  process.exit(r.code);
}
