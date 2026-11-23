# Progress

Snapshot dello stato corrente della sessione.

## Stack

- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React (`src/`, `docs-src/`); Bun + TypeScript; CI GitHub Actions. Ambient Windows: ~25 fail `bun test` noti (EPERM symlink, bash timeout, CRLF version-sync/format-check) — CI è la verità. Layer: orchestrator NON crea nuovi file in `.context/` né usa shell pipe **né scrive in `.context/archive/`** (denied anche al close-out 2026-11-23); `gh` negato (PR apre l'utente); git base mutanti in sessione primaria solo su autorizzazione utente.
- Code Graph CRG: fresh a `a127541` (incrementale, discharge completo). ATTENZIONE ambient: il catalogo del server churna in-course (surface a 4 tool vs `get_minimal_context_tool`; vedi issues.md riga churn).
- Board root: sempre assoluto `E:/MyProjects/opencode-orchestrator-kit/plan`.

## Current state

- **PR #200 pronta per merge (apertura a carico utente)**: branch `feat/200-code-mode-adoption` pushed (`a127541`), commit: `052bac9` P1 docs, `baafe9d` P4 policy, `90963d4` fix review, `a127541` chore (board + evidenze). Titolo/descrizione PR proposti all'utente nel chat (EN, `Closes #200`).
  - URL apertura PR: https://github.com/NicoGenti/opencode-orchestrator-kit/pull/new/feat/200-code-mode-adoption
  - **Pointer attivo**: Plan #200 (Code Mode adoption): **qa** — in attesa di merge utente → poi `move qa→complete` con verdetto comprehension `none` — vedi `plan/qa/200.md`.
- Comprehension #200: **NONE (annunciata)** (docs-only; nessun coach, nessun log/record).
- Working tree (non committati, per prassi `chore` a parte dell'utente): `.context/progress|decisions|issues` modificati; ATTESA AZIONE UTENTE: `decisions.md` è sopra soglia archivio e il write in `.context/archive/` è NEGATO dal layer (`Permission denied: edit` — verbatim nel chat); serve azione umana o sessione con permessi su `.context/archive/`.
- Nessun dispatch in flight.

## Done (questa sessione)

- Bootstrap + chiusura pendente #201: card `plan/qa/201.md` → `plan/complete/` (ok:true, `none`).
- **#200 end-to-end**: scoping utente (tutte fasi P1–P4; follow-up fuori #199) → card (new+move, plan-writer) → risposta upstream `librarian` (gap 3: `codemode` valido in AMBO i superfici: config `mcp.servers` e plugin registration; fonti opencode.ai verificate 2026-11-23) → **P1** `052bac9` (`docs/CODE-MODE.md` canonical + pointer README/QUICKSTART + mirror) → **P2** smoke: chiamata CRG via `execute` in sessione V2 (evidenze + `.context/code-mode-smoke-report.md`) → **P4** `baafe9d` (policy + claim corretto con tipi `*Encoded` + stance `lite`×CRG = nessuna interazione) → **P3** A/B lean (grafo fresh via `code-reviewer`, 3 task × 1 run/config): T1 −21% ✓, T2 +9% ✗, T3 +29% ✗; native 64==64, `exec_inv` 7→9, findings 15/15 equivalenti → **REJECT con dati** (variante preservata in `.context/p3-code-mode-first-variant.md`, re-test rinviable) → review: REQUEST CHANGES (F1 blocking dot-form) → fix `90963d4` (F1–F4) → **re-review APPROVE** → board tidy + move qa → chore `a127541` + push → grafo re-fresh (discharge).
- Titolo+descrizione PR proposti in chat.
- Residui doc-drift loggati in issues.md; riga churn catalogo MCP/skill loggata in issues.md.

## Next steps

- **Plan #200 (Code Mode adoption): qa — apri/merger la PR; dopo il merge: move qa→complete con verdetto `none` (plan-writer)** — punta `plan/qa/200.md`.
- Azione utente `.context`: committa session memory (progress/decisions/issues) come `chore` a parte; archivio `decisions.md` negato dal layer (vedi Current state).
- Verificare run CI su `2e60b19`/main (job `skillspector baseline gate`) — ancora da confermare in-sessione.
- v1.3.0 release (#199) su main aggiornato.
- Follow-up (issues.md): bug `plan-board.py:323`; opzione D `skillspector mcp` (`security`); residui #203; required check `skillspector baseline gate` (branch protection, umano); doc-drift budget table/sito roster; churn catalogo MCP.
- Housekeeping: drop stash, `rm .context/plan-body-198-option-c.md` (orfano), revoca `NPM_TOKEN`, ri-prova archivio `.context/archive/`.
