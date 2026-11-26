# Progress

Stato dopo close-out + archiviazione autorizzata (2026-11-26, sessione issue #217 — completata).

## Stack / ambient
- Kit Markdown multi-agent per OpenCode 2 (plugin); Bun + TS; CI GitHub Actions. Windows: ambient noise noto (bun test ~23-25 CRLF/timeout, format:check CRLF-only); commit body SOLO ASCII; `gh` e `shell` NEGATI all'orchestrator (verifiche read-only); `shell` negata anche a developer-fixer per `.context` ops. CONTRIBUTING pin README attuale: `:88`/`:110` (stato post-merge #217, riconfermato).

## Stato #217 (COMPLETATO, nessuna azione residua)
- Commit `69dc53f` su main via PR mergiata; branch `fix/217-readme-opening` eliminato su origin. README opening nuova (headline/tagline/GIF), `## Recognition` a :184-194, pin/mirror/CHANGELOG allineati, GIF utente in `docs/assets/`. Classification NONE (announced). Nessun plan card.

## Archiviazione session memory (fattorizzata questa sessione)
- `.context/archive/decisions-2026-11-26.md` (17 righe) e `.context/archive/issues-2026-11-26.md` (21 righe): copie VERBATIM, uguaglianza verificata riga-per-riga da developer-fixer e confermata da verifica read indipendente (entry #217 a :5-6 nell'archivio decisions). CAVEAT: verifica a livello contenuto — byte-identity CRLF/trailing-newline NON garantita (lettura/scrittura senza shell).
- Live `.context/decisions.md` e `.context/issues.md` riavviati con header 5 righe + puntatore agli archivi; la prossima sessione li ripopola. Nessun commit fatto: i 2 file archivio (non tracciati) + i 2 live modificati restano per la gestione git dell'utente.
- Incidente osservato dal fixer (senza perdita): una read transitoria di decisions.md a 14 righe durante flight; l'archivio è preso dallo stato stabile 17 righe riconfermato prima dell'overwrite. Nessun altrowriter attivo ora.
- Storico archivi: `decisions-2026-11-23.md`, `issues-2026-11-19.md` (intatti).

## Next steps (UTENTE)
- Git lato utente: commit/push dei file `.context/` (archivi non tracciati + live modificati) a piacere, come da convenzione chore(context).
- Follow-up aperti (candidati issue GitHub): QUICKSTART `--with-examples` doc line; Pages policy vs CONTRIBUTING (utente gestisce); record-id `res-`→`ev-`; strip/reject FM `plan_board new`; ermeticità TOON; CRG stale prima del prossimo blast-radius; qa/0001 warning. (Dettaglio completo negli archivi.)
