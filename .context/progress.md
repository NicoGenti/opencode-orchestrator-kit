# Progress

Snapshot dello stato corrente della sessione.

## Stack

- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React (`src/`, `docs-src/`); Bun + TypeScript; CI GitHub Actions. Ambient Windows: ~23 fail `bun test` noti + `format:check` noise CRLF (blob-LF è la verità). Orchestrator scrive SOLO session memory + comprehension record/telemetria; NON `plan/`, NON codice; board root `E:/MyProjects/opencode-orchestrator-kit/plan`.
- Code Graph CRG: presente (base `0861e44`).
- Repo evals: bench committato (`c6069f5`, `506fb96` su main locale), NO push per ora (utente non lo ha ancora chiesto); sporco preesistente di terzi NON toccare.

## Lesson recall (pointer, 2026-11-23)

- "TOON per prose" REJECT (#205). DR-6 prettier exclusions. Body staging SENZA FM (bug #201). Verifiche `--check` su blob. Claim README = BPE cross-check.

## Issue #208 — COMPLETATA (board)

- Card `plan/complete/208.md` (comprehension `skipped`, outcome registrato, ok:true). Review APPROVE; 71/0 target; 1400/23 ambient. Branch `feat/208-toon-plan-board-payloads`: `751299d` feat + `886cf6f` chore(in-progress) già committati a `0861e44`.
- **Rimane nel working tree (da committare ora, autorizzato utente)**: `.context/decisions.md`+`issues.md`+`progress.md` mod; `.context/comprehension/ev-20261123-161125-1af3ba5724c24c1a81395182f445ad55.md` untracked (committare, precedent #205: record nel chore); `plan/complete/208.md` moved da qa (staging rename: qa deleta + complete aggiunta); `comprehension-log.md` GITIGNORED — non toccare.
- Autorizzazione git utente (per azione): chore commit di chiusura + `git push -u origin feat/208-toon-plan-board-payloads`. NO CHANGELOG (m5 PR-time), nessun altro file, niente repo evals.

## Follow-up aperti (issues.md 2026-11-23, NON in lavorazione)

- Ermeticità suite vs opt-in locale (16 call site); m4 prose agents/plan-writer (+char table); m5 CHANGELOG PR-time; dependabot entry `/plugin`; test `encoder-unavailable` (mock.module); FIX tool `plan_board new` strip/reject FM.

## Current state

- accepted=developer-fixer/208-kit-push (in flight; riuso ses_df6ff672fffeDJglAOpQpJYouj). suppressed: orchestrator git diretto (delega anche se layer permetterebbe).
- Dopo push: PR link utente; CI da verificare; deferred come sopra.
