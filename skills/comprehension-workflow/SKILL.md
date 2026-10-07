---
name: comprehension-workflow
description: >-
  Operational playbook for the comprehension gate lifecycle: configuration
  defaults and precedence, context slicing (Slicer), telemetry writer row
  format, per-plan retention records, and the manual /recall flow. Load ONLY
  when running the gate (LIGHT/DEEP) or /recall — classification itself lives
  in agents/orchestrator.md.
---

# Comprehension Workflow

Detailed operational protocol for the comprehension gate. The orchestrator
loads this skill when it must run a LIGHT or DEEP evaluation, write gate
telemetry, maintain a per-plan record, or execute `/recall`. Classification
(NONE/LIGHT/DEEP), the closing rule, and escalation routing stay in
`agents/orchestrator.md`.

## Configuration and precedence

The comprehension gate reads its limits from a user-local config file: `.opencode/comprehension.config.json` (user copies it manually from `templates/comprehension.config.json`; `install.sh` does not install `templates/`).

**Precedence**: file value > built-in defaults. If the file is absent, empty, or not valid JSON → all limits fall back to the built-in defaults listed below, and the user receives ONE warning line in the progress notes (never a hard failure).

**Invalid values** (e.g. negative `questions`, missing required keys) are detected by the orchestrator's validator and treated as invalid → the offending entry falls back to its default, with a one-line warning logged.

**Default limits**:

| Key | Default |
| --- | --- |
| `enabled` | `true` |
| `mode` | `adaptive` |
| `light.questions` | `2` |
| `light.modelTier` | `TIER_FAST` |
| `deep.questions` | `4` |
| `deep.modelTier` | `TIER_FAST` |
| `deep.escalationTier` | `TIER_REVIEW` |
| `context.maxDiffLines` | `300` |
| `context.unifiedContextLines` | `3` |
| `context.maxRelatedSymbols` | `3` |
| `evaluation.maxRetries` | `1` |
| `evaluation.escalateOnAmbiguity` | `true` |

The orchestrator reads these limits when composing delegations to `comprehension-coach`.  
`enabled: false` skips the gate entirely — orchestrator proceeds straight to close and records `comprehension=DISABLED` in the progress notes.

Tier resolution stays on the existing `TIER_FAST` / `TIER_REVIEW` mapping via the preset resolver.

## Context slicing (Slicer)

**Trigger** — the Slicer activates ONLY when the estimated change size exceeds `context.maxDiffLines` (default 300) or when the number of changed files requires a bounded slice. Tasks classified NONE receive 0 coach calls (no slice needed). Small changes follow the unchanged v0.3.0 path (specialist change report + coach reads the listed files only).

**Execution** — the orchestrator delegates to `explorer` (read-only, `TIER_FAST`, already chartered for symbol tracing). The coach NEVER receives bash access to `git diff` and its read scope is never widened.

**Pipeline** — `git diff` → changed symbols → small surrounding context (`unifiedContextLines: 3`, `maxRelatedSymbols: 3`) → hotspot behavioral extract ≤ `maxDiffLines` focused lines → slice delivered to `comprehension-coach`. The full diff or whole files are NEVER sent.

**Asymmetric context** — CHALLENGE may see up to the slice; EVALUATE re-reads only the symbols referenced by its own questions — a whole-file re-read in EVALUATE is forbidden (full rule in `agents/comprehension-coach.md`).

## Telemetry writer

The orchestrator acts as a **local telemetry writer** for the comprehension gate. This is NOT a new subagent, NOT a new tier, and does not touch `models.config.json` — it is purely an append-only side-effect of orchestrator's own verdict handling.

After **every** `comprehension-coach` evaluation reaches a final verdict — `PASS`, resolved `RETRY` (second attempt that PASSes), `FAIL`, or `SKIPPED` — the orchestrator MUST append EXACTLY ONE line to `.context/comprehension-log.md`. The file is append-only: never overwrite, never rewrite, never delete individual rows.

Line format (single space-separated fields, no user-answer content):

```
`<ISO 8601 timestamp> mode=<LIGHT|DEEP> DCI=<score>/<available_score>|skipped evaluator_conf=<1-5>|n/a outcome=<PASS|FAIL|RETRY|SKIPPED> user_conf=<1-5>|n/a`
```

