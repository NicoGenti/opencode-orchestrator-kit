---
name: workflow-intake
description: >-
  Intake playbook for ambiguous requests and workflow.mode decisions:
  restatement and explicit confirmation, the categorical NONE/LIGHT/DEEP
  triage (NONE = the existing small-task condition), workflow.mode
  (auto|full|lite) behavior, and the opt-in append-only TriageEventV1 sink.
  Load only when a request is ambiguous or a routing-mode decision is needed —
  a clear request under auto routes exactly as today, with no skill load.
---

# Workflow Intake

The orchestrator loads this skill ONLY when a request is ambiguous or a `workflow.mode` decision is needed — never for a clear request under `auto`, which routes exactly as today with no skill load and no announce line. `agents/orchestrator.md` keeps a one-line pointer; this skill owns the restatement protocol, the triage criteria, the mode config and the telemetry tuple. `orchestrator-quick` never loads it: an ambiguous request is handed back to `orchestrator`.

## Restatement trigger

Restate the request as an explicit spec ONLY when at least one of these is missing:

- **goal** — the outcome the user wants;
- **scope** — what is in and out of bounds;
- **affected files** — the paths or modules the change touches;
- **constraints** — safety, compatibility, or acceptance conditions.

**"Missing" means not stated AND not inferable** from the request, `.context/` session memory, `.opencode/PROJECT-PROFILE.md`, or the repository — an inferred value counts as supplied. Restate only for a material ambiguity that would change routing; anything else routes unchanged.

## Restatement protocol

1. Restate the request in ONE short paragraph as an explicit spec — goal, scope, affected files, constraints, and acceptance criteria when known. Never add requirements the user did not state.
2. Show the restatement to the user and wait for explicit confirmation BEFORE any `subagent` call.
3. Never rewrite silently: no confirmation, no delegation. A correction is restated once and re-confirmed before routing.
4. The restated spec itself is not persisted; `.context/progress.md` keeps task state only.

## Categorical complexity triage

Triage maps four categorical signals — at most one file (`≤1 file`), no plan needed, no security sensitivity, no cross-module impact — onto the existing NONE/LIGHT/DEEP vocabulary, with the DEEP band additionally reading the multi-phase/multi-session form of the plan signal. It is categorical — never a numeric score, never a weighted sum. `NONE` is exactly the small-task condition the routers already applied (`≤1 file` **or** `no plan needed`), stated verbatim in `agents/orchestrator.md` so the two homes cannot drift:

| Class | Condition (categorical) | Path |
| --- | --- | --- |
| **NONE** | the request touches at most one file **or** needs no plan | Quick path: tell the user to switch to `orchestrator-quick` (`/quick`) — its own hand-back rules return security or plan work to `orchestrator`; under `workflow.mode: lite` the orchestrator MAY run the slim single-delegation cycle instead, announced. |
| **DEEP** | not NONE, and any of `security sensitivity`, `cross-module impact`, `multi-phase/multi-session scope` (a plan card is warranted) | Standard flow WITH a plan card: `planner` authors the body, `plan-writer` owns the board, then review and comprehension gate. |
| **LIGHT** | not NONE and not DEEP — bounded multi-file, single-concern, single-module work beyond the shortcut, with no security sensitivity and no cross-module impact | Standard flow with direct delegation(s) under a 9-section spec, WITHOUT a plan card. |

The NONE test runs first: it is today's shortcut, preserved verbatim, so a one-file security request still goes to `orchestrator-quick` and comes back to `orchestrator` — no special case. After NONE, DEEP takes precedence over LIGHT, and every request lands in exactly one class: NONE is the shortcut, DEEP is the plan-card band, LIGHT is the bounded band between them. At close, the existing comprehension classification still decides the gate — this triage selects the path and never replaces that classification.

## workflow.mode

Config: `.opencode/workflow.config.json`, copied from `templates/workflow.config.json` (no installer seeding step), key `workflow.mode`. Precedence: file value > built-in default. An absent file means the documented default (`auto`, telemetry off) and NO warning; a present-but-empty or invalid file falls back to that same default with exactly ONE warning line and never a hard failure.

| Mode | Behavior |
| --- | --- |
| `auto` (default) | The triage above decides for ambiguous requests and mode decisions. For a clear request under `auto` this table is never consulted: routing is exactly today's, with no skill load (see header). |
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
- The write surface allow-lists the sink and defines no edit rule for it. In the V1 frontmatter that is one `permission.write` entry, mirroring `.context/research-dataset.jsonl` exactly; under the V2 plugin `write` folds into the `edit` action (`plugin/src/permissions.ts`), so append-only is enforced by the hard-boundary rule above, not by the permission layer.
- Opt-in and reversible: setting `triageTelemetry.enabled` to `false` stops the writes immediately and changes nothing else about the gate.
