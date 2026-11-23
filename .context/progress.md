# Progress

Snapshot dello stato corrente della sessione.

## Stack

- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React (`src/`, `docs-src/`); Bun + TypeScript; CI GitHub Actions. Ambient Windows: ~25 fail `bun test` noti (EPERM symlink, bash timeout, CRLF) e 56 file `format:check` noise — CI è la verità. Layer: orchestrator scrive SOLO session memory + comprehension record/telemetry (append-only), NON `plan/`, NON codice, NON `.context/archive/` (write negato); shell primaria negata (usare subagent per bun/*.script); `gh` negato; git mutanti solo su autorizzazione utente; board root assoluto `E:/MyProjects/opencode-orchestrator-kit/plan`.
- Code Graph CRG: refreshed a fine-review #205 (117 nodi/1,622 edge sulla working tree); catalogo MCP churna in-course (vedi issues.md).

## Current state

- **Pointer attivo**: Plan #200 (Code Mode adoption): **qa** — in attesa di merge utente PR → poi `move qa→complete` con verdetto comprehension `none` — vedi `plan/qa/200.md`.
- **Issue #205 CHIUSA**: card in `plan/complete/205.md` (comprehension `skipped`, outcome registrato via `move --outcome`; check 0 errori). Consegnato end-to-end: scoping utente (4 decisioni) → card (plan-writer) → P1 prompts/AGENTS/plan-README → P2 board tool `--outcome` V1+V2+schema → P3 pin (41 asserzioni, prove-it) → P4 docs/CHANGELOG/mirror → review round-1 REQUEST CHANGES (5 blocking) → fix round → **re-review round-2 APPROVE 0 blocking** → polish NEW-1/2/3/5 → suite finale 258 pass/0 fail (parity 16/16; shim forzato 15+1 skip visibile) → gate comprehension DEEP = SKIP utente esplicito → record `ev-20261123-125625-…` + riga telemetria SKIPPED → move complete. Budget: orchestrator 23,989/24,000, planner 5,383/5,400.
- **AZIONE UTENTE**: working tree con 22 file modificati + `plan/complete/205.md` nuovi — commit `chore`/`feat` a carico utente (branch+PR); nessun push da agenti.
- Azioni utente pendenti: merge PR #200 poi chiusura card; archivio `decisions.md` (soglia, write `archive/` negato); revoca `NPM_TOKEN`; verificare run CI skillspector su `2e60b19`.
- Nessun dispatch in flight.

## Next steps

- **#205**: apri branch+PR con le modifiche (titolo proposto: "Add automatic bounded lesson recall at planning time (#205)"); dopo review/merge, niente altre mosse board (card già complete).
- **#200**: apri/merger la PR; poi move qa→complete (`none`) via plan-writer.
- Follow-up (issues.md): kit bug `record-id.ts` (prefisso `ev-`); pulizia token CJK in parity test; NEW-4/NEW-6; bug `plan-board.py:323`; residui doc-drift; churn catalogo MCP.
- v1.3.0 release (#199) su main aggiornato.
