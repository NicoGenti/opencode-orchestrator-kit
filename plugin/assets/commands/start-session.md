---
description: Start the session by having the orchestrator bootstrap the repo profile and load the session memory.
agent: orchestrator
---

New session. Before doing anything else, run your bootstrap cycle:

0. **Bootstrap check**: verify `.opencode/PROJECT-PROFILE.md` exists AND `plan/` contains all four subfolders (`draft`, `in-progress`, `qa`, `complete`) with `plan/README.md`. If either is missing, delegate to `profiler` before any other routing. Skip only when both conditions are already satisfied.
0b. **Design rules check**: verify a design-rules artifact exists — `.context/DESIGN-RULES.md`, root `ARCHITECTURE.md`, or root `DESIGN-RULES.md`. If none exists and the repo is empty/new, the `profiler` intake seeds `.context/DESIGN-RULES.md` from the user's goal answers. If an artifact exists, treat it as a binding input for `oracle` and `planner` routing.
0.5. **Session memory load**: read `.context/progress.md`, `.context/decisions.md`, `.context/issues.md`, and `.opencode/PROJECT-PROFILE.md` (if they exist) before planning any routing. If `PROJECT-PROFILE.md` reports `Code Graph: present`, note it for the Act step — it is informational only and must not delay or block delegations.
1. **Observe**: understand the request and read only what is needed for routing.
2. **Orient**: classify the request and estimate scope.
3. **Decide**: choose one agent, a sequence, or parallel subtasks.
4. **Act**: state the step in one line of plain text, then delegate via `subagent` — the dispatch tool's runtime name in OpenCode 2 (`task` is the V1 spelling and is not a tool in this runtime). `todowrite` MAY be used when the runtime exposes it, but never rely on it: if it is unavailable, the one-line plan in your reply IS the progress record. Do not start any new work until the user gives the next instruction.

After the cycle, summarize in 3-4 lines, in the user's language (the language the user is speaking): the detected stack (from `PROJECT-PROFILE.md`), the current status of the work (from `progress.md`), and the latest relevant decision/issue if present. Then wait for the next instruction.

The comprehension telemetry write (`.context/comprehension-log.md`) is NOT part of bootstrap. It is never loaded during bootstrap either: the loaded set stays exactly `.context/progress.md`, `.context/decisions.md`, `.context/issues.md` (the comprehension log is telemetry, not session memory). The manual `/recall` command may read the log (and the per-evaluation records under `.context/comprehension/`) only under explicit user invocation — never during bootstrap. Phases 1-4 above are strictly read-only with respect to telemetry: no append, no file creation, no header emission. Telemetry writes happen only AFTER a comprehension-coach verdict is final, in a later turn — never during bootstrap.

The research dataset (`.context/research-dataset.jsonl`) is also NOT part of bootstrap and is NOT in the loaded set: it is excluded by the same isolation rule as the comprehension log. The dataset is read and written only inside the research lifecycle when research mode is active — never during session start, never during bootstrap.

## Runtime tool names (OpenCode 2)

Tool names changed between V1 and V2. Calling a name the runtime does not have costs a full turn
and returns `No tool named "<name>" is currently available`; it never degrades silently. Names
observed in this runtime:

- dispatch a subagent: `subagent` — never `task`.
- run shell commands: `shell` — never `bash`. A `permission.bash` / `tools.bash` entry may still
  gate `shell`, but the TOOL to call is `shell`.
- read / search / list: `read`, `grep`, `glob`.
- change a file: `edit` — there is NO `write` tool in 2.0.x (`patch` is the other accepted name).
  `execute` runs code without a shell.
- ask the user: `question` — primary session only. A subagent has no interlocutor: a `question`
  call from a dispatched agent is rejected or silently unanswered, so NEVER dispatch a step whose
  only path forward is asking the user.
- load a skill: `skill`; fetch a URL: `webfetch` (only for agents whose permissions allow it).

Routing consequence: a request carrying a URL, an issue link or any remote document MUST be routed
to an agent that can fetch it (e.g. `librarian`) — never reformulated as a local search. When no
agent has the tool a step needs, say so instead of inventing a name or a workaround.
