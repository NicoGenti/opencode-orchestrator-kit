#!/usr/bin/env python
"""issue_bridge.py — specchio GitHub Issues del board locale `plan/` (il board e' la verita').

Sottocomandi:
  check   verifica le invarianti board <-> issue (exit 0 = ok, 1 = drift)
  push    board -> issue: crea/aggiorna titolo, corpo specchio, label plan:*, stato
  pull    issue -> board: adotta le issue APERTE con label plan:mirror non ancora bindate
  new     crea la issue E il file di piano con lo stesso id (numero della issue)
  bind    lega un file di piano esistente a una issue esistente

Regole non negoziabili:
 - il bridge NON modifica mai il corpo di un file di piano ne' `id`/`status`/`title`;
 - ogni mutazione strutturale del board passa da plan-board.py (mai scritture a mano);
 - unica eccezione, dichiarata: le 4 chiavi macchina `gh_*` nel frontmatter (set_machine_keys);
 - il token non viene letto da file: si usa il gh CLI, che usa il proprio store.

Variabili d'ambiente (test): ISSUE_BRIDGE_GH_JSON (lista JSON: prefisso del comando gh),
ISSUE_BRIDGE_FAKE_STATE (stato del gh finto), ISSUE_BRIDGE_BOARD_TOOL (path del plan-board.py).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

COLUMNS = ("draft", "in-progress", "qa", "complete")
COLUMN_LABEL = {"draft": "plan:draft", "in-progress": "plan:in-progress",
                "qa": "plan:qa", "complete": "plan:complete"}
LABEL_COLUMN = {v: k for k, v in COLUMN_LABEL.items()}
MIRROR_LABEL, DIVERGENCE_LABEL = "plan:mirror", "plan:divergence"
SECTIONS = ("## Goal", "## Success Criteria", "## Scope", "## Safety", "## Inputs Available",
            "## Outputs Required", "## Test Plan", "## Verification", "## Notes / Edge Cases")
ADOPT_SECTIONS = SECTIONS[1:4] + SECTIONS[5:]   # tutte tranne Goal (titolo) e Inputs Available
FM_KEYS = ("id", "title", "status", "created", "updated", "owner", "executor")
FM_RE = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?", re.DOTALL)


def _gh_prefix() -> list[str]:
    """Prefisso del comando gh. Nei test si passa una LISTA JSON: shlex in modalita' posix
    mangerebbe i backslash dei percorsi Windows, rompendo ogni invocazione."""
    raw = os.environ.get("ISSUE_BRIDGE_GH_JSON")
    if raw:
        cmd = json.loads(raw)
        if not isinstance(cmd, list) or not cmd or not all(isinstance(x, str) for x in cmd):
            raise SystemExit("ISSUE_BRIDGE_GH_JSON deve essere una lista JSON non vuota di stringhe")
        return cmd
    return ["gh"]


GH = _gh_prefix()


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slug(text: str, limit: int = 48) -> str:
    """`Nuova feature dal telefono` -> `nuova-feature-dal-telefono`. Sempre non vuoto."""
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:limit].strip("-")
    return s or "issue"


def gh(*args: str, check: bool = True) -> str:
    p = subprocess.run([*GH, *args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if check and p.returncode != 0:
        raise RuntimeError(f"gh {' '.join(args)} -> {p.returncode}: {p.stderr.strip()[:400]}")
    return p.stdout


def gh_with_body(text: str, args: list[str]) -> str:
    """Esegue `gh <args...> --body-file <tmp>`: il corpo non passa mai dalla riga di comando."""
    fd, tmp = tempfile.mkstemp(suffix=".md")
    os.close(fd)
    Path(tmp).write_text(text, encoding="utf-8", newline="")
    try:
        return gh(*args, "--body-file", tmp)
    finally:
        os.unlink(tmp)


def split_fm(text: str):
    """Ritorna (frontmatter dict | None, corpo). Stesso contratto di plan-board.py."""
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


def render_fm(fm: dict, newline: str = "\n") -> str:
    keys = [k for k in FM_KEYS if k in fm] + sorted(k for k in fm if k not in FM_KEYS)
    return "---" + newline + newline.join(f"{k}: {fm[k]}" for k in keys) + newline + "---" + newline


def set_machine_keys(path: Path, issue: int, payload_sha: str, state: str) -> None:
    """Aggiorna SOLO le 4 chiavi macchina `gh_*`. Corpo, id, status e title non vengono toccati.
    Rifiuta di scrivere se il frontmatter e' incoerente con la cartella (move concorrente).

    L'EOL si rileva sui BYTE: `read_text` normalizza gia' \\r\\n in \\n, quindi cercare \"\\r\\n\"
    nella stringa decodificata sarebbe codice morto e riscriverebbe ogni file in LF."""
    raw = path.read_bytes()
    crlf, lf = raw.count(b"\r\n"), raw.count(b"\n") - raw.count(b"\r\n")
    nl = "\r\n" if crlf > lf else "\n"
    text = raw.decode("utf-8")
    fm, body = split_fm(text)
    if fm is None:
        raise RuntimeError(f"{path.name}: nessun frontmatter, esegui prima `plan-board.py adopt`")
    folder = path.parent.name
    if fm.get("status") and fm["status"] != folder:
        raise RuntimeError(f"{path.name}: status '{fm['status']}' != cartella '{folder}': "
                           f"stato incoerente, non scrivo")
    fm["gh_issue"] = str(issue)
    fm["gh_body_sha"] = payload_sha
    fm["gh_synced_at"] = now_iso()
    fm["gh_state"] = state
    path.write_bytes((render_fm(fm, nl) + body).encode("utf-8"))


def payload_of(path: Path) -> str:
    """Payload = corpo del file senza frontmatter, normalizzato come in mirror_body."""
    _, body = split_fm(path.read_text(encoding="utf-8"))
    return body.lstrip("\n")


def payload_of_remote(remote_body: str) -> str:
    """Il corpo della issue e' banner + payload: il banner termina con una riga vuota."""
    return remote_body.split("\n\n", 1)[1] if "\n\n" in remote_body else remote_body


