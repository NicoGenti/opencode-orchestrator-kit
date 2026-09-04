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
#
# Phase 1 model portability:
#   The installer seeds .opencode/models.config.json from templates/models.config.json
#   when no local config exists yet, then runs scripts/validate-models.sh against
#   the active preset. Validation failure aborts the install before any files are
#   written to the target directory.
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
TARGET="${1:-}"
WITH_EXTRAS=false
WITH_EXAMPLES=false
SKIP_VALIDATION=false

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
    echo "Detected shell kind: ${os_line#KIND:}"
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
    *)
      break
      ;;
  esac
done

if [[ "${1:-}" != "--symlink" ]]; then
  PROFILE_NAME="${2:-}"
fi

usage() {
  echo "Usage: $0 [--symlink] [--with-extras] [--with-examples] [--skip-validation] {project|global|studio <profile-name>}"
  echo ""
  echo "Options:"
  echo "  --with-extras       Install extras/ directory (pc-doctor, writer)"
  echo "  --with-examples     Install skills/examples/ directory (language-specific skill examples)"
  echo "  --skip-validation   Skip the Phase 1 model-profile validator (not recommended)"
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
      echo "    Edit it to point tiers at your provider/model IDs, or keep the `default` preset."
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

case "$TARGET" in
  project)
    # Validate the Phase 1 model-profile before copying anything else so a
    # bad config aborts the install cleanly.
    install_model_profile "$(pwd)/.opencode" || exit 1
    install_into "$(pwd)/.opencode"
    # AGENTS.md and CONTRIBUTING.md live at project root, not inside .opencode/
    link_or_copy "$KIT_DIR/AGENTS.md"       "$(pwd)/AGENTS.md"
    link_or_copy "$KIT_DIR/CONTRIBUTING.md" "$(pwd)/CONTRIBUTING.md"
    echo "Done. Run 'opencode' inside this project, select the orchestrator agent, and run /start-session to bootstrap it."
    ;;
  global)
    install_model_profile "$HOME/.config/opencode" || exit 1
    install_into "$HOME/.config/opencode"
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
    install_model_profile "$PROFILE_DIR" || exit 1
    install_into "$PROFILE_DIR"
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