**Hard boundary (v0.6.3)**: `.context/comprehension-log.md` and `.context/research-dataset.jsonl` are append-only telemetry artifacts — the orchestrator appends rows and performs only two sanctioned bounded edits, and may read them ONLY under explicit user invocation (`/recall` for the log; the research lifecycle for the dataset). Sanctioned dataset edit: backfill `dci_delayed` on the matching row (via `/recall`, between tasks, never inside a task lifecycle). Sanctioned log edit: normalise a malformed row to the canonical format. No other edits, no deletes, no history rewrites, no writes from other steps. Neither is ever read during bootstrap.

**Normalised confidence contract (v0.6.1)** — exactly two integer 1-5 confidence values exist in the whole workflow, never overloaded:

- `user_confidence` — the developer's self-assessment (the calibration question). Asked only in slot-B LIGHT/DEEP evaluations (never in research Slot-A control tasks, never in NONE-classified sessions); recorded in per-plan records, /recall rows and telemetry rows (`user_conf=`), never rated by the coach.
- `evaluator_confidence` — the coach's self-rated confidence in its own verdict (integer 1-5). In telemetry rows it appears as `evaluator_conf=`; `n/a` only when no score was produced.

A live telemetry row therefore never contains the bare `conf=` field — that name is retired (it previously designated three different things).

- `DCI=skipped` and `evaluator_conf=n/a` are emitted verbatim strings (used for `SKIPPED` and any other case where the score is not computed).
- `<score>/<available_score>` carries the DCI rubric score (e.g. `DCI=6/8`).
- `outcome` is the orchestrator's final disposition for this evaluation cycle.

**Denominator rule**: `available_score = 2 × the number of dimensions actually evaluated` — every dimension scores 0-2, so valid denominators are the even values 2-8. Odd or out-of-range denominators are contract violations; never emit or propagate them.

Privacy by design: the log MUST NOT include any user answer text, question text, reasoning excerpts, file diffs, file paths, or symbol names. The line is a metric row, not a transcript.

First-write bootstrap: on the FIRST write of a session, if `.context/comprehension-log.md` does not yet exist, create it with EXACTLY one header comment line and then append the evaluation row on the next line:

```
# comprehension telemetry (one line per evaluation; no user answers)
```

The header line is written exactly once per session (i.e. once per file). Subsequent appends in the same session never re-emit the header.

NONE-classified sessions: the orchestrator MUST NOT write to `.context/comprehension-log.md` at all and MUST NOT create the file. The gate short-circuits with zero coach calls and zero telemetry rows.

SKIPPED outcome: emit a single row with `DCI=skipped` and `evaluator_conf=n/a`, regardless of the original classification bucket.

The write happens AFTER the verdict is final — never during bootstrap, never during the CHALLENGE/EVALUATE dialogue, never as a side-effect of reading existing rows. The orchestrator MUST treat `.context/comprehension-log.md` as a strictly append-only artifact from the moment the first verdict lands onward.

## Retention records

For LIGHT/DEEP evaluations on task plan-scoped work, the orchestrator MUST write/update a per-plan comprehension record at `.context/comprehension/<plan-id>.md` alongside the telemetry row. This is a local comprehension artifact, NOT a new subagent or tier.

Per-plan record format (each field on its own line, no user answer text, no prose):

```
plan: <plan-id>
questions:
- ? <question-1 verbatim>
- ? <question-N verbatim>
user_conf: <1-5>|n/a
dci: <score>/<available_score>
outcome: <PASS|FAIL|RETRY|SKIPPED>
date: <YYYY-MM-DD>
src: stored
```

- Questions are stored verbatim from the CHALLENGE step, one per line with `- ?` prefix. NO user answers, NO prose.
- `user_conf` is the developer's `user_confidence` (calibration question, 1-5); `n/a` when the question was not asked.
- **DCI₀ baseline (v0.6.2)**: when the task belongs to an active research session, the same `user_conf` value is attached to the DCI₀ (immediate) reading — recorded in the research tuple alongside `dci_immediate` as the calibration baseline; the per-plan record is the canonical store.
- The calibration gap compares `user_conf` against the normalised DCI: `gap = user_conf − round(5 × dci_score / dci_available)`.
- Unplanned tasks → no record. NONE classification → no record, no file.
- `src=stored` means the record was written from the CHALLENGE dialogue; `src=reconstructed` is used only during /recall reconstruction (see below).
- Records are write-once per plan (update only the `outcome`, `dci` and `user_conf` fields if the same plan is re-evaluated).

## Escalation routing (TIER_REVIEW)

