# Design Rules

The design-rules artifact keeps the application's architecture decisions in one place, so the kit's agents plan and review against the design rather than guess it. It lives at `.context/DESIGN-RULES.md` in the target repository.

## Canonical sections

The template in `templates/design-rules.md` and the profiler seed use the same nine headings, in this order:

| Section | Content |
| --- | --- |
| Purpose | What the application is and why it exists. |
| Users and Use Cases | Who uses it and the first workflows to build. |
| Constraints | Fixed decisions: stack, hosting, budget, team, compliance. |
| Architectural Style | Chosen style and the reason. |
| Module Boundaries | Modules, ownership, allowed dependency direction. |
| Data and Integrations | Entities, data ownership, external services. |
| Non-Functional Requirements | Security, privacy, performance, availability. |
| Design Rules | Numbered, testable rules that other agents can cite. |
| Decision Log | One row per decision, with source URL and retrieval date for external facts. |

## Lifecycle

1. **Draft**: the `profiler` seeds the file from the user's own answers. Unanswered sections stay empty; nothing is invented.
2. **Refined**: the `oracle` reads the draft and returns a proposal. It never writes the file.
3. **Approved**: the user approves the proposal explicitly, and only then does `developer-fixer` write it to `.context/DESIGN-RULES.md`.

An existing file is never rewritten automatically. The orchestrator asks the user whether to normalize it. If the answer is no, the file stays untouched. If the answer is yes, changes are additive and applied only after the user approves the proposal.

## Who writes what

- **Orchestrator**: asks the user for goals and approvals through `question`. A subagent never asks the user directly.
- **Profiler**: seeds the draft for a new repository, and reports an existing artifact without modifying it.
- **Oracle**: read-only. Applies and cites the rules, flags conflicts, and proposes changes.
- **Developer-fixer**: writes the approved file.
- **Planner**: lists the artifact under Inputs Available and names the rules each phase touches.
- **Code-reviewer**: runs a Design Rules Compliance checklist when the artifact exists, and skips it silently when it does not.

The orchestrator routing and the oracle proposal mode are delivered by plan 0002, phases C and D.

## Citing external sources

Research results never override a stack the user has declared without explicit approval. Every external fact used in a decision gets one Decision Log row with:

- the decision and the reason;
- the source URL;
- the retrieval date.

Use official documentation, current version information, and security advisories. A proposal contains at most one alternative.
