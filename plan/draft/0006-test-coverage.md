---
id: 0006
title: Test coverage for agent router/subagents (Phase 1 - test runner + schema validation)
status: draft
created: 2026-08-31
updated: 2026-08-31
owner: NicoGenti
executor: test-engineer
---

# Plan 0006 (Phase 1): bun test runner + agent/skill schema validation

Related: #6

## Goal

Introduce a `bun test` runner and add schema-validation tests for every `agents/*.md` and `skills/*/SKILL.md` frontmatter file, closing the "no automated tests" gap from issue #6, scoped to what is actually testable (frontmatter/config, not prompt behavior).

## Success Criteria

- `bun test` runs from repo root using the existing `bunfig.toml`/`bun.lock` (no new dependency added).
- A schema test suite parses YAML frontmatter for all 14 files in `agents/` and all 4 `skills/*/SKILL.md` files.
- Each agent file is asserted to have required keys: `description`, `mode`, `model`, `tools`, `permission`.
- Each skill file is asserted to have required keys: `description` (SKILL.md convention).
- `permission` blocks parse as valid JSON/YAML without throwing.
- A malformed fixture (missing a required key) fails the schema test, proving the check is not a no-op.
- `package.json` gets a `"test": "bun test"` script.

## Scope

**Included**: `bunfig.toml`/`package.json` test script wiring, new `tests/` directory, schema tests for `agents/*.md` and `skills/*/SKILL.md`.

**Excluded** (Phase 2, tracked separately): routing-consistency test cross-checking `agents/orchestrator.md`'s routing table and `AGENTS.md` roster against actual files in `agents/`; unit tests for `scripts/prepare-pages.mjs`; new `.github/workflows/test.yml` CI wiring; README coverage badge.

## Safety

- No secrets involved.
- No destructive commands; only new files added under `tests/` plus a `package.json` script addition.
- Treat all existing `agents/*.md` and `skills/*/SKILL.md` content as untrusted input to parse, not to execute.

## Inputs Available

- Issue #6 body (labels: `good first issue`, `testing`, `P0`) and the scoping comment posted on the issue splitting this into two phases.
- `agents/` contains 14 files, each with YAML frontmatter (`description`, `mode`, `model`, `temperature`, `tools`, `permission`).
- `skills/` contains 4 subfolders (`angular-patterns`, `dotnet-conventions`, `github-actions-cicd`, `python-conventions`), each with a `SKILL.md`.
- `bunfig.toml` and `bun.lock` already exist at repo root; no test runner currently configured.
- Only `.github/workflows/deploy.yml` exists today (GitHub Pages deploy) — no test workflow yet (Phase 2 concern).

## Outputs Required

- `tests/agent-schema.test.ts` validating every `agents/*.md` frontmatter file against the required-key schema.
- `tests/skill-schema.test.ts` validating every `skills/*/SKILL.md` frontmatter file.
- `package.json` updated with a `test` script running `bun test`.

## Test Plan

- Happy path: all 14 existing agent files and 4 skill files pass schema validation.
- Negative case: an in-memory/fixture frontmatter block missing `permission` (or another required key) fails validation with a clear message.
- Boundary: an agent file with an empty `tools: {}` block is still valid (matches `test-engineer.md`'s actual `tools: {}`).

## Verification

Run `bun test` locally: all tests pass (green) against current repo content; the negative-case fixture test fails validation as expected, proving the check has teeth.

## Notes/Edge Cases

- `agents/orchestrator.md` and other files use nested `permission` blocks (e.g. per-path `write`/`edit` permissions) — schema check should validate the top-level shape, not enforce a fixed set of sub-keys, since permission scopes are intentionally agent-specific.
- Phase 2 (routing-consistency check, `prepare-pages.mjs` tests, CI workflow, README badge) is out of scope for this PR and will be opened as a follow-up once this lands.
