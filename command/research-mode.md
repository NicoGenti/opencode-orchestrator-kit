---
description: Explicitly activate or deactivate research mode (opt-in A/B crossover + metrics recording).
agent: orchestrator
---

Research mode records an engineering metrics tuple — task type, duration, agent calls, token counts, normalised confidence fields, DCI scores, and the behavioral A/B slot label — to `.context/research-dataset.jsonl` for each completed task while the mode is active. It is OFF by default; it never activates accidentally.

## Activation and alternation

Subcommands:

/research-mode on
  Activates research mode for this session. Requires explicit user confirmation before enabling.
  Exact confirmation phrase: "Research mode changes session behavior. Confirm activation?"
  When confirmed, the session enters the research lifecycle: slot A is assigned to the first active task, slot B to the next, alternating A/B in activation order for each subsequent task. The slot is assigned when the task begins; no re-assignment after the fact.

/research-mode off
  Immediately stops all recording. No partial tuple is completed or written.
  The per-session slot state is reset. Subsequent tasks produce no dataset entries until the next explicit activation.

Config path: `research.enabled: true` in `.opencode/comprehension.config.json` (user edit = explicit opt-in). Default when neither is set: OFF.

## A/B slots are behavioral, not labels

The slot label selects one of two materially different per-task workflows:

- **Slot A (control)** — run the normal per-task workflow WITHOUT the comprehension gate: no classification step, no comprehension questions, 0 coach calls, no DCI, no calibration question. Record `gate_type=n/a` in the tuple. The user is never asked comprehension questions in a control slot.
- **Slot B (treatment)** — run the task WITH the full comprehension gate: classify NONE/LIGHT/DEEP, run the gate per `agents/orchestrator.md` (coach questions, DCI, possible RETRY), up to the normal coaching budget. Record the resulting `gate_type` (NONE/LIGHT/DEEP); `NONE` still means 0 coach calls and no calibration question.

Both slots complete the same engineering task; only the comprehension layer differs. A control slot never emits a gate row — a treatment slot always runs the gate flow.

## Metric tuple contract (17 fields, all required unless noted)

One JSON object per line appended to `.context/research-dataset.jsonl` at task end — exactly one JSON object as one line; no header, no prose, append-only. The dataset is NEVER loaded by `/start-session` or by any bootstrap procedure; it is read/written only inside the research lifecycle.

```
date            ISO 8601 date of task completion
plan            plan identifier e.g. plan=0005; empty string "" when unplanned
slot            "A" or "B" — behavioral slot, alternating deterministically in activation order: first active task = A, next = B, then A, B, …
task_type       classification of the task (e.g. feature, bugfix, refactor, docs)
gate_type       comprehension gate applied for this slot's workflow: "A" slots record `n/a`; "B" slots record NONE/LIGHT/DEEP
duration_min    task duration in minutes (float)
agent_calls     number of subagent delegations for this task (integer)
input_tokens    estimated input tokens consumed (integer; tokens_source=estimated)
output_tokens   estimated output tokens produced (integer; tokens_source=estimated)
user_confidence developer self-rated confidence 1-5 (calibration question; slot B LIGHT/DEEP only; n/a in slot A and NONE-classified; was "confidence" pre-v0.6.1)
evaluator_confidence coach's confidence in its verdict 1-5 (only when the evaluation was useful; n/a otherwise)
dci_immediate   DCI score from immediate comprehension gate (n/a if none)
dci_delayed     DCI score from delayed comprehension gate or /recall (n/a if not applicable)
retries         number of comprehension-coach retries (integer)
skipped         whether comprehension was skipped (boolean)
bugfix_ref      "plan=<NNNN>" when a later bugfix plan explicitly references this plan; empty string "" otherwise
tokens_source   "estimated" (default) | "exact" — honesty field disclosing token count provenance
```

Slot alternation: A, B, A, B… in chronological order of task activation. The slot is assigned when the task begins and recorded in the tuple. No re-assignment after the fact.

Bugfix reference convention: when a bugfix plan is created and the defect traces back to a specific earlier plan, write `bugfix_ref: "plan=<earlierNNNN>"`; otherwise write `bugfix_ref: ""`.

**Privacy invariant** (verbatim):
> No source code and no personal answers are ever written to the dataset.

**What never enters the dataset**: source code excerpts, file diffs, symbol names, user answers, or any content that could identify a specific user response. Only the metric tuple fields listed above are written.

**When inactive — zero overhead when inactive**: no research lifecycle is entered, the dataset file is never read, never written, and no token cost is incurred.