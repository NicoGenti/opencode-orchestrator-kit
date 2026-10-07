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

- **Slot A (control)** — run the normal per-task workflow WITHOUT the comprehension gate: no classification step, no comprehension questions, 0 coach calls, no DCI, no calibration question. Record `gate_type="n/a"` (slot A never enters the gate layer).
- **Slot B (treatment)** — run the task WITH the full comprehension gate: classify NONE/LIGHT/DEEP, run the gate per `agents/orchestrator.md` (coach questions, DCI, possible RETRY). Record the resulting `gate_type` (NONE/LIGHT/DEEP); `NONE` still means 0 coach calls and no calibration question.

Both slots complete the same engineering task; only the comprehension layer differs. Slot order: the first active task after activation enters slot A, the next slot B, then A again — alternating strictly in activation order, never per-task re-drawn. A control slot never emits a gate row; a treatment slot always runs the gate flow.

## Metric tuple contract — `ResearchTupleV1` (17 fields, all required unless noted)

One JSON object per task, appended as exactly one line to `.context/research-dataset.jsonl` at task end — exactly one JSON object as one line; no header, no prose, append-only. The dataset is NEVER loaded by `/start-session` or by any bootstrap procedure; it is read/written only inside the research lifecycle.

```
date            string — ISO 8601 date (YYYY-MM-DD) of task completion
plan            string — bare plan id ("0007"); empty string "" when unplanned
slot            enum "A" | "B" — behavioral slot assigned when the task begins, alternating deterministically in activation order: first active task = A, next = B, then A, B, …; no re-assignment after the fact
task_type       enum: bugfix | feature | test | docs | refactor | other
gate_type       enum: n/a | NONE | LIGHT | DEEP — comprehension gate applied for this slot's workflow; slot "A" records "n/a"
duration_min    float — task duration in minutes
agent_calls     integer — number of subagent delegations for this task
input_tokens    integer — input tokens consumed; provenance disclosed by tokens_source
output_tokens   integer — output tokens produced; provenance disclosed by tokens_source
user_confidence developer self-rated confidence 1-5 or "n/a" — calibration question; slot B LIGHT/DEEP only; "n/a" in slot A and NONE-classified
evaluator_confidence coach's confidence in its verdict 1-5 or "n/a" — only when the evaluation was useful
dci_immediate   string "DCI=<score>/<available_score>" from the immediate comprehension gate reading ("n/a" if none); even 2-8 denominators. DCI0 baseline: the task's user_confidence is recorded ONCE, anchored to this immediate reading
dci_delayed     string "DCI=<score>/<available_score>" or "n/a" — delayed gate reading ("n/a" at write time; backfilled by /recall — the ONLY sanctioned dataset edit, between tasks, on explicit user invocation)
retries         integer — number of comprehension-coach retries
skipped         boolean — whether comprehension was skipped
bugfix_ref      string — "plan=<NNNN>" when a later bugfix plan explicitly references this plan; empty string "" otherwise
tokens_source   enum "estimated" (default) | "exact" — honesty field disclosing token count provenance
```

Slot alternation: A, B, A, B… in chronological order of task activation. The slot is assigned when the task begins and recorded in the tuple. No re-assignment after the fact.

Bugfix reference convention: when a bugfix plan is created and the defect traces back to a specific earlier plan, write `bugfix_ref: "plan=<earlierNNNN>"`; otherwise write `bugfix_ref: ""`.

**Privacy invariant** (verbatim):
> No source code and no personal answers are ever written to the dataset.

**What never enters the dataset**: source code excerpts, file diffs, symbol names, user answers, or any content that could identify a specific user response. Only the metric tuple fields listed above are written.

**When inactive — zero overhead**: no research lifecycle is entered, the dataset file is never read, never written, and no token cost is incurred.

**Hard boundary** (v0.6.3): while this mode is active, the dataset is the ONLY sink for research metrics; each task appends exactly one tuple line at task end — no intermediate or diagnostic rows, no other file receives research metrics. Besides that append, the single sanctioned edit is the `dci_delayed` backfill on the matching row (via `/recall`, only between tasks, never inside a task lifecycle); no deletes, no history rewrites, and the dataset is read only inside this lifecycle (never during bootstrap).

## Behavioral A/B flow (normative example)

A minimal behavioral reference: how slot alternation, the comprehension gate, the coach
block, telemetry and the research tuple interlock. Two tasks run back-to-back in activation
order: task 1 is an unplanned hotfix on slot A (control); task 2 is the plan-scoped LIGHT
task — add a missing `user_conf` field to a telemetry writer test. The
backtick-free markers `SIM-U` and `SIM-C` mark the recorded user turn; `SIM-C` lines mark the coach verdict block.

```
 orchestrator → classify(mode=LIGHT, tier=TIER_FAST)          [slot A: gate suppressed]
 SIM-U: "procedi"
 → implement, self-verify (npx -y bun test), close the task    [no coach call, no questions]
 → at task end append ONE ResearchTupleV1 line to .context/research-dataset.jsonl:
 {"date":"2026-10-07","plan":"","slot":"A","task_type":"bugfix","gate_type":"n/a","duration_min":12,"agent_calls":0,"input_tokens":14300,"output_tokens":2100,"user_confidence":"n/a","evaluator_confidence":"n/a","dci_immediate":"n/a","dci_delayed":"n/a","retries":0,"skipped":true,"bugfix_ref":"","tokens_source":"estimated"}
```

```
 orchestrator → classify(mode=LIGHT, tier=TIER_FAST)   [slot B: gate active, gate_type=LIGHT]
 SIM-U: "user_conf=2 — the failing assertion is allowed.length === hits.length"
 → calibration + 2 questions (max 2 in LIGHT) before any code or explanation
 SIM-C: RETRY
   Comprehension: RETRY
   evaluator_confidence: 2
   DCI: 2/4
 → one focused hint, user retries. SIM-C: PASS (second check):
   Comprehension: PASS
   evaluator_confidence: 4
   DCI: 4/4
 → implement, self-verify, close the task. A wrong answer at the second check would instead
   yield Comprehension: FAIL — a terminal outcome, never retried a second time. The delayed
   reading (DCI1) belongs to /recall: outside the task lifecycle, only between tasks, on
   explicit user invocation — it later backfills dci_delayed on the matching dataset row.
 → telemetry row: <ts> mode=LIGHT DCI=4/4 evaluator_conf=4 outcome=PASS user_conf=2
 → at task end append ONE ResearchTupleV1 line to .context/research-dataset.jsonl:
 {"date":"2026-10-07","plan":"0007","slot":"B","task_type":"test","gate_type":"LIGHT","duration_min":21,"agent_calls":0,"input_tokens":18900,"output_tokens":3400,"user_confidence":2,"evaluator_confidence":4,"dci_immediate":"DCI=4/4","dci_delayed":"n/a","retries":1,"skipped":false,"bugfix_ref":"plan=0006","tokens_source":"exact"}
```

What the flow pins (and tests assert): slots alternate A→B in activation order; one
ResearchTupleV1 line per task; canonical key order per the contract; slot A emits
`gate_type="n/a"`, no coach calls, `skipped=true`, `tokens_source="estimated"`;
slot B runs the LIGHT gate, emits the atomic coach block (RETRY DCI 2/4 → PASS DCI 4/4),
records `user_confidence=2` (the calibration answer, anchored to the DCI0 baseline) while
`evaluator_confidence` distinguishes retry (2) from pass (4); `dci_delayed` stays `n/a` at
write time and is backfilled only by `/recall`. Tests assert these properties on the parsed
JSON tuples (not on prose tokens).
