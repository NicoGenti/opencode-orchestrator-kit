---
name: structural-search
description: Opt-in ast-grep patterns for structural code search (function defs, call sites, class usage). Read-only; falls back to rg when ast-grep is unavailable.
---

# Structural Search (ast-grep, opt-in)

Use this skill when the explorer needs structural matches that plain `rg` cannot express well (e.g. "find all call sites of X", "find all async functions", "find classes implementing Y").

## When to use

- The question is about code structure, not plain text.
- The `sg` (ast-grep) binary is available on PATH (`sg --version` or `ast-grep --version`).
- CRG is absent or did not narrow the search enough.

## Core patterns

- Function definition: `sg run -p 'function $NAME($$$ARGS) { $$$ }'` (adjust per language).
- Call site: `sg run -p '$OBJ.$METHOD($$$ARGS)'`.
- Class usage: `sg run -p 'new $CLASS($$$ARGS)'`.

Always scope with `--globs` to the relevant file set (e.g. `--globs 'src/**/*.ts'`) to keep output small.

## Safety

- Read-only: never use ast-grep to rewrite files (`--rewrite` is forbidden in this workflow).
- If `sg` is missing or errors, fall back silently to `rg` + targeted reads.
- Respect the explorer's bounded-read and output-contract rules.

## Fallback

If structural search yields nothing useful within 2 attempts, revert to the standard `rg` → targeted-read ladder and note it in `Not checked:` if relevant.
