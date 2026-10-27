---
id: 0001-design-first-bootstrap
title: Design-first bootstrap for architecture design rules
status: draft
created: 2026-10-27
updated: 2026-10-27
owner: NicoGenti
executor: perplexity-github-mcp
---

## Goal

Make the kit bootstrap design-first: the session bootstrap checks for a design-rules artifact, and the profiler's new-repo intake asks the user for project goals and seeds `.context/DESIGN-RULES.md` before any scaffolding is planned.

## Success Criteria

- `command/start-session.md` includes a bootstrap step "0b. Design rules check" that verifies a design-rules artifact exists (`.context/DESIGN-RULES.md`, root `ARCHITECTURE.md`, or root `DESIGN-RULES.md`).
- `agents/profiler.md` Case 2 asks up to 3 goal questions (project purpose and audience, core capabilities to build first, known constraints) in addition to the existing stack questions.
- The profiler writes `.context/DESIGN-RULES.md` (only when absent), seeded strictly from the user's answers, under a "Draft — to be refined by oracle" heading.
- The profiler frontmatter `permission.write` list includes `.context/DESIGN-RULES.md: allow`.
- Case 1 (existing repo): the profiler detects an existing root `ARCHITECTURE.md` / `DESIGN-RULES.md` and reports it; normalization is proposed to the user, never applied automatically.
- The `AGENTS.md` profiler roster row's "Writes only" column is updated to include `.context/DESIGN-RULES.md`.
- All changes are mirrored to `plugin/assets/agents/profiler.md` and `plugin/assets/commands/start-session.md` (byte-identical copies).
- The full test suite passes, including `profiler-repo-map`, `plugin-agents`, `plugin-integration`, `agent-schema`, `frontmatter-order`, `assembly-order`, and `stable-prefix-boundary`.

## Scope

- In: `command/start-session.md`; `agents/profiler.md`; `plugin/assets/commands/start-session.md`; `plugin/assets/agents/profiler.md`; `AGENTS.md` (profiler row only); `QUICKSTART.md` (one positioning line); `CHANGELOG.md` (Unreleased — Added); this plan file.
- Out: no new agent or extras files (the prompt-prefix boundary set and `tests/fixtures/prompt-prefix-boundary.txt` stay unchanged); no edits to `scripts/plan-board.py`; no changes to the oracle read-only contract; no `src/` or runtime code changes; no model-tier or permission-architecture changes.

## Safety

- No secrets or credentials in commits.
- Workflow: one feature branch (`feat/design-first-bootstrap`) off `main` if direct push to `main` is blocked by branch protection; changes land as one commit and merge via reviewed PR.
- Do not add, remove, or rename files under `agents/` or `extras/` — that is a boundary contract change and is out of scope.
- Keep the canonical frontmatter key order (`description, mode, model, temperature, tools, permission`) and introduce no new top-level frontmatter keys.
- Do not modify existing files in place other than the Markdown surfaces listed in Scope.

## Inputs Available

- `agents/profiler.md` (blob df6d257), `command/start-session.md` (blob cffc6ec), and their `plugin/assets/` mirrors.
- `AGENTS.md` runtime roster table (profiler row).
- `tests/profiler-repo-map.test.ts` (asserts profiler write permissions), `tests/plugin-agents.test.ts` and `tests/plugin-integration.test.ts` (agents/ ↔ plugin/assets/agents/ parity), `tests/frontmatter-order.test.ts` (canonical key order).

## Outputs Required

- One commit (or PR) containing the edited files listed in Scope plus this plan file.
- `CHANGELOG.md` Unreleased entry: "Design-first bootstrap: profiler intake asks for project goals and seeds `.context/DESIGN-RULES.md`; session bootstrap adds a design-rules check."
- A PR against `main` referencing plan id `0001` in the description.

## Test Plan

- `bun test` — full suite, expected exit 0.
- `python scripts/plan-board.py check --root plan --json` — expected exit 0, new plan file conforming.
- Diff review: profiler frontmatter permission list contains `.context/DESIGN-RULES.md: allow`; `agents/profiler.md` and `plugin/assets/agents/profiler.md` identical; same for the two `start-session.md` copies.

## Verification

- All named suites green on the PR's CI run.
- `plan-board.py check` reports no ERROR for the new plan file.
- Boundary baseline fixture unchanged; `stable-prefix-boundary.test.ts` green.

## Notes / Edge Cases

- P1 follow-up (separate plan, id 0002): orchestrator routing for the architecture-first flow — `oracle` (webfetch allowed) researches current best practices for the chosen stack, the user approves the recommendation, and `developer-fixer` transcribes it into `.context/DESIGN-RULES.md` (oracle stays read-only). Also the "normalize existing architecture file" offer when a root `ARCHITECTURE.md` exists.
- P2 follow-up: a fixed-section `DESIGN-RULES.md` template under `templates/` (Purpose, Constraints, Style Rules, Structure Decisions, Open Questions) and README positioning line.
- If the user answers no goal questions, write the artifact with empty sections rather than inventing requirements — never fabricate goals.
- If `.context/DESIGN-RULES.md` already exists, the profiler leaves it untouched and reports "design rules already present" (same idempotency rule as the memory templates).
- Rollback: revert the single commit; no state persists outside git.
