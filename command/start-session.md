---
description: Start the session by having the orchestrator bootstrap the repo profile and load the session memory.
agent: orchestrator
---

New session. Before doing anything else, run your bootstrap cycle:

0. **Bootstrap check**: verify `.opencode/PROJECT-PROFILE.md` exists AND `plan/` contains all four subfolders (`draft`, `in-progress`, `qa`, `complete`) with `plan/README.md`. If either is missing, delegate to `profiler` before any other routing. Skip only when both conditions are already satisfied.
0.5. **Session memory load**: read `.context/progress.md`, `.context/decisions.md`, `.context/issues.md`, and `.opencode/PROJECT-PROFILE.md` (if they exist) before planning any routing. If `PROJECT-PROFILE.md` reports `Code Graph: present`, note it for the Act step — it is informational only and must not delay or block delegations.
1. **Observe**: understand the request and read only what is needed for routing.
2. **Orient**: classify the request and estimate scope.
3. **Decide**: choose one agent, a sequence, or parallel subtasks.
4. **Act**: run `todowrite`, then delegate via `task`. Do not start any new work until the user gives the next instruction.

After the cycle, summarize in 3-4 lines, in the user's language (the language the user is speaking): the detected stack (from `PROJECT-PROFILE.md`), the current status of the work (from `progress.md`), and the latest relevant decision/issue if present. Then wait for the next instruction.

The comprehension telemetry write (`.context/comprehension-log.md`) is NOT part of bootstrap. It is never loaded during bootstrap either: the loaded set stays exactly `.context/progress.md`, `.context/decisions.md`, `.context/issues.md` (the comprehension log is telemetry, not session memory). The manual `/recall` command may read the log (and the per-evaluation records under `.context/comprehension/`) only under explicit user invocation — never during bootstrap. Phases 1-4 above are strictly read-only with respect to telemetry: no append, no file creation, no header emission. Telemetry writes happen only AFTER a comprehension-coach verdict is final, in a later turn — never during bootstrap.

The research dataset (`.context/research-dataset.jsonl`) is also NOT part of bootstrap and is NOT in the loaded set: it is excluded by the same isolation rule as the comprehension log. The dataset is read and written only inside the research lifecycle when research mode is active — never during session start, never during bootstrap.
