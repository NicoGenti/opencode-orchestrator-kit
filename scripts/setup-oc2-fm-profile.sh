#!/usr/bin/env bash
# setup-oc2-fm-profile.sh - crea il profilo OpenCode V2 dedicato a FreeLLMAPI e il comando `oc2-fm`.
# NON tocca il profilo globale ($OC2_HOME/config/opencode): ne crea uno nuovo e separato.
#
#   bash scripts/setup-oc2-fm-profile.sh [--with-extras] [--port 49412]
#        [--bin-dir <dir>] [--oc2-home <dir>] [--force] [--key <api-key>]
#        [--base-url <url>] [--no-service-start] [--no-preflight] [--no-smoke]
set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OC2_HOME="${OC2_HOME:-}"
BASE_URL="${FREELLMAPI_BASE_URL:-http://127.0.0.1:31415/v1}"
API_KEY="${FREELLMAPI_API_KEY:-}"
PORT="${OC2_FM_PORT:-49412}"
BIN_DIR=""
WITH_EXTRAS=false
FORCE=false
PREFLIGHT=true
SMOKE=true
START_SERVICE=true

usage() {
  echo "Usage: bash scripts/setup-oc2-fm-profile.sh [--with-extras] [--port <n>] [--bin-dir <dir>]"
  echo "            [--oc2-home <dir>] [--force] [--key <k>] [--base-url <url>]"
  echo "            [--no-service-start] [--no-preflight] [--no-smoke]"
  exit 1
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-extras) WITH_EXTRAS=true; shift ;;
    --port) PORT="${2:?}"; shift 2 ;;
    --bin-dir) BIN_DIR="${2:?}"; shift 2 ;;
    --oc2-home) OC2_HOME="${2:?}"; shift 2 ;;
    --force) FORCE=true; shift ;;
    --key) API_KEY="${2:?}"; shift 2 ;;
    --base-url) BASE_URL="${2:?}"; shift 2 ;;
    --no-service-start) START_SERVICE=false; shift ;;
    --no-preflight) PREFLIGHT=false; shift ;;
    --no-smoke) SMOKE=false; shift ;;
    -h|--help) usage ;;
    *) echo "Flag sconosciuto: $1" >&2; usage ;;
  esac
done

native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s\n' "$1"; fi; }
PY=""; for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && { PY="$c"; break; }; done
[[ -n "$PY" ]] || { echo "ERROR: serve python3/python." >&2; exit 1; }

[[ -n "$OC2_HOME" ]] || OC2_HOME="$(native "$HOME/.opencode2")"
[[ -n "$BIN_DIR" ]] || BIN_DIR="$(native "$HOME/bin")"
CONFIG_DIR="$OC2_HOME/config-fm/opencode"
[[ -d "$OC2_HOME/node_modules/@opencode/cli" ]] || {
  echo "ERROR: nessuna install V2 in $OC2_HOME (serve node_modules/@opencode/cli)." >&2; exit 1; }

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

if [[ "$PREFLIGHT" == true ]]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Authorization: Bearer $API_KEY" "$BASE_URL/models" || true)"
  [[ "$code" == "200" ]] || { echo "ERROR: FreeLLMAPI non raggiungibile su $BASE_URL (HTTP $code). Avvia l'app." >&2; exit 1; }
  echo "  + preflight FreeLLMAPI OK ($BASE_URL)"
fi

if ! "$PY" - "$PORT" <<'PYEOF'
import socket, sys
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try: s.bind(("127.0.0.1", int(sys.argv[1])))
except OSError: raise SystemExit(1)
finally: s.close()
PYEOF
then
  echo "ERROR: porta $PORT occupata. Passare --port <altra>." >&2; exit 1
fi
echo "  + porta servizio $PORT libera"

if [[ -d "$CONFIG_DIR" ]]; then
  if [[ "$FORCE" != true ]]; then
    echo "ERROR: $CONFIG_DIR esiste gia'. Ripetere con --force (verra' archiviato)." >&2; exit 1
  fi
  mv "$CONFIG_DIR" "$CONFIG_DIR.bak-$(date +%Y%m%d-%H%M%S)"
  echo "  + vecchio profilo archiviato"
fi
mkdir -p "$CONFIG_DIR" "$OC2_HOME/data-fm" "$OC2_HOME/state-fm" "$OC2_HOME/cache-fm"

cp -R "$KIT_DIR/agents" "$CONFIG_DIR/agents"
[[ "$WITH_EXTRAS" == true ]] && cp -R "$KIT_DIR/extras" "$CONFIG_DIR/extras"
cp -R "$KIT_DIR/skills" "$CONFIG_DIR/skills"
cp -R "$KIT_DIR/command" "$CONFIG_DIR/command"
cp "$KIT_DIR/AGENTS.md" "$CONFIG_DIR/AGENTS.md"
cp "$KIT_DIR/CONTRIBUTING.md" "$CONFIG_DIR/CONTRIBUTING.md"
cp "$KIT_DIR/templates/models.config.json" "$CONFIG_DIR/models.config.json"
[[ -f "$OC2_HOME/config/opencode/cli.json" ]] && cp "$OC2_HOME/config/opencode/cli.json" "$CONFIG_DIR/cli.json"

