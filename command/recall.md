---
description: Re-activate a past comprehension session for a plan via a strict read-only diagnostic and comprehension re-verification flow.
agent: orchestrator
---

Comando `/recall`. Flusso di ri-attivazione di una sessione di comprensione passata per un plan. È un flow strettamente read-only di diagnostica e ri-verifica della comprensione — mai una replay del lavoro, mai una re-delegazione implicita.

**Invariant**: ALL questions are shown BEFORE any code or explanation is displayed.

**Pre-condition**: `.context/comprehension-log.md` is read ONLY during explicit `/recall` invocation — never at session start, never during bootstrap.

**Flow (9 steps)**:

1. **List candidates**: scan `plan/complete/*.md` and existing `.context/comprehension/*.md` records; present to user as a numbered list (plan-id + last outcome + date).
2. **User selects** the plan to recall (number or plan-id).
3. **Load questions**: read the per-plan record at `.context/comprehension/<plan-id>.md` if it exists (`src=stored`); otherwise reconstruct from the plan's Goal/Scope section in `plan/complete/<plan-id>.md` (`src=reconstructed`), inferring questions that map to the plan's stated acceptance criteria.
4. **Show ALL questions** (with `- ?` prefix), one per line. No code, no diffs, no explanations yet.
5. **User answers from memory** (no tooling, no file access during this step); from answer time on, reads go only through step 5's whitelist — nothing else.
6. **Code inspection** (v0.3.1 token-aware comprehension, v0.6.1 caps): if needed, show the relevant diff with `maxDiffLines=300` and correlated symbols capped at `maxRelatedSymbols=3` — diff lines ONLY, NEVER full files, NEVER repo-wide scans.
7. **Evaluation** delegated to `comprehension-coach` using the v0.4.0 DCI rubric with the identical whitelist input (goal, changed file list, focused diff, minimal surrounding symbols). The coach's rubric score is the DCI verdict.
8. **Retry/skip** (v0.3.0 verbatim): maximum 1 retry; `skip comprehension` is always available; no reveal of expected answers during retry.
9. **Outcome**: append dci1-format row to `.context/comprehension-log.md` AND note in `.context/progress.md`; update the per-plan record's `outcome`, `dci` and `user_conf` fields (v0.6.1+ normalisation). Format:

```
<date> | plan=<NNNN> | type=dci1 | src=stored|reconstructed | retry=<0|1> | user_conf=<1-5>|n/a | evaluator_conf=<1-5>|n/a | DCI=<score>/<available_score> | DCI=skipped | outcome=PASS|FAIL|RETRY|SKIPPED
```

- `outcome=SKIPPED` row format: `user_conf=n/a | evaluator_conf=n/a | DCI=skipped | outcome=SKIPPED` (no numeric confidence fields).
- v0.6.1: the two confidence fields are distinct normalised values — `user_conf` is the developer's calibration self-rating, `evaluator_conf` the coach's confidence in its verdict; the old overloaded single `conf=` field is retired.
- Same header-once rule as the telemetry writer; same append-only discipline.
- The log file `.context/comprehension-log.md` is the single sink for all dci1 rows.

**Metric caveat (Retention = DCI₁/DCI₀)**: "è una nostra metrica operativa, non una metrica scientificamente validata". Retention compares the delayed DCI₁ (via `/recall`) with the immediate DCI₀ recorded at gate time; it is an operational metric, not a validated scientific one. v0.5.0 only accumulates dci1 data.

**Budget (v0.6.1 normalisation)**: before the user answers, only the plan document and the per-plan record's saved questions are consulted. After the answer, reads are limited to the diff/file/symbol matter pertinent to the selected plan, respecting `maxDiffLines=300` and `maxRelatedSymbols=3` — never a whole-repo scan, never a whole-file read when a bounded slice suffices.

**Whitelist of sources**: ONLY the plan document in `plan/complete/`, the per-plan record in `.context/comprehension/`, and the bounded post-answer inspection — the relevant diff (`maxDiffLines=300`) and correlated symbols (`maxRelatedSymbols=3`) of the files listed in the per-plan record — may be consulted after the user has answered; step 9 appends the dci1 row and updates the per-plan record (`outcome`, `dci`, `user_conf`). NO repo-wide scans, NO scanning of other plans, NO ad-hoc file reads beyond the selected plan's document and its record-listed files.

**Isolation**: Manual invocation only. Nothing in this profile may trigger `/recall` automatically. `.context/comprehension-log.md` is read exclusively during `/recall` invocation.
