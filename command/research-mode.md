---
description: Explicitly activate or deactivate research mode (opt-in A/B crossover + event recording).
agent: orchestrator
---

Research mode records engineering-metrics events — task type, duration, agent calls, token counts, normalised confidence fields, DCI scores and the behavioral A/B slot label — to `.context/research-dataset.jsonl` for each completed task while the mode is active. It is OFF by default; it never activates accidentally.

## Activation and alternation

Subcommands:

/research-mode on
  Activates research mode for this session. Requires explicit user confirmation before enabling.
  Exact confirmation phrase: "Research mode changes session behavior. Confirm activation?"
  When confirmed, the session enters the research lifecycle: every task is assigned a `research_id` and a slot when it begins. Slot alternation is deterministic in activation order: first active task = A, next = B, then A, B, … No re-assignment after the fact.

/research-mode off
  Immediately stops all recording. No partial event is completed or written.
  The per-session slot state is reset. Subsequent tasks produce no dataset entries until the next explicit activation.

Config path: `research.enabled: true` in `.opencode/comprehension.config.json` (user edit = explicit opt-in). Default when neither is set: OFF.

## A/B slots are behavioral, not labels

The slot label selects one of two materially different per-task workflows:

- **Slot A (control)** — run the normal per-task workflow WITHOUT the comprehension gate: no classification step, no comprehension questions, 0 coach calls, no DCI, no calibration question. Record `gate_type="n/a"` (slot A never enters the gate layer). `skipped` stays **false** — a control slot is not a user skip; there is no comprehension to skip.
- **Slot B (treatment)** — run the task WITH the full comprehension gate: classify NONE/LIGHT/DEEP, run the gate per `agents/orchestrator.md` (coach questions, DCI, possible RETRY). Record the resulting `gate_type` (NONE/LIGHT/DEEP); `NONE` still means 0 coach calls and no calibration question. `skipped` is true only for a user-issued `skip comprehension` during an active LIGHT/DEEP gate.

Both slots complete the same engineering task; only the comprehension layer differs. `agent_calls` counts **every subagent delegation of the task** in both slots (explorer, developer-fixer, comprehension-coach evaluations, …) — it is never a gate-overhead counter and it is never 0 when subagents were used. Slot order: the first active task after activation enters slot A, the next slot B, then A again — alternating strictly in activation order, never per-task re-drawn. A control slot never emits a gate row; a treatment slot always runs the gate flow.

## Research event contract — DatasetEventV1 (`schema_version: 1`)

One line per event, appended to `.context/research-dataset.jsonl` — exactly one JSON object as one line; no header, no prose; no intermediate or diagnostic rows. The dataset is a **strictly append-only event log**: events are never modified, backfilled, deleted or rewritten, and history never mutates. The dataset is NEVER loaded by `/start-session` or by any bootstrap procedure; it is read/written only inside the research lifecycle.

`research_id` — `res-YYYYMMDD-HHMMSS-<32hex>` (v0.6.6: readable task-start timestamp +
128-bit random suffix) — is assigned when the task begins, together with the slot. It is
stable per task and it is the ONLY correlation key: every recall event of a task carries
the same `research_id`. Uniqueness across tasks is probabilistic at 128 bits (CSPRNG,
UUID-v4 class). `plan` is descriptive
metadata only: never an identifier, never a lookup key on its own.

**Task event — `ResearchTupleV1` (19 fields, canonical order, all required):**

