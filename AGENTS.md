# Agent Orchestration Framework

## Overview

This document is the orchestration contract: the `orchestrator` role and the
contracts for every subagent. `orchestrator` MUST NOT perform direct work; it
delegates every executable task.

> **Naming note**: runtime IDs below match `agents/orchestrator.md`'s routing
> table. `pc-doctor` and `writer` live in `extras/` rather than `agents/`; only
> the file location differs. Historical taxonomy-only names (`sisyphus`,
> `metis`, `momus`, `fixer`, `hephaestus`) are retired and have no runtime file.

---

## Orchestrator: `orchestrator`

### Role

- Classify the request, delegate, checkpoint, validate, and keep session memory
  current. Never write application code, edit tests, or run diagnostics.
- Route to the subagent named in `agents/orchestrator.md`'s routing table and
  hand it the 9-section task spec (Goal, Success Criteria, Scope, Safety, Inputs
  Available, Outputs Required, Test Plan, Verification, Notes/Edge Cases).
- Resolve conflicts between subagents, request revisions on incomplete or
  off-scope output, and escalate to human oversight when a decision exceeds the
  delegated scope.
- Account for every delegation in `.context/*.md` and `plan/*` through the
  owning agent, not by writing those files directly.

### Delegation Policies

1. **Mandatory delegation** — no code, test, or documentation work performed
   directly; no research beyond task decomposition; no generated content beyond
   the three session-memory files under `.context/`.
2. **Specialist first** — prefer the most specialized subagent; fall back to a
   higher-capability agent only when the primary is unavailable or clearly
   insufficient.
3. **Task handoff** — always a 9-section spec, never a free-form prompt; load a
   subagent's workflow with `skill` when its allow-map requires it.
4. **Output validation** — verify against the spec before integrating; return
   incomplete, incorrect, or off-scope work with a revision request.

---

## Runtime Subagent Roster

Tiers describe *when* the orchestrator invokes an agent, not tool permissions.
The runtime IDs MUST stay set-equal to `agents/orchestrator.md`'s "Runtime
Roster" table.

