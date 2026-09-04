#!/usr/bin/env bash
# validate-models.sh — Phase 1 model-portability validator.
#
# Verifies that a model-profile is safe to apply before installation
# completes. Catches three classes of failure:
#
#   1. Missing required tiers in the selected preset.
#      Required: TIER_REASONING, TIER_CODE, TIER_FAST.
#      Optional with one-hop fallbacks:
#        TIER_ROUTER  -> TIER_REASONING
#        TIER_REVIEW  -> TIER_CODE
#
#   2. Unresolved `placeholder/...` sentinels in the preset.
#      Any tier whose resolved value still starts with `placeholder/`
#      is treated as not-yet-edited and rejected.
#
#   3. Unresolved `{{TIER_*}}` literals left in agent frontmatter.
#      Every `model:` line under agents/*.md and extras/*.md must be
#      either a {{TIER_*}} placeholder (which the installer resolves)
#      OR a concrete provider/model ID. Literal tokens remaining after
#      a `apply-model-preset.py` run are surfaced here.
#
# Usage:
#   bash scripts/validate-models.sh                       # validate default preset against default config
#   bash scripts/validate-models.sh --preset default      # validate the named preset
#   bash scripts/validate-models.sh --config path/to/json # use an alternate config
#   bash scripts/validate-models.sh --config templates/models.config.json --preset generic
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed; diagnostic lines printed to stdout
#
# The validator never edits files and is safe to run from any directory.

set -uo pipefail

# Canonical token order (must match scripts/resolve-model-preset.ts).
TOKENS=(TIER_ROUTER TIER_REASONING TIER_CODE TIER_FAST TIER_REVIEW)
# Required subset; the original three tiers.
REQUIRED_TOKENS=(TIER_REASONING TIER_CODE TIER_FAST)

# Defaults — overridable via flags.
CONFIG_PATH=".opencode/models.config.json"
PRESET_NAME=""
AGENTS_DIRS=("agents" "extras")

usage() {
  cat <<'USAGE'
Usage: bash scripts/validate-models.sh [--config <path>] [--preset <name>] [--agents-dir <path>]

Options:
  --config <path>      Path to a models.config.json file.
                        Default: .opencode/models.config.json
  --preset <name>      Preset to validate.
                        Default: the value of `default_preset` in the config.
  --agents-dir <path>  Repeatable. Directories to scan for agent .md files.
                        Default: agents, extras
  --skip-agents        Skip the {{TIER_*}} literal scan of agent files
                        (useful for templates/ before any agent file is
                        generated against them).
  -h, --help           Show this help and exit.

Exit codes:
  0  All checks passed.
  1  One or more checks failed; diagnostics printed above.
USAGE
}

# Parse args.
SCAN_AGENTS=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --config)
      CONFIG_PATH="${2:-}"
      shift 2
      ;;
    --preset)
      PRESET_NAME="${2:-}"
      shift 2
      ;;
    --agents-dir)
      AGENTS_DIRS+=("${2:-}")
      shift 2
      ;;
    --skip-agents)
      SCAN_AGENTS=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# Strip the default entries from AGENTS_DIRS if the user passed any --agents-dir
