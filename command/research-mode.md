---
description: Explicitly activate or deactivate research mode (opt-in A/B crossover + metrics recording).
agent: orchestrator
---

Research mode records an engineering metrics tuple — task type, duration, agent calls, token counts, confidence, DCI scores, and slot label (A or B) — to `.context/research-dataset.jsonl` for each completed task while the mode is active. It is OFF by default; it never activates accidentally.

Subcommands:

/research-mode on
  Activates research mode for this session. Requires explicit user confirmation before enabling.
  Exact confirmation phrase: "Research mode changes session behavior. Confirm activation?"
  When confirmed, the session enters the research lifecycle: slot A is assigned to the first task, slot B to the next, alternating A/B in activation order for each subsequent task.
  No partial tuples are written — if OFF is issued mid-task, the in-progress task tuple is discarded.

/research-mode off
  Immediately stops all recording. No partial tuple is completed or written.
  The per-session slot state is reset. Subsequent tasks produce no dataset entries until the next explicit activation.

Privacy invariant: No source code and no personal answers are ever written to the dataset.