def mirror_body(rel_path: str, payload: str, column: str) -> str:
    """Corpo della issue = banner (informativo) + payload. L'hash NON copre il banner:
    cosi' spostare un piano fra colonne non invalida lo specchio."""
    banner = (f"<!-- issue-bridge: specchio generato da {rel_path}. NON modificare a mano: "
              f"la fonte di verita' e' il file di piano nel repository. -->\n"
              f"> **Specchio.** Fonte di verita': `{rel_path}` (ramo di default). "
              f"Colonna: `{column}`.\n\n")
    return banner + payload


def plan_files(board: Path) -> list[tuple[str, Path]]:
    """Tutti i file di piano dei 4 rami come (colonna, path). Esclude `.gitkeep` e i README."""
    out = []
    for col in COLUMNS:
        d = board / col
        if not d.is_dir():
            continue
        for p in sorted(d.iterdir()):
            if p.is_file() and p.suffix == ".md" and p.name != "README.md":
                out.append((col, p))
    return out


def binding(fm: dict):
    v = fm.get("gh_issue")
    return int(v) if v and str(v).isdigit() else None


def list_issues(remote: str) -> list[dict]:
    raw = gh("issue", "list", "-R", remote, "--state", "all", "--limit", "300",
             "--json", "number,title,state,labels,body,updatedAt")
    return json.loads(raw or "[]")


def label_names(issue: dict) -> list[str]:
    return [l["name"] if isinstance(l, dict) else str(l) for l in issue.get("labels", [])]


def ensure_labels(remote: str, names) -> None:
    """Crea le label mancanti. Idempotente: senza --force `gh label create` fallisce se esiste,
    ed e' cio' che vogliamo (non tocchiamo i colori gia' scelti)."""
    for name in names:
        gh("label", "create", name, "-R", remote, "--color", "0e8a16", check=False)


