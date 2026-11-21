# Progress

Snapshot dello stato corrente della sessione.

## Stack

- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React (`src/`, `docs-src/`); Bun + TypeScript; CI GitHub Actions.
- Board: solo via python CLI + prova fisica in questo ambiente.

## Stato: issue #203 completato

- `plan/complete/203.md` (comprehension `none`); TECHNICALLY_DONE e HUMAN_OWNED registrati.
- Validazione: code-reviewer APPROVE (0 bloccanti); test 1303 pass / 19 ambient (0 nuovi); `sync-assets --check` clean; typecheck e lint 0.
- File principali: `agents/orchestrator.md`, `agents/orchestrator-quick.md`, `agents/test-engineer.md`, `AGENTS.md`, `tests/dispatch-guard.test.ts`, `tests/permission-matrix.test.ts`, `tests/v2-permission-snapshot.*`, `CHANGELOG.md`.
- Nota plan-board: root assoluto obbligatorio (`E:/.../plan`); root relativo phantom.
- Residue opzionali (follow-up; fuori gate #203): accounting ledger survival su overwrite (R1), writer ledger nel router quick (R2), hole `--output` in developer-fixer/code-reviewer (R4), pulizia card `0001`/`179`.

## Next steps (utente)

- `git stash pop` per riprendere #198 (`workflow-intake`).
- Decidere se aprire follow-up per R1/R2/R4 e per il merge/deploy.
- Revoca `NPM_TOKEN` resta pendente se applicabile.

## Baseline / note

- Ambient fail-set Windows unchanged (19 fail).
- `.context/decisions.md` e `.context/issues.md` aggiornati al 22/11/2026.