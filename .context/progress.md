# Progress

Snapshot dello stato corrente della sessione.

## Stack

- Kit Markdown multi-agent per OpenCode 2 (plugin `plugin/`); sito Vite/React (`src/`, `docs-src/`); Bun + TypeScript; CI GitHub Actions.
- Board: solo via python CLI + prova fisica in questo ambiente.

## Stato: v1.2.3 PUBBLICATA (2026-11-19)

- `opencode-orchestrator-kit@1.2.3` su npm (OIDC + provenance, environment `npm` approvato dall'utente). Run #10: gate branch-first → quality gates → tag↔version → npm≥11.5.1 → publish → GitHub Release automatica da sezione `[1.2.3]` CHANGELOG.
- Tag `v1.2.3` annotato su `release/v1.2.3` @ `3e54f1f` (push approvato; deploy.yml Pages trigger `release/v*` OK).
- PR mergiate: #193 (OIDC/#178), #194 (branch-first + Release automatica). R1 su entrambe (code-reviewer REQUEST CHANGES → fix → APPROVE; oracle/security APPROVE con F1 implementato, F2 = branch protection wildcard a carico utente).
- 12 issue Snyk path-traversal (#143–#150, #155–#158) chiuse con evidenza post-decisione utente; 12 alert dismissi false positive (run #65; Snyk non modella il guard custom). 8 ulteriori Security* below-high (#181,182,183,185,188,189,191,192) chiuse il 2026-11-19 su autorizzazione esplicita utente.
- Plan `179` (release cycle): tutte le fasi eseguite (H1–H5, S1, P1, R1, P2, C1, C2). Card ancora in `plan/in-progress/179.md` — da muovere a qa/complete a chiusura formale (utente).

## Next steps (utente)

- Decidere chiusura #178 (publish OIDC verificato; manca solo revoca `NPM_TOKEN`, passo umano) e chiusura epic #179.
- Revocare `NPM_TOKEN` (secret GitHub) dopo verifica registry.
- Branch protection wildcard `release/v*` (oracle F2).
- PR severity-filter ancora NON aperta: branch `chore/179-security-alert-severity-filter` (7b732c6, pushato), body in temp
- Board: card 179 → qa/complete dopo comprehension gate / decisione utente; merge-back `release/v1.2.3`→main deliberatamente fuori ciclo.
- Comprehension gate (DEEP) non eseguito in sessione; oracle/code-reviewer usati come review tecniche, non come comprehension.
- `release/v1.2.2` mantenuto per decisione utente; worktree `release-v1.2.3-baseline` rimosso; worktree release in `%TEMP%\opencode\release-v1.2.3`.

## Baseline / note

- Fail-set `bun test` invariato (20 fail, ambiente Windows); `version-sync` CRLF rientrato con la normalizzazione CHANGELOG a LF.
- `gh` negato in sessione: PR/issue aperte via browser (#193, #194, chiusure issue); gh refusal del push in subagent senza approvazione in-band esplicita.
- Archive: dettagli storici in `.context/archive/issues-2026-11-19.md`.
