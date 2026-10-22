# Progress

- 2026-10-20: repository reso self-contained per l'esecuzione agentica cloud (label `agent:run`).
  `plan/` e `.context/` sono ora versionati; le junction locali verso `../plan` e `../.context`
  sono state rimosse.
- 2026-10-20: piano 19 eseguito (issue #19): script `bun:audit` (`bun test && bun run lint`) in
  `package.json`, checklist `.opencode/ci-check.md` + test `tests/agent-smoke-bun-audit.test.ts`
  (RED → GREEN), eccezione mirata in `.gitignore` per committare solo `.opencode/ci-check.md`
  (il resto di `.opencode/` resta ignored, incluso `opencode.jsonc`). Verifiche: `bun run bun:audit`
  exit 0 con 692/692 test. Gate comprensione: skipped (esecuzione headless).
- 2026-10-22: piano 13 fase 0 eseguito (issue #13, spike di fattibilità migrazione a plugin
  OpenCode 2): nota scritta in `docs/PLUGIN-V2-FEASIBILITY.md`. Esito: migrazione fattibile; un
  plugin PUÒ registrare agenti via `ctx.agent.transform` + `editor.update` (upsert, non documentato
  ma verificato su `packages/core/src/agent.ts` e usato dal plugin built-in `opencode.agent`);
  fallback copia in `.opencode/agents/` tenuto come sicurezza commutabile. Runner: OpenCode
  v2.0.32, kit attuale gira non modificato (`install.sh project` exit 0, agenti tutti visibili con
  `opencode debug agents` e selezionabili con `--agent`). Rinvenuti riferimenti stale a
  `scripts/oc2-fm-run.sh` / `scripts/setup-oc2-fm-profile.sh` (inesistenti). Verifiche:
  `bun run typecheck` exit 0, `bun test` 702/702, `bun run lint` exit 0. Piano spostato
  draft → qa con `plan-board.py move --comprehension skipped`. Gate comprensione: skipped
  (esecuzione headless).
