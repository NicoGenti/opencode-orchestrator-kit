# Progress

Close-out sessione 2026-11-24 (issue #215 — fix README applicato e committato; nessun plan attivo).

## Stack / ambient
- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React; Bun + TS; CI GitHub Actions. Windows: ambient noise noto — `bun test` CRLF/timeout (~23-25 fail), `format:check` CRLF-only (~50-59 file; blob-LF = verita', CI finale); versione-sync richiede working copy LF. Board root assoluta `E:/MyProjects/opencode-orchestrator-kit/plan`; commit body SOLO ASCII; `gh` NEGATO nelle dispatch; `shell` NEGATA all'orchestrator questa sessione (verifiche orchestrator via read-only tools). Git: HEAD `903d24d` == origin/main (push pendenti della sessione #199 eseguiti dall'utente).

## Done (questa sessione — issue #215)
- Audit README via explorer (read-only, tree `903d24d`): tutti i claim contabili/link/config verificati; **discrepancy skills 11-vs-9 risolta** — README "11 skills" CORRETTA (base = SKILL.md registrati ricorsivi: 8 dirs + 3 in `skills/examples/`, confermata da mirror, `plugin-integration-install.test.ts`, tarball v1.3.0); il 9 = base cartelle top-level; drift = base non documentata.
- Fix approvato utente ("Approvo mutation", "Sì, commit autorizzato"): commit `19e1a46` su branch `fix/215-readme-alignment` (da `903d24d`), 5 file — README:118 base conteggio inline, QUICKSTART:22 npm 1.3.0, QUICKSTART:113-114 16 base/18 extras, CONTRIBUTING:177/179 pin :96/:118, CHANGELOG bullet [Unreleased] + `plugin/README.md` rigenerato via sync-assets. Edit verificati a read; draft PR consegnata in chat (derivazioni + resolution skills).
- Check: typecheck/lint/build/sync-assets --check VERDI; `bun test` 1403 pass / 23 fail ambient-Windows (nessun nuovo file fallante); `format:check` ambient CRLF-only. Classification: **NONE (announced)** — docs-only; no coach/telemetria/record.
- Session memory: decisions.md entry #215 appended; issues.md entry follow-up #215 appended.

## Next steps (UTENTE)
- `git push -u origin fix/215-readme-alignment` + PR su main (draft in chat) → merge → chiudere #215 su GitHub.

## Pointer piani attivi
- Nessun pointer: nessun plan in corso per il ciclo corrente; board 199/200 in `plan/complete/` (record permanente). #215 = fix diretto senza plan card (pre-classificato NONE/LIGHT docs band).

## Follow-up aperti (NON in lavorazione; dettaglio in issues.md)
- Da audit #215: QUICKSTART `--with-examples` doc line (base 8 skills vs 11 plugin), verifica tarball/registry fuori scope — candidati issue separate.
- Storico: record-id `res-`→`ev-` fix tool; strip/reject FM in `plan_board new` (ricorrente #201/#208); TS mirror audit (#211); Pages policy vs CONTRIBUTING (gestione utente); ermeticità suite TOON; CRG stale (update prima del prossimo blast-radius); qa/0001 missing-comprehension warning; outcome 199 troncato (fix FM opzionale).
- **Archiviazione `.context/archive/` NEGATA dal permission layer (ricorrente: sessione #199 e questa)** — `decisions.md` (~10k token) e `issues.md` (~7k token) restano live e sovrasoglia; il prossimo avvio deve decidere (approvazione manuale dell'utente per la write di archivio o gestione alternativa).