def board_check(board_tool: Path, board: Path) -> tuple[int, dict]:
    """Delega la struttura del board a plan-board.py. Il suo JSON (verificato su HEAD) ha le
    chiavi `ok`, `action`, `root`, `errors`, `warnings`, `plans`."""
    p = subprocess.run([sys.executable, str(board_tool), "check", "--root", str(board), "--json"],
                       capture_output=True, text=True, encoding="utf-8")
    try:
        data = json.loads(p.stdout or "{}")
    except json.JSONDecodeError:
        data = {"ok": False,
                "errors": [{"file": str(board), "code": "board-tool-output",
                            "message": (p.stdout or p.stderr).strip()[:200]}],
                "warnings": []}
    return p.returncode, data


def board_new(board_tool: Path, board: Path, ident: str, title: str, body_file: Path,
              column: str) -> Path:
    """`plan-board.py new` crea il file come `<root>/<colonna>/<ident>.md` (verificato su HEAD) e ne
    restituisce il path letto dal suo stesso JSON: il path non si indovina per prefisso."""
    p = subprocess.run([sys.executable, str(board_tool), "new", "--id", ident, "--title", title,
                        "--owner", "issue-bridge", "--executor", "orchestrator",
                        "--body", str(body_file), "--column", column,
                        "--root", str(board), "--json"],
                       capture_output=True, text=True, encoding="utf-8")
    if p.returncode != 0:
        raise RuntimeError(f"plan-board.py new -> {p.returncode}: "
                           f"{(p.stdout or p.stderr).strip()[:300]}")
    try:
        created = Path(json.loads(p.stdout)["path"])
    except (json.JSONDecodeError, KeyError, TypeError):
        raise RuntimeError(f"plan-board.py new non ha restituito un `path` nel JSON: "
                           f"{p.stdout.strip()[:300]}")
    if not created.is_file():
        raise RuntimeError(f"plan-board.py new ha dichiarato {created}, che non esiste")
    return created


def issue_number_from_url(url: str) -> int:
    """`gh issue create` stampa l'URL della issue: se non lo fa, meglio fallire che bindare a caso."""
    seg = (url or "").strip().rstrip("/").rsplit("/", 1)[-1]
    if not seg.isdigit():
        raise RuntimeError(f"gh issue create non ha stampato un URL con numero di issue: {url!r}")
    return int(seg)


def find_created(board: Path, column: str, n: int) -> Path | None:
    """NON usata dal flusso: il path del file creato arriva da `board_new`. Resta solo come
    strumento diagnostico manuale (un file con lo stesso numero in un'altra colonna)."""
    hits = [p for c, p in plan_files(board) if c == column and p.name.startswith(f"{n}-")]
    return hits[0] if hits else None


# ---------------------------------------------------------------- push

