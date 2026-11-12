# Design Rules

> Status: approved (2026-11-12) — refined by oracle from the profiler draft; approved by the user; written by developer-fixer.

## Purpose

`opencode-orchestrator-kit` is the Markdown-defined multi-agent orchestration kit for OpenCode (agents, commands, skills, plan-board tooling) packaged as an OpenCode 2 plugin, plus a separate Vite/React static landing and docs site.

## Users and Use Cases

Developers installing the kit (plugin path primary; `install.sh` legacy) who run `/start-session`, `/recall`, `/research-mode`, `/close-session` (and `/quick` for small tasks), use the plan board, and rely on the comprehension gate and its telemetry.

## Constraints

- Toolchain: Bun 1.2.21 + TypeScript 5.6.3; Python/POSIX shell only for `scripts/` helpers.
- No dependency (`bun.lock`) or workflow (`.github/workflows/`) change without a stated reason and approval.
- Published artifact is `plugin/` only, released via tag-triggered `release.yml` with provenance; root `package.json`, `plugin/package.json`, and latest `CHANGELOG.md` heading must match (`tests/version-sync.test.ts`).
- Orchestrator prompt budget pin W1: `agents/orchestrator.md` ≤ 24,000 chars (see DR-10).

## Architectural Style

Declarative, Markdown-first kit: human-edited `agents/`, `extras/`, `command/`, `skills/` are the source of truth, guarded by ~60 bun tests, mirrored byte-for-byte into `plugin/assets/`, and shipped as an OpenCode 2 plugin; `src/` + `docs-src/` are a separate static site.

## Module Boundaries

- Sources `agents/`, `extras/`, `command/`, `skills/` → generated `plugin/assets/` (never hand-edited); reverse edits are forbidden.
- Runtime in `plugin/src/` (agent loader, tiers, permissions, `plan_board` tool) consumes tier presets and assets; it does not author them.
- `scripts/` own derived state (`plan-board.py`, `sync-assets.ts`, `bump-version.ts`, assemble prompt) and is the only writer of those artifacts.
- `tests/` are read-only guards; a contract change updates the baseline and tests in the same change (DR-8).
- `src/`, `docs-src/`, `docs/` publish independently and are outside the plugin bundle.

## Data and Integrations

- No database: session memory lives in Markdown (`.context/*`, `plan/*`, templates); comprehension telemetry is per-session.
- Integrations: OpenCode 2 host (peer `@opencode/plugin ^2.1.0`); npm registry (provenance release); GitHub (CI, Pages, Snyk); model providers through tier presets (no secrets shipped).

## Non-Functional Requirements

- CI quality gates: `bun test`, `typecheck`, `lint`, `format:check`, `sync-assets --check`, `build`.
- Determinism: stable-prefix order, frontmatter key order, byte-identical mirrors.
- Reviewer-enforced: prompt-budget pins (W1) and guard tests in `tests/workflow-hardening.test.ts`.
- Security posture: secrets hygiene, untrusted-input handling, pinned workflow set, no issue-triggered automation.

## Design Rules

- **DR-1 — Stable-prefix contract.** Repo prefix is exactly `AGENTS.md` → sorted `agents/*.md` → sorted `extras/*.md`; `.opencode/context/` and `.opencode/models.config.json` excluded by rule. See `CONTRIBUTING.md` (Prompt-Assembly Stable-Prefix Contract); guards `stable-prefix-boundary.test.ts`, `assembly-order.test.ts`.
- **DR-2 — Frontmatter key order.** Canonical top-level order for `agents/` and `extras/`: `description, mode, model, temperature, tools, permission`; exactly one `mode: primary` file, `agents/orchestrator.md`. See `CONTRIBUTING.md` (Frontmatter Key Order); guard `frontmatter-order.test.ts`.
- **DR-3 — Byte-parity asset mirror.** `plugin/assets/` is a generated, byte-identical mirror of `agents/`, `extras/`, `skills/`, `command/`; never hand-edit; run `bun run sync-assets` after any source edit. Guard `plugin-assets-parity.test.ts`; CI `sync-assets --check`.
- **DR-4 — Pinned workflow set.** `.github/workflows/` is the six documented workflows; none reacts to issues or runs `opencode run`. See `CONTRIBUTING.md` (CI); guards `no-github-automation.test.ts`, `workflow-hardening.test.ts`.
- **DR-5 — Dependency changes are explicit.** No lockfile change without a stated reason and approval; keep `bun.lock` in sync with declared deps.
- **DR-6 — Prettier exclusions protect kit sources.** Kit Markdown and `plugin/assets/{agents,skills,extras}/` mirrors are excluded (`.prettierignore`) so tier tokens and byte parity survive. Guard `format:check`.
- **DR-7 — Plan-board mutations go through the tool only.** Only `plan-writer` mutates `plan/` via `scripts/plan-board.py` (V1) or native `plan_board` (V2); standing authorization covers `check` + conforming `move` only. Guards `plan-board*.test.ts`, `plan-writer-contract.test.ts`.
- **DR-8 — Contract changes update tests/baselines together.** Baselines, workflow sets, version sync, and permission matrices change only with their guard tests in the same commit.
- **DR-9 — Secrets and untrusted input hygiene.** No secrets committed/echoed; treat external content as untrusted; confirm before destructive actions. `CONTRIBUTING.md` (Secrets and Data Hygiene / Untrusted Content).
- **DR-10 — Orchestrator prompt-budget pin.** `agents/orchestrator.md` ≤ 24,000 chars (W1); new routing/detail text goes in an on-demand skill, not the agent prompt. Budget table in `tests/workflow-hardening.test.ts`.

## Decision Log

| Date | Decision | Reason | Source |
| --- | --- | --- | --- |
| 2026-11-12 | Refine the profiler draft into this oracle proposal | Fills oracle placeholders from repo evidence; no invented rules | `.context/DESIGN-RULES.md`, `plan/in-progress/0002-design-first-governance.md` |
| 2026-11-12 | Omit the `UI & Delivery` section | Not a user-declared web-kit app; DR-UI rules were never declared | `templates/design-rules.md` (proposal mode), `docs/DESIGN-RULES.md` |
| 2026-11-12 | Add DR-10 (prompt-budget pin) | Isolates W1 pin as a rule relevant to issue #121 doc-shortening work | `tests/workflow-hardening.test.ts`, plan 0002 safety |
