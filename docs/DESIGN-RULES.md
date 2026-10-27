# Design Rules

The design-rules artifact is the kit's single source of truth for architecture decisions.

## Artifact locations

The orchestrator recognizes, in order:

1. `.context/DESIGN-RULES.md` — kit-native location, seeded by the profiler on new repos.
2. Root `ARCHITECTURE.md` — common convention.
3. Root `DESIGN-RULES.md` — alternative convention.

## Canonical sections

Purpose, Users and Use Cases, Constraints, Architectural Style, Module Boundaries, Data and Integrations, Non-Functional Requirements, Design Rules, Decision Log.

## Lifecycle

1. **Draft** — the profiler seeds the file on a new/empty repo from the user's goal answers; unanswered sections stay empty.
2. **Refined** — `oracle` reads the artifact, researches current best practices when needed, and proposes additions or normalization; the user approves before anything is written.
3. **Approved** — `developer-fixer` writes the approved changes; the artifact becomes a binding input for `planner` and `code-reviewer`.

## Who writes what

| Actor | Role |
| --- | --- |
| `profiler` | Seeds the draft on new repos; never modifies an existing artifact. |
| `oracle` | Reads, researches, proposes; never writes. |
| User | Approves or rejects every proposal. |
| `developer-fixer` | Writes approved changes only. |
| `planner` | Consumes the rules; never edits them. |
| `code-reviewer` | Checks compliance; never edits them. |

## Decision Log

Every externally sourced fact (framework version, official guidance, security advisory) recorded in the Decision Log must cite the source URL and the retrieval date. External research never overrides a user-declared stack without explicit approval.

See `templates/design-rules.md` for the canonical template.