def cmd_push(board: Path, remote: str, dry: bool) -> int:
    """board -> issue. Idempotente: il payload e' una funzione pura del file."""
    issues = {i["number"]: i for i in list_issues(remote)}
    created, updated, restored, skipped, errors = [], [], [], [], []
    seen: set[int] = set()
    if not dry:
        ensure_labels(remote, [MIRROR_LABEL, DIVERGENCE_LABEL, *COLUMN_LABEL.values()])
    for col, path in plan_files(board):
        fm, _ = split_fm(path.read_text(encoding="utf-8"))
        if fm is None:
            skipped.append(f"plan/{col}/{path.name}: legacy senza frontmatter "
                           f"(esegui `plan-board.py adopt`)")
            continue
        rel = f"plan/{col}/{path.name}"
        title = fm.get("title", path.stem)
        payload = payload_of(path)
        want_state = "CLOSED" if col == "complete" else "OPEN"
        want_label = COLUMN_LABEL[col]
        issue_n = binding(fm)
        if issue_n is not None:
            if issue_n in seen:
                errors.append(f"{rel}: duplicate-binding con un altro file che punta a #{issue_n}: "
                              f"salto questo file (esegui `check`)")
                continue
            seen.add(issue_n)
        if issue_n is None:
            if col == "complete":
                continue                      # archivio: si specchia solo cio' che ha un binding
            if dry:
                created.append(f"{rel} -> nuova issue")
                continue
            url = gh_with_body(mirror_body(rel, payload, col),
                               ["issue", "create", "-R", remote, "--title", title,
                                "--label", MIRROR_LABEL, "--label", want_label])
            new_n = issue_number_from_url(url)
            set_machine_keys(path, new_n, sha(payload), want_state)
            created.append(f"{rel} -> #{new_n}")
            continue
        issue = issues.get(issue_n)
        if issue is None:
            errors.append(f"{rel}: la issue #{issue_n} bindata non esiste sul remoto")
            continue
        have = label_names(issue)
        mirror = mirror_body(rel, payload, col)
        if fm.get("gh_body_sha") and sha(payload_of_remote(issue.get("body", ""))) != fm["gh_body_sha"]:
            restored.append(f"#{issue_n}: payload remoto modificato, ripristinato lo specchio")
            if not dry:
                gh_with_body("Modifica manuale al corpo di una issue specchio: e' stata sostituita "
                             f"dallo specchio generato da `{rel}`. Il board locale e' la fonte di "
                             f"verita'.\n", ["issue", "comment", str(issue_n), "-R", remote])
                gh("issue", "edit", str(issue_n), "-R", remote, "--add-label", DIVERGENCE_LABEL)
        others = [l for l in have if l in LABEL_COLUMN and l != want_label]
        drift = []
        if issue["title"] != title:
            drift.append("title")
        if sha(issue.get("body", "")) != sha(mirror):
            drift.append("body")
        if want_label not in have:
            drift.append("label")
        if MIRROR_LABEL not in have:
            drift.append("mirror")
        if others:
            drift.append("extra")
        if issue["state"] != want_state:
            drift.append("state")
        if not drift:
            continue
        updated.append(f"#{issue_n}: {','.join(drift)}")
        if dry:
            continue
        if "body" in drift:                      # una sola scrittura: titolo + corpo
            gh_with_body(mirror, ["issue", "edit", str(issue_n), "-R", remote, "--title", title])
        elif "title" in drift:
            gh("issue", "edit", str(issue_n), "-R", remote, "--title", title)
        if "label" in drift or "mirror" in drift or others:
            args = ["issue", "edit", str(issue_n), "-R", remote]
            if "label" in drift:
                args += ["--add-label", want_label]
            if "mirror" in drift:
                args += ["--add-label", MIRROR_LABEL]
            for other in others:
                args += ["--remove-label", other]
            gh(*args)
        if "state" in drift:
            gh("issue", "close" if want_state == "CLOSED" else "reopen", str(issue_n), "-R", remote)
        set_machine_keys(path, issue_n, sha(payload), want_state)
    summary = {"ok": not errors, "action": "push", "created": created, "updated": updated,
               "restored": restored, "skipped": skipped, "errors": errors}
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    return 1 if errors else 0


# ---------------------------------------------------------------- check

