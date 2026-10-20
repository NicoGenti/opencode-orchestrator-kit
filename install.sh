#!/usr/bin/env bash
# OpenCode Orchestrator Kit — installer
# Works for native OpenCode (project or global config) and for OpenCode Studio profiles.
# Usage:
#   ./install.sh project                       # copy into ./.opencode/ + ./AGENTS.md (this repo only)
#   ./install.sh global                        # copy into ~/.config/opencode/ (all projects)
#   ./install.sh studio <profile>              # copy into an OpenCode Studio profile directory
#   ./install.sh --symlink ...                 # same targets, but symlink instead of copy (keeps kit updatable via git pull)
#   ./install.sh --with-extras ...             # also install extras/ directory (pc-doctor, writer)
#   ./install.sh --with-examples ...           # also install skills/examples/ directory
#   ./install.sh --yes ...                     # opt in to non-interactive consent (Phase 2 will use this for package managers)
#
# Phase 1 model portability:
#   The installer seeds .opencode/models.config.json from templates/models.config.json
#   when no local config exists yet, then runs scripts/validate-models.sh against
#   the active preset. Validation failure aborts the install before any files are
#   written to the target directory.
#   After copying, the installer runs scripts/apply-model-preset.py against the
#   target's models.config.json and agents/ (and extras/ with --with-extras) to
#   resolve every {{TIER_*}} token in agent frontmatter to a concrete
#   provider/model ID. Without this step OpenCode rejects the config at startup
#   ("Configuration is invalid ... model").
#
# Comprehension gate config: seeded leave-if-exists from templates/comprehension.config.json.
#
# Phase 1 (this draft) prerequisite checkpoint:
#   A `require_python_prereq` helper hard-fails the install before any write to
#   the target directory if a Python >=3.6 interpreter is not on PATH. The
#   function resolves `python3` then `python` (first hit wins) and runs a static
#   version-probe. When Python is missing or too old, the helper either prompts
#   once (TTY only, default NO, EOF/non-TTY safe) or accepts --yes from the
#   command line. In this phase the helper does NOT invoke a package manager;
#   it falls through to a per-platform manual-install block. Phase 2 will
#   replace the fall-through with the apt-get / dnf / brew branch. --skip-
#   validation does NOT waive the Python requirement.
#
# Phase 3 OS allowlist:
#   The installer refuses to run on environments outside the supported set:
#   Linux, macOS, and Windows under Git Bash / MSYS / Cygwin. Detection runs
#   before any argument parsing so the gate is the first thing evaluated.
#   Set KIT_SKIP_OS_CHECK=1 to bypass only if you have already confirmed the
#   environment is supported by another path (advanced override).

set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="copy"
# TARGET is re-captured from the first non-flag argument after the flag
# parser has consumed any leading options. A leading `TARGET="${1:-}"`
# here would break `--yes project` / `--skip-validation project` because
# the case dispatch at the end of the script would see the flag name
# and fall through to `usage`. The re-capture below is the source of
# truth; this initial value is only used as a placeholder.
TARGET=""
WITH_EXTRAS=false
WITH_EXAMPLES=false
SKIP_VALIDATION=false
# Phase 1 --yes flag. Set only via the command line; never read from the
# environment, env vars, or any other source. Used by require_python_prereq
# to opt the run in to non-interactive consent (Phase 2 will extend this
# to the actual package-manager invocation).
ASSUME_YES=false
# KIT_OS_KIND is captured from scripts/detect-os.sh's `KIND:<value>` line
# and consumed by print_python_manual_install_block to select the right
# per-platform instructions. It is unset until the OS gate runs.
KIT_OS_KIND=""