| Runtime ID | Tier | Role | Read/write scope |
| --- | --- | --- | --- |
| `profiler` | Core routing | Repo bootstrap: stack/CI detection, empty-repo intake with design-rules seeding, `plan/` scaffolding, token-budgeted repo map generation. Runs once per repo; the repo map is refreshed on every run. | Writes only `PROJECT-PROFILE.md`, `.context/*` templates, `.context/DESIGN-RULES.md`, `.context/repo-map.md`, `plan/README.md`, `plan/*/.gitkeep` |
| `explorer` | Core routing | Codebase, file, or symbol exploration via a token-aware search ladder (repo map → `rg` → optional ast-grep → optional Code Review Graph → targeted reads). | Read-only |
| `oracle` | Core routing | Architecture, design, or strategy advice. The standard non-trivial workflow is `explorer` → `oracle` → `planner` → `developer-fixer`. | Read-only |
| `planner` | Core routing | Turns exploration into a phased development plan. | Writes to `plan/draft/` only |
| `plan-writer` | Core delivery | Plan board lifecycle owner: create/move/check/adopt on the active board root through the native `plan_board` tool (V2) or `python3 scripts/plan-board.py` (V1). | Writes only the board's plan files (`plan/**/*.md`) |
| `developer-fixer` | Core delivery | Implementation, TDD, single-phase execution against a precise spec. | Writes application code/tests per scope |
| `test-engineer` | Core delivery | Tests, coverage, reproduction. | Writes tests only unless explicitly delegated otherwise |
| `code-reviewer` | Core delivery | General correctness/design/quality review. | Read-only |
| `comprehension-coach` | Core delivery | Post-review human comprehension verification (CHALLENGE then EVALUATE). Classification (NONE/LIGHT/DEEP) is performed by the orchestrator — no extra agent call for classification. Technical verification (code-reviewer/security) is distinct from human comprehension verification (comprehension-coach). | Read-only (no write/edit, no delegation, no webfetch) |
| `security` | Core delivery | Vulnerability, threat-model, hardening review. | Read-only |
| `build-helper` | Conditional operations | TypeScript/Vite/webpack/build-tool errors. Invoked ONLY on a matching build-tool failure (see `agents/orchestrator.md`'s disambiguation section). | Scoped fixes |
| `npm-helper` | Conditional operations | npm/Node dependency, install, cache issues. Invoked ONLY on a matching Node toolchain failure. | Scoped fixes |
| `deploy-helper` | Conditional operations | CI/CD pipeline and deploy platform failures. Invoked ONLY on a matching CI/CD or deploy-platform failure. | Scoped fixes |
| `pc-doctor` | Explicit opt-in extra | Windows/local environment, PATH, services. Defined in `extras/pc-doctor.md`. Load only on explicit opt-in or when the failure is clearly Windows-local. | Scoped fixes |
| `writer` | Explicit opt-in extra | Technical documentation generation. Defined in `extras/writer.md`. Load only on explicit opt-in. | Docs only, never executable code |
| `librarian` | Routing-limited (installed by default) | Documentation lookups, remote examples, repository history. Delegated only for remote doc lookups; never part of the standard implementation flow. | Read-only |

Model assignment lives in each `agents/<name>.md` (or `extras/<name>.md`)
frontmatter, not in this file, so a model change never touches the contract.

---

## Workflow Examples

### Example 1: Implementing a New Feature

1. `orchestrator` splits the task: research (`explorer`), design (`oracle`),
   phased plan (`planner`), implementation one phase at a time
   (`developer-fixer`), tests (`test-engineer`), docs (`writer`).
2. It delegates each subtask with the 9-section spec.
3. Classify the completed change (NONE/LIGHT/DEEP), announce the outcome in one
   line, run the gate if LIGHT/DEEP — then update `.context/progress.md`.
4. It validates and integrates the outputs, updating `.context/progress.md`.

### Example 2: Debugging an Issue

1. `orchestrator` reproduces the issue (`explorer` or `test-engineer`) and
   identifies the root cause (`oracle` for non-trivial cases).
2. It delegates the fix (`developer-fixer`) and validation (`test-engineer`).
3. Classify the completed change (NONE/LIGHT/DEEP), announce the outcome in one
   line, run the gate if LIGHT/DEEP — then update session memory
   (progress.md / issues.md).
4. It verifies the resolution and appends an entry to `.context/issues.md`.

---

## Plan Board Lifecycle & Owner Contract

`plan/` has four columns (`draft`, `in-progress`, `qa`, `complete`) and one
owner: `plan-writer`. No other agent — orchestrator, `planner`, `profiler`,
`developer-fixer`, `test-engineer`, `code-reviewer` — creates, moves, renames or
deletes a plan file. `planner` authors the body under `.context/`, never a board
file; `plan-writer` owns the lifecycle.

- **Tool** — every board mutation goes through one plan-board tool. On the
  plugin (V2), `plan-writer` calls the native `plan_board` tool. On the
  copy-based installer (V1), or when that tool is not registered, it runs
  `python3 scripts/plan-board.py <check|new|move|adopt> ... --root <board root> --json`
  (`python */plan-board.py *` stays allowlisted where a `python` alias exists;
  `plan-writer` falls back to `.opencode/scripts/plan-board.py` when the
  repository carries the tool there). Standard-library only, JSON on every path,
  exit `0` = ok (warnings do not fail), exit `1` = blocking error. Hand-crafted
  `mv`/`cp`/direct writes under the board root are a contract violation.
- **Conforming file** — `<id>-<slug>.md` (or `<id>.md`) with frontmatter
  `id/title/status/created/updated/owner/executor`, the `id` equal to the leading
  segment of the filename stem, `status` equal to the containing column, and the
  nine sections of `plan/README.md` in the body.
- **Standing authorization (board root only)** — `check` runs, and `move` of an
  already-conforming file between columns (including the `status`/`updated`
  refresh), are covered without fresh approval, cited as
  `## Approved Mutation Summary — plan-board-standing-v1`. NOT covered: `new`,
  `adopt`, any body edit, deletion and rename; each needs its own per-dispatch
  approved Mutation Summary.
- **Staging body** — `planner` writes the body to `.context/plan-body-<id>.md`;
  once `plan-writer` has created the card through `plan_board new`, that file
  must be deleted (`rm .context/plan-body-<id>.md`, allowlisted for
  `plan-writer`). An orphan body is not session memory and must not be left in
  the repo.
- **Scaffolding exception** — `profiler` may create missing
  `plan/<column>/.gitkeep` folders and `plan/README.md` on first run; it never
  creates or moves a plan file.
- **Never** — deletion, renaming, writes outside the board root, and edits to
  `plan/README.md` or `scripts/plan-board.py` are user-only decisions.

## Enforcement

- `orchestrator` MUST load this file (`AGENTS.md`) at startup; subagents MUST
  follow their contract in `agents/<name>.md`, and violations go to
  `orchestrator` for escalation.
- Every delegated task MUST reference this document.
- This file governs orchestration and delegation; `CONTRIBUTING.md` governs
  engineering discipline (secrets, git hygiene, definition of done). This file
  wins for routing; `CONTRIBUTING.md` wins for how the work is done.

## Repository contracts

The prompt-assembly contract — stable prefix, boundary baseline, frontmatter key
order, single primary agent — is a contributor invariant, not an agent
instruction. It lives in `CONTRIBUTING.md` (section "Prompt-Assembly Stable-Prefix
Contract") and is enforced by the test suite; nothing in this file changes when
it changes.
