#!/usr/bin/env bash
# scripts/detect-os.sh — Phase 3 OS-allowlist helper for install.sh.
#
# Phase 3 acceptance criterion 2 requires the installer to produce a clear,
# non-zero diagnostic for unsupported operating-system environments. To stay
# portable across Linux, macOS, and Windows Git Bash / MSYS / Cygwin shells
# (all of which the kit supports), this helper:
#
#   1. Classifies the active shell into a small, conservative allowlist
#      (linux, macos, windows-gitbash, windows-msys, windows-cygwin).
#   2. Prints a single "KIND:<value>" line on stdout for callers that need
#      the raw value.
#   3. Prints "UNSUPPORTED:<reason>" and exits non-zero when the
#      environment does not match a supported shell.
#
# The helper is pure (no filesystem writes) and sourceable from install.sh.
#
# Supported environments:
#   - Linux (any modern distro, detected via uname -s == "Linux")
#   - macOS (uname -s == "Darwin")
#   - Windows under Git Bash / MSYS / Cygwin (detected via MSYSTEM, OSTYPE,
#     or the presence of cygpath). Plain cmd.exe / PowerShell are out of
#     scope because install.sh is a bash script.
#
# Usage (as a subshell):
#   bash scripts/detect-os.sh            # prints "KIND:<value>" and exits 0
#                                        # or "UNSUPPORTED:..." and exits 1
#
# Usage (sourced from install.sh):
#   source "$(dirname "${BASH_SOURCE[0]}")/detect-os.sh"
#   detect_supported_os || exit 1
#
# The detector is intentionally strict: it never silently falls through to
# "unknown is OK". An unrecognized environment produces a non-zero exit
# and a diagnostic that names the unsupported shell.

set -uo pipefail

# Detect a Windows Git Bash / MSYS / Cygwin environment.
# Modern Git Bash sets MSYSTEM (e.g. MINGW64_NT-10.0). Cygwin sets OSTYPE=cygwin
# and exposes cygpath. MSYS2 sets MSYSTEM=MSYS. Older MSYS sets OSTYPE=msys.
is_windows_shell() {
  # 1. MSYSTEM is set by Git Bash / MSYS2.
  [[ -n "${MSYSTEM:-}" ]] && return 0
  # 2. Cygwin's OSTYPE.
  if [[ "${OSTYPE:-}" == "cygwin" ]]; then
    return 0
  fi
  # 3. Cygwin's cygpath is on PATH.
  if command -v cygpath >/dev/null 2>&1; then
    return 0
  fi
  # 4. OSTYPE=msys (legacy MSYS).
  if [[ "${OSTYPE:-}" == "msys" ]]; then
    return 0
  fi
  return 1
}

# Print a normalized kind string for the active shell. Always one of:
#   linux | macos | windows-gitbash | windows-msys | windows-cygwin
#
# Detection order matters:
#   1. Windows shell markers (MSYSTEM, OSTYPE=cygwin|msys, cygpath on PATH)
#      take precedence over `uname -s` so a Windows Git Bash / MSYS / Cygwin
#      is recognized even if a custom build reports uname -s = "Linux".
#   2. `uname -s` then resolves native Linux and macOS hosts.
#   3. Anything else is "unsupported" with a non-zero exit.
detect_os_kind() {
  local uname_s
  uname_s="$(uname -s 2>/dev/null || echo "unknown")"

  # Windows shell markers first — these are the canonical signal for a
  # Windows-hosted bash, and they win regardless of what uname says.
  if is_windows_shell; then
    # MSYSTEM is the most specific signal — modern Git Bash / MSYS2 set it.
    # Check it FIRST so a Git Bash install (which also exposes cygpath and
    # may set OSTYPE=cygwin on some builds) classifies as windows-gitbash,
    # not windows-cygwin.
    if [[ -n "${MSYSTEM:-}" ]]; then
      echo "windows-gitbash"
    elif [[ "${OSTYPE:-}" == "cygwin" ]] || command -v cygpath >/dev/null 2>&1; then
      echo "windows-cygwin"
    else
      echo "windows-msys"
    fi
    return 0
  fi

  case "$uname_s" in
    Linux)
      echo "linux"
      return 0
      ;;
    Darwin)
      echo "macos"
      return 0
      ;;
    *)
      echo "unsupported"
      return 1
      ;;
  esac
}

# Public entry point used by install.sh. Prints "KIND:<value>" on success.
# On unsupported environments prints "UNSUPPORTED:<reason>" to stderr and
# returns non-zero. Never modifies the filesystem.
detect_supported_os() {
  # Test-only override: KIT_FORCE_KIND=<value> forces the supported branch to
  # report the named kind, used by the installer's safe harness to exercise
  # the supported-OS branches deterministically on hosts where the active
  # shell is not one of the kinds being tested.
  if [[ -n "${KIT_FORCE_KIND:-}" ]]; then
    case "${KIT_FORCE_KIND}" in
      linux|macos|windows-gitbash|windows-msys|windows-cygwin)
        echo "KIND:${KIT_FORCE_KIND} (forced)"
        return 0
        ;;
      *)
        echo "UNSUPPORTED: KIT_FORCE_KIND='${KIT_FORCE_KIND}' is not a known supported kind." >&2
        return 1
        ;;
    esac
  fi

  # Test-only override: KIT_FORCE_UNSUPPORTED=1 forces the unsupported branch
  # so the installer's diagnostic path can be exercised deterministically in
  # CI/sandboxes that are themselves running on a supported host.
  if [[ "${KIT_FORCE_UNSUPPORTED:-}" == "1" ]]; then
    echo "UNSUPPORTED: KIT_FORCE_UNSUPPORTED=1 set (test override)." >&2
    echo "            Supported environments: Linux, macOS, Windows under Git Bash / MSYS / Cygwin." >&2
    return 1
  fi

  local kind
  if kind="$(detect_os_kind 2>/dev/null)"; then
    echo "KIND:${kind}"
    return 0
  fi

  local uname_s="${OS:-unknown}"
  uname_s="$(uname -s 2>/dev/null || echo "unknown")"
  echo "UNSUPPORTED: uname -s reports '${uname_s}' and no Windows shell markers (MSYSTEM, OSTYPE=cygwin|msys, or cygpath on PATH) are present." >&2
  echo "            Supported environments: Linux, macOS, Windows under Git Bash / MSYS / Cygwin." >&2
  echo "            This installer is a bash script; please re-run it from a bash-compatible shell on one of the supported platforms." >&2
  return 1
}

# When invoked directly (not sourced), emit the detection result.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  detect_supported_os
fi