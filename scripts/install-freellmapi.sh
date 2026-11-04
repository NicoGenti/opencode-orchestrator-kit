#!/usr/bin/env bash
# install-freellmapi.sh — one command: installs the orchestrator kit in <project> and
# wires every agent to the local FreeLLMAPI app (http://127.0.0.1:31415/v1).
#
#   bash scripts/install-freellmapi.sh [--with-extras] [--symlink] [--no-strip]
#        [--force-config] [--no-gitignore] [--no-preflight] [--no-smoke]
#        [--key <api-key>] [--base-url <url>] <project-dir>
#
# Esempio:  bash scripts/install-freellmapi.sh --with-extras D:/Work/MyProject
#
# The key is taken (in order) from --key, from $FREELLMAPI_API_KEY, or
# read read-only from the app DB: %APPDATA%\FreeLLMAPI\freeapi.db
# (settings table, unified_api_key entry). The key is never printed.
#
# It NEVER writes to the global .opencode2/** profile: the V2 commands
# (`debug config`, `debug agents`, `run`) are invoked READ-ONLY
# through the \`opencode2\ shim (~/bin/opencode2, overridable with $OC2_SHIM).
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
[[ -n "$PY" ]] || { echo "ERROR: python3/python/py is required on PATH." >&2; exit 1; }