Escalation is part of the evaluation retry budget: exactly ONE escalation per task evaluation, and ONLY when one of these three conditions holds: (a) the evaluation result is ambiguous, (b) the reasoning involves security-critical code paths, or (c) the architectural decision cannot be confidently judged. It never fires on PASS and is never chained.

The escalation tier follows the tier, not the fixed name: `deep.escalationTier` (default `TIER_REVIEW`) resolves through the model preset resolver to the current review-tier roster entry, and delegation targets whatever agent currently binds that tier. With `escalateOnAmbiguity: false`, an ambiguous evaluation result is an immediate `FAIL` — never a guessed PASS.

The escalation delegation re-evaluates ONLY the ambiguous Q→symbol pairs (same read-only whitelist as the coach). After the escalation returns, the orchestrator records the verdict — no second evaluation pass, no second retry: the verdict is FINAL and the telemetry row is written once, AFTER the verdict is final.

An escalation consumes the single retry budget: after it, the result is terminal (`PASS` / `FAIL`), with no further follow-up questions.

## Manual /recall

The `/recall` command re-activates a past comprehension session for a plan. It is a strict read-only diagnostic and comprehension re-verification flow — never a replay of work, never an implicit re-delegation.

**Invariant**: retrieval strictly precedes explanation: ALL questions are shown BEFORE any code or explanation is displayed.

**Pre-condition**: `.context/comprehension-log.md` is read ONLY during explicit `/recall` invocation — never at session start, never during bootstrap.

**Retrieval phases** (v0.6.1 normalisation):
- BEFORE the user answers: the agent may consult ONLY the selected plan document and the per-plan record's saved questions (plan + questions, nothing else).
- AFTER the user answers: code inspection may read exclusively diff/file/symbol matter pertinent to the selected plan, respecting the caps `maxDiffLines=300` and `maxRelatedSymbols=3`. NEVER a whole-repo scan; NEVER a whole-file read when a bounded slice suffices.

**Flow (9 steps)**:

1. **List candidates**: scan `plan/complete/*.md` and existing `.context/comprehension/*.md` records; present to user as a numbered list (plan-id + last outcome + date).
2. **User selects** the plan to recall (number or plan-id).
3. **Load questions**: read the per-plan record at `.context/comprehension/<plan-id>.md` if it exists (`src=stored`); otherwise reconstruct from the plan's Goal/Scope section in `plan/complete/<plan-id>.md` (`src=reconstructed`), inferring questions that map to the plan's stated acceptance criteria.
4. **Show ALL questions** (with `- ?` prefix), one per line. No code, no diffs, no explanations yet.
5. **User answers from memory** (no tooling, no file access during this step).
6. **Code inspection** (v0.3.1 token-aware comprehension): if needed, show the relevant diff with `maxDiffLines=300` and correlated symbols capped at `maxRelatedSymbols=3` — diff lines ONLY, NEVER full files, NEVER repo-wide scans.
7. **Evaluation** delegated to `comprehension-coach` using the v0.4.0 DCI rubric with the identical whitelist input (goal, changed file list, focused diff, minimal surrounding symbols). The coach's rubric score is the DCI verdict.
8. **Retry/skip** (v0.3.0 verbatim): maximum 1 retry; `skip comprehension` is always available; no reveal of expected answers during retry.
9. **Outcome**: append dci1-format row to `.context/comprehension-log.md` AND note in `.context/progress.md`; update the per-plan record's `outcome`, `dci` and `user_conf` fields. Format:

```
<date> | plan=<NNNN> | type=dci1 | src=stored|reconstructed | retry=<0|1> | user_conf=<1-5> | evaluator_conf=<1-5> | DCI=<score>/<available_score> | outcome=PASS|FAIL|RETRY|SKIPPED
```

- `outcome=SKIPPED` row format: `user_conf=n/a | evaluator_conf=n/a | DCI=skipped | outcome=SKIPPED` (no numeric confidence fields).
- Same header-once rule as the telemetry writer; same append-only discipline.
- The log file `.context/comprehension-log.md` is the single sink for all dci1 rows.

**Whitelist of sources**: ONLY the plan document in `plan/complete/` and the per-plan record in `.context/comprehension/` may be consulted during /recall. NO repo-wide scans, NO scanning of other plans, NO ad-hoc file reads beyond the selected plan's document.

**Isolation**: Manual invocation only. Nothing in this profile may trigger `/recall` automatically. `.context/comprehension-log.md` is read exclusively during `/recall` invocation, never at session start, never during bootstrap.