---
description: Start the session by having the orchestrator bootstrap the repo profile and load the session memory.
agent: orchestrator
---

New session. Before doing anything else, run your bootstrap cycle:

1. Check if `.opencode/PROJECT-PROFILE.md` exists in the current repo. If it does not exist, delegate to `profiler` before proceeding.
2. Read `.context/progress.md`, `.context/decisions.md`, and `.context/issues.md` if they exist.
3. Summarize in 3-4 lines, in Italian: the detected stack, the current status of the work (from `progress.md`), and the latest relevant issue/decision if present in `issues.md`/`decisions.md`.
4. Do not start any new work. Wait for my next instruction after the summary.

If none of the bootstrap files exist (repo has never been profiled before), state this explicitly and ask me if you want the `profiler` to run now.

The comprehension telemetry write (`.context/comprehension-log.md`) is NOT part of bootstrap. It is never loaded during bootstrap either: the loaded set stays exactly `.context/progress.md`, `.context/decisions.md`, `.context/issues.md` (the comprehension log is telemetry, not session memory). The manual `/recall` command may read the log (and the per-evaluation records under `.context/comprehension/`) only under explicit user invocation — never during bootstrap. Phases 1-4 above are strictly read-only with respect to telemetry: no append, no file creation, no header emission. Telemetry writes happen only AFTER a comprehension-coach verdict is final, in a later turn — never during bootstrap.

The research dataset (`.context/research-dataset.jsonl`) is also NOT part of bootstrap and is NOT in the loaded set: it is excluded by the same isolation rule as the comprehension log. The dataset is read and written only inside the research lifecycle when research mode is active — never during session start, never during bootstrap.
