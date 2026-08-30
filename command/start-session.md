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
