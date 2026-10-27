# Design Rules Workflow

Approval-gated flow to create or normalize the design-rules artifact. The orchestrator loads this skill when `/start-session` step 0b reports no artifact (new/empty repo) or a non-canonical one.

## Invariants

- A subagent never asks the user: the orchestrator asks via `question`.
- `oracle` stays read-only: it proposes, never writes.
- Nothing is written before explicit user approval of the oracle proposal.
- An existing architecture file is never modified without user approval; normalization is additive only.
- External research never overrides a user-declared stack without explicit approval.

## Flow A - New project (no artifact)

1. Orchestrator asks the user (via `question`) for: project purpose and target audience, core capabilities to build first, known constraints or integrations.
2. Orchestrator dispatches `oracle` with the answers and `templates/design-rules.md` headings, asking for one complete proposal (webfetch allowed only for current versions, official docs, security advisories; every external fact must carry source URL + retrieval date for the Decision Log).
3. Orchestrator shows the proposal to the user and waits for explicit approval.
4. On approval, orchestrator dispatches `developer-fixer` to write `.context/DESIGN-RULES.md` using the canonical headings, filling only what the user approved.
5. On rejection, orchestrator records the objection in `.context/decisions.md` and stops.

## Flow B - Existing architecture file

1. Orchestrator reads the existing root `ARCHITECTURE.md` / `DESIGN-RULES.md` / `.context/DESIGN-RULES.md`.
2. Orchestrator asks the user whether to normalize it against the canonical template.
3. On no: stop; the file is never modified.
4. On yes: orchestrator dispatches `oracle` to propose ADDITIVE changes only (missing sections, clarifications); destructive rewrites are forbidden.
5. User approves the proposal; orchestrator dispatches `developer-fixer` to apply it.

## Handoff to planning

Once the artifact exists (draft or approved), the orchestrator includes its path in every `planner` and `code-reviewer` delegation under Inputs Available.