# Phase 3 — OS allowlist gate.
#
# Detect the active shell and refuse to install on environments outside the
# supported set: Linux, macOS, and Windows under Git Bash / MSYS / Cygwin.
# The detector is sourced, so a failure here aborts the installer cleanly
# before any file is written to the target. Run with `KIT_SKIP_OS_CHECK=1`
# only if you have already confirmed the environment is supported by
# another path (advanced override; not part of the documented flow).
DETECT_OS_SH="${KIT_DIR}/scripts/detect-os.sh"
if [[ -f "$DETECT_OS_SH" ]]; then
  # shellcheck disable=SC1090
  source "$DETECT_OS_SH"
  if [[ "${KIT_SKIP_OS_CHECK:-}" != "1" ]]; then
    # The detector prints "KIND:<value>" on success or a multi-line UNSUPPORTED
    # diagnostic on stderr and exits non-zero on failure. We capture both so a
    # failure surfaces the detector's own message rather than a generic line.
    os_diag="${TMPDIR:-/tmp}/kit-os-diag.$$"
    : > "$os_diag"
    set +e
    os_line="$(detect_supported_os 2>"$os_diag")"
    os_status=$?
    set -e
    if [[ "$os_status" -ne 0 || "${os_line#KIND:}" == "$os_line" ]]; then
      echo "Error: this installer requires a supported operating system / shell." >&2
      echo "  Supported: Linux, macOS, Windows under Git Bash / MSYS / Cygwin." >&2
      if [[ -s "$os_diag" ]]; then
        # Forward the detector's own diagnostic, indented for readability.
        while IFS= read -r line; do
          echo "  detector: $line" >&2
        done < "$os_diag"
      fi
      echo "  Re-run from a bash-compatible shell on one of the supported platforms." >&2
      echo "  (override only if you have already confirmed support: KIT_SKIP_OS_CHECK=1)" >&2
      rm -f "$os_diag"
      exit 1
    fi
    rm -f "$os_diag"
    # Capture the bare kind (e.g. "linux", "macos", "windows-gitbash")
    # for use by the Phase 1 prerequisite checkpoint's manual-install
    # block. The leading "KIND:" prefix is stripped; "(forced)" suffixes
    # introduced by KIT_FORCE_KIND are likewise stripped. If anything
    # unexpected slips through, the manual-install block falls back to
    # a generic "install Python for your platform" message.
    KIT_OS_KIND="${os_line#KIND:}"
    KIT_OS_KIND="${KIT_OS_KIND% (forced)}"
    echo "Detected shell kind: $KIT_OS_KIND"
  else
    # The OS-allowlist gate is bypassed (KIT_SKIP_OS_CHECK=1) but the
    # Phase 1 prerequisite checkpoint still needs to know which
    # platform manual-install block to print. Honor the test-only
    # KIT_FORCE_KIND override here so the block is right even when
    # the rest of the detection is suppressed. Unknown / unset values
    # leave KIT_OS_KIND empty, which the manual-install block treats
    # as a generic "install Python for your platform" message.
    case "${KIT_FORCE_KIND:-}" in
      linux|macos|windows-gitbash|windows-msys|windows-cygwin)
        KIT_OS_KIND="${KIT_FORCE_KIND}"
        echo "Detected shell kind (forced): $KIT_OS_KIND"
        ;;
    esac
  fi
else
  echo "Error: scripts/detect-os.sh not found at ${DETECT_OS_SH}." >&2
  echo "  The OS-allowlist check could not run. Reinstall the kit or restore scripts/detect-os.sh." >&2
  exit 1
fi

# Parse optional flags
while [[ $# -gt 0 ]]; do
  case $1 in
    --with-extras)
      WITH_EXTRAS=true
      shift
      ;;
    --with-examples)
      WITH_EXAMPLES=true
      shift
      ;;
    --symlink)
      MODE="symlink"
      TARGET="${2:-}"
      PROFILE_NAME="${3:-}"
      shift
      ;;
    --skip-validation)
      SKIP_VALIDATION=true
      shift
      ;;
    --yes)
      # Phase 1: opt the run in to non-interactive consent. Phase 2
      # will use this flag to authorize the apt-get / dnf / brew
      # install. The flag is set ONLY by its command-line form; the
      # environment is never consulted.
      ASSUME_YES=true
      shift
      ;;
    *)
      break
      ;;
  esac
done

# Re-capture TARGET and PROFILE_NAME from the first non-flag argument.
# The flag parser above consumes leading options (e.g. `--yes project`)
# but does not update TARGET. Doing it here keeps the case dispatch
# at the end of the script pointing at the user's chosen mode.
if [[ -z "$TARGET" ]]; then
  TARGET="${1:-}"
