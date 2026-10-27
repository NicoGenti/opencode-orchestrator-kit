---
id: 0002-design-first-governance
title: Design-first governance - rules template, oracle research, compliance checks
status: draft
created: 2026-10-28
updated: 2026-10-28
owner: NicoGenti
executor: perplexity-github-mcp
---

## Phase Checklist

- [ ] Phase A: DESIGN-RULES template and guide (canonical sections)
- [ ] Phase B: Align profiler seeding with the template headings
- [ ] Phase C: Orchestrator routing for design rules (new project and existing file)
- [ ] Phase D: Oracle research and proposal contract
- [ ] Phase E: Planner input and code-reviewer compliance checklist
- [ ] Phase F: Contract tests
- [ ] Phase G: Provider tool-use smoke checklist (docs only)
- [ ] Phase H: Docs and changelog

## Goal

Close the design-first loop started by plan 0001: a canonical DESIGN-RULES template, an approval-gated flow to create or normalize the rules (with oracle web research), and rule-compliance checks in planning and review.

## Success Criteria

- `templates/design-rules.md` and `docs/DESIGN-RULES.md` exist and define the same canonical sections: Purpose, Users and Use Cases, Constraints, Architectural Style, Module Boundaries, Data and Integrations, Non-Functional Requirements, Design Rules, Decision Log.
- The profiler seed (`.context/DESIGN-RULES.md`) uses exactly those headings.
- New project: the orchestrator asks the user for goals via `question`, dispatches `oracle` for a proposal, obtains explicit user approval, then dispatches `developer-fixer` to write the file.
- Existing architecture file: the orchestrator asks the user whether to normalize it; on no, the file is never modified; on yes, changes are additive and applied only after the user approves the oracle proposal.
- `oracle` reads the design-rules artifact when present, cites the rules it applies, flags conflicts, and records every external fact in the Decision Log with source URL and retrieval date. It stays read-only.
- `planner` lists the artifact under Inputs Available and names the rules each phase touches; `code-reviewer` runs a Design Rules Compliance checklist and skips it silently when no artifact exists.
- `docs/PROVIDER-SMOKE-CHECK.md` defines a per-tier tool-use checklist; it contains no invented results.
- All agent/command changes are mirrored byte-for-byte under `plugin/assets/`; the full test suite passes.

## Scope

- In: `templates/design-rules.md`; `docs/DESIGN-RULES.md`; `docs/PROVIDER-SMOKE-CHECK.md`; `agents/profiler.md`, `agents/orchestrator.md`, `agents/oracle.md`, `agents/planner.md`, `agents/code-reviewer.md` and their `plugin/assets/agents/` mirrors; new on-demand skill `skills/design-rules-workflow/SKILL.md` (and its `plugin/assets/skills/` mirror); `tests/design-rules-contract.test.ts`; `README.md` (one line), `QUICKSTART.md` (one link), `CHANGELOG.md` (Unreleased).
- Out: the quality/cost benchmark (P0, run by the user at the end); LSP or semantic index; new files under `agents/` or `extras/`; write permission for `oracle`; `scripts/plan-board.py`; model tiers.

## Safety

- Work on a feature branch (`feat/design-first-governance`); one commit per phase; one PR referencing plan 0002.
- Never touch the prompt-prefix boundary set (no add, remove or rename under `agents/` or `extras/`); keep the canonical frontmatter key order.
- `agents/orchestrator.md` must stay within its 24,000-char prompt budget (W1 pin); put detailed flow text in the on-demand skill, not in the agent prompt.
- A subagent never asks the user: all user questions are asked by the orchestrator via `question`.
- External research results must never override a user-declared stack without explicit approval.
- No secrets in commits; do not invent provider test results.

## Inputs Available

