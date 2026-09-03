---
name: angular-patterns
description: >-
  Angular structure, component, and state-management conventions to apply when writing or reviewing Angular code.
  Load before implementing or reviewing any angular.json-based feature.
---

# Angular Patterns

## Components

- Default to standalone components; use NgModules only when shared configuration across many components genuinely requires it [web:70][web:59].
- One component (TS + template + style) per file trio, sharing the same base name (`[name].component.ts/.html/.css`) [web:59].
- Limit files to ~400 lines; if a component grows past that, split responsibilities [web:59][web:68].
- Limit individual functions/methods to ~75 lines [web:68].
- Use the `OnPush` change detection strategy by default for performance; only fall back to default detection when the component genuinely needs it [web:67].
- Use `@defer` blocks for lazy-loading heavy or below-the-fold components [web:67].

## Naming

- kebab-case for file names, `feature.type.ts` pattern (e.g., `user-profile.component.ts`) [web:68][web:70].
- PascalCase for classes/interfaces, camelCase for properties and methods [web:70].
- Use dashes to separate words in descriptive names, dots to separate the descriptive name from the type suffix [web:68].

## Structure

- All UI code (TS, HTML, styles) lives under `src/`; config and scripts live outside `src/` [web:59].
- One empty line between third-party imports and application imports [web:68].
- Prefer feature-based folder structure over type-based (group by feature, not by "components/services/pipes" folders).

## State Management

- Use signals or RxJS consistently within a given module — check the existing pattern in the codebase before introducing a new one.
- Avoid subscribing manually in components when the `async` pipe or a signal-based approach suffices; manual subscriptions require explicit unsubscription (e.g., `takeUntilDestroyed`).

## When Reviewing

Flag standalone-vs-NgModule inconsistency, missing `OnPush` where clearly beneficial, and manual subscriptions without cleanup, ahead of pure naming nits.