fi
if [[ "${1:-}" != "--symlink" ]]; then
  PROFILE_NAME="${2:-}"
fi

usage() {
  echo "Usage: $0 [--symlink] [--with-extras] [--with-examples] [--skip-validation] [--yes] {project|global|studio <profile-name>}"
  echo ""
  echo "Options:"
  echo "  --with-extras       Install extras/ directory (pc-doctor, writer)"
  echo "  --with-examples     Install skills/examples/ directory (language-specific skill examples)"
  echo "  --skip-validation   Skip the Phase 1 model-profile validator (not recommended)"
  echo "  --yes               Opt in to non-interactive consent for prerequisite installation"
  echo "                      (Phase 1 prints manual instructions only; Phase 2 will use this"
  echo "                      flag to authorize apt-get / dnf / brew.)"
  echo ""
  echo "Modes:"
  echo "  project              Install into ./.opencode/ + ./AGENTS.md (this repo only)"
  echo "  global               Install into ~/.config/opencode/ (all projects)"
  echo "  studio <profile>     Install into an OpenCode Studio profile directory"
  echo ""
  echo "  --symlink            Symlink instead of copy (keeps kit updatable via git pull)"
  exit 1
}

link_or_copy() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  if [[ -e "$dst" ]]; then
    echo "  ! Skipping existing: $dst (remove it first if you want to overwrite)"
    return
  fi
  if [[ "$MODE" == "symlink" ]]; then
    ln -s "$src" "$dst"
    echo "  + symlinked $dst -> $src"
  else
    cp -R "$src" "$dst"
    echo "  + copied $dst"
  fi
}

# Phase 1 model-profile selection and validation.
#
# Behavior:
#   - If a .opencode/models.config.json already exists in the target, leave it alone.
#   - Otherwise copy templates/models.config.json to the target's .opencode/ so
#     the user has a known-good starting point (the `default` preset is fully
#     concrete; `generic` is intentionally left as placeholders for editing).
#   - Run scripts/validate-models.sh against the default preset. If it fails,
#     abort the install before any other file is written.
#
# The function is idempotent: if the user re-runs install.sh after editing the
# config, this step is a no-op on the config file and re-runs validation only.
install_model_profile() {
  local base="$1"
  local target_config="${base}/models.config.json"
  local target_dir
  target_dir="$(dirname "$target_config")"
  mkdir -p "$target_dir"

  if [[ ! -e "$target_config" ]]; then
    if [[ -f "${KIT_DIR}/templates/models.config.json" ]]; then
      cp "${KIT_DIR}/templates/models.config.json" "$target_config"
      echo "  + seeded ${target_config} from templates/models.config.json"
      echo "    Edit it to point tiers at your provider/model IDs, or keep the 'default' preset."
    else
      echo "  ! WARNING: templates/models.config.json not found in ${KIT_DIR};"
      echo "    skipping model-profile seed. Run scripts/validate-models.sh manually later."
      return 0
    fi
  fi

  if [[ "$SKIP_VALIDATION" == "true" ]]; then
    echo "  > Skipping Phase 1 model-profile validation (--skip-validation)."
    return 0
  fi

  if [[ ! -x "${KIT_DIR}/scripts/validate-models.sh" ]]; then
    echo "  > Note: scripts/validate-models.sh is not executable; running it via bash."
  fi

  echo "  > Validating model profile at ${target_config}..."
  if ! bash "${KIT_DIR}/scripts/validate-models.sh" --config "$target_config"; then
    echo ""
    echo "  ! Model-profile validation FAILED for ${target_config}."
    echo "    Fix the unresolved tiers/placeholders and re-run the installer."
    echo "    Re-run with --skip-validation only if you accept running with broken tiers."
    return 1
  fi
}

