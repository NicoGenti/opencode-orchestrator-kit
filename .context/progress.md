# Progress

Snapshot dello stato corrente della sessione.

## Stack

- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React (`src/`, `docs-src/`); Bun + TypeScript; CI GitHub Actions. Ambient Windows: ~25 fail `bun test` noti + 56 `format:check` noise (CI è la verità; verificare prettier/ricerche su contenuo git-blob/LF mai disco CRLF). Layer: orchestrator scrive SOLO session memory + comprehension record/telemetria; NON `plan/`, NON codice, NON `.context/archive/` (`Permission denied: edit` al close-out 2026-11-23 — archivio decisions.md ancora da fare human-side); shell primaria negata per non-git; `gh` negato; git mutanti in sessione primaria ok con autorizzazione utente esplicita; board root assoluto `E:/MyProjects/opencode-orchestrator-kit/plan`.
- Code Graph CRG: refreshed durante review #205 (base `194e790`); catalogo MCP churna in-course (issues.md).
- CI su PR #205 attesi verdi su `3f4b4c7`: prettier blob-verified, baseline skillspector 4×exit 0 + negctl, sweep tier standalone, suite target 313/0 e 116/0.

## Current state

- **Pointer attivo**: Plan #200 (Code Mode adoption): **qa** — in attesa di merge utente PR → poi `move qa→complete` con verdetto comprehension `none` — vedi `plan/qa/200.md`.
- **Issue #205 CHIUSA E COMMITTATA**: card `plan/complete/205.md` (comprehension `skipped`, outcome registrato via `move --outcome` — primo uso in dogfooding). Branch `feat/205-lesson-recall` pushato: `39c8786` feat (P1-P4, 19 file +1014/−86), `9f7689b` chore (card+session memory), `d8130f4` ci (prettier+baseline), `3f4b4c7` ci (sweep tier). PR da aprire: https://github.com/NicoGenti/opencode-orchestrator-kit/pull/new/feat/205-lesson-recall
- Comprehension #205: DEEP → CHALLENGE 4 domande → EVALUATE RETRY 4/8 → **SKIP utente esplicito → SKIPPED** (annunciato; mai PASS); record `.context/comprehension/ev-20261123-125625-….md` + riga telemetria (comprehension-log gitignorato, record committato nel chore).
- accepted=developer-fixer/archive-decisions-20261123 (in flight — utente esplicitamente autorizzato il finalize archivio via subagent); suppressed: profiler (once-per-repo, fuori ruolo), orchestrator-direct (layer negato "Permission denied: edit").
- Nessun altro dispatch in flight.

## Done (questa sessione)

- Bootstrap, scoping #205 (4 decisioni utente), card via plan-writer (new+move+check, RAW ok:true).
- Esecuzione a fasi P1→P4 (developer-fixer ×3, plan-writer ×3 patch board-doc, test-engineer P3 prove-it), fix round review (5 blocking → risolti), re-review **APPROVE 0 blocking**, polish NEW-1/2/3/5, mirror sempre sync-assets.
- Gate comprehension DEEP completo (slice 295 righe, coach 2 fasi, skip utente, telemetria+record, id ev- via swap documentato).
- Chiusura card qa→complete con `--comprehension skipped --outcome` (ok:true, check 0 errori).
- CI fix: prettier blob-verified su 4 test, baseline skillspector rigenerata da git-blob/LF (pinned v2.13.6, re-triage 2 TM1 plan-writer, negctl), regressione sweep tier fixata. Committata e pushata.

## Next steps

- **#200 (Code Mode adoption): qa — apri/merger la PR utente; poi move qa→complete con verdetto `none` (plan-writer)** — punta `plan/qa/200.md`.
- **#205**: apri la PR dal link, conferma run CI verde su `3f4b4c7`, mergi.
- Azioni utente: revoca `NPM_TOKEN`; commit session memory post-close-out come `chore` (include la rotazione archivio eseguita: `.context/archive/decisions-2026-11-23.md` + live restart).
- Follow-up (issues.md): kit bug `record-id.ts` (prefisso `ev-`); token CJK in parity test; NEW-4/NEW-6; bug `plan-board.py:323`; doc-drift (#200 residui); churn catalogo MCP; lezione "comprehension-config nei set target".
- v1.3.0 release (#199) su main aggiornato.

## Archive

- Rotazione eseguita via subagent (autorizzazione utente esplicita): `.context/archive/decisions-2026-11-23.md` creato (26 bullet verbatim, parità 26→26 verificata), `.context/decisions.md` ripartito con header fresco; nessun altro file toccato, niente git. Nota cosmetica: entrambi i file LF (il layer strip-pa i CR; il contenuto è identico — nessun impatto: `.context/` è fuori scope prettier/sweep). Verdetto 5 pass / 1 fail cosmetico.