def cmd_check(board: Path, remote: str, board_tool: Path) -> int:
    """Verifica le 6 invarianti di §4. Exit 0 = coerente, 1 = drift."""
    findings = []
    _, report = board_check(board_tool, board)
    board_errors, board_warnings = report.get("errors", []), report.get("warnings", [])
    for e in board_errors:
        findings.append({"severity": "ERROR", "code": e.get("code", "board"),
                         "message": f"{e.get('file', '')}: {e.get('message', '')}"})
    issues = {i["number"]: i for i in list_issues(remote)}
    bound, files = {}, 0
    for col, path in plan_files(board):
        files += 1
        fm, _ = split_fm(path.read_text(encoding="utf-8"))
        if fm is None:
            findings.append({"severity": "WARN", "code": "legacy-unmirrored",
                             "message": f"plan/{col}/{path.name}: fuori dallo specchio finche' non "
                                        f"viene adottato con `plan-board.py adopt`"})
            continue
        n = binding(fm)
        if n is None:
            findings.append({"severity": "WARN", "code": "unbound",
                             "message": f"plan/{col}/{path.name}: nessun `gh_issue` "
                                        f"(il prossimo `push` crea la issue)"})
            continue
        if n in bound:
            findings.append({"severity": "ERROR", "code": "duplicate-binding",
                             "message": f"gh_issue {n} usato da {bound[n]} e da plan/{col}/{path.name}"})
            continue
        bound[n] = f"plan/{col}/{path.name}"
        issue = issues.get(n)
        if issue is None:
            findings.append({"severity": "ERROR", "code": "missing-remote-issue",
                             "message": f"plan/{col}/{path.name}: la issue #{n} non esiste sul remoto"})
            continue
        have = label_names(issue)
        want_state = "CLOSED" if col == "complete" else "OPEN"
        want_label = COLUMN_LABEL[col]
        if issue["state"] != want_state:
            findings.append({"severity": "ERROR", "code": "state-mismatch",
                             "message": f"#{n}: stato remoto {issue['state']} != {want_state} "
                                        f"(colonna {col}); esegui `push`"})
        if want_label not in have:
            findings.append({"severity": "ERROR", "code": "label-mismatch",
                             "message": f"#{n}: manca la label {want_label} (colonna {col}); "
                                        f"esegui `push`"})
        others = [l for l in have if l in LABEL_COLUMN and l != want_label]
        if others:
            findings.append({"severity": "ERROR", "code": "extra-column-label",
                             "message": f"#{n}: porta anche {', '.join(others)} oltre a {want_label}; "
                                        f"esegui `push`"})
        if MIRROR_LABEL not in have:
            findings.append({"severity": "ERROR", "code": "mirror-label-missing",
                             "message": f"#{n}: bindata a plan/{col}/{path.name} ma senza la label "
                                        f"{MIRROR_LABEL}; esegui `push`"})
        if fm.get("gh_body_sha") and sha(payload_of_remote(issue.get("body", ""))) != fm["gh_body_sha"]:
            findings.append({"severity": "ERROR", "code": "divergence",
                             "message": f"#{n}: il payload remoto non e' piu' identico a quello di "
                                        f"plan/{col}/{path.name}; esegui `push`"})
    open_mirrors = [i for i in issues.values()
                    if MIRROR_LABEL in label_names(i) and i["state"] == "OPEN"]
    for i in open_mirrors:
        if i["number"] not in bound:
            findings.append({"severity": "ERROR", "code": "orphan-mirror",
                             "message": f"la issue aperta #{i['number']} porta {MIRROR_LABEL} ma nessun "
                                        f"file di piano la referenzia: adottala con `pull` o toglile "
                                        f"la label"})
    payload = {"ok": not findings, "action": "check",
               "board": {"files": files, "bound": len(bound),
                         "errors": len(board_errors), "warnings": len(board_warnings)},
               "remote": {"issues": len(issues), "open_mirrors": len(open_mirrors)},
               "findings": findings}
    print(json.dumps(payload, ensure_ascii=False, indent=1))
    if not findings:
        print("BRIDGE OK", file=sys.stderr)      # stdout resta JSON puro (per `| jq`)
    return 1 if findings else 0


# ---------------------------------------------------------------- pull

def adopt_body(title: str, remote_body: str) -> str:
    out = f"## Goal\n{title.strip()}\n\n## Inputs Available\n{remote_body.strip()}\n\n"
    for s in ADOPT_SECTIONS:
        out += f"{s}\n- \n\n"
    return out