# Phase D comprehension-gate config seeding.
#
# Behavior:
#   - If a comprehension.config.json already exists in the target, leave it alone.
#   - Otherwise copy templates/comprehension.config.json to the target so the user
#     has a known-good starting point.
#   - A missing template is a WARNING only: the install continues. This is
#     deliberately NOT the abort-on-failure behavior of install_model_profile's
#     validation step — the comprehension gate falls back to built-in defaults.
#
# Idempotent: re-running install.sh after editing the config is a no-op here.
seed_comprehension_config() {
  local base="$1"
  local target_config="${base}/comprehension.config.json"

  if [[ ! -e "$target_config" ]]; then
    if [[ -f "${KIT_DIR}/templates/comprehension.config.json" ]]; then
      if cp "${KIT_DIR}/templates/comprehension.config.json" "$target_config"; then
        echo "  + seeded ${target_config} from templates/comprehension.config.json"
      else
        echo "  ! WARNING: failed to seed ${target_config} from templates/comprehension.config.json;"
        echo "    built-in defaults will apply."
        return 0
      fi
    else
      echo "  ! WARNING: templates/comprehension.config.json not found in ${KIT_DIR};"
      echo "    skipping comprehension-gate config seed (built-in defaults will apply)."
      return 0
    fi
  fi
}

install_into() {
  local base="$1"
  echo "Installing OpenCode Orchestrator Kit into: $base"
  link_or_copy "$KIT_DIR/AGENTS.md"       "$base/AGENTS.md"
  link_or_copy "$KIT_DIR/CONTRIBUTING.md" "$base/CONTRIBUTING.md"
  link_or_copy "$KIT_DIR/agents"          "$base/agents"
  if [[ "$WITH_EXTRAS" == "true" ]]; then
    link_or_copy "$KIT_DIR/extras"        "$base/extras"
  fi
  link_or_copy "$KIT_DIR/skills"          "$base/skills"
  if [[ "$WITH_EXAMPLES" == "true" ]]; then
    link_or_copy "$KIT_DIR/skills/examples" "$base/skills/examples"
  fi
  link_or_copy "$KIT_DIR/command"         "$base/command"
}

# Phase 1 model-token resolution.
#
# Agent frontmatter ships with logical tier tokens (model: {{TIER_FAST}}).
# OpenCode rejects those literals at startup:
#   "Configuration is invalid ... Expected string | undefined, got {...} model"
# so every token must be rewritten to the concrete provider/model ID from the
# active preset in <base>/models.config.json before the user runs `opencode`.
# Idempotent: files whose model line is already concrete are left untouched.
# kit_native_path converts an MSYS-style path (/e/repo/...) to the native
# forward-slash form a Windows python.exe can open (E:/repo/...). No-op on
# Linux/macOS; on Git Bash / MSYS / Cygwin it uses cygpath when available.
kit_native_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$p"
  else
    printf '%s\n' "$p"
  fi
}

resolve_model_tokens() {
  local base="$1"
  local config="${base}/models.config.json"

  if [[ ! -f "$config" ]]; then
    echo "  ! WARNING: ${config} not found; skipping model-token resolution."
    echo "    Agents keep literal {{TIER_*}} model lines and OpenCode may refuse to start."
    return 0
  fi

  local py=""
  # Prefer the interpreter resolved by require_python_prereq when
  # available, so a run with multiple interpreters on PATH picks the
  # same one the checkpoint accepted. Fall back to the historical
  # PATH probe when the checkpoint was skipped (e.g. an early
  # installer revision without the checkpoint call site).
  if [[ -n "${KIT_PY:-}" ]] && command -v "${KIT_PY}" >/dev/null 2>&1; then
    py="${KIT_PY}"
  else
    for _cand in python3 python; do
      if command -v "$_cand" >/dev/null 2>&1; then py="$_cand"; break; fi
    done
  fi
  if [[ -z "$py" ]]; then
    echo "  ! WARNING: no python3/python on PATH; cannot resolve {{TIER_*}} model tokens."
    echo "    Agents keep literal {{TIER_*}} model lines and OpenCode may refuse to start."
    return 0
  fi

  if [[ -d "${base}/agents" ]]; then
    echo "  > Resolving model tiers in ${base}/agents/*.md from ${config}..."
    "$py" "$(kit_native_path "${KIT_DIR}/scripts/apply-model-preset.py")" \
      --config "$config" --agents-dir "${base}/agents"
  fi
  if [[ "$WITH_EXTRAS" == "true" && -d "${base}/extras" ]]; then
    echo "  > Resolving model tiers in ${base}/extras/*.md from ${config}..."
    "$py" "$(kit_native_path "${KIT_DIR}/scripts/apply-model-preset.py")" \
      --config "$config" --agents-dir "${base}/extras"
  fi
}

