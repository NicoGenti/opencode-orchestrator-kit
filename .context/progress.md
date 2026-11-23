# Progress

Snapshot dello stato corrente della sessione.

## Stack

- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React (`src/`, `docs-src/`); Bun + TypeScript; CI GitHub Actions. Ambient Windows: ~23 fail `bun test` noti + `format:check` noise CRLF (blob-LF è la verità). Orchestrator scrive SOLO session memory + comprehension record/telemetria; NON `plan/`, NON codice; board root `E:/MyProjects/opencode-orchestrator-kit/plan`.
- Code Graph CRG: refreshed ×2 in review #208.
- Repo evals: P1 committato (`c6069f5`, `506fb96`), NO push; sporco preesistente di terzi NON toccare.

## Lesson recall #208 (pointer, 2026-11-23)

- REJECT "TOON per prose" (#205). DR-6 prettier exclusions. Body staging SENZA FM (bug #201 — normalizzato su 208; fix tool in issues.md deferred). Verifiche `--check` su blob. Claim README = BPE cross-check. Edit `agents/orchestrator.md` → includere `comprehension-config` nei target.

## Issue #208 — stato

- Card `plan/in-progress/208.md`. P1 ✅ GATE ✅ P2 ✅ P3 ✅ review ✅ fix round ✅ **re-review APPROVE** (1400/23 ambient, tipo 71/0 target, frozen-lockfile OK) → **commit autorizzato utente: branch `feat/208-toon-plan-board-payloads` + 2 commit atomici (feat / chore card+memory), NO push, NO CHANGELOG (m5 PR-time)** → poi move qa → comprehension DEEP → complete.
- Follow-up in issues.md 2026-11-23: ermeticity test vs opt-in locale (16 call site); deferred: m4 prose agents, m5 CHANGELOG, dependabot /plugin entry, test encoder-unavailable, FIX tool new/FM.
- Contenuto change: dep @toon-format/toon@4.4.0 (plugin + root devDep), toon-config loader, branch serialize (default byte-identico, TOON opt-in), 261 line test, docs canoni, README, dependabot comment, mirror. Review APPROVE; invarianti intatte.

## Current state

- accepted=developer-fixer/208-kit-commit (in flight; riuso ses_df6ff672fffeDJglAOpQpJYouj). suppressed: commit diretto da orchestrator (layer negato + policy), commit evals (repo sporco di terzi NON toccare).
- Pendente utente: merge PR #200 (qa) e PR #205; push branch #208 + PR/CI quando vuole; opzioni deferred issues.md.
