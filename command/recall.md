---
description: Re-activate a past comprehension session for a plan via a strict read-only diagnostic and comprehension re-verification flow.
agent: orchestrator
---

Comando `/recall`. Flusso di ri-attivazione di una sessione di comprensione passata per un plan. È un flow strettamente read-only di diagnostica e ri-verifica della comprensione — mai una replay del lavoro, mai una re-delegazione implicita.

**Invariant**: ALL questions are shown BEFORE any code or explanation is displayed.

**Pre-condition**: `.context/comprehension-log.md` is read ONLY during explicit `/recall` invocation — never at session start, never during bootstrap.

**Flow (9 steps)**:

1. **List candidates**: scan `plan/complete/*.md` and existing `.context/comprehension/**/*.md` records; present to user as a numbered list (plan-id + research_id + last outcome + date).
2. **User selects** the plan to recall (number or plan-id).
3. **Load questions**: read the per-evaluation record at `.context/comprehension/<plan-id>/<research-id>.md` if it exists (`src=stored`; the user's selection pins one specific `research_id`); otherwise reconstruct from the plan's Goal/Scope section in `plan/complete/<plan-id>.md` (`src=reconstructed`), inferring questions that map to the plan's stated acceptance criteria.
4. **Show ALL questions** (with `- ?` prefix), one per line. No code, no diffs, no explanations yet.
5. **User answers from memory** (no tooling, no file access during this step); from answer time on, reads go only through step 5's whitelist — nothing else.
6. **Code inspection** (v0.3.1 token-aware comprehension, v0.6.1 caps): if needed, show the relevant diff with `maxDiffLines=300` and correlated symbols capped at `maxRelatedSymbols=3` — diff lines ONLY, NEVER full files, NEVER repo-wide scans.
7. **Evaluation** delegated to `comprehension-coach` using the v0.4.0 DCI rubric with the identical whitelist input (goal, changed file list, focused diff, minimal surrounding symbols). The coach's rubric score is the DCI verdict.
8. **Retry/skip** (v0.3.0 verbatim): maximum 1 retry; `skip comprehension` is always available; no reveal of expected answers during retry.
9. **Outcome**: append dci1-format row to `.context/comprehension-log.md` AND full-overwrite `.context/progress.md` (snapshot of the CURRENT state — pointer removal on completion, never a per-task history line); update the selected record's `outcome`, `dci` and `user_conf` fields (v0.6.1+ normalisation). Format:

```
<date> | plan=<NNNN> | type=dci1 | src=stored|reconstructed | retry=<0|1> | user_conf=<1-5>|n/a | evaluator_conf=<1-5>|n/a | DCI=<score>/<available_score> | DCI=skipped | outcome=PASS|FAIL|RETRY|SKIPPED
```

- `outcome=SKIPPED` row format: `user_conf=n/a | evaluator_conf=n/a | DCI=skipped | outcome=SKIPPED` (no numeric confidence fields).
- v0.6.1: the two confidence fields are distinct normalised values — `user_conf` is the developer's calibration self-rating, `evaluator_conf` the coach's confidence in its verdict; the old overloaded single `conf=` field is retired.

- **Research dataset event (v0.6.6)**: after the dci1 evaluation, `/recall` APPENDS one recall
  event — a NEW line — to `.context/research-dataset.jsonl`, carrying the SAME `research_id`
  recorded by the task event (stored in the per-evaluation record at task end; the record
  supplies the id — the dataset itself is never edited or rewritten to find it). If the record
  carries no `research_id` (task predates research mode), nothing is written to the dataset.
  No modify, no backfill, no delete, no rewrite of existing rows — the dataset is a strictly
  append-only event log. Never inside a task lifecycle. The `research_id` format is
  `res-YYYYMMDD-HHMMSS-<32hex>` (v0.6.6: 128-bit random CSPRNG suffix): `/recall` reads it
  from the per-evaluation record and copies it verbatim — never regenerates, reformats, or
  truncates it.
- Same header-once rule as the telemetry writer; same append-only discipline.
- The log file `.context/comprehension-log.md` is the single sink for all dci1 rows.

**Metric caveat (Retention = DCI₁/DCI₀)**: "è una nostra metrica operativa, non una metrica scientificamente validata". Retention compares the delayed DCI₁ (via `/recall`) with the immediate DCI₀ recorded at gate time; it is an operational metric, not a validated scientific one. v0.5.0 only accumulates dci1 data.

**Budget (v0.6.1 normalisation)**: before the user answers, only the plan document and the selected record's saved questions are consulted. After the answer, reads are limited to the diff/file/symbol matter pertinent to the selected plan, respecting `maxDiffLines=300` and `maxRelatedSymbols=3` — never a whole-repo scan, never a whole-file read when a bounded slice suffices.

**Whitelist of sources**: ONLY the plan document in `plan/complete/`, the per-evaluation record in `.context/comprehension/<plan-id>/<research-id>.md`, and the bounded post-answer inspection — the relevant diff (`maxDiffLines=300`) and correlated symbols (`maxRelatedSymbols=3`) of the files listed in the evaluation record — may be consulted after the user has answered; step 9 appends the dci1 row and updates the selected record (`outcome`, `dci`, `user_conf`). The record is also the source of the recall event's correlation id: its `research_id` line (v0.6.6 format `res-YYYYMMDD-HHMMSS-<32hex>`) is copied verbatim — one specific evaluation = one specific research_id; the plan id is metadata, never the dataset key. NO repo-wide scans, NO scanning of other plans, NO ad-hoc file reads beyond the selected plan's document and its record-listed files.

**Isolation**: Manual invocation only. Nothing in this profile may trigger `/recall` automatically.
/recall never runs inside a task lifecycle — it is invoked only between tasks or sessions, on explicit user request. `.context/comprehension-log.md` is read exclusively during `/recall` invocation.
