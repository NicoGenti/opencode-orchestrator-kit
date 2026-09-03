---
name: python-conventions
description: >-
  Python style and structure conventions based on PEP 8. Load before implementing or reviewing any
  pyproject.toml/requirements.txt-based feature.
---

# Python Conventions

Based on PEP 8, the official Python style guide [web:74].

## Naming

- `lower_case_with_underscores` for functions and variables [web:87].
- `CapitalizedWords` (PascalCase) for classes [web:87].
- `UPPERCASE_WITH_UNDERSCORES` for constants [web:87].
- Always use `self` as the first argument of instance methods [web:84].

## Formatting

- 4 spaces per indentation level; never mix tabs and spaces [web:74][web:84].
- Limit lines to 79 characters for code, 72 for docstrings/comments — relax this ceiling only if the project's linter config already does (e.g., Black's 88-char default) [web:74].
- Two blank lines around top-level functions and classes; one blank line between methods inside a class [web:74].
- One space around operators; no space immediately inside parentheses/brackets [web:87].
- Pick one quote style (single or double) and use it consistently across the codebase [web:87].

## Imports

- Order: standard library, then third-party, then local application imports, each group separated by a blank line [web:87][web:84].
- Prefer one import per line; use explicit `from module import name` only when it improves clarity.

## Structure

- Use type hints on public function signatures.
- Use docstrings for modules, classes, and public functions describing purpose, not implementation.
- Keep functions focused; if a function mixes multiple responsibilities, split it.

## When Reviewing

Flag mixed tabs/spaces, inconsistent quote style, and missing type hints on public APIs ahead of line-length nits if the project has its own formatter (Black/Ruff) already configured — defer to that tool's config over strict PEP 8 line length.
