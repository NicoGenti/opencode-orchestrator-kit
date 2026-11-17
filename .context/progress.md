# Progress

Snapshot dello stato corrente della sessione; nessuna lavorazione in corso.

## Stack

- Kit Markdown multi-agent per OpenCode 2 pubblicato come plugin (`plugin/`); sito Vite/React separato (`src/`, `docs-src/`).
- Bun + TypeScript; gate CI: `bun test`, typecheck, lint, format:check, `sync-assets --check`.

## Done

- Issue #171 (Pages deploy su tag `v*` + What's new derivato dal CHANGELOG a build time via `virtual:latest-release`) COMPLETATA e MERGIATA dall'utente; Pages source verificata = GitHub Actions. Gate comprehension DEEP chiuso `SKIPPED` (telemetria 2026-11-17T17:24:43Z). Dettaglio in `.context/decisions.md` (voce 2026-11-17) e `.context/issues.md` (m7 aperto).
- Main locale allineato dall'utente.

## Current state

- Nessun lavoro in corso. Baseline ambientale invariata: `bun test` 20 fail noti (CRLF, host-bash /mnt, symlink EPERM, timeout installer); `format:check` drift CRLF-only. Mai "fixare" questi.
- Board ops in questo ambiente: SOLO python CLI + verifica fisica (il tool nativo è inaffidabile).

## Next steps

- Plan 0009 (Release v1.2.0): in-progress, Phase 5–6 aperte — see plan/in-progress/0009.md
- Plan 0002 (design-first-governance): in-progress, fasi F/H aperte — see plan/in-progress/0002-design-first-governance.md
- Warning board: plan/qa/0001 missing-comprehension (pre-esistente).
- Aperto: review m7 di #171 — tag guard in `deploy.yml` (vedi `.context/issues.md`).
