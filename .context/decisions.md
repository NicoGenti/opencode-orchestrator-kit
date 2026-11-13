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
- 2026-11-13 (issue #120, piano 0004): scope minimo confermato dall'utente — regola stable/variable
  in README `## Cache-aware prompt design` + cross-link 1 riga in CONTRIBUTING (ownership dei
  contenuti); unico edit prompt: orchestrator.md (Scope=paths espliciti, Inputs=simboli path:line) e
  orchestrator-quick.md (Inputs), zero altri refactor (audit espresso: 18 file già conformi ai 5
  requisiti issue); branch `feat/issue-120-cache-stable-prompts` + PR a fine lavori (schema 0003).
- 2026-11-13 (piano 0004): regola operativa board RAFFINATA: le mutazioni board in questo ambiente
  vanno eseguite SOLO via fallback V1 `python scripts/plan-board.py --root <abs> --json` — il tool
  nativo `plan_board` ha fallito fisicamente 2 dispatch consecutivi (ok:true riportato, card mai
  creata nel repo, payload con slug di fantasia "sample-*"); DOPO ogni board-op va sempre
  verificata la prova fisica (glob/ls del repo).
- 2026-11-13 (issue #137, piano 0005): design confermato dall'utente — reading package derivato dallo slice
  ricevuto dal coach (ZERO modifiche ad `agents/orchestrator.md`), tag di fonte dentro le stringhe domanda
  verbatim (nessun cambio schema record/telemetria), cap parole 800 superato e cap caratteri 6.500 INTATTO
  (compressione prosa non pinnata nel review-fix), identità autore miste sui commit lasciate com'è (già miste
  su main), title scheda normalizzato SENZA `#` (bug split di scripts/plan-board.py:66, vedi issues).
  Review APPROVED + re-check APPROVED post review-fix F1–F10 (ad8ffc5). Gate comprehension LIGHT: coach
  FAIL DCI 0/4 conf 4 (nessun tentativo); l'utente ha dichiarato `skip comprehension` → outcome finale
  SKIPPED (telemetria 2026-11-13T10:27:17Z; record ev-20261113-102717-3580f2afdb19a1d10035d138498d6022;
  prefisso ev- adattato come da precedente 0003 — l'emitter produce solo res-). Board rule: python CLI +
  prova fisica (reconfirm piano 0004).
- 2026-11-13 (piano 0006, issues #128–#135): scope confermato dall'utente — UNA guardia lessicale
  `_is_traversal` (segmento `..` esatto via membership in lista dopo split di ENTRAMBI i separatori)
  al parse di `--root`/`--body`/`--config` nei 3 script Python, prima di ogni accesso FS; rifiuti nei
  tre stili esistenti (`ERROR:` stderr exit 1, `sys.exit("error: …")` exit 1, envelope `fail()` con
  code additivo `path-traversal`); NESSUNA reassegnazione da `resolve()` (payload raw `str(root)` +
  parità byte-for-byte Python↔TS), `tests/plan-board-parity.test.ts` intoccato, `--agents-dir` e porta
  TS `plugin/src/plan-board.ts` follow-up espliciti; branch unico `fix/issues-128-135-path-traversal`,
  4 commit (e227016, a4d63f6, bc8820e, cb51748), push riuscito, PR da aprire a mano (`gh pr create`
  negato ×1; body pronto in `C:\Users\NicolasGentilucci\AppData\Local\Temp\opencode\pr-body-0006.md`
  con `Fixes #128`…`#135`). Review: code-reviewer APPROVED dopo re-check (P1 refutato: `in` su lista
  è membership per uguaglianza, non substring); security PASS-WITH-FINDINGS (8/8 flussi chiusi; 2
  Medium follow-up: guard `--agents-dir` in apply-model-preset:210/freellmapi:135, porta guard su
  plugin/src/plan-board.ts). Gate comprehension DEEP: coach FAIL DCI 0/8 conf 5 (nessun tentativo a
  Q1–Q4; user_conf calibrazione 3) → l'utente ha dichiarato `skip comprehension` → outcome finale
  SKIPPED (telemetria 2026-11-13T11:26:20Z; record ev-20261113-112614-93ada9643e548a5c26457c96aca784e6;
  prefisso ev- adattato come da 0003/0005). Board: python CLI + prova fisica, card completata con
  `--comprehension skipped`; check errors:[] (solo warning pre-esistente su qa/0001).