# (the user is responsible for including whatever they want scanned).
if [[ ${#AGENTS_DIRS[@]} -gt 2 ]]; then
  # Drop the first two defaults ("agents", "extras") — preserve user additions only.
  AGENTS_DIRS=("${AGENTS_DIRS[@]:2}")
fi

failures=0
diagnostics=()

note() {
  diagnostics+=("$1")
  echo "$1"
}

fail() {
  failures=$((failures + 1))
  diagnostics+=("$1")
  echo "$1"
}

if [[ ! -f "$CONFIG_PATH" ]]; then
  fail "FAIL: config not found at '$CONFIG_PATH'."
  echo ""
  echo "Copy templates/models.config.json to .opencode/models.config.json and edit, or pass --config <path>."
  exit 1
fi

# Use python3 for JSON parsing; this script is documented as requiring
# Python 3 (same dependency as scripts/apply-model-preset.py).
# Prefer `python3` (matches macOS/Linux/CI conventions and the existing
# documented dependency); fall back to `python` on hosts where only the
# Windows launcher is on PATH (the typical case for `python.exe`).
PYTHON_BIN=""
for _py in python3 python; do
  if command -v "$_py" >/dev/null 2>&1; then
    PYTHON_BIN="$_py"
    break
  fi
done
if [[ -z "$PYTHON_BIN" ]]; then
  fail "FAIL: python3 (or python) is required for JSON parsing but was not found in PATH."
  exit 1
fi

# Extract the active preset name and models with a small python one-shot
# so we do not have to hand-roll JSON parsing in bash.
read_config() {
  CONFIG_PATH="$1" PRESET_NAME="$2" "$PYTHON_BIN" <<'PYEOF'
import json, os, sys
path = os.environ["CONFIG_PATH"]
preset = os.environ.get("PRESET_NAME", "")
try:
    with open(path, "r", encoding="utf-8") as fh:
        cfg = json.load(fh)
except Exception as e:
    print(f"INVALID_JSON:{e}", file=sys.stderr)
    sys.exit(2)

if not isinstance(cfg, dict):
    print("NOT_OBJECT", file=sys.stderr)
    sys.exit(2)

presets = cfg.get("presets")
if not isinstance(presets, dict):
    print("NO_PRESETS", file=sys.stderr)
    sys.exit(2)

# Default preset name.
default_preset = cfg.get("default_preset")
target = preset or default_preset or ""

# Output as shell-eval-able lines.
print(f"DEFAULT_PRESET={default_preset!r}")
print(f"TARGET_PRESET={target!r}")
if target and target in presets:
    body = presets[target]
    label = body.get("label", "")
    description = body.get("description", "")
    models = body.get("models", {}) or {}
    print(f"PRESET_LABEL={label!r}")
    print(f"PRESET_DESCRIPTION={description!r}")
    # Emit one MODELS_<TIER>=... line per canonical tier.
    for t in ("TIER_ROUTER", "TIER_REASONING", "TIER_CODE", "TIER_FAST", "TIER_REVIEW"):
        v = models.get(t, "")
        print(f"MODELS_{t}={v!r}")
else:
    print(f"PRESET_FOUND=0")
    names = sorted(presets.keys())
    print(f"AVAILABLE_PRESETS={','.join(names)!r}")
PYEOF
}

# Parse output of read_config into shell variables.
config_output="$(read_config "$CONFIG_PATH" "$PRESET_NAME" 2>&1)"
rc=$?
if [[ $rc -ne 0 ]]; then
  case "$config_output" in
    INVALID_JSON:*) fail "FAIL: $CONFIG_PATH contains invalid JSON (${config_output#INVALID_JSON:}).";;
    NO_PRESETS) fail "FAIL: $CONFIG_PATH has no 'presets' object.";;
    NOT_OBJECT) fail "FAIL: $CONFIG_PATH is not a JSON object.";;
    *) fail "FAIL: could not parse $CONFIG_PATH.";;
  esac
  exit 1
fi

DEFAULT_PRESET=""
TARGET_PRESET=""
PRESET_FOUND=1
MODELS_TIER_ROUTER=""
MODELS_TIER_REASONING=""
MODELS_TIER_CODE=""
MODELS_TIER_FAST=""
MODELS_TIER_REVIEW=""
AVAILABLE_PRESETS=""

while IFS= read -r line; do
  case "$line" in
    DEFAULT_PRESET=*) DEFAULT_PRESET="${line#DEFAULT_PRESET=}" ;;
    TARGET_PRESET=*) TARGET_PRESET="${line#TARGET_PRESET=}" ;;
    PRESET_FOUND=*) PRESET_FOUND="${line#PRESET_FOUND=}" ;;
    MODELS_TIER_*)    eval "$line" ;;
    AVAILABLE_PRESETS=*) AVAILABLE_PRESETS="${line#AVAILABLE_PRESETS=}" ;;
  esac
done <<< "$config_output"

if [[ -z "$TARGET_PRESET" ]]; then
  fail "FAIL: no preset specified and no 'default_preset' in $CONFIG_PATH. Pass --preset <name>."
  exit 1
fi

if [[ "$PRESET_FOUND" != "1" ]]; then
  fail "FAIL: preset '$TARGET_PRESET' not found in $CONFIG_PATH."
  note "       Available presets: ${AVAILABLE_PRESETS:-(none)}"
  exit 1
fi

note "Validating preset '$TARGET_PRESET' in $CONFIG_PATH"

# Apply one-hop fallbacks for the check (the runtime does the same in TS).
resolved_router="$MODELS_TIER_ROUTER"
resolved_reasoning="$MODELS_TIER_REASONING"
resolved_code="$MODELS_TIER_CODE"
resolved_fast="$MODELS_TIER_FAST"
resolved_review="$MODELS_TIER_REVIEW"

