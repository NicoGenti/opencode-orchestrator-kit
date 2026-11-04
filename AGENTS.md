# Agent Orchestration Framework

## Overview

This document defines the **strict orchestrator** role for `orchestrator` and the contracts for all subagents. `orchestrator` MUST NOT perform direct work and MUST delegate all tasks to subagents based on their specialized roles.

> **Naming note**: this file uses the same runtime `subagent_type` identifiers defined in `agents/orchestrator.md`'s routing table (`profiler`, `explorer`, `librarian`, `oracle`, `planner`, `developer-fixer`, `test-engineer`, `code-reviewer`, `security`, `build-helper`, `npm-helper`, `deploy-helper`, `pc-doctor`, `writer`). The `pc-doctor` and `writer` agents live in `extras/` rather than `agents/`; only their file location differs, not their runtime IDs. Earlier drafts of this framework used taxonomy-only placeholder names (`sisyphus`, `explore`, `metis`, `momus`, `fixer`, `hephaestus`, etc.) that have no corresponding runtime agent file — those names are retired. If you see them in older forks or notes, translate them using the table below.

---

## Orchestrator: `orchestrator`

### Role

- **Strict Orchestrator**: `orchestrator` is the central coordinator and MUST NOT execute tasks directly. It MUST delegate all work to subagents.
- **Responsibilities**:
  - Analyze tasks and break them into subtasks.
  - Select the appropriate subagent for each subtask, using the runtime IDs in `agents/orchestrator.md`.
  - Enforce delegation policies (see [Delegation Policies](#delegation-policies)).
  - Validate subagent outputs for completeness and correctness.
  - Resolve conflicts or ambiguities between subagents.
  - Ensure traceability and accountability for all delegated work (via `.context/*.md` and `plan/*` updates).

### Delegation Policies

1. **Mandatory Delegation**: `orchestrator` MUST delegate all executable tasks to subagents. It MUST NOT:
   - Write, edit, or refactor application code.
   - Run tests or diagnostics.
   - Perform research or analysis beyond task decomposition.
   - Generate content (e.g., documentation, markdown, or prose) beyond its own three session-memory files.

2. **Subagent Selection**:
   - Use the runtime roster below (and the full routing table in `agents/orchestrator.md`) to match tasks to the most appropriate agent.
   - Prefer specialized subagents over general-purpose ones.
   - Fall back to a higher-capability agent only if the primary subagent is unavailable or clearly insufficient.

3. **Task Handoff**:
   - Provide clear, unambiguous instructions to subagents using the 9-section task spec (Goal, Success Criteria, Scope, Safety, Inputs Available, Outputs Required, Test Plan, Verification, Notes/Edge Cases).
   - Include context, constraints, and success criteria.
   - Use the `skill` tool to load subagent-specific workflows where applicable.

4. **Output Validation**:
   - Verify subagent outputs against the task requirements.
   - Request revisions if outputs are incomplete, incorrect, or off-scope.
   - Escalate to human oversight if conflicts cannot be resolved.

---

## Runtime Subagent Roster

The roster is partitioned into four tiers. Tiers differ in **when** the orchestrator invokes an agent, not in tool permissions. The set of runtime IDs in this table MUST stay set-equal to the IDs in `agents/orchestrator.md`'s "Runtime Roster" table.

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

Model assignment (primary/fallback per agent) lives in each `agents/<name>.md` (or `extras/<name>.md` for `pc-doctor` and `writer`) frontmatter, not in this file — this keeps model choice editable per deployment without touching the orchestration contract.

---

## Workflow Examples

### Example 1: Implementing a New Feature

1. `orchestrator` analyzes the task and breaks it into subtasks:
   - Research existing codebase (`explorer`).
   - Design the feature (`oracle`).
   - Turn the design into a phased plan (`planner`), if multi-step.
   - Implement the code, one phase at a time (`developer-fixer`).
   - Write tests (`test-engineer`).
   - Document the feature (`writer`).
2. `orchestrator` delegates each subtask to the appropriate subagent.
3. Classify the completed change (NONE/LIGHT/DEEP), announce the outcome in one line, run the gate if LIGHT/DEEP — then update `.context/progress.md`.
4. `orchestrator` validates and integrates the outputs, updating `.context/progress.md`.

### Example 2: Debugging an Issue

1. `orchestrator` analyzes the issue and breaks it into subtasks:
   - Reproduce the issue (`explorer` or `test-engineer`).
   - Identify root cause (`oracle`, for non-trivial cases).
   - Fix the code (`developer-fixer`).
   - Validate the fix (`test-engineer`).
2. `orchestrator` delegates each subtask to the appropriate subagent.
3. Classify the completed change (NONE/LIGHT/DEEP), announce the outcome in one line, run the gate if LIGHT/DEEP — then update session memory (progress.md / issues.md).
4. `orchestrator` verifies the resolution and appends an entry to `.context/issues.md`.

---

## Plan Board Lifecycle & Owner Contract

`plan/` (four columns: `draft`, `in-progress`, `qa`, `complete`) is owned by exactly one agent: `plan-writer`. No other agent — the orchestrator, `planner`, `profiler`, `developer-fixer`, `test-engineer`, `code-reviewer` — creates, moves, renames or deletes a plan file. Content authorship stays with `planner` (which writes the plan body under `.context/`, never a board file); lifecycle ownership stays with `plan-writer`.

- **Tool** — every board mutation goes through one plan-board tool. On the plugin (V2), `plan-writer` calls the native `plan_board` tool. On the copy-based installer (V1), or when that tool is not registered, it runs
  `python3 scripts/plan-board.py <check|new|move|adopt> ... --root <board root> --json`
  (`python */plan-board.py *` stays allowlisted where a `python` alias exists; `plan-writer` falls back to `.opencode/scripts/plan-board.py` when the repository carries the tool there). Standard-library only, JSON on every path, exit `0` = ok (warnings do not fail), exit `1` = blocking error. Hand-crafted `mv`/`cp`/direct writes under the board root are a contract violation and are refused.
- **Conforming file** — `<id>-<slug>.md` (or `<id>.md`) with frontmatter
  `id/title/status/created/updated/owner/executor`, the `id` equal to the leading segment of the filename stem, `status` equal to the containing column, and the nine sections of `plan/README.md` in the body.
- **Standing authorization (user-granted, limited to the board root)** — covered without a fresh approval: `check` runs, and `move` of an already-conforming file between columns (including the `status`/`updated` refresh), cited as
  `## Approved Mutation Summary — plan-board-standing-v1`. NOT covered: `new` (creating a plan file), `adopt` (normalising an existing file), any body edit, deletion and rename — each needs its own per-dispatch approved Mutation Summary.
- **Staging body** — `planner` writes the plan body to `.context/plan-body-<id>.md`; once `plan-writer` has created the card through `plan_board new`, that file must be deleted (`rm .context/plan-body-<id>.md`, allowlisted for `plan-writer`). An orphan body is not session memory and must not be left in the repo.
- **Scaffolding exception** — `profiler` may create the missing `plan/<column>/.gitkeep` folders and `plan/README.md` on first run; it never creates or moves a plan file.
- **Never** — deletion, renaming, writes outside the board root, and edits to `plan/README.md` or `scripts/plan-board.py` are user-only decisions.


## Enforcement

- `orchestrator` MUST load this file (`AGENTS.md`) at startup to enforce its orchestrator role.
- Subagents MUST adhere to their defined contracts in `agents/<name>.md`. Violations MUST be reported to `orchestrator` for escalation.
- All delegated tasks MUST include a reference to this document for clarity.
- This file governs orchestration and delegation; `CONTRIBUTING.md` governs engineering discipline (secrets hygiene, git hygiene, definition of done). Where they overlap, this file wins for routing decisions and `CONTRIBUTING.md` wins for how the work itself is done.

---

## Repository contracts

The prompt-assembly contract — stable prefix, boundary baseline, frontmatter key order,
single primary agent — is a contributor invariant, not an agent instruction. It lives in
`CONTRIBUTING.md` (section "Prompt-assembly contract") and is enforced by the test suite;
nothing in this file changes when it changes.
