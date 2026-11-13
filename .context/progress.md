# Progress

Stato corrente della sessione. Storia dei piani completati: `git log`, `plan/complete/`, `plan/qa/`.

## Chiuso: piano 0004 (issue #120) — cache-aware prompt design

- Board: `plan/complete/0004.md` (status complete, comprehension: pass). Branch:
  `feat/issue-120-cache-stable-prompts`, 4 commit (80450c0, 3b0baab, 62a25d2 + close in corso dal
  fixer). PR verso main: aperta dopo il commit di chiusura (URL in chat/GitHub).
- Contenuto: contratto di delega esplicito — `agents/orchestrator.md:248` (Scope "name the relevant
  file paths explicitly") e `:250` (Inputs Available "relevant symbols to inspect, as `path:line`
  identifiers"); `agents/orchestrator-quick.md:74` (Inputs = file paths + symbols); README
  `## Cache-aware prompt design` (regola stabile/variabile + esempio verbatim developer-fixer vs
  dispatch variabile + meccanica prefix-cache); CONTRIBUTING 1 riga cross-link in `### Boundary`.
  Mirror `plugin/assets` rigenerato (parity verde).
- Garanzie: scope audit 6 file (2 agenti + 2 mirror + README + CONTRIBUTING); frontmatter, permessi,
  `{{TIER_*}}`, fixture `prompt-prefix-boundary.txt` intatti; cap budget 22.408/24.000 e
  3.784/4.200 (CRLF-normalized); nessun refactor ad altri agent/extras (audit: 18 file già conformi
  ai 5 requisiti della issue).
- Verifiche: fase 4 = 6/6 gate — sync-assets --check 0; `bun test` 1099 pass / 13 fail (baseline
  ambientale esatta, zeri nuovi); typecheck/lint 0; format:check 6 file ambient (0 nuovi, README
  content-clean: solo endOfLine vs CRLF checkout); board check 0 errori. code-reviewer fase 5 PASS
  senza findings.
- Comprehension: LIGHT → 2 domande CHALLENGE; verdict coach PASS DCI 4/4 evaluator_conf 5;
  user_conf 2 (telemetria 2026-11-13T09:15:28Z; record
  `ev-20261113-091521-d85f492eddf75357463b66d4316a0352`). HUMAN_OWNED: PASS.
- Follow-up aperti in `.context/issues.md`: baseline format drift (9→6 file), dangle
  `.context/plan-body-0004.md` (rm negato dal permission layer, cleanup manuale), tool-root nativo
  inaffidabile reconfirmato ×2 (board-op SOLO via python CLI + prova fisica).
- Warn configurazione: `.opencode/comprehension.config.json` assente → default built-in LIGHT.
- Da fare dopo questa riga: commit di chiusura (card complete + memoria sessione + record) e PR —
  in corso dal fixer.
