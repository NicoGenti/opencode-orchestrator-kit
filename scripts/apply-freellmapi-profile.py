#!/usr/bin/env python3
"""apply-freellmapi-profile.py - cabla una config OpenCode (profilo o progetto) su FreeLLMAPI.

  1. legge la riga `model:` gia' risolta da ogni file agente in --agents-dir;
  2. fonde nel config: provider `freellmapi`, `enabled_providers`, `default_agent`,
     mappa agent.<id>.model per OGNI agente trovato e (se richiesto) model/small_model
     di root per i builtin;
  3. con --strip-frontmatter toglie la riga `model:` dai file agente (la mappa del
     config diventa l'unica fonte).

Exit code: 0 ok · 1 input mancante/token non risolti · 2 config esistente non-JSON
(commenti o JSON invalido) -> ripetere con --force-config (backup datato automatico).
"""
from __future__ import annotations

import argparse, json, os, re, shutil, sys, time

PROVIDER_ID = "freellmapi"
PROVIDER_NAME = "FreeLlmApi"
PROVIDER_NPM = "@ai-sdk/openai-compatible"
DEFAULT_ALIASES = ["auto", "auto:fast", "auto:smart"]
MODEL_LINE_RE = re.compile(r"^model:[ \t]*(\S+)[ \t]*\r?$", re.MULTILINE)
FRONTMATTER_RE = re.compile(r"\A---\r?\n.*?\r?\n---", re.DOTALL)


def strip_jsonc(text: str) -> str:
    out, i, n, in_str, esc = [], 0, len(text), False, False
    while i < n:
        c = text[i]
        if in_str:
            out.append(c)
            if esc: esc = False
            elif c == "\\": esc = True
            elif c == '"': in_str = False
            i += 1; continue
        if c == '"':
            in_str = True; out.append(c); i += 1; continue
        if c == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] not in "\r\n": i += 1
            continue
        if c == "/" and i + 1 < n and text[i + 1] == "*":
            j = text.find("*/", i + 2); i = n if j == -1 else j + 2
            continue
        out.append(c); i += 1
    return "".join(out)


def iter_agent_files(agents_dirs):
    for d in agents_dirs:
        if not os.path.isdir(d): continue
        for name in sorted(os.listdir(d)):
            if name.endswith(".md"): yield os.path.join(d, name)


def read_agent_models(agents_dirs) -> dict:
    models = {}
    for path in iter_agent_files(agents_dirs):
        with open(path, encoding="utf-8", errors="replace", newline="") as fh:
            text = fh.read()
        m = MODEL_LINE_RE.search(text)
        if m: models[os.path.basename(path)[:-3]] = m.group(1)
    return models


def strip_model_lines(agents_dirs, apply: bool):
    changed = []
    for path in iter_agent_files(agents_dirs):
        with open(path, encoding="utf-8", errors="replace", newline="") as fh:
            text = fh.read()
        fm = FRONTMATTER_RE.match(text)
        if not fm: continue
        block = fm.group(0)
        new_block = MODEL_LINE_RE.sub("", block)
        if new_block == block: continue
        changed.append(path)
        if apply:
            with open(path, "w", encoding="utf-8", newline="") as fh:
                fh.write(new_block + text[fm.end():])
    return changed


def load_config(path):
    if not os.path.exists(path): return {}, None
    with open(path, encoding="utf-8", errors="replace", newline="") as fh:
        raw = fh.read()
    stripped = strip_jsonc(raw)
    if stripped != raw: return None, raw
    try:
        data = json.loads(stripped)
    except json.JSONDecodeError:
        return None, raw
    return (data, raw) if isinstance(data, dict) else (None, raw)


def build_config(cfg, api_key, base_url, agent_models, root_model, small_model):
    out = dict(cfg)
    out.setdefault("$schema", "https://opencode.ai/config.json")
    enabled = list(out.get("enabled_providers") or [])
    if PROVIDER_ID not in enabled: enabled.append(PROVIDER_ID)
    out["enabled_providers"] = enabled
    out.setdefault("default_agent", "orchestrator")
    if root_model: out["model"] = root_model
    if small_model: out["small_model"] = small_model

    ids = sorted({m.split("/", 1)[-1] for m in agent_models.values()} | set(DEFAULT_ALIASES))
    providers = dict(out.get("provider") or {})
    providers[PROVIDER_ID] = {
        "name": PROVIDER_NAME, "npm": PROVIDER_NPM,
        "options": {"baseURL": base_url, "apiKey": api_key},
        "models": {mid: {"id": mid} for mid in ids},
    }
    out["provider"] = providers

    agents = dict(out.get("agent") or {})
    for aid, model in agent_models.items():
        entry = dict(agents.get(aid) or {})
        entry["model"] = model
        agents[aid] = entry
    out["agent"] = dict(sorted(agents.items()))
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--agents-dir", action="append", default=[])
    ap.add_argument("--key", required=True)
    ap.add_argument("--base-url", default="http://127.0.0.1:31415/v1")
    ap.add_argument("--root-model", default="")
    ap.add_argument("--small-model", default="")
    ap.add_argument("--strip-frontmatter", action="store_true")
    ap.add_argument("--force-config", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)

    agent_models = read_agent_models(a.agents_dir)
    if not agent_models:
        print("ERROR: nessun agente con riga `model:` in %s" % a.agents_dir, file=sys.stderr); return 1
    bad = {k: v for k, v in agent_models.items() if "{{" in v}
    if bad:
        print("ERROR: token {{TIER_*}} non risolti: %s (eseguire prima install.sh)" % bad, file=sys.stderr); return 1

    cfg, raw = load_config(a.config)
    if cfg is None and not a.force_config:
        print("ERROR: %s esiste ma non e' JSON puro (commenti/JSON invalido)." % a.config, file=sys.stderr)
        print("       Ripetere con --force-config (verra' salvato un .bak-<timestamp>).", file=sys.stderr); return 2
    if cfg is None:
        print("  ! %s riscritto integralmente (--force-config): commenti non preservati." % a.config, file=sys.stderr)
        cfg = {}

    merged = build_config(cfg, a.key, a.base_url, agent_models, a.root_model, a.small_model)
    print("  > agenti mappati: %d" % len(agent_models))
    print("  > provider %s -> %s (%d id modello)" % (PROVIDER_ID, a.base_url,
                                                     len(merged["provider"][PROVIDER_ID]["models"])))
    if a.dry_run:
        print("  > dry-run: nessun file scritto"); return 0

    if raw is not None:
        backup = "%s.bak-%s" % (a.config, time.strftime("%Y%m%d-%H%M%S"))
        shutil.copy2(a.config, backup); print("  + backup %s" % backup)
    os.makedirs(os.path.dirname(os.path.abspath(a.config)), exist_ok=True)
    with open(a.config, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(merged, fh, indent=2); fh.write("\n")
    print("  + scritto %s" % a.config)

    if a.strip_frontmatter:
        changed = strip_model_lines(a.agents_dir, apply=True)
        print("  + rimosso `model:` da %d file agente" % len(changed))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())