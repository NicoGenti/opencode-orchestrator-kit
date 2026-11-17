# Progress

Snapshot dello stato corrente della sessione.

## Stack

- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React (`src/`, `docs-src/`); Bun + TypeScript; CI GitHub Actions.
- Board: board in questo ambiente solo via python CLI + prova fisica.

## Current state

- **v1.2.2 PUBBLICATA su npm (2026-11-17)**: `latest = 1.2.2` (gitHead `290ca39`); tag annotato `v1.2.2` su `main` post-merge (rebase-merge); `release.yml` verde (tag check + publish); `deploy.yml` su tag verde dopo fix utente delle protection rules di `github-pages`.
- Incidente risolto: primo tag su `2553aed` (pre-bump) → fallimento atteso del tag-check; tag eliminato (approvato) e ricreato sul commit post-merge. Nessun publish parziale; nessun fallout su npm.
- Scope rilasciato: #172 (CRG MUST-when-configured) + #171 (Pages su tag + What's new da CHANGELOG). Diff release: 4 path (`CHANGELOG.md`, `package.json`, `plugin/package.json`, `tests/site-landing.test.ts`).
- `.context/decisions.md` archiviato e ripartito pulito (`.context/archive/decisions-2026-11-17.md`). `.context/issues.md` NON archiviato: scrittura in `.context/archive/` negata dal permission layer (vedi issues.md, voce 2026-11-17) — il file live contiene ancora il log completo.
- Working tree primario: `main` allineato a `origin/main` (`290ca39`); worktree release in `C:\Users\NicolasGentilucci\AppData\Local\Temp\opencode\release-v1.2.2` (branch mergiato).

## Done (questa sessione)

- Release v1.2.2: verifica bullet changelog #172, bump via script, pin sito, sweep completo in worktree isolato, push branch, PR (handoff utente per `gh` negato), merge rebase da utente, recovery tag, verifica publish npm + Pages verde, release notes draft (testo consegnato in chat).
- `progress.md` riscritto a fine sessione; `decisions.md` archiviato+riavviato; tentativo di archivio `issues.md` negato dal layer.

## Next steps

- Utente: creare la GitHub Release `v1.2.2` a mano (workflow non la crea); chiudere issue #174; decidere board lifecycle della card di release (board separato per scelta utente).
- Plan 0009 (Release v1.2.0): in-progress, Phase 5–6 aperte — vedi `plan/in-progress/0009.md` (igiene board utente).
- Plan 0002 (design-first-governance): in-progress, fasi F/H aperte — vedi `plan/in-progress/0002-design-first-governance.md`.
- Warning board pre-esistente: `plan/qa/0001` missing-comprehension.
- Aperto (#171 m7): guard versione/pattern su `v*` in `deploy.yml` (decisione separata dell'utente).
- Baseline: `bun test` 20 fail ambientali (worktree CRLF), 19 su checkout LF; `format:check` ~120 path CRLF — non regressioni.