```
event           "task"
schema_version  integer 1 — DatasetEventV1 contract version
research_id     string "res-YYYYMMDD-HHMMSS-<32hex>" — stable; the ONLY correlation key to any recall event
date            string — ISO 8601 date (YYYY-MM-DD) of task completion
plan            string — bare plan id ("0007"); empty string "" when unplanned; metadata, not an id
slot            enum "A" | "B" — assigned when the task begins; alternating deterministically in activation order
task_type       enum: bugfix | feature | test | docs | refactor | other
gate_type       enum: n/a | NONE | LIGHT | DEEP — comprehension gate applied for this slot's workflow; slot "A" records "n/a"
duration_min    float — task duration in minutes
agent_calls     integer — count of ALL subagent delegations of the task (coach evaluations included when present)
input_tokens    integer — input tokens consumed; provenance disclosed by tokens_source
output_tokens   integer — output tokens produced; provenance disclosed by tokens_source
user_confidence developer self-rated confidence 1-5 or "n/a" — calibration question; slot B LIGHT/DEEP only; "n/a" in slot A and NONE-classified
evaluator_confidence coach's confidence in its verdict 1-5 or "n/a" — only when the evaluation was useful
dci_immediate   string "DCI=<score>/<available_score>" from the immediate comprehension gate reading ("n/a" if none); even 2-8 denominators. DCI0 baseline: the task's user_confidence is recorded ONCE, anchored to this immediate reading
retries         integer — number of comprehension-coach retries (0 or 1)
skipped         boolean — true only for a user-issued comprehension skip (slot B, active LIGHT/DEEP gate); slot A always false (control ≠ skip)
bugfix_ref      string — "plan=<NNNN>" when a later bugfix plan explicitly references this plan; empty string "" otherwise
tokens_source   enum "estimated" (default) | "exact" — honesty field disclosing token count provenance
```

`dci_delayed` is NOT a task-event field. The delayed DCI₁ reading is a **recall event** (appended by `/recall`); the v0.6.3 single-row backfill edit is retired — no dataset edit of any kind remains sanctioned.

**Recall event (8 fields, canonical order, all required) — appended by `/recall`:**

```
event           "recall"
schema_version  integer 1 — DatasetEventV1 contract version
research_id     string — the SAME research_id as the correlated task event
date            string — ISO 8601 date of the recall
dci_delayed     string "DCI=<score>/<available_score>" (even 2-8 denominators) or "n/a"
evaluator_confidence coach's confidence in its verdict 1-5 or "n/a"
retries         integer 0 | 1
skipped         boolean — true when the recall comprehension was skipped
```

`/recall` appends the recall event only when the selected per-evaluation record carries the task's `research_id` (stored in the record at task end); if the id is not recorded (task predates research mode), nothing is written to the dataset.

Bugfix reference convention: when a bugfix plan is created and the defect traces back to a specific earlier plan, write `bugfix_ref: "plan=<earlierNNNN>"`; otherwise write `bugfix_ref: ""`.

**Privacy invariant** (verbatim):
> No source code and no personal answers are ever written to the dataset.

**What never enters the dataset**: source code excerpts, file diffs, symbol names, user answers, or any content that could identify a specific user response. Only the event fields listed above are written.

**When inactive — zero overhead**: no research lifecycle is entered, the dataset file is never read, never written, and no token cost is incurred.

**Hard boundary** (v0.6.4): while this mode is active, the dataset is the ONLY sink for research metrics; each task appends exactly one task-event line at task end — no intermediate or diagnostic rows, no other file receives research metrics. `/recall` (outside the task lifecycle, explicit user invocation only) adds one recall-event line per evaluation. No deletes, no edits, no backfill, no history mutation of any kind; the dataset is read only inside this lifecycle (never during bootstrap).

## Behavioral A/B flow (normative example)

A minimal behavioral reference: how slot alternation, research_id assignment, the comprehension
gate, the coach block and the dataset events interlock. Two tasks run back-to-back in activation
order (task index 0 → slot A, task index 1 → slot B): task 1 is an unplanned hotfix on slot A
(control); task 2 is the plan-scoped LIGHT task — add a missing `user_conf` field to a telemetry
writer test. The backtick-free markers `SIM-U` and `SIM-C` mark the recorded user turn; `SIM-C`
lines mark the coach verdict block.

```
 orchestrator → assign research_id=res-20261007-143000-3f9a7c2e1b08d54fa6e3c70b92d1846a + slot A   [control: no classification, no gate]
 → run the normal workflow — delegate explorer (bounded repo survey),
   delegate developer-fixer (implement + self-verify)             [task delegations: 2]
 → at task end append ONE task event to .context/research-dataset.jsonl:
 {"event":"task","schema_version":1,"research_id":"res-20261007-143000-3f9a7c2e1b08d54fa6e3c70b92d1846a","date":"2026-10-07","plan":"","slot":"A","task_type":"bugfix","gate_type":"n/a","duration_min":12,"agent_calls":2,"input_tokens":14300,"output_tokens":2100,"user_confidence":"n/a","evaluator_confidence":"n/a","dci_immediate":"n/a","retries":0,"skipped":false,"bugfix_ref":"","tokens_source":"estimated"}
```

