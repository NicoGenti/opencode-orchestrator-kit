#!/usr/bin/env bash
# install-freellmapi.sh — un comando: installa l'orchestrator kit in <project> e
# cabla ogni agente sull'app FreeLLMAPI locale (http://127.0.0.1:31415/v1).
#
#   bash scripts/install-freellmapi.sh [--with-extras] [--symlink] [--no-strip]
#        [--force-config] [--no-gitignore] [--no-preflight] [--no-smoke]
#        [--key <api-key>] [--base-url <url>] <project-dir>
#
# Esempio:  bash scripts/install-freellmapi.sh --with-extras D:/Work/MyProject
#
# La chiave viene presa (in ordine) da --key, da $FREELLMAPI_API_KEY, oppure
# letta in sola lettura dal DB dell'app: %APPDATA%\FreeLLMAPI\freeapi.db
# (tabella settings, chiave unified_api_key). La chiave non viene mai stampata.
#
# NON scrive MAI nel profilo globale .opencode2/**: i comandi V2
# (`debug config`, `debug agents`, `run`) sono invocati SOLO in lettura
# tramite lo shim `opencode2` (~/bin/opencode2, sovrascrivibile con $OC2_SHIM).
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${FREELLMAPI_BASE_URL:-http://127.0.0.1:31415/v1}"
API_KEY="${FREELLMAPI_API_KEY:-}"
OC2_SHIM="${OC2_SHIM:-$HOME/bin/opencode2}"
WITH_EXTRAS=false
SYMLINK=false
STRIP=true
FORCE_CONFIG=false
GITIGNORE=true
PREFLIGHT=true
SMOKE=true
PROJECT=""

usage() {
  echo "Usage: bash scripts/install-freellmapi.sh [--with-extras] [--symlink] [--no-strip]"
  echo "            [--force-config] [--no-gitignore] [--no-preflight] [--no-smoke]"
  echo "            [--key <api-key>] [--base-url <url>] <project-dir>"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-extras)   WITH_EXTRAS=true; shift ;;
    --symlink)       SYMLINK=true; STRIP=false; shift ;;
    --no-strip)      STRIP=false; shift ;;
    --force-config)  FORCE_CONFIG=true; shift ;;
    --no-gitignore)  GITIGNORE=false; shift ;;
    --no-preflight)  PREFLIGHT=false; shift ;;
    --no-smoke)      SMOKE=false; shift ;;
    --key)           API_KEY="${2:-}"; shift 2 ;;
    --base-url)      BASE_URL="${2:-}"; shift 2 ;;
    -h|--help)       usage ;;
    -*)              echo "Flag sconosciuto: $1" >&2; usage ;;
    *)               PROJECT="$1"; shift ;;
  esac
done
[[ -n "$PROJECT" ]] || usage

native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s\n' "$1"; fi; }
PY=""
for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && { PY="$c"; break; }; done
[[ -n "$PY" ]] || { echo "ERROR: serve python3/python/py sul PATH." >&2; exit 1; }

