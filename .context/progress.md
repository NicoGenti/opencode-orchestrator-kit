# Progress

Snapshot chiusura sessione 2026-11-24 (issue #199 — release v1.3.0 COMPLETATA; nessuna plan attiva).

## Stack

- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React; Bun + TS + Python stdlib; CI GitHub Actions. Ambient Windows: ~25 fail `bun test` CRLF + ~50 noise `format:check` (blob-LF = verità; CI finale); versione-sync locale richiede working copy LF (ambient `:39`).
- Board root: SEMPRE assoluta `E:/MyProjects/opencode-orchestrator-kit/plan`; commit body SOLO ASCII; quirk FM: `#` tronca flat scalar (anche `plan_board move --outcome`; card 199 outcome troncato — versione integrale in decisions.md 2026-11-24).
- `gh` NEGATO dalla perm-layer nelle dispatch (fixer/explorer): fallback HTTPS anonimi (pagine renderizzate) o azione utente; `npm` OK.
- Conteggi siempre dal tree, mai copiati; tag SOLO su head ramo release; verifiche equivalenti-CI su blob LF con `--check`.

## Current state

- **Nessun dispatch in flight.** Working tree su `main`, HEAD `58066a8` (2 commit AHEAD di `origin/main` — PUSH PENDING per 403 credenziali `NicoGentiDoit`: `f1b9d9b` chore(plan) cards 199+200 complete, `58066a8` docs align npm marker 1.3.0).
- Dirty: solo `.context/progress.md` + `.context/decisions.md` (close-out appends; session memory, commit a scelta utente).
- **RELEASE v1.3.0 CHIUSA E VERIFICATA (F6 GREEN)**: npm `1.3.0` provenance SLSA v1 attested; GitHub Release con 8 note; `release.yml` #11 verde al tag; tar 69 file (security-audit 21, 11 SKILL.md); tag `3c3255f` peels a `fbb7ed0` == origin/main == `origin/release/v1.3.0` (ramo tenuto su origin). **Alert Snyk #20 RISOLTO** (utente in UI). Classification task: NONE (announced) — nessun coach/telemetria/record.
- Board: `199` e `200` in `plan/complete/` (nessun pointer attivo — nessuna plan in-progress/qa del ciclo corrente; warning pre-esistente qa/0001 only).
- **ARCHIVIAZIONE NEGOZIATA (close-out)**: `write .context/archive/decisions-2026-11-24.md` → `{"error":{"type":"permission.rejected","message":"Permission denied: edit"}}` (directory `.context/archive/` inesistente nel checkout e scrittura nuova file negata; shell pure negata). `decisions.md` e `issues.md` RESTANO live e sovrasoglia (~5k/~6k token) — il prossimo avvio decide tra ariverle o mantenerle; i contenuti correnti sono quelli pubblicati in chat in questa sessione.

## Next steps (UTENTE)

- `git push origin main` (`fbb7ed0..58066a8`) a credenziali ripristinate; poi chiudere l'issue #199 su GitHub ("released in v1.3.0").
- Facoltativo: ricalcolare LF locale su `CHANGELOG.md`/working files (ambient); gestire la discrepanza Pages policy vs CONTRIBUTING (scelta utente: gestione propria).

## Follow-up aperti (NON in lavorazione; dettaglio completo in live issues/decisions)

- record-id `res-`→`ev-`; strip/reject FM in `plan_board new`; TS mirror audit; ermeticità suite TOON (opt-in locale); m4 prose plan-writer; m5 CHANGELOG PR-time; CRG stale (update prima del prossimo blast-radius); qa/0001 missing-comprehension; outcome 199 troncato (fix FM opzionale con approvazione); Pages policy mismatch.