case "$PROJECT" in
  /*|[A-Za-z]:[\\/]*) ;;
  *) echo "ERROR: an absolute path is required for <project-dir> (received: $PROJECT)" >&2; exit 1 ;;
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
[[ -n "$API_KEY" ]] || { echo "ERROR: FreeLLMAPI key missing (--key or FREELLMAPI_API_KEY)." >&2; exit 1; }

# 0) preflight: the app validates the Bearer, so the real key is used (never printed).
if [[ "$PREFLIGHT" == true ]]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
            -H "Authorization: Bearer ${API_KEY}" "$BASE_URL/models" || true)"
  if [[ "$code" == "200" ]]; then
    echo "  + preflight FreeLLMAPI OK ($BASE_URL)"
  elif [[ "$code" == "401" ]]; then
    echo "ERROR: FreeLLMAPI at $BASE_URL rejected the key (HTTP 401)." >&2
    exit 1
  else
    echo "ERROR: FreeLLMAPI unreachable at $BASE_URL (HTTP $code). Start the FreeLLMAPI app." >&2
    exit 1
  fi
fi

# 1) project model profile: default_preset = freellmapi (byte-minimal edit,
#    preserves the existing file's line endings).
mkdir -p "$OPENCODE_DIR"
TARGET_PROFILE="$OPENCODE_DIR/models.config.json"
if [[ ! -f "$TARGET_PROFILE" ]]; then
  cp "$(native "$KIT_DIR/templates/models.config.json")" "$TARGET_PROFILE"
  echo "  + seeded $TARGET_PROFILE"
fi
"$PY" - "$TARGET_PROFILE" <<'PYEOF'
import json, re, sys
p = sys.argv[1]
with open(p, encoding="utf-8", newline="") as fh:
    raw = fh.read()
cfg = json.loads(raw)
if "freellmapi" not in (cfg.get("presets") or {}):
    raise SystemExit("ERROR: preset 'freellmapi' missing in %s (update the kit or the file)" % p)
new, n = re.subn(r'("default_preset"\s*:\s*")[^"]*(")', r'\g<1>freellmapi\g<2>', raw, count=1)
if n == 0:
    raise SystemExit("ERROR: default_preset field not found in %s" % p)
with open(p, "w", encoding="utf-8", newline="") as fh:
    fh.write(new)
print("  + default_preset = freellmapi in %s" % p)
PYEOF

# 2) kit install into the project (copy + validation + {{TIER_*}} resolution).
#    Deviation from the plan, required on this host: `install.sh project` resolves
#    the target as "$(pwd)/.opencode" (MSYS form), which native python does not
#    read: resolution dies with "config file not found: \c\Users\...") even
#    with --skip-validation, which does not skip resolve_model_tokens (evidence
#    collected 2026-10-13 on a scratch dir). Same operations, rerun here with
#    native paths (same pattern as scripts/setup-oc2-fm-profile.sh, committed).
if [[ "$SYMLINK" == true ]]; then
  echo "ERROR: --symlink is not supported by the FreeLLMAPI profile: tier" >&2
  echo "       resolution and frontmatter stripping need copies. Use copy mode." >&2
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
# OpenCode loads {agent,agents}/**/*.md only. extras/ is not an agent directory,
# so opt-in agents are copied into agents/ (same rule as install.sh).
if [[ "$WITH_EXTRAS" == true ]]; then
  mkdir -p "$OPENCODE_DIR/agents"
  for entry in "$KIT_DIR/extras"/*.md; do
    [[ -e "$entry" ]] || continue
    copy_kit_component "$entry" "$OPENCODE_DIR/agents/$(basename "$entry")"
  done
  echo "  > Installed opt-in extras into $OPENCODE_DIR/agents/ (OpenCode does not load extras/)."
fi
copy_kit_component "$KIT_DIR/skills"          "$OPENCODE_DIR/skills"
copy_kit_component "$KIT_DIR/command"         "$OPENCODE_DIR/command"
if [[ -d "$OPENCODE_DIR/agents" ]]; then
  echo "  > Resolving model tiers in $OPENCODE_DIR/agents/*.md from $TARGET_PROFILE..."
  "$PY" "$(native "$KIT_DIR/scripts/apply-model-preset.py")" \
    --config "$TARGET_PROFILE" --agents-dir "$OPENCODE_DIR/agents"
fi
if [[ "$WITH_EXTRAS" == true && -d "$OPENCODE_DIR/extras" ]]; then
  echo "  ! Note: OpenCode does not load agents from $OPENCODE_DIR/extras/."
  echo "  > Resolving model tiers in legacy $OPENCODE_DIR/extras/*.md from $TARGET_PROFILE..."
  "$PY" "$(native "$KIT_DIR/scripts/apply-model-preset.py")" \
    --config "$TARGET_PROFILE" --agents-dir "$OPENCODE_DIR/extras"
fi
copy_kit_component "$KIT_DIR/AGENTS.md"       "$PROJECT_NATIVE/AGENTS.md"
copy_kit_component "$KIT_DIR/CONTRIBUTING.md" "$PROJECT_NATIVE/CONTRIBUTING.md"

# 3) provider + agent map in the project config, and strip of `model:` from the frontmatter
AGENT_DIRS=(--agents-dir "$OPENCODE_DIR/agents")
if [[ "$WITH_EXTRAS" == true && -d "$OPENCODE_DIR/extras" ]]; then
  # Legacy layout only. New installs place pc-doctor.md and writer.md in agents/.
  AGENT_DIRS+=(--agents-dir "$OPENCODE_DIR/extras")
fi
EXTRA_PY=()
[[ "$STRIP" == true ]] && EXTRA_PY+=(--strip-frontmatter)
[[ "$FORCE_CONFIG" == true ]] && EXTRA_PY+=(--force-config)
"$PY" "$(native "$KIT_DIR/scripts/apply-freellmapi-profile.py")" \
  --config "$OPENCODE_DIR/opencode.jsonc" "${AGENT_DIRS[@]}" \
  --key "$API_KEY" --base-url "$BASE_URL" "${EXTRA_PY[@]}"

# 4) the key sits in the project config: keep it out of an accidental commit
if [[ "$GITIGNORE" == true ]] && git -C "$PROJECT_NATIVE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GI="$PROJECT_NATIVE/.gitignore"
  if ! grep -q 'opencode-orchestrator-kit + FreeLLMAPI profile' "$GI" 2>/dev/null; then
    printf '\n# opencode-orchestrator-kit + FreeLLMAPI profile (contains a local API key)\n.opencode/opencode.jsonc\n.opencode/models.config.json\n' >> "$GI"
    echo "  + .gitignore updated ($GI)"
  fi
fi

# 5) static check: no unresolved token, no leftover model: (when stripping)
fail=0
CHECK_DIRS=("$OPENCODE_DIR/agents")
[[ -d "$OPENCODE_DIR/extras" ]] && CHECK_DIRS+=("$OPENCODE_DIR/extras")
tier_left="$(grep -rn '{{TIER_' "${CHECK_DIRS[@]}" --include='*.md' 2>/dev/null || true)"
if [[ -n "$tier_left" ]]; then
  echo "FAIL: unresolved {{TIER_*}} tokens remain:"
  printf '%s\n' "$tier_left" | head -5
  fail=1
fi
if [[ "$STRIP" == true ]]; then
  model_left="$(grep -rn '^model:' "${CHECK_DIRS[@]}" --include='*.md' 2>/dev/null || true)"
  if [[ -n "$model_left" ]]; then
    echo "FAIL: the agent frontmatter still contains model:"
    printf '%s\n' "$model_left" | head -5
    fail=1
  fi
fi

# 6) V2 check via the opencode2 shim (READ-ONLY, never written to the global profile)
if [[ -x "$OC2_SHIM" ]]; then
  AGENTS_JSON="$(mktemp 2>/dev/null || mktemp)"
  CFG_JSON="$(mktemp 2>/dev/null || mktemp)"
  ( cd "$PROJECT_NATIVE" && env -u PWD "$OC2_SHIM" debug agents ) > "$AGENTS_JSON" 2>/dev/null || true
  MODELS_TXT="$(mktemp 2>/dev/null || mktemp)"
  ( cd "$PROJECT_NATIVE" && env -u PWD "$OC2_SHIM" models ) > "$MODELS_TXT" 2>/dev/null || true

  ( cd "$PROJECT_NATIVE" && env -u PWD "$OC2_SHIM" debug config ) > "$CFG_JSON"  2>/dev/null || true

  # guard: `freellmapi` must appear among the enabled_providers seen by V2
  "$PY" - "$(native "$CFG_JSON")" "$(native "$MODELS_TXT")" <<'PYEOF' || warn=1

import json, sys
warn = 0
try:
    data = json.loads(open(sys.argv[1], encoding="utf-8", errors="replace").read())
except Exception:
    print("  > SKIP: `debug config` returned no JSON")
    raise SystemExit(0)
sources = data if isinstance(data, list) else (data.get("sources") if isinstance(data, dict) and isinstance(data.get("sources"), list) else [])
print("  > config sources:")
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
    print("  > SKIP: no recognized source in \`debug config\")
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
    print("  + guard: freellmapi among the enabled_providers seen by opencode2")
elif declared:
    n_cat = 0
    try:
        with open(sys.argv[2], encoding="utf-8", errors="replace") as fh:
            n_cat = sum(1 for ln in fh if ln.startswith("freellmapi/"))
    except Exception:
        n_cat = -1
    if n_cat > 0:
        print("  + guard: freellmapi in the runtime catalog (%d \`freellmapi/\" rows)" % n_cat)
    else:
        print("  WARNING: `freellmapi` is in the project config and resolves the agents, but does NOT enter")
        print("           the runtime catalogue: `opencode2 models` has no `freellmapi/` rows, so")
        print("           the TUI does not offer the provider and runs fail with `Model unavailable`.")
        print("           To work in this project use the dedicated profile: command `oc2-fm`.")
        warn = 1
else:
    print("  WARNING: `freellmapi` does not appear enabled in the project config seen by opencode2.")
    print("           I do NOT modify the global profile: for a dedicated profile use")
    print("           scripts/setup-oc2-fm-profile.sh (the \`oc2-fm\" command).")
    warn = 1
raise SystemExit(warn)
PYEOF

  # agent -> freellmapi providerID map for every agent in the project config
  "$PY" - "$(native "$AGENTS_JSON")" "$(native "$OPENCODE_DIR/opencode.jsonc")" <<'PYEOF' || fail=1
import json, sys
try:
    raw = open(sys.argv[1], encoding="utf-8", errors="replace").read().strip()
    agents = json.loads(raw)
except Exception:
    print("  > SKIP: `debug agents` returned no JSON (V2 service not running?)")
    raise SystemExit(0)
if not isinstance(agents, list):
    print("  > SKIP: unexpected format of \`debug agents\")
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
    print("  FAIL: config agents not registered in opencode2: %s" % ", ".join(sorted(missing)))
    raise SystemExit(1)
if bad:
    print("  FAIL: agents still on another provider: %s" % ", ".join(bad))
    raise SystemExit(1)
print("  + every mapped agent resolves providerID=freellmapi")
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
  echo "  > SKIP: opencode2 shim not found in $OC2_SHIM (check manually with: cd <project> && opencode2 debug agents)"
fi

echo
echo "FreeLLMAPI profile ready in $OPENCODE_DIR"
echo "  avvio:    cd $PROJECT_NATIVE && opencode2"
echo "  headless: $OC2_SHIM run -m freellmapi/auto:smart \"...\"  (run --agent ignores the map: -m is required)"
echo "  rollback: rm -rf $OPENCODE_DIR/agents $OPENCODE_DIR/skills $OPENCODE_DIR/command $OPENCODE_DIR/models.config.json $OPENCODE_DIR/opencode.jsonc $PROJECT_NATIVE/AGENTS.md $PROJECT_NATIVE/CONTRIBUTING.md"
exit $fail