if [[ -z "$resolved_router" ]]; then
  resolved_router="$resolved_reasoning"
  note "  - TIER_ROUTER omitted: falling back to TIER_REASONING."
fi
if [[ -z "$resolved_review" ]]; then
  resolved_review="$resolved_code"
  note "  - TIER_REVIEW omitted: falling back to TIER_CODE."
fi

# Check required tiers are non-empty.
missing=()
for token in "${REQUIRED_TOKENS[@]}"; do
  case "$token" in
    TIER_REASONING) v="$resolved_reasoning" ;;
    TIER_CODE)      v="$resolved_code" ;;
    TIER_FAST)      v="$resolved_fast" ;;
  esac
  if [[ -z "$v" ]]; then
    missing+=("$token")
  fi
done
if [[ ${#missing[@]} -gt 0 ]]; then
  fail "FAIL: preset '$TARGET_PRESET' is missing required tier(s): ${missing[*]}"
fi

# Check no value starts with placeholder/.
declare -A resolved_for_check
resolved_for_check[TIER_ROUTER]="$resolved_router"
resolved_for_check[TIER_REASONING]="$resolved_reasoning"
resolved_for_check[TIER_CODE]="$resolved_code"
resolved_for_check[TIER_FAST]="$resolved_fast"
resolved_for_check[TIER_REVIEW]="$resolved_review"

placeholder_offenders=()
for token in "${TOKENS[@]}"; do
  v="${resolved_for_check[$token]}"
  if [[ -n "$v" && "$v" == placeholder/* ]]; then
    placeholder_offenders+=("$token=$v")
  fi
done
if [[ ${#placeholder_offenders[@]} -gt 0 ]]; then
  fail "FAIL: preset '$TARGET_PRESET' has unresolved placeholder(s):"
  for offender in "${placeholder_offenders[@]}"; do
    fail "       - $offender"
  done
  fail "       Edit $CONFIG_PATH and replace placeholder/* values with concrete provider/model IDs."
fi

# Scan agent files for unresolved {{TIER_*}} literals if requested.
if [[ "$SCAN_AGENTS" -eq 1 ]]; then
  agent_files=()
  for d in "${AGENTS_DIRS[@]}"; do
    if [[ -d "$d" ]]; then
      while IFS= read -r f; do
        agent_files+=("$f")
      done < <(find "$d" -maxdepth 1 -type f -name '*.md' | sort)
    fi
  done

  if [[ ${#agent_files[@]} -gt 0 ]]; then
    # Collect unique tokens used and check each resolves.
    # Strip CR so CRLF agent files do not leak '\r' into captured tier names.
    # This is line-ending-safe; LF files are unaffected.
    declared_tokens="$(grep -hE '^model:\s*\{\{TIER_[A-Z_]+\}\}' "${agent_files[@]}" 2>/dev/null \
      | sed -E 's/^model:\s*\{\{([^}]+)\}\}/\1/' \
      | tr -d '\r' \
      | sort -u || true)"
    unresolvable=()
    while IFS= read -r token; do
      [[ -z "$token" ]] && continue
      case "$token" in
        TIER_ROUTER)    v="$resolved_router" ;;
        TIER_REASONING) v="$resolved_reasoning" ;;
        TIER_CODE)      v="$resolved_code" ;;
        TIER_FAST)      v="$resolved_fast" ;;
        TIER_REVIEW)    v="$resolved_review" ;;
        *)              v="" ;;
      esac
      if [[ -z "$v" ]]; then
        unresolvable+=("$token")
      fi
    done <<< "$declared_tokens"
    if [[ ${#unresolvable[@]} -gt 0 ]]; then
      fail "FAIL: agent frontmatter declares {{TIER_*}} token(s) the preset cannot resolve:"
      for u in "${unresolvable[@]}"; do
        fail "       - {{$u}}"
      done
    fi
    note "Scanned ${#agent_files[@]} agent file(s) for unresolved {{TIER_*}} literals."
  else
    note "No agent files found in scanned dirs (${AGENTS_DIRS[*]}); skipping token-resolution check."
  fi
fi

if [[ $failures -eq 0 ]]; then
  echo ""
  echo "OK: preset '$TARGET_PRESET' passed all checks."
  echo "  Required tiers present: ${REQUIRED_TOKENS[*]}"
  echo "  Resolved router  -> ${resolved_router:-<empty>}"
  echo "  Resolved review  -> ${resolved_review:-<empty>}"
  exit 0
fi

echo ""
echo "FAIL: $failures check(s) failed for preset '$TARGET_PRESET'."
exit 1