"$PY" - "$CONFIG_DIR/models.config.json" <<'PYEOF'
import json, sys
p = sys.argv[1]
cfg = json.load(open(p, encoding="utf-8"))
if "freellmapi" not in (cfg.get("presets") or {}):
    raise SystemExit("ERROR: preset 'freellmapi' assente in %s" % p)
cfg["default_preset"] = "freellmapi"
with open(p, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(cfg, fh, indent=2); fh.write("\n")
print("  + default_preset = freellmapi")
PYEOF

"$PY" "$(native "$KIT_DIR/scripts/apply-model-preset.py")" \
  --config "$CONFIG_DIR/models.config.json" --agents-dir "$CONFIG_DIR/agents"
if [[ "$WITH_EXTRAS" == true && -d "$CONFIG_DIR/extras" ]]; then
  "$PY" "$(native "$KIT_DIR/scripts/apply-model-preset.py")" \
    --config "$CONFIG_DIR/models.config.json" --agents-dir "$CONFIG_DIR/extras"
fi

AGENT_DIRS=(--agents-dir "$CONFIG_DIR/agents")
[[ -d "$CONFIG_DIR/extras" ]] && AGENT_DIRS+=(--agents-dir "$CONFIG_DIR/extras")
"$PY" "$(native "$KIT_DIR/scripts/apply-freellmapi-profile.py")" \
  --config "$CONFIG_DIR/opencode.jsonc" "${AGENT_DIRS[@]}" \
  --key "$API_KEY" --base-url "$BASE_URL" \
  --root-model "freellmapi/auto:smart" --small-model "freellmapi/auto:fast" \
  --strip-frontmatter

"$PY" - "$CONFIG_DIR" <<'PYEOF'
import json, os, sys
base = sys.argv[1]
cfg = json.load(open(os.path.join(base, "opencode.jsonc"), encoding="utf-8"))
mapped = set((cfg.get("agent") or {}).keys())
files = set()
for d in ("agents", "extras"):
    p = os.path.join(base, d)
    if os.path.isdir(p):
        files |= {f[:-3] for f in os.listdir(p) if f.endswith(".md")}
missing = sorted(files - mapped)
if missing:
    raise SystemExit("ERROR: agent non mappati (il roster resterebbe vuoto): %s" % missing)
print("  + mappa completa: %d agenti" % len(mapped))
PYEOF

"$PY" - "$CONFIG_DIR/service.json" "$PORT" <<'PYEOF'
import json, sys
json.dump({"disabled": False, "port": int(sys.argv[2])}, open(sys.argv[1], "w", encoding="utf-8"), indent=2)
print("  + service.json porta %s" % sys.argv[2])
PYEOF

mkdir -p "$BIN_DIR"
for f in "$BIN_DIR/oc2-fm" "$BIN_DIR/oc2-fm.cmd"; do
  [[ -f "$f" ]] && { cp "$f" "$f.bak-$(date +%Y%m%d-%H%M%S)"; echo "  + backup $f"; }
done
cat > "$BIN_DIR/oc2-fm" <<EOF
#!/bin/sh
# Shim OpenCode V2 - profilo "fm" (FreeLLMAPI). Il profilo globale opencode2 non e' toccato.
OC2_HOME='$OC2_HOME'
if [ -z "\${OPENCODE_API_KEY:-}" ] && [ -f "\$OC2_HOME/bin/get-key.py" ]; then
  for _p in python python3 py; do
    command -v "\$_p" >/dev/null 2>&1 || continue
    OPENCODE_API_KEY="\$("\$_p" "\$OC2_HOME/bin/get-key.py" 2>/dev/null)"
    [ -n "\$OPENCODE_API_KEY" ] && { export OPENCODE_API_KEY; break; }
  done
fi
XDG_DATA_HOME="\$OC2_HOME/data-fm" \\
XDG_CONFIG_HOME="\$OC2_HOME/config-fm" \\
XDG_STATE_HOME="\$OC2_HOME/state-fm" \\
XDG_CACHE_HOME="\$OC2_HOME/cache-fm" \\
exec "\$OC2_HOME/node_modules/@opencode/cli/bin/opencode.exe" "\$@"
EOF
chmod +x "$BIN_DIR/oc2-fm"
cat > "$BIN_DIR/oc2-fm.cmd" <<EOF
@echo off
REM Shim OpenCode V2 - profilo "fm" (FreeLLMAPI). Il profilo globale opencode2 non e' toccato.
setlocal
set "OC2_HOME=$OC2_HOME"
set "XDG_DATA_HOME=%OC2_HOME%\\data-fm"
set "XDG_CONFIG_HOME=%OC2_HOME%\\config-fm"
set "XDG_STATE_HOME=%OC2_HOME%\\state-fm"
set "XDG_CACHE_HOME=%OC2_HOME%\\cache-fm"
if not defined OPENCODE_API_KEY (
  for /f "usebackq delims=" %%k in (\`py -3 "%OC2_HOME%\\bin\\get-key.py" 2^>nul\`) do set "OPENCODE_API_KEY=%%k"
)
if not defined OPENCODE_API_KEY (
  for /f "usebackq delims=" %%k in (\`python "%OC2_HOME%\\bin\\get-key.py" 2^>nul\`) do set "OPENCODE_API_KEY=%%k"
)
"%OC2_HOME%\\node_modules\\@opencode\\cli\\bin\\opencode.exe" %*
exit /b %ERRORLEVEL%
EOF
echo "  + shim scritti in $BIN_DIR (oc2-fm, oc2-fm.cmd)"

OC2_FM="$BIN_DIR/oc2-fm"
if [[ "$START_SERVICE" == true ]]; then
  sh "$OC2_FM" service set port "$PORT" >/dev/null 2>&1 || true
  sh "$OC2_FM" service set disabled false >/dev/null 2>&1 || true
  echo "--- service start"; sh "$OC2_FM" service start 2>&1 | tail -3
fi
cd "$(native "$HOME")"
if [[ "$START_SERVICE" == true ]]; then
  echo "--- debug paths"; sh "$OC2_FM" debug paths 2>&1 | head -8
  # Il servizio appena avviato risponde anche con roster vuoto/non-JSON (race misurata):
  # ritenta fino a 8 volte con attesa crescente prima di dichiarare il FAIL (cold start
  # misurato: il roster puo' restare vuoto oltre 20s dopo "service start").
  OC2_EXE="$OC2_HOME/node_modules/@opencode/cli/bin/opencode.exe"
  FM_OK=0
  for _try in 1 2 3 4 5 6 7 8; do
    OUT_A="$(env -u PWD \
      XDG_DATA_HOME="$OC2_HOME/data-fm" XDG_CONFIG_HOME="$OC2_HOME/config-fm" \
      XDG_STATE_HOME="$OC2_HOME/state-fm" XDG_CACHE_HOME="$OC2_HOME/cache-fm" \
      "$OC2_EXE" debug agents 2>/dev/null || true)"
    if printf '%s' "$OUT_A" | "$PY" - "$CONFIG_DIR/opencode.jsonc" <<'PYEOF'
import json, sys
try: agents = json.loads(sys.stdin.read())
except Exception:
    raise SystemExit(2)
cfg = json.load(open(sys.argv[1], encoding="utf-8"))
idx = {(a.get("id") or a.get("name")): a for a in agents}
bad = ["%s=%s" % (i, (idx[i].get("model") or {}).get("providerID")) for i in cfg["agent"]
       if i in idx and (idx[i].get("model") or {}).get("providerID") != "freellmapi"]
if len(agents) < len(cfg["agent"]) or bad:
    raise SystemExit(1)
print("  %d agenti enumerati" % len(agents))
print("  + tutti gli agenti del profilo risolvono providerID=freellmapi")
raise SystemExit(0)
PYEOF
    then FM_OK=1; echo "  + roster verificato (tentativo $_try)"; break; else sleep 6; fi
  done
  if [[ "$FM_OK" != 1 ]]; then
    echo "  FAIL: roster del profilo non verificato dopo i retry (vedi output sopra)"; exit 1
  fi
fi
if [[ "$SMOKE" == true ]]; then
  echo "--- smoke"
  # NB: qui NON si passa dallo shim: da MSYS la sh re-esporta una $PWD POSIX e il
  # comando `run` muore con "Failed to change directory" (pitfall documentato).
  # Eseguire direttamente l'exe con env -u PWD e i root XDG del profilo fm.
  OC2_EXE="$OC2_HOME/node_modules/@opencode/cli/bin/opencode.exe"
  if [[ -f "$OC2_EXE" ]]; then
    env -u PWD \
      XDG_DATA_HOME="$OC2_HOME/data-fm" XDG_CONFIG_HOME="$OC2_HOME/config-fm" \
      XDG_STATE_HOME="$OC2_HOME/state-fm" XDG_CACHE_HOME="$OC2_HOME/cache-fm" \
      "$OC2_EXE" run -m freellmapi/auto:smart "Respond with exactly: FREELMAPI_KIT_OK" 2>&1 | tail -3
  else
    sh "$OC2_FM" run -m freellmapi/auto:smart "Respond with exactly: FREELMAPI_KIT_OK" 2>&1 | tail -3
  fi
fi
echo
echo "Profilo fm pronto. Uso:  cd <progetto> && oc2-fm"
echo "Headless:               oc2-fm run -m freellmapi/auto:smart --agent orchestrator \"...\""
echo "Rollback:               rm -rf $OC2_HOME/config-fm $OC2_HOME/data-fm $OC2_HOME/state-fm $OC2_HOME/cache-fm $BIN_DIR/oc2-fm $BIN_DIR/oc2-fm.cmd"
