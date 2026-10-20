# Progress

- 2026-10-20: repository reso self-contained per l'esecuzione agentica cloud (label `agent:run`).
  `plan/` e `.context/` sono ora versionati; le junction locali verso `../plan` e `../.context`
  sono state rimosse.
- 2026-10-20: piano 19 eseguito (issue #19): script `bun:audit` (`bun test && bun run lint`) in
  `package.json`, checklist `.opencode/ci-check.md` + test `tests/agent-smoke-bun-audit.test.ts`
  (RED → GREEN), eccezione mirata in `.gitignore` per committare solo `.opencode/ci-check.md`
  (il resto di `.opencode/` resta ignored, incluso `opencode.jsonc`). Verifiche: `bun run bun:audit`
  exit 0 con 692/692 test. Gate comprensione: skipped (esecuzione headless).