# Phase 1 — print a per-platform manual-install block for Python >=3.6.
# This is the ONLY output of the prerequisite failure path besides the
# eventual non-zero exit. The branch is selected by KIT_OS_KIND, which
# is captured from scripts/detect-os.sh's `KIND:<value>` line. The
# function MUST NOT invoke a package manager; it only prints the manual
# block. The kind values here match the allowlist emitted by
# scripts/detect-os.sh. Any unrecognized kind falls through to a
# generic message.
print_python_manual_install_block() {
  local kind="${KIT_OS_KIND:-linux}"
  echo "" >&2
  echo "Error: Python >=3.6 is required but was not found on PATH or is too old." >&2
  echo "" >&2
  case "$kind" in
    linux)
      echo "Install Python 3 with your distribution's package manager (requires root):" >&2
      echo "    Debian / Ubuntu:  apt-get update && apt-get install -y python3" >&2
      echo "    Fedora / RHEL:    dnf install -y python3" >&2
      echo "After installing, re-run this installer in a fresh shell so the updated" >&2
      echo "PATH takes effect." >&2
      ;;
    macos)
      echo "Install Homebrew (https://brew.sh) and then run:" >&2
      echo "    brew install python@3.6" >&2
      echo "After installing, re-run this installer in a fresh shell so the updated" >&2
      echo "PATH takes effect." >&2
      ;;
    windows-gitbash|windows-msys|windows-cygwin)
      echo "This installer does not run a package manager on Windows." >&2
      echo "Install Python manually from one of:" >&2
      echo "    - python.org MSI installer:  https://www.python.org/downloads/windows/" >&2
      echo "    - Microsoft Store:           search for 'Python 3.10' or newer" >&2
      echo "    - 'py' launcher:             https://docs.python.org/3/using/windows.html" >&2
      echo "After installing, open a fresh shell so the updated PATH takes effect," >&2
      echo "then re-run this installer." >&2
      ;;
    *)
      echo "Install Python >=3.6 for your platform and ensure 'python3' or 'python' is" >&2
      echo "on PATH. Then re-run this installer." >&2
      ;;
  esac
}

# Phase 1 — prerequisite checkpoint: Python >=3.6.
#
# Hard-fails the install BEFORE any write to the target directory if a
# Python >=3.6 interpreter is not on PATH. Resolves the interpreter by
# probing `python3` then `python` (first hit wins) and runs a static
# version probe that requires sys.version_info >= (3, 6). Anything
# else (missing interpreter, probe failure, older version) is treated
# as a hard prerequisite failure.
#
# Consent handling in Phase 1:
#   * --yes set, missing/old Python: falls through to the
#     manual-install block. Phase 2 will hook the package-manager
#     branch in here; Phase 1 MUST NOT invoke a package manager.
#   * --yes unset, stdin is a TTY: prompts once with default NO.
#     An affirmative answer (y/yes, case-insensitive) also falls
#     through to the manual-install block in this phase. Anything
#     else (no, empty input, EOF) prints the manual-install block
#     and returns non-zero.
#   * --yes unset, stdin is not a TTY: prints the manual-install
#     block and returns non-zero immediately. There is no silent
#     default; the user must pass --yes explicitly.
#
# On success, the resolved interpreter path is exported as KIT_PY so
# later resolution stages (e.g. resolve_model_tokens) can reuse it
# without re-probing PATH. The function does not write to the
# filesystem, does not invoke a package manager, and does not consult
# any environment variable other than the --yes command-line form.
require_python_prereq() {
  local py=""
  for _cand in python3 python; do
    if command -v "$_cand" >/dev/null 2>&1; then
      py="$(command -v "$_cand")"
      break
    fi
  done

  # The version probe is a static literal string. It MUST NOT be built
  # from user input, env vars, or filesystem content. The probe rejects
  # anything older than Python 3.6 (the floor is set by
  # scripts/apply-model-preset.py, which uses PEP 498 f-strings).
  if [[ -n "$py" ]] \
     && "$py" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 6) else 1)' >/dev/null 2>&1; then
    export KIT_PY="$py"
    return 0
  fi

  # Python is missing or too old. Handle consent before printing the
  # failure block.
  if [[ "${ASSUME_YES:-false}" != "true" ]]; then
    if [[ -t 0 ]]; then
      # TTY: prompt once with default NO. `read` returns non-zero on
      # EOF or on a closed/redirected stdin; that branch is treated
      # as NO. The `if read ...; then ... else ...; fi` shape keeps
      # `set -e` happy: the non-zero read exit is caught by the
      # `else` arm rather than aborting the script.
      local answer=""
      if read -r -p "Python >=3.6 is required but was not found on PATH. Install via package manager? [y/N] " answer; then
        case "${answer,,}" in
          y|yes)
            : # fall through to the manual-install block in Phase 1
            ;;
          *)
            print_python_manual_install_block
            return 1
            ;;
        esac
      else
        # EOF on stdin (or any read failure) is treated as NO.
        print_python_manual_install_block
        return 1
      fi
    else
      # Non-TTY (piped, redirected, closed): default NO. There is no
      # silent default; the user must pass --yes to opt in.
      print_python_manual_install_block
      return 1
    fi
  fi

  # Either --yes was set or the user answered YES at the prompt.
  # Phase 1 does not invoke a package manager. Phase 2 will replace
  # this section with the apt-get / dnf / brew branch. In the
  # meantime, fall through to the manual-install block so the run
  # ends with a clear next step rather than silently proceeding.
  print_python_manual_install_block
  return 1
}

