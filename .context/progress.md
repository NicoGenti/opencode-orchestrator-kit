# Progress

Snapshot dello stato corrente della sessione.

## Stack

- Kit Markdown multi-agent per OpenCode 2 pubblicato come plugin (`plugin/`); sito Vite/React separato (`src/`, `docs-src/`).
- Bun + TypeScript; gate CI: `bun test`, typecheck, lint, format:check, `sync-assets --check`.

## Current state

- Release **v1.2.2 PUBBLICATA** (2026-11-17): `npm view opencode-orchestrator-kit version` → `1.2.2`; tag annotato `v1.2.2` → `290ca39` (tip di `main`, post-merge rebase-style, nessun merge commit); workflow Release verde (publish OK); workflow Pages su tag verde.
- Release shippa #172 (CRG MUST-when-configured) + #171 (deploy Pages su tag + What's new da CHANGELOG). Diff vs main pre-release: esattamente 4 path (`CHANGELOG.md`, `package.json`, `plugin/package.json`, `tests/site-landing.test.ts`).
- Worktree di release: `C:\Users\NicolasGentilucci\AppData\Local\Temp\opencode\release-v1.2.2` (branch `release/v1.2.2` ricreato via rebase su `2553aed` → pushato, poi mergiato rebase-style → commit `26a193a`/`290ca39`). LF-clone di verifica in temp; `pr-body-175.md` aggiornato in temp.
- Incidente risolto: il primo tag `v1.2.2` (lightweight, su `2553aed`, pre-bump) faceva fallire `release.yml`; eliminato (locale+remoto) e ri-creato annotato sul commit post-merge dopo il merge.
- Aperto: **GitHub Release manuale v1.2.2 da creare dall'utente** (gh negato in sessione; la Release non è stata creata dal workflow).
- Board/issue: nessuna card creata per #174 (scelta utente: board separato); chiusura issue #174 e board lifecycle = decisione utente post-release.
- Baseline ambientali invariate: `bun test` 20 fail CRLF (19 LF), tutti membri baseline; format:check 120+ CRLF path.
- Anomalia da annotare: merge di PR #175 vs contenuto di `main` non coerenti con gli SHA pre-rebase (la PR è stata infine mergiata rebase-style; nessun danno; verificare il reflog/eventi GitHub se serve archeologia).

## Next steps

- Utente: creare la GitHub Release `v1.2.2` (manuale; note dal tag; publish npm confermato).
- Utente: chiudere issue #174 e decidere board lifecycle della card di release (separato dal release).
- Osservazione: `deploy.yml` ora gira sui tag `v*`; le environment protection rules di `github-pages` sono state corrette dall'utente (il run del tag è passato).
