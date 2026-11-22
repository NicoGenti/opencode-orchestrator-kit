# Progress

Snapshot dello stato corrente della sessione.

## Stack

- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React (`src/`, `docs-src/`); Bun + TypeScript; CI GitHub Actions (test.yml: typecheck/lint/format/sync/build/test).
- Code Graph: presente. Plan-board root: sempre assoluto (`E:/.../plan`). Prettier: default (proseWrap preserve, endOfLine lf); `.context/`, `plan/`, `agents/`, `skills/`, `docs/` esclusi da format.

## Current state

- Nessun piano attivo; nessun dispatch in flight. Main = origin/main (`2f11bed`), tree pulito.
- PR #206 MERGIATA (squash: SHA nuovi, contenuti #198 equivalenti); branch origin+locale eliminati; `release/v1.2.3` worktree eliminato (utente).

## Done

- **Issue #198 (workflow intake + adaptive complexity gate) COMPLETATA**: card `plan/complete/198.md` (comprehension: skipped); review round-3 APPROVE; CI PR verde (run #274, incl. `Run tests`).
- Consegnato: restatement+conferma su richieste ambigue (`workflow-intake` skill on-demand), triage categorico NONE/LIGHT/DEEP disgiunto-esaustivo, `workflow.mode auto|full|lite` (templates/workflow.config.json, prompt-level read), telemetria opt-in `TriageEventV1` → `.context/triage-dataset.jsonl`, mirror AGENTS/docs/README/CHANGELOG.
- CI root-cause fix: 3 file non formattati per LF-blob (README + 2 test) — fix prettier + mirror; lezione: verifica formattazione con `--check` su blob LF, mai `--stdin-filepath` senza check.
- Gate comprehension DEEP: SKIPPED a richiesta utente (telemetria row + record `ev-20261122-191123-…` emessi).
- Baseline ambient corretta: 25 fail locali Windows (19 + 6 timeout bash), non CI-relevant.

## Next steps (utente)

- v1.3.0 release (#199) su main aggiornato — CHANGELOG [Unreleased] ha il bullet #198.
- Follow-up opzionali: residui #203 (R1/R2/R4); card legacy `plan/in-progress/0002…`/`0009`/`179` + qa `0001`/`13` (0001 warning missing-comprehension noto).
- Decisioni pending: drop vecchi stash (`stash@{0..1}`), `rm .context/plan-body-198-option-c.md` (orfano), revoca `NPM_TOKEN` se applicabile.
