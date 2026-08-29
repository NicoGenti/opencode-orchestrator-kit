# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project does not yet follow a formal versioning scheme.

## [Unreleased]

### Added

- **Pre-Delegation Confirmation Gate**: `orchestrator` now pauses and asks the user for explicit confirmation, in the root session, before delegating any task to a file-writing agent (`developer-fixer`, `build-helper`, `deploy-helper`, `npm-helper`, `test-engineer`). This is independent of OpenCode's native `edit`/`bash` permission layer and covers known gaps where nested-subagent permission prompts don't reliably bubble up to the root session. See `agents/orchestrator.md`, "Pre-Delegation Confirmation Gate", and `docs/ARCHITECTURE.md`, "Human-in-the-loop confirmation gate."
- `README.md`: new "Perché¤¤ nasce questo kit" section explaining the framework's origin and motivation, plus documentation of the confirmation gate in the "How it works" flow and the agent roster table.
- `docs/ARCHITECTURE.md`: documented the confirmation gate in the routing flow diagram and added a dedicated "Human-in-the-loop confirmation gate" section.

### Fixed

- `agents/test-engineer.md`: added the `permission.edit` block that was previously undefined, scoped to `ask` on common test-file patterns (`*.test.*`, `*.spec.*`, `test/**`, `tests/**`, `__tests__/**`) and `deny` elsewhere.
