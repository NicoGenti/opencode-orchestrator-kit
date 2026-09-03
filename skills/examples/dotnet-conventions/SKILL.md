---
name: dotnet-conventions
description: >-
  C#/.NET naming, structure, and style conventions to apply when writing or reviewing C# code. Load before
  implementing or reviewing any .csproj-based feature.
---

# .NET Conventions

Apply these conventions consistently. Prefer clarity and modern C# features over legacy patterns [web:61].

## Naming

- PascalCase for types, methods, and public members.
- camelCase for local variables and parameters.
- Prefix interfaces with `I` (e.g., `IRepository`).
- Prefix private fields with `_` (e.g., `_httpClient`).
- Use language keywords for built-in types (`string`, `int`) instead of runtime type names (`String`, `Int32`) [web:61].
- Use `int` rather than unsigned types unless interop specifically requires it [web:61].

## Style

- Use `var` only when the type is obvious from the right-hand side; otherwise use the explicit type [web:61].
- Use modern language features (pattern matching, records, nullable reference types) over outdated constructs [web:61].
- Use LINQ for collection manipulation where it improves readability; avoid LINQ chains so long they hurt readability.
- Use `async`/`await` for I/O-bound work; be careful with `ConfigureAwait` in library code to avoid deadlocks [web:61].
- Catch specific exception types with meaningful messages; do not catch bare `Exception` without a filter [web:61].
- Keep methods short (aim under ~50 lines); if a method grows past that, extract private helper methods.

## Structure

- One primary type per file; file name matches the type name.
- Group namespace imports alphabetically, `System.*` first, at the top of the file, outside the namespace block.
- Prefer dependency injection via constructor over static/service-locator patterns.
- Prefer the repository/service pattern already used in the codebase over introducing a new abstraction layer — check 2-3 existing services before adding a new pattern.

## When Reviewing

Flag violations of the above, but prioritize behavior-affecting issues (nullability bugs, unawaited tasks, exception swallowing) over pure style nits.
