# Progress

Snapshot dello stato corrente della sessione; nessun piano attivo in esecuzione.

## Stack

- Kit Markdown multi-agent per OpenCode 2 pubblicato come plugin (`plugin/`); sito Vite/React separato (`src/`, `docs-src/`).
- Bun + TypeScript; gate CI: `bun test`, typecheck, lint, format:check, `sync-assets --check`.

## Current state

- Nessuna lavorazione in corso. Ultima sessione chiusa con: piano **172** (CRG mandatory-when-configured, issue #172) completato — merge via PR, card in `plan/complete/172.md` (comprehension `skipped`), telemetria DEEP scritta, nessun lavoro pendente su 172.
- Baseline ambientale `bun test`: 20 fail noti (3 storici + 16 host-bash + 1 CRLF); `format:check` drift CRLF-only. Mai "fixare" questi.
- Board ops in questo ambiente: SOLO python CLI + verifica fisica (il tool nativo è inaffidabile).
- Comprehension: outcome `skipped` per 172 (utente skip prima delle domande); record `ev-20261117-164232-856854e0b358dac63eae84ca5ce5c568`.

## Done (questa sessione)

- Analisi export sessione 37 (CRG non usato) → causa: wording optional + trigger auto-classificato + `execute` implicito + nessun enforcement.
- Piano 172 creato, eseguito (4 fasi + fix review, APPROVED), mergiato via PR utente, card completata. PR/issue: #172 chiusa.

## Next steps

- Plan 0009 (Release v1.2.0): in-progress, Phase 5–6 aperte — see `plan/in-progress/0009.md`
- Plan 0002 (design-first-governance): in-progress, fasi F/H aperte — see `plan/in-progress/0002-design-first-governance.md`
- Warning board: `plan/qa/0001` missing-comprehension (pre-esistente).
- Utente: GitHub Release v1.2.1 a mano; pulizia staging bodies orfani in `.context/`; igiene card 0009.
- Opzionale: refresh CRG (`build_or_update_graph_tool`, owner code-reviewer) post-merge 172.
