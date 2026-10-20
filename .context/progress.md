# Progress

- 2026-10-20: repository reso self-contained per l'esecuzione agentica cloud (label `agent:run`).
  `plan/` e `.context/` sono ora versionati; le junction locali verso `../plan` e `../.context`
  sono state rimosse.
- 2026-10-20: piano 19 eseguito (issue #19): script `bun:audit` (`bun test && bun run lint`) in
  `package.json`, checklist `.opencode/ci-check.md` + test `tests/agent-smoke-bun-audit.test.ts`
  (RED → GREEN), eccezione mirata in `.gitignore` per committare solo `.opencode/ci-check.md`
  (il resto di `.opencode/` resta ignored, incluso `opencode.jsonc`). Verifiche: `bun run bun:audit`
  exit 0 con 692/692 test. Gate comprensione: skipped (esecuzione headless).
- 2026-10-20: riesecuzione headless dell'issue #19 (stato già implementato dal commit b4362f2):
  nessuna modifica al codice (YAGNI); verifica soltanto, 7/7 PASS — `bun:audit` presente,
  `.opencode/ci-check.md` conforme, `bun test` 692/692, lint e `bun run bun:audit` exit 0,
  tree pulito. Piano gia' in `qa` (plan-board.py: already-in-column), comprehension: skipped.
