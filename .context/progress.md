# Progress

- 2026-10-20: repository reso self-contained per l'esecuzione agentica cloud (label `agent:run`).
  `plan/` e `.context/` sono ora versionati; le junction locali verso `../plan` e `../.context`
  sono state rimosse.
- 2026-10-20: piano 19 eseguito (issue #19): script `bun:audit` (`bun test && bun run lint`) in
  `package.json`, checklist `.opencode/ci-check.md` + test `tests/agent-smoke-bun-audit.test.ts`
  (RED → GREEN), eccezione mirata in `.gitignore` per committare solo `.opencode/ci-check.md`
  (il resto di `.opencode/` resta ignored, incluso `opencode.jsonc`). Verifiche: `bun run bun:audit`
  exit 0 con 692/692 test. Gate comprensione: skipped (esecuzione headless).
- 2026-10-21: piano 27 eseguito (issue #27): audit tool usage del runner headless `agent:run`
  sui run 39568623813 e 39438069017 (issue #19) — 6 tool eseguiti (`read`, `edit`, `glob`, `grep`,
  `shell`, `subagent`), `question`/`skill`/`webfetch`/`write` mai usati; rifiuti `shell` causati da
  frontmatter subagent `bash: ask` in headless, non da `OPENCODE_PERMISSION`. Deliverable:
  `docs/AGENT-ISSUE-PERMISSIONS.md` (128 righe) con `OPENCODE_PERMISSION` minimo consigliato +
  fallback flat, rischio residuo reale (`GH_TOKEN`/`OPENCODE_API_KEY` a livello job) e follow-up
  umani (PR su `.github/workflows/agent-issue.yml`, smoke test). Nessuna modifica a workflow.
  Piano spostato in `plan/qa/`. Gate comprensione: skipped (esecuzione headless).