case "$TARGET" in
  project)
    # Phase 1 prerequisite checkpoint. Hard-fails before any write to
    # the target directory (including install_model_profile, which
    # seeds the target's models.config.json). --skip-validation does
    # NOT waive this check; Python is required regardless.
    require_python_prereq || exit 1
    # Validate the Phase 1 model-profile before copying anything else so a
    # bad config aborts the install cleanly.
    install_model_profile "$(pwd)/.opencode" || exit 1
    seed_comprehension_config "$(pwd)/.opencode" || exit 1
    install_into "$(pwd)/.opencode"
    resolve_model_tokens "$(pwd)/.opencode"
    # AGENTS.md and CONTRIBUTING.md live at project root, not inside .opencode/
    link_or_copy "$KIT_DIR/AGENTS.md"       "$(pwd)/AGENTS.md"
    link_or_copy "$KIT_DIR/CONTRIBUTING.md" "$(pwd)/CONTRIBUTING.md"
    echo "Done. Run 'opencode' inside this project, select the orchestrator agent, and run /start-session to bootstrap it."
    ;;
  global)
    require_python_prereq || exit 1
    install_model_profile "$HOME/.config/opencode" || exit 1
    seed_comprehension_config "$HOME/.config/opencode" || exit 1
    install_into "$HOME/.config/opencode"
    resolve_model_tokens "$HOME/.config/opencode"
    echo "Done. This kit is now available in every OpenCode project on this machine."
    echo "Run /start-session at the start of every new session to bootstrap the orchestrator."
    ;;
  studio)
    if [[ -z "$PROFILE_NAME" ]]; then
      echo "Error: studio mode requires a profile name."
      usage
    fi
    PROFILE_DIR="$HOME/.config/opencode-profiles/$PROFILE_NAME"
    if [[ ! -d "$PROFILE_DIR" ]]; then
      echo "Error: profile directory not found: $PROFILE_DIR"
      echo "Create the profile in OpenCode Studio first, then re-run this script."
      exit 1
    fi
    require_python_prereq || exit 1
    install_model_profile "$PROFILE_DIR" || exit 1
    seed_comprehension_config "$PROFILE_DIR" || exit 1
    install_into "$PROFILE_DIR"
    resolve_model_tokens "$PROFILE_DIR"
    echo "Done. Known issue: if a global ~/.config/opencode/AGENTS.md also exists,"
    echo "it currently takes precedence over the profile's AGENTS.md in some OpenCode"
    echo "versions. If routing rules seem ignored, temporarily rename/remove the"
    echo "global AGENTS.md, or merge its contents into this profile's copy."
    echo "Run /start-session at the start of every new session to bootstrap the orchestrator."
    ;;
  *)
    usage
    ;;
esac