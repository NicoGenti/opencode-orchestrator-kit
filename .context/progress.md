# Progress

Snapshot sessione 2026-11-23 (issue #211 chiusa).

## Current state

- **Issue #211 COMPLETA**: card `plan/complete/211.md` (comprehension `skipped`, outcome lesson registrata). Fix: guard `_outside` pre-dry-run in `cmd_move`/`cmd_new` di `scripts/plan-board.py` (+8/-0) + 3 pin regressioni in `tests/plan-board.test.ts` (+122/-0). Verifiche: 36/0 test, parity 16/0, typecheck/lint 0, format ambient. Review security APPROVE (0 blocking).
- DECISIONE UTENTE 2026-11-24: autorizzazione ESPLICITA per azione — creazione ramo, commit modifche, push (per-action authorization, AGENTS.md dispatch guard). Split commit approvato: (1) fix+test, (2) board card 211, (3) session memory.
- `accepted=developer-fixer/211-git` — dispatch in flight (riuso sessione P2 `ses_df62e098dffeSYNM4XhvmmWFN0`, stesso task limitato).
- Stray: file `211.md` creato per errore su una board estranea (root relativa `plan_board`, incidente 2026-11-23) — percorso non localizzato (glob `E:\MyProjects\**` negativo), cleanup azione utente, vedi issues.md.
- Board: 211 complete ✔; residui warning pre-esistenti `qa/0001`, `qa/200` (fuori scope).

## Next steps (NON in lavorazione)

- AZIONI UTENTE post-#211: commit/push (messaggio ASCII, un logical change per commit), verifica chiusura alert Snyk #20 alla re-scan su default branch (se persiste → disposition "not vulnerable", decisione utente, non altro codice).
- Follow-up registrati in issues.md (NON in lavorazione): gap containment `cmd_adopt` (Low); audit TS mirror `plugin/src/plan-board.ts` (Info); CRG update (stale, graph `4c9b1fd` vs HEAD); commento guard "defense-in-depth" (unasked, non applicato).
- Ereditati sessione precedente: plan #200 qa→complete dopo merge PR utente; PR `feat/205-lesson-recall` da confermare; push repo evals; follow-up #208 (in issues.md); commit chore session memory (questo file) al prossimo avvio o a mano.
