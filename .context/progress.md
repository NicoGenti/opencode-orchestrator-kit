# Progress

Snapshot dello stato corrente della sessione.

## Stato: issue #198 COMPLETATA

- Card: `plan/complete/198.md` (comprehension: skipped). TECHNICALLY_DONE = review round-3 **APPROVE** + suite **1334 pass / 25 ambient** (0 nuovi) + typecheck/lint/build/sync-assets verdi. HUMAN_OWNED = comprehension **SKIPPED** (skip esplicito utente durante il gate DEEP; row telemetria emessa; record `.context/comprehension/ev-20261122-191123-f5b3cd69f4d9d7e1e7545e47879e40ad.md`).
- Commit: `a6d6e60` (A: skill workflow-intake + pointer router + mirror AGENTS + pin), `136e94d` (B: workflow.config template + gitignore + docs), `bcd8695` (C: 24→32 pin intake-triage), `c54cadb` (D: CHANGELOG + CONTRIBUTING row), `2467421` (fix r1: B1 Opzione A + M1-M3 + N1-N7), `af2c0d4` (fix r2: LIGHT raggiungibile + NEW-2/3/4), `0972103` (polish r3 nits).
- Design finale (decisions.md 2026-11-22): intake su richiesta ambigua (missing = non dichiarato E non inferibile) con restatement+conferma; skill `workflow-intake` solo su on-demand; NONE = shortcut small-task esistente (OR) → quick; LIGHT = banda bounded tra NONE e DEEP, deleghe dirette senza plan card; DEEP = security/cross-module/multi-phase → plan card via planner→plan-writer; `workflow.mode` auto|full|lite (default auto, prompt-level read, assente = silenzioso); telemetria `TriageEventV1` opt-in su `.context/triage-dataset.jsonl`. Classi disgiunte, non vuote, esaustive (pin).
- Baseline ambient corretta a 25 (19 + 6 timeout bash) — issues.md 2026-11-22.

## Follow-up (nessun pointer attivo — da lanciare su richiesta)

- Optional/#203 residui R1/R2/R4; card legacy `plan/in-progress/0002…`, `0009`, `179` e qa `0001`/`13` da sistemare; WARNING qa/0001 missing-comprehension noto.
- Decisioni utente pendenti: `stash drop` (stash@{0} = vecchio progress.md), `rm .context/plan-body-198-option-c.md` (orfano), revoca `NPM_TOKEN` se applicabile.
- v1.3.0 (#199 release) non ancora tagliata; CHANGELOG [Unreleased] ha il bullet #198.

## Baseline / note

- Nessun dispatch in flight. Gate comprehension: default (config assente, silenziosa). Code Graph: presente. Plan-board root: assoluto.
