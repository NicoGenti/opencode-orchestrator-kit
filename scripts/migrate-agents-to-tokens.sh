#!/usr/bin/env bash
# migrate-agents-to-tokens.sh — one-time Phase 1 migration.
#
# Rewrites the hardcoded `model:` line in each agents/*.md and extras/*.md
# frontmatter to the logical tier token it belongs to, so future installs
# resolve models via .opencode/models.config.json +
# scripts/apply-model-preset.py instead of a fixed model ID baked into the
# file.
#
# Canonical five-tier assignment:
#   TIER_ROUTER    — orchestrator
#   TIER_REASONING — oracle, security, planner
#   TIER_CODE      — developer-fixer, test-engineer
#   TIER_FAST      — explorer, librarian, profiler, build-helper,
#                    npm-helper, deploy-helper, plus extras pc-doctor and writer
#   TIER_REVIEW    — code-reviewer
#
# Safe to re-run (idempotent): sed only matches the literal current values
# below, so once a file is migrated the corresponding line no longer matches
# and is left untouched.
#
# Run from the repo root:
#   bash scripts/migrate-agents-to-tokens.sh
#
# Then commit the result and use:
#   python3 scripts/apply-model-preset.py --preset default
# to re-resolve tokens back to concrete IDs for local testing.

set -euo pipefail
cd "$(dirname "$0")/.."

replace() {
  local dir="$1" file="$2" old="$3" token="$4"
  if [[ ! -f "${dir}/${file}" ]]; then
    echo "  ${dir}/${file}: SKIPPED (file not found)"
    return
  fi
  if grep -qF "model: ${old}" "${dir}/${file}"; then
    sed -i.bak "s|^model: ${old}\$|model: {{${token}}}|" "${dir}/${file}"
    rm -f "${dir}/${file}.bak"
    echo "  ${dir}/${file}: ${old} -> {{${token}}}"
  else
    echo "  ${dir}/${file}: SKIPPED (expected value not found, check manually)"
  fi
}

replace_in() {
  local file="$1" old="$2" token="$3"
  if [[ -f "agents/${file}" ]]; then
    replace "agents" "${file}" "${old}" "${token}"
  elif [[ -f "extras/${file}" ]]; then
    replace "extras" "${file}" "${old}" "${token}"
  else
    echo "  ${file}: SKIPPED (not found in agents/ or extras/)"
  fi
}

echo "Migrating agents/*.md and extras/*.md to logical model tiers..."

# TIER_ROUTER — single routing agent
replace "orchestrator.md" "opencode-go/gpt-5.6-luna" "TIER_ROUTER"

# TIER_REASONING — orchestration, architecture advice, security, planning
replace "oracle.md"           "opencode-go/kimi-k3"      "TIER_REASONING"
replace "security.md"         "opencode-go/kimi-k3"      "TIER_REASONING"
# planner historically used ollama/glm-5.2:cloud. Keep the migration tolerant
# of either the stale ollama/*:cloud value or a refreshed opencode-go/* value.
replace "planner.md"          "ollama/glm-5.2:cloud"     "TIER_REASONING"
replace "planner.md"          "opencode-go/kimi-k3"      "TIER_REASONING"

# TIER_CODE — implementation, tests, and code authoring
replace "developer-fixer.md"  "opencode-go/minimax-m3"   "TIER_CODE"
replace "test-engineer.md"    "opencode-go/minimax-m3"   "TIER_CODE"
# Tolerate the stale ollama/minimax-m3:cloud value reported by the oracle,
# since some older installs may still have it.
replace "developer-fixer.md"  "ollama/minimax-m3:cloud"  "TIER_CODE"
replace "test-engineer.md"    "ollama/minimax-m3:cloud"  "TIER_CODE"

# TIER_REVIEW — general correctness / quality review
replace "code-reviewer.md"    "opencode-go/minimax-m3"   "TIER_REVIEW"
replace "code-reviewer.md"    "ollama/minimax-m3:cloud"  "TIER_REVIEW"

# TIER_FAST — lightweight utility / high-throughput tasks
replace "explorer.md"         "ollama/deepseek-v4-flash:cloud"  "TIER_FAST"
replace "librarian.md"        "ollama/deepseek-v4-flash:cloud"  "TIER_FAST"
replace_in "pc-doctor.md"    "ollama/deepseek-v4-flash:cloud"  "TIER_FAST"
replace "npm-helper.md"       "ollama/deepseek-v4-flash:cloud"  "TIER_FAST"
replace "build-helper.md"     "ollama/deepseek-v4-flash:cloud"  "TIER_FAST"
replace "deploy-helper.md"    "ollama/deepseek-v4-flash:cloud"  "TIER_FAST"
replace_in "writer.md"       "ollama/deepseek-v4-flash:cloud"  "TIER_FAST"
replace "profiler.md"         "ollama/deepseek-v4-flash:cloud"  "TIER_FAST"

echo ""
echo "Done. Review the diff, then run:"
echo "  python3 scripts/apply-model-preset.py --preset default"
echo "to resolve tokens back to concrete model IDs for local testing."
echo "  bash scripts/validate-models.sh"
echo "to confirm the resolved preset has no unresolved placeholders or tokens."