- Merged PR #54 (plan 0001): `command/start-session.md` step 0b, profiler goal intake and `.context/DESIGN-RULES.md` seeding.
- Existing on-demand skill pattern: `comprehension-workflow` (loaded only when needed).
- Tests to keep green: `plugin-agents`, `plugin-integration`, `agent-schema`, `frontmatter-order`, `assembly-order`, `stable-prefix-boundary`, `profiler-repo-map`, and the orchestrator prompt-budget pin.
- `docs/BENCHMARK-TOKEN-USAGE.md` (style reference for docs).

## Outputs Required

### Phase A (S)

- Create `templates/design-rules.md` with the nine canonical sections and one-line fill-in hints.
- Create `docs/DESIGN-RULES.md`: purpose, lifecycle (draft -> refined -> approved), who writes what, how the Decision Log cites external sources.

### Phase B (XS) - requires A

- `agents/profiler.md` Case 2 step 5: seed uses the exact template headings, inline in the prompt (templates are not shipped as plugin assets); unanswered sections stay empty.
- Mirror to `plugin/assets/agents/profiler.md`.

### Phase C (S) - requires A

- Create `skills/design-rules-workflow/SKILL.md` (+ plugin mirror): new-project flow and existing-file normalization flow, each with the approval gates from Success Criteria.
- `agents/orchestrator.md`: add at most 4 lines of routing that load the skill when step 0b reports no artifact (new repo) or a non-canonical artifact; allow the skill in the orchestrator `permission.skill` map; mirror the agent file.

### Phase D (S) - requires A

- `agents/oracle.md`: add a Design Rules section (mandatory read, cite rules, flag conflicts) and a Proposal mode (webfetch only for current versions, official docs, security advisories; Decision Log row per external fact with URL and date; at most one alternative). Keep `edit: deny`.
- Mirror to `plugin/assets/agents/oracle.md`.

### Phase E (XS)

- `agents/planner.md`: Inputs Available must list the artifact when present; each phase names the rules it touches.
- `agents/code-reviewer.md`: add the Design Rules Compliance checklist (module boundary violations, dependency direction, contradiction with Decision Log, new rule without a test); skip when no artifact.
- Mirror both files.

### Phase F (S) - requires A-E

- Create `tests/design-rules-contract.test.ts`: template headings equal profiler seed headings; skill exists and is allowed by the orchestrator; oracle has `webfetch: allow` and `edit: deny`; planner and code-reviewer contain the new clauses; mirrors are identical; orchestrator prompt stays within budget.

### Phase G (XS)

- Create `docs/PROVIDER-SMOKE-CHECK.md`: per tier (ROUTER, REASONING, CODE, FAST, REVIEW) a checklist - tool-call round trip, edit permission, shell permission, long-context read, concurrent-agent limit - plus an empty results table (date, provider, model id, pass/fail, notes) for the user to fill.

### Phase H (XS) - last

- `README.md` one line on design-first governance; `QUICKSTART.md` link to `docs/DESIGN-RULES.md`; `CHANGELOG.md` Unreleased entries for phases A-G.

## Test Plan

- `bun test` after every phase; expected exit 0.
- `python scripts/plan-board.py check --root plan --json` after adding the plan; expected exit 0.
- Diff check per phase: each agent file and its `plugin/assets/` mirror are identical.

## Verification

- All phases checked off in the Phase Checklist; full suite green on the PR CI run.
- `tests/fixtures/prompt-prefix-boundary.txt` unchanged; `stable-prefix-boundary.test.ts` green.
- Manual dry run in a scratch empty repo: the flow asks goals, shows the oracle proposal, writes nothing before approval. Record the outcome in `.context/progress.md`; if not run, say so.

## Notes / Edge Cases

- Dependencies: B, C, D require A; F requires A-E; H is last; E and G are independent.
- If the orchestrator skill permission or the plugin skill registration needs a new entry, add it in the same phase and extend `plugin-integration` expectations.
- If `agents/orchestrator.md` approaches the budget, shorten the added lines rather than raising the pin.
- The user's P0 benchmark can reuse `docs/PROVIDER-SMOKE-CHECK.md` as its pre-flight step.
- Rollback: revert the PR; no state lives outside git.
