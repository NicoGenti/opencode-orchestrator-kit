# Progress

Snapshot dello stato corrente della sessione.

## Stack

- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React (`src/`, `docs-src/`); Bun + TypeScript; CI GitHub Actions. Ambient Windows: ~23 fail `bun test` noti + `format:check` noise CRLF (blob-LF è la verità). Orchestrator scrive SOLO session memory + comprehension record/telemetria; NON `plan/`, NON codice; board root `E:/MyProjects/opencode-orchestrator-kit/plan`.
- Code Graph CRG: presente (base `0861e44`).
- Repo evals: bench TOON committato in locale (`c6069f5`, `506fb96` su main — NON pushato; il push evals non è mai stato richiesto); sporco preesistente di terzi NON toccare.

## Lesson recall (pointer, 2026-11-23)

- "TOON per prose" REJECT (#205). DR-6 prettier exclusions. Body staging SENZA FM (bug #201; fix tool in issues.md deferred). Verifiche `--check` su blob-LF. Claim README = BPE cross-check (euristica soprastima). Edit `agents/orchestrator.md` → includere `comprehension-config` nei target. Shell scanner: evitare body commit con caratteri non-ASCII (fai riprova con body ASCII).

## Issue #208 — COMPLETATA E PUSHATA

- Branch `feat/208-toon-plan-board-payloads` pushata su origin (`origin/…` con tracking), 3 commit: `751299d` feat (TOON opt-in: dep 4.4.0 plugin+root, toon-config loader, branch tool, test, docs, README, dependabot), `886cf6f` chore (card in-progress + session memory), `1c427e4` chore close-out (record comprehension ev-…ad55, decisions/progress, rename card `in-progress→complete` R098, comprehension `skipped` + outcome). Ancestry esatto da `0861e44`; working tree kit PULITO.
- Board: `plan/complete/208.md` (`comprehension: skipped`, outcome registrato); check 0 errori.
- Review APPROVE (fix round M1/M2 + 6 minor); test: 71/0 target, 1400/23 ambient; frozen-lockfile OK.
- PR da aprire (utente): https://github.com/NicoGenti/opencode-orchestrator-kit/pull/new/feat/208-toon-plan-board-payloads — la CI gira sul PR; verificare verde su `1c427e4`.

## Follow-up aperti (issues.md, NON in lavorazione)

- Ermeticità suite vs opt-in locale (16 call site JSON.parse; fix chdir ×3 o nota docs); m4 prose `agents/plan-writer.md:89` (+ char table stesso commit); m5 CHANGELOG `[Unreleased]` (PR-time); dependabot entry `/plugin`; test `encoder-unavailable` (mock.module); FIX tool `plan_board new` strip/reject FM staging.

## Azioni utente pendenti

- Apri la PR dal link, verifica CI verde, mergi. (Se la CI rientra rossa: dispatch deploy-helper/fix round come sempre.)
- Merge PR #205 (`feat/205-lesson-recall`) se non fatto; merge PR #200 (Code Mode) → poi move qa→complete `none` (plan-writer).
- Push evals `main` (`c6069f5`, `506fb96`) se/quando lo vuoi; commit del working evals sporco di terzi (tu).
- Deferred opzionali (le decidiamo quando vuoi).
