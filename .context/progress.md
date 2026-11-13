# Progress

Snapshot dello stato corrente della sessione. Storia dei piani completati: `git log`, `plan/complete/`, `plan/qa/`.

## Stack

- Kit Markdown multi-agent per OpenCode 2 pubblicato come plugin (`plugin/`); site Vite/React separato (`src/`, `docs-src/`).
- Bun 1.2.21 + TypeScript 5.6.3; Python/POSIX solo per helper `scripts/`; gate CI: `bun test`, typecheck, lint, format:check, `sync-assets --check`.

## Stato attuale

- Nessun piano attivo. **Piano 0008 "Deterministic context-budget and evidence-check gates (issue #151)" CHIUSO** in `plan/complete/0008.md` (`comprehension: skipped`).
- Branch `feat/issue-151-deterministic-gates`: 5 commit (`8f6bcac`…`ff6ac89`) pushati su origin; **PR da aprire a mano** (body pronto in `C:\Users\NicolasGentilucci\AppData\Local\Temp\opencode\pr-body-0008.md` — `Closes #151`, push già riuscito).
- Board: complete = 0003–0008; in-progress = `0002-design-first-governance` (pre-esistente); qa = `0001-design-first-bootstrap` (warning pre-esistente) + `13-migrare-il-kit-al-plugin-opencode-2`.
- Comprehension gate: `.opencode/comprehension.config.json` ABSENTE → default built-in; gate 0008 classificato DEEP, utente ha scritto `skip comprehension` → outcome finale SKIPPED (telemetria `DCI=skipped`, `evaluator_conf=n/a`, `user_conf=n/a`). Record valido in `.context/comprehension/ev-20261113-142509-d5f6e7e71ab99b5b2ddf61d8e2ddb61a.md`; record orfano invalido `ev-20261113-142509-75ee…md` lasciato in place (permessi negano rm). Telemetria: due righe appendite per lo stesso evaluation (doppio dispatch accidentale) — append-only, nessuna riga rimossa; consolidamento rimandato all'utente.
- Ambient: baseline 14 fail (`bun test`) + 22 `format:check` content-clean CRLF; zero fail nuovi in tutti i phase gate.

## Done (questa sessione)

- Issue #151 acquisita (librarian), workflow prefigurato: explorer → oracle → planner → developer-fixer phases 1–5 → code-reviewer → review-fix → comprehension skipped.
- Piano 0008 creato/completato via plan-writer (card `plan/draft` → `in-progress` → `qa` → `complete`), autore planner.
- Implementazione: 3 script (`check-common`, `context-budget`, `evidence-check`) + tipi/pin, template `templates/gates.config.json`, 3 test file (76 nuovi test), integrazione docs/orchestrator/README/package/CHANGELOG + mirror generato; review-fix H1 (absolute evidence path), M1 (loader root traversal), M2 (doc precedence), L4 (counterMarker precedence).
- Review code-reviewer: nessun blocco residuo aperto; push branch riuscito a `ff6ac89`; PR apertura resta user-manual (`gh` permission-denied ×2).
- Gate comprehension (DEEP → SKIPPED, user-declared `skip comprehension`, calibrazione 2 prima della skip): telemetria 2 righe (2026-11-13T14:25:51Z e 14:26:16Z), record valido creato.

## Next steps

- Plan #0002 (design-first-governance): in-progress — fasi F/H aperte — see `plan/in-progress/0002-design-first-governance.md`.
- **Aprire la PR a mano** da `feat/issue-151-deterministic-gates` → `main`, body in `C:\Users\NicolasGentilucci\AppData\Local\Temp\opencode\pr-body-0008.md` (`Closes #151`), oppure `https://github.com/NicoGenti/opencode-orchestrator-kit/pull/new/feat/issue-151-deterministic-gates`.
- **Cleanup opzionale manuale** (permessi negati in sessione): rimuovere `.context/comprehension/ev-20261113-142509-75ee5dc9fedb2df1f4c56a7a7e771957.md`, consolidare il doppiaggio riga telemetria, cancellare dangle `plan-body-*` pre-esistenti.
- Ambient baseline invariata: 14 fail `bun test` + 22 `format:check` CRLF (gap scala a11y/pre-esistenti).