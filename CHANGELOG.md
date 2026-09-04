# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project does not yet follow a formal versioning scheme.

## [Unreleased]

## [0.2.2] - 2026-09-04

### Added

- **Pre-Delegation Confirmation Gate**: `orchestrator` now pauses and asks the user for explicit confirmation, in the root session, before delegating any task to a file-writing agent (`developer-fixer`, `build-helper`, `deploy-helper`, `npm-helper`, `test-engineer`). This is independent of OpenCode's native `edit`/`bash` permission layer and covers known gaps where nested-subagent permission prompts don't reliably bubble up to the root session. See `agents/orchestrator.md`, "Pre-Delegation Confirmation Gate", and `docs/ARCHITECTURE.md`, "Human-in-the-loop confirmation gate."
- **Phase 1 — Model tier presets, resolver, and migration**: a five-tier abstraction (`TIER_ROUTER`, `TIER_REASONING`, `TIER_CODE`, `TIER_FAST`, `TIER_REVIEW`) replaces hard-coded model IDs in agent frontmatter. Shipped as `scripts/resolve-model-preset.ts`, `scripts/migrate-agents-to-tokens.sh`, `scripts/apply-model-preset.py`, and `templates/models.config.json` (the `default` and `generic` profiles).
- **Phase 1 — `install.sh` integration**: the installer seeds `.opencode/models.config.json` from the bundled template, accepts `--symlink`, `--with-extras`, `--with-examples`, and `--skip-validation`, and runs the Phase 1 model-profile validator before writing to the target directory.
- **Phase 1 — `docs/CONFIGURATION.md`**: full tier-resolution rules, fallback chains, placeholder policy.
- **Phase 1 — `docs/SETUP-NATIVE.md`**: manual install path, prerequisites, and per-flag installer reference.
- **Phase 1 — `scripts/detect-os.sh` and `scripts/validate-models.sh`**: installer OS detection and pre-flight model-profile validator.
- **Phase 1 — `templates/models.config.json`**: the `default` and `generic` model-profile presets, with `validate-models.sh` exiting 0 with an `OK:` line on success.
- **Phase 1 — `agents/*.md` and `extras/*.md` frontmatter cleanup**: present top-level frontmatter keys appear in the canonical subsequence `description, mode, model, temperature, tools, permission` (subsequence, not strict permutation).
- **Phase 1 — `scripts/resolve-model-preset.ts` exports**: `loadModelConfig`, `resolvePreset`, `resolveModelValue`, `listPresets`, `getPreset`, `getDefaultPreset`, `validatePreset`, `resolveModelConfig`, `TOKENS`.
- **Phase 2 — Bootstrap repo scaffolding**: `profiler` agent fingerprints any repo (stack, CI, structure), scaffolds `.context/` session memory and `plan/` kanban, and is idempotent on retrofit. See `.opencode/PROJECT-PROFILE.md`, `AGENTS.md`, and `agents/profiler.md`.
- **Phase 2 — `agents/orchestrator.md` expanded routing table**: Core routing (`profiler`, `explorer`, `oracle`, `planner`), Core delivery (`developer-fixer`, `test-engineer`, `code-reviewer`, `security`), Operations helpers (`build-helper`, `npm-helper`, `deploy-helper`), and explicit opt-in extras (`pc-doctor`, `writer`, `librarian`) are documented as separate tiers with disambiguation notes.
- **Phase 3 — Prompt-assembly stable-prefix contract**: documented in `AGENTS.md` as the repository-controlled boundary — `AGENTS.md` first, then sorted `agents/*.md`, then sorted `extras/*.md` — and explicitly excludes `.opencode/context/` and `.opencode/models.config.json`.
- **Phase 3 — Boundary baseline**: `tests/fixtures/prompt-prefix-boundary.txt` lists every boundary file exactly once, in sorted order, using forward slashes.
- **Phase 3 — Three new skills**: `skills/build-debug/SKILL.md`, `skills/dev-cleanup/SKILL.md`, `skills/npm-debug/SKILL.md`.
- **Phase 3 — `README.md` README consistency correction**: `oracle` is now listed in the Core routing tier table; the responsibility map and explicit opt-in classifications are preserved unchanged.

### Changed

- `README.md`: rewritten roster section — single responsibility map (six required concerns pinned to one specialist each), followed by the four-tier roster table. Quickstart reorganized into a four-step flow (prerequisites → installer → model profile → run orchestrator).
- `AGENTS.md`: roster table now partitioned into four tiers (Core routing, Core delivery, Conditional operations, Explicit opt-in extras); added "Prompt-Assembly Stable-Prefix Contract" section; documented the Single Primary Resolution (Phase 2) — `agents/orchestrator.md` is the sole `mode: primary` agent, `agents/security.md` was changed from `mode: primary` to `mode: subagent`.
- `QUICKSTART.md`: expanded to cover the installer flags, model-profile selection, and tier tokens.
- `agents/explorer.md`, `agents/librarian.md`, `agents/oracle.md`, `agents/profiler.md`: model field normalized to the tier-token form (`{{TIER_*}}`).
- `agents/security.md`: changed from `mode: primary` to `mode: subagent` (Phase 2 single-primary resolution).
- `agents/test-engineer.md`: `permission.edit` block added, scoped to `ask` on `*.test.*`, `*.spec.*`, `test/**`, `tests/**`, `__tests__/**` and `deny` elsewhere.
- `package.json`: version bumped from `0.1.0` to `0.2.2` (release metadata).

### Tests

- `tests/frontmatter-order.test.ts`: asserts the canonical top-level frontmatter key order for every `agents/*.md` and `extras/*.md` file, plus the single `mode: primary` invariant (now `["agents/orchestrator.md"]`).
- `tests/model-preset.test.ts`: covers `loadModelConfig`, `resolvePreset`, `resolveModelValue`, `listPresets`, `getPreset`, `getDefaultPreset`, `validatePreset`, `resolveModelConfig`, `TOKENS`, including malformed/missing/empty JSON and missing-tiers negative cases.
- `tests/routing-consistency.test.ts`: now also walks `extras/*.md` and asserts every agent ID in either bucket has a matching file, plus the orphan-agent-file check.
- `tests/skill-schema.test.ts`: now recursively scans `skills/` (including `skills/examples/`) and asserts `name` matches the immediate parent folder.
- `tests/stable-prefix-boundary.test.ts` (new): committed baseline matches the live filesystem enumeration; `.opencode/context/*` and `.opencode/models.config.json` are explicitly excluded; the boundary validator rejects wrong-order and duplicate boundaries and accepts canonical ones.
- `tests/installer-os-detection.test.ts` (new), `tests/validate-models.test.ts` (new), `tests/phase3-documentation.test.ts` (new).

### Notes

- The full `bun test` suite verifies 384 pass / 0 fail at release time.
- `.opencode/models.config.json` remains user-local and is explicitly excluded from this release. `CONTEXT-ANALYSIS.md` is a scratch file and is intentionally untracked and unstaged.
- The pre-existing `v0.2.0` / `v0.2.1` tags were not moved or re-pointed; this release ships as a new tag `v0.2.2` ahead of them.
