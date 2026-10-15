#!/usr/bin/env python
"""plan-board.py — Kanban dei piani (board draft/in-progress/qa/complete).

Sottocomandi:
  check  [--root DIR] [--json]
  move   --id <id> --to <column> [--root DIR] [--dry-run] [--json]
  new    --id <id> --title T --owner O --executor E --body FILE [--column draft] [--root DIR] [--dry-run] [--json]
  adopt  --file NAME --owner O --executor E [--root DIR] [--dry-run] [--json]

Exit 0 = ok (i warning non fanno fallire), 1 = errore bloccante.
Solo libreria standard (nessuna dipendenza esterna).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

COLUMNS = ("draft", "in-progress", "qa", "complete")
SECTIONS = (
    "## Goal",
    "## Success Criteria",
    "## Scope",
    "## Safety",
    "## Inputs Available",
    "## Outputs Required",
    "## Test Plan",
    "## Verification",
    "## Notes / Edge Cases",
)
FM_KEYS = ("id", "title", "status", "created", "updated", "owner", "executor")
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
FM_RE = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?", re.DOTALL)


def today() -> str:
    return dt.date.today().isoformat()


def id_matches(pid: str, stem: str) -> bool:
    """Regola del kit: `id` e' il segmento iniziale dello stem del file.

    La convenzione del kit e' `<id>-<slug>.md` con `id` corto (es. `id: 0002`
    dentro `0002-v0.3.0-human-comprehension-gate.md`), quindi vale
    `stem == id` oppure `stem == "<id>-<slug>"`.
    """
    return bool(pid) and (stem == pid or stem.startswith(pid + "-"))


def split_frontmatter(text: str):
    """Ritorna (frontmatter dict | None, body). None = file legacy senza frontmatter."""
    if not text.startswith("---"):
        return None, text
    m = FM_RE.match(text)
    if not m:
        return None, text
    fm = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#") or ":" not in line:
            continue
        k, v = line.split(":", 1)
        fm[k.strip()] = v.split("#")[0].strip()
    return fm, text[m.end():]


def render_frontmatter(fm: dict, newline: str = "\n") -> str:
    keys = [k for k in FM_KEYS if k in fm] + sorted(k for k in fm if k not in FM_KEYS)
    return "---" + newline + newline.join(f"{k}: {fm[k]}" for k in keys) + newline + "---" + newline


def board_files(root: Path) -> dict:
    out = {}
    for col in COLUMNS:
        d = root / col
        out[col] = sorted(p for p in d.glob("*") if p.is_file() and p.name != ".gitkeep")
    return out


def inspect_file(path: Path, column: str):
    """Ritorna (findings, frontmatter|None). Un finding e' (severita', codice, messaggio)."""
    findings = []
    text = path.read_text(encoding="utf-8")
    fm, body = split_frontmatter(text)
    if fm is None:
        findings.append(("WARN", "legacy-no-frontmatter",
                         "file legacy senza frontmatter YAML: normalizzalo con `adopt`"))
        return findings, None
    pid = fm.get("id", "")
    if not pid:
        findings.append(("ERROR", "missing-id", "frontmatter senza `id`"))
    elif not id_matches(pid, path.stem):
        findings.append(("ERROR", "id-filename-mismatch",
                         f"id '{pid}' non e' il segmento iniziale del nome file '{path.name}'"))
    status = fm.get("status", "")
    if status != column:
        findings.append(("ERROR", "status-folder-mismatch",
                         f"status '{status}' non corrisponde alla cartella '{column}'"))
    if not ID_RE.match(pid or "x"):
        findings.append(("ERROR", "id-not-slug-safe", f"id '{pid}' non slug-safe"))
    for s in SECTIONS:
        if s not in body:
            findings.append(("WARN", "missing-section", f"sezione mancante: {s}"))
    for k in ("title", "created", "updated", "owner", "executor"):
        if not fm.get(k):
            findings.append(("WARN", "missing-frontmatter-key", f"chiave frontmatter mancante: {k}"))
    return findings, fm


def emit(payload: dict, as_json: bool) -> None:
    if as_json:
        print(json.dumps(payload, indent=2))
        return
    print(f"{'ok  ' if payload.get('ok') else 'FAIL'} {payload.get('code', '')} {payload.get('message', '')}".rstrip())
    for e in payload.get("errors", []):
        print(f"  ERROR {e['code']}  {e['file']}  {e['message']}")
    for w in payload.get("warnings", []):
        print(f"  WARN  {w['code']}  {w['file']}  {w['message']}")


def fail(code: str, message: str, as_json: bool) -> int:
    emit({"ok": False, "code": code, "message": message}, as_json)
    return 1


def cmd_check(root: Path, as_json: bool) -> int:
    payload = {"ok": True, "action": "check", "root": str(root), "errors": [], "warnings": [], "plans": {}}
    seen = {}
    if not root.is_dir():
        payload["errors"].append({"file": str(root), "code": "missing-root",
                                  "message": "root della board inesistente: nessun piano verificabile"})
    for col, files in board_files(root).items():
        if root.is_dir() and not (root / col).is_dir():
            payload["warnings"].append({"file": str(root / col), "code": "missing-column",
                                        "message": f"colonna mancante: {col}"})
        payload["plans"][col] = []
        for p in files:
            if p.suffix.lower() != ".md":
                payload["warnings"].append({"file": str(p), "code": "unexpected-file",
                                            "message": "file non .md presente in una colonna"})
                continue
            findings, fm = inspect_file(p, col)
            payload["plans"][col].append({"file": p.name,
                                          "id": (fm or {}).get("id", ""),
                                          "status": (fm or {}).get("status", "")})
            if fm and fm.get("id"):
                seen.setdefault(fm["id"], []).append(str(p))
            for sev, code, msg in findings:
                (payload["errors"] if sev == "ERROR" else payload["warnings"]).append(
                    {"file": str(p), "code": code, "message": msg})
    for pid, paths in sorted(seen.items()):
        if len(paths) > 1:
            payload["errors"].append({"file": pid, "code": "duplicate-id",
                                      "message": "id presente in piu' colonne: " + ", ".join(paths)})
    payload["ok"] = not payload["errors"]
    emit(payload, as_json)
    return 0 if payload["ok"] else 1


def find_plan(root: Path, ident: str):
    """Risolve un piano per stem esatto o per id iniziale (`<id>-<slug>.md`)."""
    ident = ident[:-3] if ident.endswith(".md") else ident
    return [(col, p) for col, ps in board_files(root).items() for p in ps
            if p.stem == ident or p.stem.startswith(ident + "-")]


def update_status(path: Path, fm: dict, status: str) -> str:
    text = path.read_text(encoding="utf-8")
    nl = "\r\n" if "\r\n" in text else "\n"
    _, body = split_frontmatter(text)
    fm = dict(fm)
    fm["status"] = status
    fm["updated"] = today()
    return render_frontmatter(fm, nl) + body


def cmd_move(root: Path, ident: str, to: str, dry_run: bool, as_json: bool) -> int:
    if to not in COLUMNS:
        return fail("bad-column", f"colonna '{to}' non valida (usare: {', '.join(COLUMNS)})", as_json)
    hits = find_plan(root, ident)
    if not hits:
        return fail("plan-not-found", f"nessun piano '{ident}' nelle colonne di {root}", as_json)
    if len(hits) > 1:
        return fail("plan-ambiguous", f"'{ident}' presente in piu' colonne: "
                    + ", ".join(f"{c}/{p.name}" for c, p in hits), as_json)
    col, path = hits[0]
    if col == to:
        return fail("already-in-column", f"'{path.name}' e' gia' in '{to}'", as_json)
    text = path.read_text(encoding="utf-8")
    fm, _ = split_frontmatter(text)
    if fm is None:
        return fail("legacy-requires-adopt",
                    f"'{path.name}' non ha frontmatter: esegui prima `adopt`", as_json)
    if not id_matches(fm.get("id", ""), path.stem):
        return fail("id-filename-mismatch",
                    f"id '{fm.get('id')}' non e' il segmento iniziale del nome file '{path.name}': move rifiutata", as_json)
    dst = root / to / path.name
    if dst.exists():
        return fail("target-exists", f"{dst} esiste gia'", as_json)
    payload = {"ok": True, "action": "move", "id": path.stem, "from": col, "to": to,
               "path": str(dst), "dry_run": dry_run}
    if not dry_run:
        path.write_text(update_status(path, fm, to), encoding="utf-8", newline="")
        path.replace(dst)
        payload["verified"] = dst.is_file() and not path.exists()
    emit(payload, as_json)
    return 0


def cmd_new(root: Path, ident: str, title: str, owner: str, executor: str,
            body_file: Path, column: str, dry_run: bool, as_json: bool) -> int:
    if column not in COLUMNS:
        return fail("bad-column", f"colonna '{column}' non valida", as_json)
    if not ID_RE.match(ident):
        return fail("bad-id", f"id '{ident}' non slug-safe (ammessi [A-Za-z0-9._-])", as_json)
    if not body_file.is_file():
        return fail("body-missing", f"body file non trovato: {body_file}", as_json)
    body = body_file.read_text(encoding="utf-8")
    missing = [s for s in SECTIONS if s not in body]
    if missing:
        return fail("body-incomplete", "sezioni mancanti nel body: " + ", ".join(missing), as_json)
    dst = root / column / f"{ident}.md"
    if dst.exists(): 
        return fail("target-exists", f"{dst} esiste gia'", as_json)
    dup = find_plan(root, ident)
    if dup:
        return fail("duplicate-id", f"'{ident}' esiste gia' in {dup[0][0]}", as_json)
    fm = {"id": ident, "title": title, "status": column, "created": today(),
          "updated": today(), "owner": owner, "executor": executor}
    payload = {"ok": True, "action": "new", "id": ident, "column": column,
               "path": str(dst), "dry_run": dry_run}
    if not dry_run:
        dst.write_text(render_frontmatter(fm) + "\n" + body.lstrip("\n"), encoding="utf-8", newline="")
        payload["verified"] = dst.is_file()
    emit(payload, as_json)
    return 0


def cmd_adopt(root: Path, name: str, owner: str, executor: str, dry_run: bool, as_json: bool) -> int:
    hits = find_plan(root, name)
    if not hits:
        return fail("plan-not-found", f"nessun piano '{name}' nelle colonne di {root}", as_json)
    if len(hits) > 1:
        return fail("plan-ambiguous", f"'{name}' presente in piu' colonne", as_json)
    col, path = hits[0]
    text = path.read_text(encoding="utf-8")
    fm, body = split_frontmatter(text)
    if fm is not None:
        return fail("already-has-frontmatter", f"'{path.name}' ha gia' un frontmatter", as_json)
    if not ID_RE.match(path.stem):
        return fail("bad-id", f"nome file '{path.stem}' non slug-safe", as_json)
    title = path.stem
    for line in body.splitlines():
        if line.startswith("# "):
            title = line[2:].strip()
            break
    fm = {"id": path.stem, "title": title, "status": col, "created": today(),
          "updated": today(), "owner": owner, "executor": executor}
    payload = {"ok": True, "action": "adopt", "id": path.stem, "column": col,
               "path": str(path), "dry_run": dry_run,
               "warnings": [{"file": str(path), "code": "derived-frontmatter",
                             "message": "title/owner/executor dedotti: verifica il frontmatter dopo l'adopt"}]}
    if not dry_run:
        path.write_text(render_frontmatter(fm) + "\n" + body.lstrip("\n"), encoding="utf-8", newline="")
        payload["verified"] = split_frontmatter(path.read_text(encoding="utf-8"))[0] is not None
    emit(payload, as_json)
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="plan-board.py", description="Kanban dei piani (draft/in-progress/qa/complete)")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def add_common(p):
        p.add_argument("--root", default="plan")
        p.add_argument("--json", action="store_true")

    p = sub.add_parser("check"); add_common(p)

    p = sub.add_parser("move")
    p.add_argument("--id", required=True)
    p.add_argument("--to", required=True)
    p.add_argument("--dry-run", action="store_true")
    add_common(p)

    p = sub.add_parser("new")
    p.add_argument("--id", required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--owner", required=True)
    p.add_argument("--executor", required=True)
    p.add_argument("--body", required=True)
    p.add_argument("--column", default="draft")
    p.add_argument("--dry-run", action="store_true")
    add_common(p)

    p = sub.add_parser("adopt")
    p.add_argument("--file", required=True)
    p.add_argument("--owner", default="unknown")
    p.add_argument("--executor", default="unknown")
    p.add_argument("--dry-run", action="store_true")
    add_common(p)

    a = ap.parse_args(argv)
    root = Path(a.root)
    if a.cmd == "check":
        return cmd_check(root, a.json)
    if a.cmd == "move":
        return cmd_move(root, a.id, a.to, a.dry_run, a.json)
    if a.cmd == "new":
        return cmd_new(root, a.id, a.title, a.owner, a.executor, Path(a.body), a.column, a.dry_run, a.json)
    if a.cmd == "adopt":
        return cmd_adopt(root, a.file, a.owner, a.executor, a.dry_run, a.json)
    return fail("bad-command", "comando non riconosciuto", a.json)


if __name__ == "__main__":
    sys.exit(main())
