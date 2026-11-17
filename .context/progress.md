# Progress

Snapshot dello stato corrente della sessione; nessun piano attivo.

## Stack

- Kit Markdown multi-agent per OpenCode 2 pubblicato come plugin (`plugin/`); sito Vite/React separato (`src/`, `docs-src/`).
- Bun + TypeScript; gate CI: `bun test`, typecheck, lint, format:check, `sync-assets --check`.

## Stato corrente

- **Issue #168 COMPLETATA**: release **v1.2.1** pubblicata su npm (confermata dall'utente). Tag `v1.2.1` su `a6ca475` (merge rebase della PR di release per #168); release PR aperta a mano dall'utente (`gh` permission-denied in sessione); Release GitHub NON creata (il workflow la crea? no — `release.yml` fa solo npm publish; va creata a mano, vedi issues.md).
- Contenuto 1.2.1 (4 path, +7): bullet #167 in CHANGELOG (promossa sotto `## [1.2.1] — 2026-11-16`), bump `package.json`/`plugin/package.json` 1.2.0→1.2.1, pin `tests/site-landing.test.ts:189` → 1.2.1. Tag/branch release puliti; worktree rimosso; main locale allineato a origin/main (`a6ca475`).
- Card 0010 → `plan/complete/` (comprehension `none`); card 0009 (v1.2.0) ancora con Phase 5–6 aperte — igiene board lasciata all'utente.
- Board: `plan/complete/0010.md` untracked in git; da committare a parte se voluto (fuori dal release diff). Nessuna riga telemetria scritta per #168 (classificazione NONE); la riga 2026-11-16T20:32:31Z (LIGHT PASS) appartiene al gate #167.
- Residui: `.context/plan-body-*.md` orphan staging bodies (0008, 0009, 0010, 000153, 000167) — cancellazione negata dal permission layer; pulizia manuale utente.

## Next steps

- Utente: creare la GitHub Release v1.2.1 a mano (vedi issues.md 2026-11-16) oppure confermare che non serve.
- Utente: valutare chiusura issue #168 su GitHub; valutare pulizia card 0009 e staging bodies.
- Prossimo rilascio: ereditare le note ambientali in issues.md (baseline CRLF/host-bash del worktree; mai confrontare format:check cross-environment).
- Nessun piano attivo.