def cmd_pull(board: Path, remote: str, board_tool: Path, dry: bool) -> int:
    """issue -> board, SOLO adozione di issue APERTE (mai `move`)."""
    _, report = board_check(board_tool, board)
    adopted, errors = [], []
    if report.get("errors"):
        print(json.dumps({"ok": False, "action": "pull",
                          "error": "board non conforme: risolvi prima gli errori di plan-board.py",
                          "board_errors": len(report["errors"])}, ensure_ascii=False))
        return 1
    issues = {i["number"]: i for i in list_issues(remote)}
    bound = set()
    for _, p in plan_files(board):
        fm, _ = split_fm(p.read_text(encoding="utf-8"))
        n = binding(fm) if fm else None
        if n is not None:
            bound.add(n)
    for n, issue in sorted(issues.items()):
        labels = label_names(issue)
        if (MIRROR_LABEL not in labels or issue["state"] != "OPEN"
                or COLUMN_LABEL["complete"] in labels or n in bound):
            continue
        col = next((LABEL_COLUMN[l] for l in labels if l in LABEL_COLUMN), "draft")
        if dry:
            adopted.append(f"#{n} -> plan/{col}/")
            continue
        ident = f"{n}-{slug(issue['title'])}"
        fd, tmp = tempfile.mkstemp(suffix=".md")
        os.close(fd)
        Path(tmp).write_text(adopt_body(issue["title"], issue.get("body", "")),
                            encoding="utf-8", newline="")
        try:
            created = board_new(board_tool, board, ident, issue["title"], Path(tmp), col)
        except RuntimeError as exc:
            errors.append(str(exc))
            continue
        finally:
            os.unlink(tmp)
        set_machine_keys(created, n, "", issue["state"])
        adopted.append(f"#{n} -> plan/{col}/{created.name}")
    payload = {"ok": not errors, "action": "pull", "adopted": adopted, "errors": errors}
    print(json.dumps(payload, ensure_ascii=False, indent=1))
    return 1 if errors else 0


# ---------------------------------------------------------------- new / bind

def cmd_new(board: Path, remote: str, board_tool: Path, title: str, body_file: Path,
            column: str, dry: bool) -> int:
    """Valida board e body PRIMA di creare qualsiasi cosa sul remoto, poi crea la issue (per il
    numero) e il file di piano con quell'id. In caso di errore sul board, chiude la issue e
    rimuove il file eventualmente gia' scritto."""
    if column not in COLUMNS:
        print(json.dumps({"ok": False, "action": "new", "error": f"colonna '{column}' non valida"},
                         ensure_ascii=False))
        return 1
    if not body_file.is_file():
        print(json.dumps({"ok": False, "action": "new", "error": f"body mancante: {body_file}"},
                         ensure_ascii=False))
        return 1
    body = body_file.read_text(encoding="utf-8")
    missing = [s for s in SECTIONS if s not in body]
    if missing:
        print(json.dumps({"ok": False, "action": "new",
                          "error": "sezioni mancanti: " + ", ".join(missing)}, ensure_ascii=False))
        return 1
    _, report = board_check(board_tool, board)
    if report.get("errors"):
        print(json.dumps({"ok": False, "action": "new",
                          "error": "board non conforme: risolvi prima gli errori di plan-board.py"},
                         ensure_ascii=False))
        return 1
    if dry:
        print(json.dumps({"ok": True, "action": "new", "dry_run": True, "title": title,
                          "column": column}, ensure_ascii=False))
        return 0
    ensure_labels(remote, [MIRROR_LABEL, *COLUMN_LABEL.values()])
    url = gh_with_body("Bozza: questa issue viene riscritta dal bridge subito dopo la creazione.\n",
                       ["issue", "create", "-R", remote, "--title", title,
                        "--label", MIRROR_LABEL, "--label", COLUMN_LABEL[column]])
    n = issue_number_from_url(url)
    ident = f"{n}-{slug(title)}"
    created: Path | None = None
    try:
        created = board_new(board_tool, board, ident, title, body_file, column)
        payload = payload_of(created)
        mirror = mirror_body(f"plan/{column}/{created.name}", payload, column)
        gh_with_body(mirror, ["issue", "edit", str(n), "-R", remote, "--title", title])
        set_machine_keys(created, n, sha(payload), "OPEN")
    except Exception as exc:                  # niente issue orfane ne' file fantasma
        if created is not None:
            created.unlink(missing_ok=True)
        gh("issue", "close", str(n), "-R", remote, check=False)
        gh("issue", "edit", str(n), "-R", remote, "--remove-label", MIRROR_LABEL, check=False)
        gh("issue", "comment", str(n), "-R", remote, "--body",
           f"Creazione annullata dal bridge: {exc}", check=False)
        print(json.dumps({"ok": False, "action": "new", "error": str(exc), "orphan_closed": n},
                         ensure_ascii=False))
        return 1
    print(json.dumps({"ok": True, "action": "new", "id": ident, "issue": n, "path": str(created)},
                     ensure_ascii=False, indent=1))
    return 0


