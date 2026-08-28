#!/usr/bin/env bash
# OpenCode Orchestrator Kit — installer
# Works for native OpenCode (project or global config) and for OpenCode Studio profiles.
# Usage:
#   ./install.sh project              # copy into ./.opencode/ + ./AGENTS.md (this repo only)
#   ./install.sh global               # copy into ~/.config/opencode/ (all projects)
#   ./install.sh studio <profile>     # copy into an OpenCode Studio profile directory
#   ./install.sh --symlink ...        # same targets, but symlink instead of copy (keeps kit updatable via git pull)

set -euo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="copy"
TARGET="${1:-}"

if [[ "${1:-}" == "--symlink" ]]; then
  MODE="symlink"
  TARGET="${2:-}"
  PROFILE_NAME="${3:-}"
else
  PROFILE_NAME="${2:-}"
fi

usage() {
  echo "Usage: $0 [--symlink] {project|global|studio <profile-name>}"
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

install_into() {
  local base="$1"
  echo "Installing OpenCode Orchestrator Kit into: $base"
  link_or_copy "$KIT_DIR/AGENTS.md"      "$base/AGENTS.md"
  link_or_copy "$KIT_DIR/CONTRIBUTING.md" "$base/CONTRIBUTING.md"
  link_or_copy "$KIT_DIR/agents"          "$base/agents"
  link_or_copy "$KIT_DIR/skills"          "$base/skills"
}

case "$TARGET" in
  project)
    install_into "$(pwd)/.opencode"
    # AGENTS.md and CONTRIBUTING.md live at project root, not inside .opencode/
    link_or_copy "$KIT_DIR/AGENTS.md"       "$(pwd)/AGENTS.md"
    link_or_copy "$KIT_DIR/CONTRIBUTING.md" "$(pwd)/CONTRIBUTING.md"
    echo "Done. Run 'opencode' inside this project and select the orchestrator agent."
    ;;
  global)
    install_into "$HOME/.config/opencode"
    echo "Done. This kit is now available in every OpenCode project on this machine."
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
    install_into "$PROFILE_DIR"
    echo "Done. Known issue: if a global ~/.config/opencode/AGENTS.md also exists,"
    echo "it currently takes precedence over the profile's AGENTS.md in some OpenCode"
    echo "versions. If routing rules seem ignored, temporarily rename/remove the"
    echo "global AGENTS.md, or merge its contents into this profile's copy."
    ;;
  *)
    usage
    ;;
esac
