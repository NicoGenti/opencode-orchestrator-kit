# Decisions

- 2026-10-20: `plan/` e `.context/` sono versionati nel repository. Il runner GitHub controlla il
  repo e deve poter leggere la memoria di sessione, adottare l'issue nel board, spostare il piano e
  committarlo: qualunque path fuori dal checkout (il vecchio layout a junction) e' invisibile al
  runner. La telemetria (`.context/comprehension-log.md`, `.context/research-dataset.jsonl`) resta
  fuori dal versionamento.
- 2026-11-12: bootstrap `profiler` eseguito (prima volta nel repo): `.opencode/PROJECT-PROFILE.md`,
  `.context/repo-map.md`, bozza `.context/DESIGN-RULES.md`. Regole raffinate da `oracle` (DR-1..DR-10),
  approvate dall'utente e scritte da `developer-fixer`; committate in 45a9f95 (piano 0003).
- 2026-11-12: issue #121 procede come piano 0003; il piano 0002 resta in-progress (fasi F/H aperte)
  e i nostri cambiamenti tengono verdi tutti i pin dei test così che le sue fasi possano atterrare dopo.
- 2026-11-12: la guideline di budget prompt in CONTRIBUTING.md sarà espressa in PAROLE (scelta utente) e
  referenzia la tabella di cap in caratteri di `tests/workflow-hardening.test.ts:57-79` come enforcement,
  senza introdurre numeri concorrenti.
- 2026-11-12: i record una tantum di docs/ (FLOW-VERIFICATION, FEEDBACK-WINDOW-*, PLUGIN-V2-FEASIBILITY)
  vanno spostati verbatim in `docs/archive/` (scelta utente); `command/`, `skills/` e `docs/SETUP-NATIVE.md`
  restano fuori scope.
- 2026-11-12: lavoro su branch `feat/issue-121-shorten-prompts-docs`, un commit per fase; PR a fine lavori.
- 2026-11-12: il fixer della fase 0 ha rimosso il body di staging violando il confine board (solo
  `plan-writer`); esito equivalente (scheda conforme, check 0 errori) ma titolo/owner della card differiscono
  minimamente dal Mutation Summary approvato: si normalizza al passaggio qa con summary dedicata.
  Normalizzata effettivamente al passaggio qa (titolo approvato + owner NicoGenti; edit dei soli campi
  approvati + tick checklist, plan-writer con Mutation Summary approvata).
- 2026-11-12 (piano 0003, chiusura): comprehension gate DEEP eseguito (slicer ≤72 righe; 4 domande
  CHALLENGE; verdict coach FAIL DCI 0/8 conf 4 — nessuna risposta ricostruttiva); l'utente ha
  dichiarato `skip comprehension` → outcome finale SKIPPED (telemetria 2026-11-12T16:51:07Z; record
  `.context/comprehension/ev-20261112-164744-84a0e0893de545c236ba8695986b86f5.md`; evaluation_id da
  `scripts/record-id.ts` con prefisso `ev-` adattato — l'emitter produce solo `res-`). Piano 0003
  chiuso in plan/complete con `comprehension: skipped` (check 0 errori, root assoluto). Le fix di
  review F1–F6 sono in b465b74; il pin `--body-file`→`--body` in tests/plan-writer-contract.test.ts è
  il primo edit deliberato a un pin che codificava un errore fattuale (DR-8, giustificato in fase).