case "$PROJECT" in
  /*|[A-Za-z]:[\\/]*) ;;
  *) echo "ERROR: serve un percorso assoluto per <project-dir> (ricevuto: $PROJECT)" >&2; exit 1 ;;
esac
[[ -d "$PROJECT" ]] || { echo "ERROR: directory progetto inesistente: $PROJECT" >&2; exit 1; }
PROJECT_NATIVE="$(native "$PROJECT")"
OPENCODE_DIR="$PROJECT_NATIVE/.opencode"

read_key_from_app() {
  local db="${APPDATA:-$HOME/AppData/Roaming}/FreeLLMAPI/freeapi.db"
  [[ -f "$db" ]] || return 1
  "$PY" - "$db" <<'PYEOF'
import sqlite3, sys
p = sys.argv[1].replace("\\", "/")
con = sqlite3.connect("file:%s?mode=ro" % p, uri=True)
row = con.execute("select value from settings where key='unified_api_key'").fetchone()
print(row[0] if row else "")
PYEOF
}

[[ -n "$API_KEY" ]] || API_KEY="$(read_key_from_app || true)"
[[ -n "$API_KEY" ]] || { echo "ERROR: chiave FreeLLMAPI assente (--key o FREELLMAPI_API_KEY)." >&2; exit 1; }

# 0) preflight: l'app valida il Bearer, quindi si usa la chiave reale (mai stampata).
if [[ "$PREFLIGHT" == true ]]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
            -H "Authorization: Bearer ${API_KEY}" "$BASE_URL/models" || true)"
  if [[ "$code" == "200" ]]; then
    echo "  + preflight FreeLLMAPI OK ($BASE_URL)"
  elif [[ "$code" == "401" ]]; then
    echo "ERROR: FreeLLMAPI su $BASE_URL ha rifiutato la chiave (HTTP 401)." >&2
    exit 1
  else
    echo "ERROR: FreeLLMAPI non raggiungibile su $BASE_URL (HTTP $code). Avvia l'app FreeLLMAPI." >&2
    exit 1
  fi
fi

# 1) profilo modelli del progetto: default_preset = freellmapi (edit byte-minimal,
#    preserva i line ending del file esistente).
mkdir -p "$OPENCODE_DIR"
TARGET_PROFILE="$OPENCODE_DIR/models.config.json"
if [[ ! -f "$TARGET_PROFILE" ]]; then
  cp "$(native "$KIT_DIR/templates/models.config.json")" "$TARGET_PROFILE"
  echo "  + seminato $TARGET_PROFILE"
fi
"$PY" - "$TARGET_PROFILE" <<'PYEOF'
import json, re, sys
p = sys.argv[1]
with open(p, encoding="utf-8", newline="") as fh:
    raw = fh.read()
cfg = json.loads(raw)
if "freellmapi" not in (cfg.get("presets") or {}):
    raise SystemExit("ERROR: preset 'freellmapi' assente in %s (aggiorna il kit o il file)" % p)
new, n = re.subn(r'("default_preset"\s*:\s*")[^"]*(")', r'\g<1>freellmapi\g<2>', raw, count=1)
if n == 0:
    raise SystemExit("ERROR: campo default_preset non trovato in %s" % p)
with open(p, "w", encoding="utf-8", newline="") as fh:
    fh.write(new)
print("  + default_preset = freellmapi in %s" % p)
PYEOF

# 2) install del kit nel progetto (copia + validazione + risoluzione {{TIER_*}}).
#    Deviazione dal piano, necessaria su questo host: `install.sh project` risolve
#    il targeting come "$(pwd)/.opencode" (forma MSYS) che il python nativo non
#    legge e la risoluzione muore ("config file not found: \c\Users\...") anche
#    con --skip-validation, che non salta resolve_model_tokens (evidenza raccolta
#    2026-10-13, probe su dir di scratch). Stesse operazioni, rieseguite qui con
#    path nativi (pattern identico a scripts/setup-oc2-fm-profile.sh, committato).
if [[ "$SYMLINK" == true ]]; then
  echo "ERROR: --symlink non e' supportato dal profilo FreeLLMAPI: la risoluzione" >&2
  echo "       dei tier e lo strip del frontmatter richiedono copie. Usa la modalita' copy." >&2
  exit 1
fi
echo "  > Validating model profile at $TARGET_PROFILE (default_preset=freellmapi)..."
if ! bash "$KIT_DIR/scripts/validate-models.sh" --config "$TARGET_PROFILE" --skip-agents; then
  echo "  ! Model-profile validation FAILED for $TARGET_PROFILE." >&2
  exit 1
fi
copy_kit_component() {
  local src="$1" dst="$2"
  if [[ -e "$dst" ]]; then
    echo "  ! Skipping existing: $dst (remove it first if you want to overwrite)"
    return 0
  fi
  cp -R "$src" "$dst"
  echo "  + copied $dst"
}
copy_kit_component "$KIT_DIR/AGENTS.md"       "$OPENCODE_DIR/AGENTS.md"
copy_kit_component "$KIT_DIR/CONTRIBUTING.md" "$OPENCODE_DIR/CONTRIBUTING.md"
copy_kit_component "$KIT_DIR/agents"          "$OPENCODE_DIR/agents"
[[ "$WITH_EXTRAS" == true ]] && copy_kit_component "$KIT_DIR/extras" "$OPENCODE_DIR/extras"
copy_kit_component "$KIT_DIR/skills"          "$OPENCODE_DIR/skills"
copy_kit_component "$KIT_DIR/command"         "$OPENCODE_DIR/command"
if [[ -d "$OPENCODE_DIR/agents" ]]; then
  echo "  > Resolving model tiers in $OPENCODE_DIR/agents/*.md from $TARGET_PROFILE..."
  "$PY" "$(native "$KIT_DIR/scripts/apply-model-preset.py")" \
    --config "$TARGET_PROFILE" --agents-dir "$OPENCODE_DIR/agents"
fi
if [[ "$WITH_EXTRAS" == true && -d "$OPENCODE_DIR/extras" ]]; then
  echo "  > Resolving model tiers in $OPENCODE_DIR/extras/*.md from $TARGET_PROFILE..."
  "$PY" "$(native "$KIT_DIR/scripts/apply-model-preset.py")" \
    --config "$TARGET_PROFILE" --agents-dir "$OPENCODE_DIR/extras"
fi
copy_kit_component "$KIT_DIR/AGENTS.md"       "$PROJECT_NATIVE/AGENTS.md"
copy_kit_component "$KIT_DIR/CONTRIBUTING.md" "$PROJECT_NATIVE/CONTRIBUTING.md"

# 3) provider + mappa agent nel config di progetto, e strip del `model:` dal frontmatter
AGENT_DIRS=(--agents-dir "$OPENCODE_DIR/agents")
if [[ "$WITH_EXTRAS" == true && -d "$OPENCODE_DIR/extras" ]]; then
  AGENT_DIRS+=(--agents-dir "$OPENCODE_DIR/extras")
fi
EXTRA_PY=()
[[ "$STRIP" == true ]] && EXTRA_PY+=(--strip-frontmatter)
[[ "$FORCE_CONFIG" == true ]] && EXTRA_PY+=(--force-config)
"$PY" "$(native "$KIT_DIR/scripts/apply-freellmapi-profile.py")" \
  --config "$OPENCODE_DIR/opencode.jsonc" "${AGENT_DIRS[@]}" \
  --key "$API_KEY" --base-url "$BASE_URL" "${EXTRA_PY[@]}"

# 4) la chiave sta nel config di progetto: proteggerlo da un commit accidentale
if [[ "$GITIGNORE" == true ]] && git -C "$PROJECT_NATIVE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GI="$PROJECT_NATIVE/.gitignore"
  if ! grep -q 'opencode-orchestrator-kit + FreeLLMAPI profile' "$GI" 2>/dev/null; then
    printf '\n# opencode-orchestrator-kit + FreeLLMAPI profile (contiene una API key locale)\n.opencode/opencode.jsonc\n.opencode/models.config.json\n' >> "$GI"
    echo "  + .gitignore aggiornato ($GI)"
  fi
fi

# 5) verifica statica: nessun token non risolto, nessun model: residuo (se strip)
fail=0
CHECK_DIRS=("$OPENCODE_DIR/agents")
[[ -d "$OPENCODE_DIR/extras" ]] && CHECK_DIRS+=("$OPENCODE_DIR/extras")
tier_left="$(grep -rn '{{TIER_' "${CHECK_DIRS[@]}" --include='*.md' 2>/dev/null || true)"
if [[ -n "$tier_left" ]]; then
  echo "FAIL: restano token {{TIER_*}} non risolti:"
  printf '%s\n' "$tier_left" | head -5
  fail=1
fi
if [[ "$STRIP" == true ]]; then
  model_left="$(grep -rn '^model:' "${CHECK_DIRS[@]}" --include='*.md' 2>/dev/null || true)"
  if [[ -n "$model_left" ]]; then
    echo "FAIL: il frontmatter degli agenti contiene ancora model:"
    printf '%s\n' "$model_left" | head -5
    fail=1
  fi
fi

# 6) verifica V2 via shim opencode2 (SOLO LETTURA, mai scritta nel profilo globale)
if [[ -x "$OC2_SHIM" ]]; then
  AGENTS_JSON="$(mktemp 2>/dev/null || mktemp)"
  CFG_JSON="$(mktemp 2>/dev/null || mktemp)"
  ( cd "$PROJECT_NATIVE" && env -u PWD "$OC2_SHIM" debug agents ) > "$AGENTS_JSON" 2>/dev/null || true
  ( cd "$PROJECT_NATIVE" && env -u PWD "$OC2_SHIM" debug config ) > "$CFG_JSON"  2>/dev/null || true

  # guardia: `freellmapi` deve risultare fra gli enabled_providers visti da V2
  "$PY" - "$(native "$CFG_JSON")" <<'PYEOF' || warn=1
import json, sys
warn = 0
try:
    data = json.loads(open(sys.argv[1], encoding="utf-8", errors="replace").read())
except Exception:
    print("  > SKIP: `debug config` non ha restituito JSON")
    raise SystemExit(0)
sources = data if isinstance(data, list) else (data.get("sources") if isinstance(data, dict) and isinstance(data.get("sources"), list) else [])
print("  > sorgenti config:")
rows = []
for s in sources:
    if not isinstance(s, dict):
        continue
    path = str(s.get("path") or "")
    info = s.get("info") if isinstance(s.get("info"), dict) else None
    rows.append((path, info or {}))
    if path and "opencode" in path.lower():
        print("    %s | enabled_providers=%s" % (path, (info or {}).get("enabled_providers")))
if not rows:
    print("  > SKIP: nessuna sorgente riconosciuta in `debug config`")
    raise SystemExit(0)
ep_any = any(isinstance((i or {}).get("enabled_providers"), list)
             and "freellmapi" in i["enabled_providers"] for _, i in rows)
def proj_source(p):
    lp = p.lower().replace("\\", "/")
    return lp.endswith("/.opencode/opencode.jsonc") and "/.opencode2/" not in lp
proj = [(p, i) for p, i in rows if proj_source(p)]
declared = any("freellmapi" in json.dumps(i.get("agents") or {})
               or "freellmapi" in json.dumps(i.get("providers") or {})
               for _, i in proj if i)
if ep_any:
    print("  + guardia: freellmapi fra gli enabled_providers visti da opencode2")
elif declared:
    print("  + guardia: provider freellmapi e mappa agent presenti nella sorgente di progetto")
    print("            (.opencode/opencode.jsonc); opencode2 non riporta il campo")
    print("            `enabled_providers` nel debug config: la prova effettiva e' `debug agents`.")
else:
    print("  WARNING: `freellmapi` non risulta abilitato nel config di progetto visto da opencode2.")
    print("           NON modifico il profilo globale: per un profilo dedicato usa")
    print("           scripts/setup-oc2-fm-profile.sh (comando oc2-fm).")
    warn = 1
raise SystemExit(warn)
PYEOF

  # mappa agent -> providerID freellmapi per ogni agente del config di progetto
  "$PY" - "$(native "$AGENTS_JSON")" "$(native "$OPENCODE_DIR/opencode.jsonc")" <<'PYEOF' || fail=1
import json, sys
try:
    raw = open(sys.argv[1], encoding="utf-8", errors="replace").read().strip()
    agents = json.loads(raw)
except Exception:
    print("  > SKIP: `debug agents` non ha restituito JSON (servizio V2 non attivo?)")
    raise SystemExit(0)
if not isinstance(agents, list):
    print("  > SKIP: formato inatteso di `debug agents`")
    raise SystemExit(0)
cfg = json.load(open(sys.argv[2], encoding="utf-8"))
index = {(a.get("id") or a.get("name")): a for a in agents}
bad, missing = [], []
for aid in (cfg.get("agent") or {}):
    a = index.get(aid)
    if a is None:
        missing.append(aid)
        continue
    pid = (a.get("model") or {}).get("providerID")
    if pid != "freellmapi":
        bad.append("%s=%s" % (aid, pid))
print("  > agent mappati: %d | agenti enumerati: %d" % (len(cfg.get("agent") or {}), len(agents)))
if missing:
    print("  FAIL: agent del config non registrati in opencode2: %s" % ", ".join(sorted(missing)))
    raise SystemExit(1)
if bad:
    print("  FAIL: agent ancora su un altro provider: %s" % ", ".join(bad))
    raise SystemExit(1)
print("  + tutti gli agent mappati risolvono providerID=freellmapi")
PYEOF

  rm -f "$AGENTS_JSON" "$CFG_JSON"

  # smoke reale (opzionale): run per-progetto mappato su freellmapi
  if [[ "$SMOKE" == true ]]; then
    smoke_out="$(( cd "$PROJECT_NATIVE" && env -u PWD "$OC2_SHIM" \
       run -m freellmapi/auto:smart "Respond with exactly: FREELMAPI_KIT_OK" ) 2>&1 || true)"
    if grep -q 'FREELMAPI_KIT_OK' <<<"$smoke_out"; then
      echo "  + smoke OK (freellmapi/auto:smart)"
    else
      echo "  ! smoke fallito, ultime righe:"
      tail -5 <<<"$smoke_out"
      fail=1
    fi
  fi
else
  echo "  > SKIP: shim opencode2 non trovato in $OC2_SHIM (verifica manuale con: cd <project> && opencode2 debug agents)"
fi

echo
echo "Profilo FreeLLMAPI pronto in $OPENCODE_DIR"
echo "  avvio:    cd $PROJECT_NATIVE && opencode2"
echo "  headless: $OC2_SHIM run -m freellmapi/auto:smart \"...\"  (run --agent ignora la mappa: serve -m)"
echo "  rollback: rm -rf $OPENCODE_DIR/agents $OPENCODE_DIR/extras $OPENCODE_DIR/skills $OPENCODE_DIR/command $OPENCODE_DIR/models.config.json $OPENCODE_DIR/opencode.jsonc $PROJECT_NATIVE/AGENTS.md $PROJECT_NATIVE/CONTRIBUTING.md"
exit $fail