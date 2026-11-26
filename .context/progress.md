# Progress

Stato a close-out 2026-11-26 (sessione issue #217 — COMPLETATA end-to-end).

## Stack / ambient
- Kit Markdown multi-agent per OpenCode 2 (plugin); Bun + TS; CI GitHub Actions. Windows: ambient noise noto — `bun test` ~23-25 fail CRLF/timeout, `format:check` CRLF-only (blob-LF = verità, CI decisiva); commit body SOLO ASCII; `gh` NEGATO in dispatch; `shell` NEGATA all'orchestrator (verifiche read-only). Git: main = origin/main `62eabca` + merge PR #217 (aggiornato dal push utente; SHA confermato dall'utente via GitHub).

## Stato #217 (COMPLETATO — nessuna azione residua)
- Implementato, committato (`69dc53f`) e **PR mergiata con successo dall'utente**; branch `fix/217-readme-opening` eliminato su origin.
- Livello repo: README opening (headline :3 + tagline :5 + badge row :7 + GIF :9/:11), `## Recognition` a :184-194, CONTRIBUTING pin :88/:110, CHANGELOG bullet, `plugin/README.md` mirror, GIF utente `docs/assets/demo-start-session.gif` (3,95 MB).
- Classification: NONE (announced) — docs-only; no coach/telemetria/record. Nessun plan card (fast-flow docs).

## Next steps (UTENTE)
- Nessuna azione pendente #217. Eventuali issue follow-up (lista sotto) restano candidati GitHub.

## Pointer piani attivi
- Nessun pointer: nessun plan in corso per il ciclo corrente; board intatta (199/200 e precedenti in `plan/complete/`).

## Follow-up aperti (NON in lavorazione; dettaglio in issues.md)
- #215 audit: QUICKSTART `--with-examples` doc line (base 8 vs 11 skills plugin), candidata issue separata; Pages policy vs CONTRIBUTING (utente gestisce da solo); record-id `res-`→`ev-` (kit bug); strip/reject FM in `plan_board new` (ricorrente #201/#208); ermeticità suite vs opt-in TOON locale; CRG stale — `code-review-graph update` prima del prossimo uso blast-radius; qa/0001 missing-comprehension warning.

## In corso
- accepted=developer-fixer/context-archive-move (2026-11-26, in flight — autorizzazione utente esplicita "autorizzo la scrittura in .context/archive/ tramite un subagent con i permessi"; rimuovere alla chiusura).

## Blocchi sessione (report verbatim del permission layer)
- **Archiviazione `.context/archive/` RIUSCITA ZERO volte**: tentativo close-out su `.context/archive/decisions-2026-11-26.md` → `{"error":{"type":"permission.rejected","message":"Permission denied: edit"}}` (stesso blocco ricorrente delle sessioni #199/#215). Per non perdere contenuto i file live **NON** sono stati azzerati: `.context/decisions.md` (~10k token) e `.context/issues.md` (~7k token) restano sovrasoglia e integri. Servono: approvazione manuale del permesso di scrittura su `.context/archive/` da parte dell'utente, oppure gestione alternativa (es. archivio manuale utente), alla prossima sessione.
