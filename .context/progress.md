# Progress

Snapshot dello stato corrente della sessione (chiusura 2026-11-23).

## Stack

- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React (`src/`, `docs-src/`); Bun + TypeScript; CI GitHub Actions. Ambient Windows: ~23 fail `bun test` noti + `format:check` noise CRLF (blob-LF è la verità; CI è la verità finale). Orchestrator scrive SOLO session memory + comprehension record/telemetria; NON `plan/`, NON codice; board root `E:/MyProjects/opencode-orchestrator-kit/plan`.
- Code Graph CRG: presente (refresh più recente: review #208, base `0861e44`).
- Repo evals (`E:\MyProjects\opencode-orchestrator-kit-evals`): bench TOON `c6069f5`+`506fb96` su main LOCALE, NON pushato; sporco preesistente di terzi NON toccare.

## Lesson recall (pointer, 2026-11-23)

- "TOON per prose" REJECT (#205, archivio): non riusaminare; solo payload strutturati. DR-6 prettier exclusions. Body di staging `plan_board new` SENZA frontmatter (kit bug #201; fix tool in issues.md deferred). Verifiche equivalenti-CI sempre `--check` su blob-LF. Claim token README = cross-check BPE reale (euristica `chars/4` soprastima TOON ~3.07 vs 3.66 char/tok). Edit `agents/orchestrator.md` → includere `comprehension-config` nei target. Commit body SOLO ASCII (scanner shell rifiuta non-ASCII → invalid-structure).

## Done (questa sessione)

- **Issue #208 (TOON opt-in) COMPLETA E MERGIATA**: plan card `plan/complete/208.md` (comprehension `skipped`, outcome registrato) — lifecycle completo: explorer → 5 decisioni scoping utente → planner → card → normalize FM → in-progress → P1 bench evals (26.3% BPE / 38.1% euristica / 61.3% vs pretty su snapshot 21-card; round-trip 100%) → GATE utente PASS (≥10%) → P2/P3 (dep runtime `@toon-format/toon@4.4.0` + toon-config loader + branch tool default byte-identico + docs canoni + README + dependabot) → review APPROVE dopo fix round (M1 root anchoring `[root,"."]`, M2 segnali degrado) → re-review APPROVE → commit `751299d`+`886cf6f`+`1c427e4` su `feat/208-toon-plan-board-payloads` → push → **PR mergiata dall'utente; branch remote+locali eliminati; main local aggiornata** (per report utente, fine sessione).
- Comprehension DEEP: SKIPPED (utente esplicito durante CHALLENGE; record `ev-20261123-161125-1af3ba5724c24c1a81395182f445ad55` committato nel chore; telemetria 2 righe sessione → log row 16:19:14Z).
- Session memory aggiornata a ogni passo (decisions 3 entry, issues 2 entry new follow-ups, progress snapshot).

## Current state

- Nessun dispatch in flight; working tree kit ha SOLO `M .context/progress.md` (questo snapshot, da commit chore utente).
- Board: 208 complete ✔; residuali warning missing-comprehension pre-esistenti: `qa/0001-design-first-bootstrap`, `qa/200` (fuori scope, valutare al loro giro).

## Next steps

- Plan #200 (Code Mode adoption): qa — mergiare PR utente, poi `move qa→complete` comprehension `none` (plan-writer) — vedi `plan/qa/200.md`.
- Plan #205 (lesson recall): aprire/mergiare PR `feat/205-lesson-recall` (link in `plan/complete/205.md`), confermare CI verde su `3f4b4c7` se non già fatto.
- Push repo evals `main` (`c6069f5`+`506fb96`) e commit del worktree sporco evals di terzi — azioni utente su richiesta.
- Follow-up #208 in issues.md (NON in lavorazione): ermeticità suite vs opt-in locale (16 call site); m4 prose `agents/plan-writer.md` + char table; m5 CHANGELOG `[Unreleased]` PR-time (PR #208 mergiata SENZA bullet: valutare aggiungerlo in main col prossimo cut); dependabot entry `/plugin`; test `encoder-unavailable` (mock.module); FIX tool `plan_board new` strip/reject FM staging.
- Commit chore della session memory di chiusura (questo file) al prossimo avvio o a mano.
