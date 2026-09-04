---
name: dev-cleanup
description: >-
  Bounded checklist for cleaning local dev artifacts (build outputs, caches, temporary logs) in a single
  repository. NEVER auto-executes destructive commands — every cleanup action requires explicit, in-the-moment
  user confirmation. Use when a user explicitly asks for cleanup, or when the orchestrator determines stale
  dev artifacts are the source of a reproducible failure.
---

# Dev Cleanup (Confirmation-Gated)

A confirmation-gated checklist for cleaning local dev artifacts. This skill is **opt-in** and applies when
the user explicitly asks for cleanup, or when stale artifacts are the demonstrated source of a reproducible
failure. It is NOT a general maintenance routine and it MUST NOT be invoked for ordinary tasks.

## Safety Contract (Read First)

This skill is intentionally narrow because cleanup commands are some of the most common sources of
unintended data loss in agentic workflows. The orchestrator MUST follow these rules without exception:

1. **No automatic cleanup.** This skill MUST NOT execute any destructive command without an explicit,
   in-the-moment "yes" from the user in the root session, naming the exact paths and commands. A prior
   blanket "go ahead and clean up" is NOT sufficient when new paths or commands appear later.
2. **Default to read-only inspection first.** Before recommending any cleanup, list the candidate paths,
   their sizes, and why each is safe or unsafe to delete. The user decides.
3. **One action per confirmation.** Do not batch multiple destructive commands into a single yes/no.
   Each command gets its own confirmation listing the exact paths it touches.
4. **Stop on the first unexpected file.** If a target directory contains anything outside the documented
   list (untracked source, downloaded datasets, scratch notes), stop and ask before continuing.
5. **Never touch secret material.** Do not clean `.env`, `.env.*`, `secrets/`, `*.pem`, `*.key`,
   `credentials.json`, or anything matching `secret`/`credential` in its name, even if the user asks
   broadly to "clean everything".
6. **Trash, do not shred.** Where the platform supports it (`trash` on macOS, `gio trash` on Linux,
   Recycle Bin on Windows), prefer reversible deletion over `rm -rf`. If only `rm` is available, the
   user MUST be told it is irreversible before confirmation.

## When to Use

- The user explicitly asks for cleanup ("clean my build cache", "free up disk space", "reset the dev
  environment").
- A reproducible failure has been traced to a stale artifact (corrupted bundler cache, stale
  `node_modules`, leftover `.tsbuildinfo`) and the smallest fix is to remove that artifact.
- A repository's bootstrap doc (`README.md`, `CONTRIBUTING.md`) defines a documented cleanup ritual.

## When NOT to Use

- The user did not ask for cleanup and no failure has been traced to stale artifacts — do not pre-emptively
  clean "just in case".
- The repository contains only what the user is actively working on; cleanup adds no value.
- The fix is to update a config or upgrade a dependency, not to delete state.

## Default Inspection Commands (Read-Only)

Run these first, list the results, and let the user choose what to clean. Do not delete anything from
this list automatically.

- `du -sh node_modules dist build .next .cache .turbo .parcel-cache 2>/dev/null` (or the platform
  equivalent) — show what each candidate directory weighs.
- `git status --ignored` — surface every ignored path so the user sees untracked-but-ignored state
  before deciding.
- `git stash list` — flag any stashes; deleting anything that looks like a stale stash is destructive
  and needs its own confirmation.
- `ls -la node_modules/.cache 2>/dev/null` and similar for the bundler's transform cache.

## Categories of Cleanup (Each Independently Confirmable)

### A. Build outputs (recoverable by re-running the build)

- `dist/`, `build/`, `.next/`, `.nuxt/`, `.output/`, `out/`, `coverage/`, `storybook-static/`.
- Typically safe to delete and regenerate. Confirm before deleting.

### B. Tool caches (recoverable by re-running the install or build)

- `node_modules/.cache/`, `.cache/`, `.turbo/`, `.parcel-cache/`, `.tsbuildinfo`,
  `.eslintcache`, `.stylelintcache`, `.swc/`.
- Removing these forces a slower rebuild but does not lose user-authored content. Confirm before
  deleting.

### C. Dependency trees (slow to recover, may diverge from lockfile)

- `node_modules/`. Reinstalling via `npm ci` (not `npm install`) reproduces the lockfile exactly.
- Removing without an immediate reinstall leaves the project un-runnable. Confirm before deleting.

### D. Generated lockfiles and config (can diverge from team/CI state)

- `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `.npmrc`. Deleting one forces a regenerate that
  may produce a different resolution than teammates or CI use. Confirm before deleting and warn about
  the divergence risk.

### E. Source-tree content (almost never safe to auto-clean)

- Anything under `src/`, `app/`, `pages/`, `lib/`, `tests/`, `docs/`, `scripts/`.
- `.context/`, `plan/`, `.opencode/` (user-local memory and plan state).
- Untracked files outside ignored directories — surface them and ask case by case.

## Required Confirmation Template

When a cleanup is genuinely needed, present this template verbatim in the root session and wait for the
explicit "yes" before running any command:

```
Cleanup action requested:
- Category: <A | B | C | D | E>
- Paths: <exact paths, one per line>
- Command: <exact command, quoted>
- Reversible: <yes | no — if no, what is lost>
- Reason: <one sentence tying this to the failure or user request>
Proceed? (yes/no)
```

Do NOT execute if the user replies with anything other than an explicit "yes" to the exact command
shown. Re-ask if the path list changes between confirmation and execution.

## Reporting Format

After any cleanup action runs, the report SHOULD include:

- The exact command that ran and its exit status.
- Disk space recovered, if measurable (`du -sh` before and after).
- What was NOT cleaned and why, so the user can request it next time.
- Any unexpected files surfaced during inspection, even if untouched.

Keep the report compact; the user is approving per-command, so per-command confirmation receipts matter
more than a summary.

## When Reviewing or Debugging

If a "works on my machine" report appears, the first thing to check is whether the user has stale
artifacts the team repo does not have (stale `node_modules`, leftover `.next/`, local `.env`). Recommend
inspection (`git status --ignored`, `du -sh`) before any cleanup, and prefer the narrowest category above
that fixes the symptom.
