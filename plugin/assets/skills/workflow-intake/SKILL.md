---
name: workflow-intake
description: >-
  Intake playbook loaded before routing: when to restate an ambiguous request
  and get explicit confirmation, the categorical NONE/LIGHT/DEEP complexity
  triage, workflow.mode (auto|full|lite) behavior, and the opt-in append-only
  TriageEventV1 telemetry sink. Load only when a request is ambiguous or a
  routing-mode decision is needed — clear requests route unchanged.
---

# Workflow Intake

Intake runs BEFORE `## Agent Routing` in `agents/orchestrator.md`. The prompt keeps a one-line pointer; this skill owns the restatement protocol, the triage criteria, the mode config and the telemetry tuple. `orchestrator-quick` never loads this skill: an ambiguous request is handed back to `orchestrator`.

## Restatement trigger

Restate the request as an explicit spec ONLY when at least one of these is missing:

- **goal** — the outcome the user wants;
- **scope** — what is in and out of bounds;
- **affected files** — the paths or modules the change touches;
- **constraints** — safety, compatibility, or acceptance conditions.

A request that supplies all four is clear: route it unchanged, with zero added round-trips and no restatement chatter.

## Restatement protocol

1. Restate the request in ONE short paragraph as an explicit spec — goal, scope, affected files, constraints, and acceptance criteria when known. Never add requirements the user did not state.
2. Show the restatement to the user and wait for explicit confirmation BEFORE any `subagent` call.
3. Never rewrite silently: no confirmation, no delegation. A correction is restated once and re-confirmed before routing.
4. The restated spec itself is not persisted; `.context/progress.md` keeps task state only.

## Categorical complexity triage

Triage maps the four signals below onto the existing NONE/LIGHT/DEEP vocabulary. It is categorical — never a numeric score, never a weighted sum.

| Class | Condition (categorical) | Path |
| --- | --- | --- |
| **NONE** | `≤1 file` AND `no plan needed` AND `no security sensitivity` AND `no cross-module impact` | Quick path: tell the user to switch to `orchestrator-quick` (`/quick`); under `workflow.mode: lite` the orchestrator MAY run the slim single-delegation cycle instead, announced. |
| **LIGHT** | more than one file inside ONE module, `no plan needed`, `no security sensitivity`, `no cross-module impact` | Standard flow: one specialist per step; no plan card unless the user asks. |
| **DEEP** | any of `plan needed`, `security sensitivity`, `cross-module impact` | Full flow: plan card through `plan-writer`, review, comprehension gate. |

DEEP takes precedence over LIGHT and NONE; LIGHT is the remainder. At close, the existing comprehension classification still decides the gate — this triage selects the path and never replaces that classification.

## workflow.mode

Config: `.opencode/workflow.config.json` (seeded from `templates/workflow.config.json`), key `workflow.mode`. Precedence: file value > built-in default; an absent, empty or invalid file falls back to `auto` with one warning line.

| Mode | Behavior |
| --- | --- |
| `auto` (default) | The triage above decides. Clear requests route exactly as today, with zero added round-trips. |
| `full` | Always the standard flow (plan board, review, comprehension gate); triage is still computed and announced but never lowers the path. |
| `lite` | The slim path is permitted by an explicit decision, announced in one line — never silently. Security-sensitive or plan-requiring work still escalates to the full flow. |

## Triage telemetry — TriageEventV1 (opt-in, append-only)

Telemetry is OFF by default: `triageTelemetry.enabled` must be `true` in the same config file. While it is `false` the gate behaves identically and nothing is written — zero overhead.

When enabled, every completed triage appends EXACTLY ONE JSON object as one line to `.context/triage-dataset.jsonl`:

```
{"event":"triage","schema_version":1,"date":"YYYY-MM-DD","class":"NONE|LIGHT|DEEP","mode":"auto|full|lite","restatement":"none|restated-confirmed","signals":{"files":"one|many","plan":"no|yes","security":"no|yes","cross_module":"no|yes"}}
```

Field contract:

- `event` — fixed `"triage"`; `schema_version` — integer `1`, the TriageEventV1 contract version.
- `date` — ISO 8601 date of the triage.
- `class` — the triage class actually used; `mode` — the `workflow.mode` in force.
- `restatement` — `none` when the request was clear, `restated-confirmed` when it was restated and the user confirmed before routing. An unconfirmed request is never triaged, so no such row exists.
- `signals` — the four categorical inputs that produced the class.

**Privacy invariant** (verbatim):

> No source code and no personal answers are ever written to the dataset.

**What never enters the dataset**: restatement text, user answers, source excerpts, file diffs, file paths or symbol names. Only the categorical fields above are written; one row is a routing metric, not a transcript.

**Sink rules** — append-only and write-only:

- Append only: never overwrite, edit, delete, backfill or reorder rows; the first write creates the file.
- Never read at bootstrap: not by `/start-session`, not by any session-memory load, not by the orchestrator while triaging.
- The sink is allowed under `permission.write` and denied under `permission.edit` — append-only by permission, not merely by convention.
- Opt-in and reversible: setting `triageTelemetry.enabled` to `false` stops the writes immediately and changes nothing else about the gate.