def cmd_bind(board: Path, name: str, issue: int, dry: bool) -> int:
    """Lega un file di piano ESISTENTE a una issue ESISTENTE (caso `0009` <-> #13). Non rinomina."""
    hits = [p for _, p in plan_files(board) if p.name == name or p.stem == name]
    if len(hits) != 1:
        print(json.dumps({"ok": False, "action": "bind", "error": f"'{name}': {len(hits)} file"},
                         ensure_ascii=False))
        return 1
    fm, _ = split_fm(hits[0].read_text(encoding="utf-8"))
    if fm is None:
        print(json.dumps({"ok": False, "action": "bind",
                          "error": f"{name} non ha frontmatter: esegui prima `plan-board.py adopt`"},
                         ensure_ascii=False))
        return 1
    if not dry:
        set_machine_keys(hits[0], issue, "", "OPEN")   # il `push` successivo riallinea tutto
    print(json.dumps({"ok": True, "action": "bind", "file": str(hits[0]), "issue": issue,
                      "dry_run": dry}, ensure_ascii=False))
    return 0


# ---------------------------------------------------------------- main

def git_remote(repo: Path) -> str:
    out = subprocess.run(["git", "-C", str(repo), "remote", "get-url", "origin"],
                         capture_output=True, text=True, encoding="utf-8").stdout.strip()
    m = re.search(r"github\.com[:/]([^/\s.]+/[^/\s.]+)", out)
    if not m:
        raise SystemExit(f"impossibile dedurre owner/repo da {out!r}: passa --remote")
    return m.group(1)


def resolve_board_tool(explicit: str | None, repo: Path) -> Path:
    """Il path del plan-board.py va SEMPRE indicato: il ponte non indovina (nessun fallback
    cablato su questa macchina)."""
    cand = explicit or os.environ.get("ISSUE_BRIDGE_BOARD_TOOL")
    if not cand:
        local = repo / "plan" / "tools" / "plan-board.py"
        if not local.is_file():
            raise SystemExit("--board-tool mancante (o ISSUE_BRIDGE_BOARD_TOOL): indica il "
                             "plan-board.py da usare")
        cand = str(local)
    p = Path(cand).resolve()
    if not p.is_file():
        raise SystemExit(f"plan-board.py non trovato: {p}")
    return p


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="issue_bridge.py")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p):
        p.add_argument("--repo", default=".")
        p.add_argument("--board", default=None)
        p.add_argument("--remote", default=None)
        p.add_argument("--board-tool", dest="board_tool", default=None)
        p.add_argument("--json", action="store_true")
        p.add_argument("--dry-run", action="store_true")

    for name in ("check", "push", "pull"):
        common(sub.add_parser(name))
    p = sub.add_parser("new")
    p.add_argument("--title", required=True)
    p.add_argument("--body", required=True)
    p.add_argument("--column", default="draft")
    common(p)
    p = sub.add_parser("bind")
    p.add_argument("--file", required=True)
    p.add_argument("--issue", required=True, type=int)
    common(p)

    a = ap.parse_args(argv)
    repo = Path(a.repo).resolve()
    board = Path(a.board).resolve() if a.board else repo / "plan"
    remote = a.remote or git_remote(repo)
    tool = resolve_board_tool(a.board_tool, repo)
    if a.cmd == "check":
        return cmd_check(board, remote, tool)
    if a.cmd == "push":
        return cmd_push(board, remote, a.dry_run)
    if a.cmd == "pull":
        return cmd_pull(board, remote, tool, a.dry_run)
    if a.cmd == "new":
        return cmd_new(board, remote, tool, a.title, Path(a.body), a.column, a.dry_run)
    if a.cmd == "bind":
        return cmd_bind(board, a.file, a.issue, a.dry_run)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
