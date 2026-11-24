# Progress

Snapshot sessione 2026-11-24 (chiusura — issue #211 completata).

## Stack

- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React (`src/`, `docs-src/`); Bun + TypeScript + Python stdlib (`scripts/plan-board.py`); CI GitHub Actions. Ambient Windows: ~25 fail `bun test` noti + `format:check` noise CRLF (blob-LF è la verità; CI è finale). Code Graph CRG presente ma stale (graph `4c9b1fd` vs HEAD). Board root: SEMPRE assoluta `E:/MyProjects/opencode-orchestrator-kit/plan` (incidente root-relativa 2026-11-23).

## Current state

- Nessun dispatch in flight. Working tree pulito.
- Ramo locale `fix/211-path-traversal-hardening` (3 commit: `89773a7` fix+test, `9c52405` plan card, `824a2ca` session memory) — PUSH PENDING per 403 credenziali (`NicoGentiDoit` senza write), azione utente (issues.md).

## Done (questa sessione)

- **Issue #211 (Snyk alert #20, Path Traversal `scripts/plan-board.py:304`) COMPLETA**: card `plan/complete/211.md` (comprehension `skipped`, outcome lesson). Ciclo: explorer (verdetto falso positivo + gap hardening) → planner → card board → P1 3 pin regressioni in `tests/plan-board.test.ts` (+122; 36/0) → P2 guard `_outside` pre-dry-run in `cmd_move`/`cmd_new` (+8; check errors:[]) → P3 gates verdi (parity 16/0, typecheck/lint 0, format ambient) → review security **APPROVE** (0 blocking) → comprehension **SKIPPED** (record `ev-20261123-193055-e2a08be3b31538bc4333719022d77a68`, riga telemetria 19:30:55Z) → move qa→complete ok → git: ramo + 3 commit (push 403, vedi sopra).
- Session memory aggiornata; errori orchestrazione auto-corretti: append-only decisions (ripristinato), incidente plan_board root relativa (lezione in issues.md).
- PR title/body bozza consegnata in chat (ASCII-safe).

## Next steps

- AZIONE UTENTE: `git push -u origin fix/211-path-traversal-hardening` (range `4945b06..824a2ca`) dopo fix credenziali; poi PR (title/body bozza del 2026-11-24), CI verde, re-scan Snyk #20 — se persiste: disposition "not vulnerable" (decisione utente, non altro codice).
- Plan #200 (Code Mode adoption): qa — mergiare PR utente, poi `move qa→complete` comprehension `none` (plan-writer) — vedi `plan/qa/200.md`.
- Plan #205 (lesson recall): complete — confermare CI su PR `feat/205-lesson-recall` (`3f4b4c7`) se non già fatto.
- Follow-up #211 (issues.md, NON in lavorazione): containment `cmd_adopt` (Low), audit TS mirror, CRG update, commento guard unasked, cleanup stray foreign `211.md`.
- Follow-up #208 / #201 / #205 (issues.md, NON in lavorazione): ermeticità suite, m4 prose plan-writer, m5 CHANGELOG PR-time, fix record-id `res-`→`ev-`, strip/reject FM `plan_board new`.
- Archivio issues NON riuscito: `.context/issues.md` resta live e popolato (sovrasoglia ~4.5k token) — prossimo avvio: rientra in soglia o ariva con `.context/archive/issues-2026-11-24-*.md`.
