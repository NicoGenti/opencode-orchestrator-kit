---
name: npm-debug
description: >-
  Diagnose npm/Node toolchain failures: install, peer-dependency, lockfile, cache, and script runtime issues.
  Load ONLY when an npm/Node toolchain failure is observed in a local dev folder. Provides a bounded,
  non-destructive triage playbook; never auto-runs `rm -rf node_modules` or cache wipes without explicit
  confirmation.
---

# npm / Node Toolchain Debugging

A bounded playbook for diagnosing npm/Node toolchain failures. This skill is opt-in for `npm-helper` and
SHOULD be loaded only after the orchestrator has classified the failure as npm/Node-related (see
`agents/orchestrator.md` "Routing Disambiguation: deploy-helper vs build-helper vs npm-helper vs pc-doctor").

## Scope

In scope:

- `npm install`, `npm ci`, `npm update`, and `npx` failures.
- `package.json` / `package-lock.json` peer-dependency and version-resolution conflicts.
- Node version mismatches (`engines`, `.nvmrc`, `nvm`, Volta, Corepack).
- npm cache integrity errors and registry connectivity issues.
- Script-time runtime errors caused by missing binaries (`node_modules/.bin`) or wrong `PATH`.

Out of scope — delegate to another helper:

- TypeScript / Vite / webpack build errors → `build-helper` (`skills/build-debug`).
- CI/CD or deploy-platform failures → `deploy-helper` (`skills/github-actions-cicd`).
- Windows-local PATH, registry, or service issues → `pc-doctor`.

## Triage Order (Read Before Acting)

1. **Capture the exact failing command and its full stderr.** Do not paraphrase; quote it verbatim in the
   report.
2. **Note the working directory.** `npm` resolves relative to the current shell, not the repo root, so
   "ran in the wrong folder" is a common false lead.
3. **Confirm Node + npm versions:** `node -v`, `npm -v`, and compare to `engines.node` in `package.json`
   and to `.nvmrc` if present. A version mismatch usually explains peer-dep errors and engine warnings.
4. **Inspect lockfile state:** `git status package.json package-lock.json`. If `package-lock.json` is
   modified locally or missing, prefer `npm ci` over `npm install` to reproduce CI exactly.
5. **Reproduce minimally:** run the same command with `--no-audit --no-fund` first to remove noise. Only
   escalate to `--verbose` or `--loglevel silly` once the simple repro fails the same way.

## Common Failures and First-Line Fixes

### `EACCES` / permission errors on global installs

- Cause: previous `sudo npm install -g` left root-owned files behind, or a corporate policy denies global
  installs.
- First-line fix: switch to a Node version manager (`nvm`, Volta, Corepack) and install per-user. Do NOT
  recommend `chown -R` on `/usr` or similar system-wide permission changes.

### `EPEERINVALID` / peer-dependency conflicts

- Cause: a top-level dep requested a peer that another top-level dep does not satisfy.
- First-line fix: run `npm ls <package>` to see the resolved tree, then check whether the project pins a
  transitive via `overrides` / `resolutions`. If the conflict is purely advisory (npm 7+ reports but does
  not enforce), document it as a warning rather than blocking.
- Do NOT silence with `npm install --legacy-peer-deps` blindly — surface the conflict in the report and let
  the user decide.

### `ELIFECYCLE` / `errno 137` during scripts

- Cause: usually OOM-killed on a memory-constrained runner, or a script exited non-zero and left the
  process tree dirty.
- First-line fix: re-run with `NODE_OPTIONS=--max-old-space-size=4096` (raise cautiously) and inspect
  `npm-debug.log` for the underlying script error before assuming memory.

### `EINTEGRITY` / cache corruption

- Cause: corrupted tarballs in the npm cache (`~/.npm/_cacache`).
- First-line fix: `npm cache verify`. If `verify` reports corruption, the next step (`npm cache clean
  --force`) is destructive and MUST require explicit user confirmation — see "Destructive Steps" below.

### `ENOTFOUND` / `ETIMEDOUT` to the registry

- Cause: network or proxy misconfiguration, not a project bug.
- First-line fix: confirm `npm config get registry`, then check `HTTPS_PROXY` / `HTTP_PROXY` env vars and
  the project's `.npmrc`. Do NOT recommend swapping registries without user approval.

## Destructive Steps (Require Explicit Confirmation)

The following commands can lose work, time, or local dev state. The orchestrator MUST pause and request
explicit user confirmation before any of them are run, even when delegated to `npm-helper`:

- `npm cache clean --force` — drops the entire npm cache.
- `rm -rf node_modules` — destroys the local install; recoverable via reinstall but slow.
- `rm package-lock.json` (followed by `npm install`) — generates a new lockfile that may diverge from
  CI/team state.
- `nvm uninstall <version>` / `volta uninstall <version>` — removes a Node toolchain version.
- Any global install with `sudo` or to a system path.

When any of these is genuinely needed, present the exact command, the files/paths affected, and a one-line
rationale in the root session, and wait for an explicit "yes" before executing.

## Reporting Format

After triage, the `npm-helper` report SHOULD include:

- Failing command (verbatim) and working directory.
- Node and npm versions (`node -v`, `npm -v`).
- The first actionable root cause identified, with the file:line or config key that supports it.
- The minimum fix (exact command or `package.json` change) and whether it is destructive.
- A short "what I did NOT do and why" line for any candidate fix that was ruled out, so the user can
  revisit it later.

Keep the report compact; do not paste full `npm-debug.log` contents unless the failing line is itself
the evidence.

## When Reviewing or Debugging

Check for: stale lockfiles checked in alongside modified `package.json`, missing `engines.node` /
`.nvmrc`, `npm-shrinkwrap.json` vs `package-lock.json` drift, and `preinstall` / `postinstall` scripts
that hide side effects behind `npm install`. These are higher priority than version-pinning nits.
