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

| Runtime ID | Role | Read/write scope |
| --- | --- | --- |
| `profiler` | Repo bootstrap: stack/CI detection, empty-repo intake, `plan/` scaffolding. Runs once per repo. | Writes only `PROJECT-PROFILE.md`, `.context/*` templates, `plan/README.md`, `plan/*/.gitkeep` |
| `explorer` | Codebase, file, or symbol exploration. | Read-only |
| `librarian` | Documentation lookups, remote examples, repository history. | Read-only |
| `oracle` | Architecture, design, or strategy advice. | Read-only |
| `planner` | Turns exploration into a phased development plan. | Writes to `plan/draft/` only |
| `developer-fixer` | Implementation, TDD, single-phase execution against a precise spec. | Writes application code/tests per scope |
| `test-engineer` | Tests, coverage, reproduction. | Writes tests only unless explicitly delegated otherwise |
| `code-reviewer` | General correctness/design/quality review. | Read-only |
| `security` | Vulnerability, threat-model, hardening review. | Read-only |
| `build-helper` | TypeScript/Vite/webpack/build-tool errors. | Scoped fixes |
| `npm-helper` | npm/Node dependency, install, cache issues. | Scoped fixes |
| `deploy-helper` | CI/CD pipeline and deploy platform failures. | Scoped fixes |
| `pc-doctor` | Windows/local environment, PATH, services. Defined in `extras/pc-doctor.md`. | Scoped fixes |
| `writer` | Technical documentation generation. Defined in `extras/writer.md`. | Docs only, never executable code |

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
3. `orchestrator` validates and integrates the outputs, updating `.context/progress.md`.

### Example 2: Debugging an Issue

1. `orchestrator` analyzes the issue and breaks it into subtasks:
   - Reproduce the issue (`explorer` or `test-engineer`).
   - Identify root cause (`oracle`, for non-trivial cases).
   - Fix the code (`developer-fixer`).
   - Validate the fix (`test-engineer`).
2. `orchestrator` delegates each subtask to the appropriate subagent.
3. `orchestrator` verifies the resolution and appends an entry to `.context/issues.md`.

---

## Enforcement

- `orchestrator` MUST load this file (`AGENTS.md`) at startup to enforce its orchestrator role.
- Subagents MUST adhere to their defined contracts in `agents/<name>.md`. Violations MUST be reported to `orchestrator` for escalation.
- All delegated tasks MUST include a reference to this document for clarity.
- This file governs orchestration and delegation; `CONTRIBUTING.md` governs engineering discipline (secrets hygiene, git hygiene, definition of done). Where they overlap, this file wins for routing decisions and `CONTRIBUTING.md` wins for how the work itself is done.

---

## Prompt-Assembly Stable-Prefix Contract

This section locks down the **repository-controlled stable prefix** of the prompt assembly. It is the contract that any future assembler implementation, cache key, or review tool MUST honor. It documents what is already enforced by the test suite; it does not introduce new behavior.

### Boundary

The repository-controlled stable prefix consists only of the following prompt-source files:

- `AGENTS.md` — the single root file.
- `agents/*.md` — every Markdown file in the `agents/` directory.
- `extras/*.md` — every Markdown file in the `extras/` directory (when the directory exists).

Anything else — `tests/`, `skills/`, `.context/`, `plan/`, `docs/`, the site/ directory, lockfiles, etc. — is out of scope for the stable prefix.

### Explicit Exclusions

The following paths are **deliberately excluded** from the stable prefix:

- `.opencode/context/` — user-local; not a repository-controlled prompt source.
- `.opencode/models.config.json` — user-local configuration; not a prompt source.
- OpenCode-native cache internals — the cache implementation is owned by the runtime, not by this repository. This contract does not, and must not, assert anything about OpenCode's internal cache key format, hashing strategy, eviction policy, or storage layout.

The exclusion of `.opencode/context/` and `.opencode/models.config.json` is rule-based: even if those paths exist on disk, they MUST NOT appear in the stable prefix.

### Deterministic Enumeration Order

The assembler MUST concatenate boundary files in exactly this order:

1. `AGENTS.md` (first, when present).
2. `agents/*.md` paths, sorted ascending by relative path (lexicographic, forward slashes).
3. `extras/*.md` paths, sorted ascending by relative path (when the directory exists).

Within each bucket the order is strictly sorted; across buckets the order is strictly `AGENTS.md` → `agents/` → `extras/`. No bucket may interleave with another. Two independent enumerations of the same repository MUST produce identical lists; the sort is the source of determinism.

### Frontmatter Key Order

The canonical top-level frontmatter key order for files under `agents/` and `extras/` is:

```
description, mode, model, temperature, tools, permission
```

Present keys MUST appear in this order. Absent keys are skipped (subsequence semantics, not strict permutation). Nested keys inside `tools:` and `permission:` blocks are out of scope — this contract does not prescribe their order or shape. Top-level keys outside the canonical list are rejected.

### Boundary Baseline

The committed baseline of the boundary lives at `tests/fixtures/prompt-prefix-boundary.txt`. It lists every boundary file exactly once, in sorted order, using forward slashes. Any change to the set of boundary files (addition, removal, rename) MUST update the baseline in the same change.

The relevant guard tests are:

- `tests/frontmatter-order.test.ts` — asserts the canonical top-level frontmatter key order (and the current `mode: primary` file set).
- `tests/assembly-order.test.ts` — asserts the deterministic `AGENTS.md` → sorted `agents/` → sorted `extras/` enumeration.
- `tests/stable-prefix-boundary.test.ts` — asserts the boundary exactly matches the committed baseline and explicitly excludes `.opencode/context/` and `.opencode/models.config.json`.

### Known Discrepancy (Out of Scope)

The repository currently has a pre-existing two-primary discrepancy: `agents/orchestrator.md` and `agents/security.md` both declare `mode: primary`. This contract does **not** assert that there is a single primary agent, does not prescribe a resolution, and does not authorize changing either value. Reconciling the spec's single-primary wording with the existing two-primary reality is left to a separate decision.

### Scope of This Contract

- This section documents repository-controlled prompt-source invariants. It does not modify OpenCode's internal cache implementation, model-preset values, or routing behavior.
- Adding, removing, or renaming a boundary file is a contract change: update the baseline and the relevant tests in the same change.
- `.opencode/context/` remains user-local and excluded by explicit user decision; do not edit or un-ignore it.
- The model-preset mismatch remains out of scope; this contract does not mention a resolution.