```
 orchestrator → assign research_id=res-20261007-154500-9f3e2b7c5a41e8d02fb6c7314a95e620 + slot B; classify(mode=LIGHT, tier=TIER_FAST)   [slot B: gate active, gate_type=LIGHT]
 SIM-U: "user_conf=2 — the failing assertion is allowed.length === hits.length"
 → calibration + 2 questions (max 2 in LIGHT) before any code or explanation
 SIM-C: RETRY
   Comprehension: RETRY
   evaluator_confidence: 2
   DCI: 2/4
 → one focused hint, user retries. SIM-C: PASS (the single sanctioned escalation):
   Comprehension: PASS
   evaluator_confidence: 4
   DCI: 4/4
 → a wrong answer at the second check would instead yield Comprehension: FAIL — a terminal
   outcome, never retried a second time. The delayed reading (DCI1) belongs to /recall: outside
   the task lifecycle, only between tasks, on explicit user invocation.
 → task delegations: 4 — explorer, coach evaluation, coach re-check (the single escalation),
   developer-fixer; `agent_calls` counts every one of them
 → at task end append ONE task event to .context/research-dataset.jsonl (and store `research_id`
   in the per-evaluation record `.context/comprehension/<plan-id>/<research-id>.md` so a later /recall can correlate):
 {"event":"task","schema_version":1,"research_id":"res-20261007-154500-9f3e2b7c5a41e8d02fb6c7314a95e620","date":"2026-10-07","plan":"0007","slot":"B","task_type":"test","gate_type":"LIGHT","duration_min":21,"agent_calls":4,"input_tokens":19400,"output_tokens":3500,"user_confidence":2,"evaluator_confidence":4,"dci_immediate":"DCI=4/4","retries":1,"skipped":false,"bugfix_ref":"plan=0006","tokens_source":"exact"}
```

```
 /recall (plan 0007, days later) — after the dci1 evaluation, append ONE recall event:
 {"event":"recall","schema_version":1,"research_id":"res-20261007-154500-9f3e2b7c5a41e8d02fb6c7314a95e620","date":"2026-10-09","dci_delayed":"DCI=3/4","evaluator_confidence":3,"retries":0,"skipped":false}
 The task event above is untouched — same line, same values: the dataset is an append-only event
 log and no dataset edit is ever sanctioned (no backfill, no rewrite, no delete).
```

What the flow pins (and tests assert): slots alternate A→B by activation index (task 0 = A,
task 1 = B); each task emits exactly ONE task event, canonical key order per the contract;
`research_id` is unique per task, present on the task event AND the recall event (correlation);
its format is `res-YYYYMMDD-HHMMSS-<32hex>` (v0.6.6): the task-start timestamp plus a random
128-bit CSPRNG suffix, so tasks activated in the same second never collide; the id is generated
ONCE at task start and reused verbatim on the recall event and in the per-evaluation record
(`.context/comprehension/<plan-id>/<research-id>.md`) — never regenerated or mutated over the
task → recall lifecycle. `plan` is metadata (slot A carries ""). Slot A shows
NO classification at all (no
`classify(...)` line), emits `gate_type="n/a"`, 0 gate overhead, `skipped=false`, and
`agent_calls=2` — exactly the two delegations its flow shows. Slot B runs the LIGHT gate
(classify NONE/LIGHT/DEEP), emits the atomic coach block (RETRY DCI 2/4 → PASS DCI 4/4),
records `user_confidence=2` (the calibration answer, anchored to the DCI0 baseline) while
`evaluator_confidence` distinguishes retry (2) from pass (4), and reports `agent_calls=4` —
the four delegations its flow shows, coach evaluations included. `/recall` adds the recall
event as a NEW line sharing the task's `research_id`; `dci_delayed` never appears on a task
event. Tests assert these properties on the parsed JSON events (not on prose tokens).