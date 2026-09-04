---
name: build-debug
description: >-
  Diagnose TypeScript, Vite, webpack, Rollup, esbuild, and Sass build errors that reproduce locally and are
  unrelated to CI/CD or npm toolchain failures. Load ONLY for pure build-tool errors. Bounded, non-destructive
  triage; never auto-runs cache wipes or version downgrades without explicit confirmation.
---

# Build-Tool Debugging

A bounded playbook for diagnosing build-tool failures that reproduce locally and are unrelated to CI/CD or
npm toolchain failures. This skill is opt-in for `build-helper` and SHOULD be loaded only after the
orchestrator has classified the failure as a pure build-tool error (see `agents/orchestrator.md` "Routing
Disambiguation: deploy-helper vs build-helper vs npm-helper vs pc-doctor").

## Scope

In scope:

- TypeScript compile errors (`tsc`, `vue-tsc`, `tsgo`) that are not application logic bugs.
- Bundler errors: Vite, webpack, Rollup, esbuild, Parcel, Rspack.
- Sass / PostCSS / CSS-module pipeline errors.
- Source-map, asset, or `public/` resolution failures inside the build.
- Path-alias and `tsconfig.json` / `jsconfig.json` resolution drift.

Out of scope — delegate to another helper:

- npm install / peer-dep / lockfile failures → `npm-helper` (`skills/npm-debug`).
- CI/CD pipeline or deploy-platform failures → `deploy-helper` (`skills/github-actions-cicd`).
- Windows-local environment issues → `pc-doctor`.

## Triage Order (Read Before Acting)

1. **Capture the exact failing command and its full stderr.** Quote the first error line and the file:line
   it points at verbatim — most bundlers print the actionable line first, then a noise stack.
2. **Confirm the project shape:** `package.json` scripts, presence of `tsconfig.json` / `jsconfig.json`,
   bundler config file (e.g. `vite.config.ts`, `webpack.config.js`). Wrong-config-file-for-this-script is a
   common false lead when the repo has multiple build modes.
3. **Check Node + bundler versions** (`node -v`, `npm ls <bundler>`). A version jump that changed defaults
   (Vite 4 → 5, webpack 4 → 5, TypeScript 4 → 5) is a frequent root cause.
4. **Reproduce minimally:** drop the watch flag and any dev-only plugins. `vite build` is more diagnostic
   than `vite dev`; `tsc --noEmit` is more diagnostic than a bundler that wraps it.
5. **Check for stale caches:** the build tool's own cache, plus `node_modules/.cache`, plus any `.tsbuildinfo`
   file. Only after the simple repro fails identically do you escalate to cache invalidation (see
   "Destructive Steps" below).

## Common Failures and First-Line Fixes

### `Cannot find module` / `Cannot find type definitions`

- Cause: missing dependency, missing `tsconfig.json` `paths` entry, or wrong `baseUrl` / `moduleResolution`.
- First-line fix: confirm the package exists in `node_modules` and is listed in `package.json`; if missing,
  this is an `npm-helper` failure, not a build-tool failure. If present, check `paths` / `baseUrl` /
  `moduleResolution` against the file's actual import path.

### `Type 'X' is not assignable to type 'Y'` cascades

- Cause: a small upstream type change propagating through the dep graph.
- First-line fix: identify the exact mismatch and the introducing commit/PR before recommending any
  suppression. Do NOT recommend blanket `// @ts-ignore` or `skipLibCheck: true` without surfacing the
  mismatch in the report.

### Vite `esbuild` OOM during build

- Cause: large monorepo or aggressive `optimizeDeps` configuration outrunning default memory.
- First-line fix: raise `NODE_OPTIONS=--max-old-space-size=4096` for the build script, then audit the
  `optimizeDeps.include` list for entries that pull entire UI libraries. Memory bumps are a diagnostic
  step, not a fix.

### Sass deprecation warnings treated as errors

- Cause: a `sass` upgrade promoted a deprecation to an error in CI but not locally.
- First-line fix: confirm the `sass-embedded` / `sass` version, then map each deprecation to its specific
  replacement call. Do NOT silence with `quietDeps: true` or `silenceDeprecations` without documenting
  each silenced deprecation.

### `Chunk size > 500 kB` warnings blocking CI

- Cause: a single bundle absorbed a heavy dep or there is no code-splitting on the entry route.
- First-line fix: identify the offending chunk (`rollup-plugin-visualizer` or the bundler's built-in
  report) and propose a code-split boundary or a dynamic import, not a global `chunkSizeWarningLimit`
  bump without surfacing the chunk contents.

## Destructive Steps (Require Explicit Confirmation)

The following commands can lose build cache, lock state, or dev artifacts. The orchestrator MUST pause and
request explicit user confirmation before any of them are run, even when delegated to `build-helper`:

- `rm -rf node_modules/.cache` — drops the bundler's transform cache; slow to rebuild.
- `rm .tsbuildinfo` or any `*.tsbuildinfo` — forces a full TypeScript re-check.
- `rm -rf dist` / `rm -rf build` — destroys the previous build output (usually safe to regenerate).
- Downgrading a major version of a build tool (`npm install --save-dev vite@4`) — silently changes
  behavior; the user MUST approve.
- Editing `tsconfig.json` `compilerOptions` to suppress a real type error (`strict: false`,
  `skipLibCheck: true`, `noImplicitAny: false`) — suppressions must be flagged in the report.

When any of these is genuinely needed, present the exact command and the files/paths affected, and wait
for an explicit "yes" before executing.

## Reporting Format

After triage, the `build-helper` report SHOULD include:

- Failing command (verbatim) and working directory.
- Bundler + Node versions, and the relevant `tsconfig.json` / config-file digest (not the full file).
- The first actionable root cause, with the file:line or config key that supports it.
- The minimum fix (exact command, config change, or `package.json` patch) and whether it is destructive.
- A short "what I did NOT do and why" line for ruled-out candidates, so the user can revisit them later.

Keep the report compact; do not paste full build logs unless the failing line is itself the evidence.

## When Reviewing or Debugging

Check for: missing `engines.node` paired with a `tsconfig.json` that assumes a newer TS, swallowed
`catch (e) {}` blocks around bundler errors that hide the real failure, and `peerDependencies` declared
in the project's own `package.json` that the build tool cannot satisfy. These are higher priority than
formatting nits.
