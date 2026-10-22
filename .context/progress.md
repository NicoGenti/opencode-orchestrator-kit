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
- 2026-10-22: piano 13 fase 1 eseguita (issue #13, scheletro del plugin OpenCode 2): nuovo
  pacchetto dedicato `plugin/` (`opencode-orchestrator-kit@0.7.0-alpha.1`, `type: module`,
  zero dipendenze installate) con `plugin/src/index.ts` → `Plugin.define` id stabile
  `opencode-orchestrator-kit` che in `setup(ctx)` registra il comando `start-session`
  (specchio di `command/start-session.md`) e le 9 skill da `plugin/assets/skills/`
  (parità byte con `command/` e `skills/`, garantita da `tests/plugin-assets-parity.test.ts`).
  Shim temporaneo `@opencode/plugin` (`plugin/types/opencode-plugin-shim.d.ts` + stand-in
  runtime `plugin/src/runtime/opencode-plugin.ts`): nessuna nuova dipendenza perché il
  vincolo runner vieta modifiche ai lockfile; sostituito con il peer dep reale in fase 6.
  `tsconfig.json` include `plugin/`; blocco eslint dedicato in `eslint.config.js`.
  Test: `tests/plugin-skeleton.test.ts` + `tests/plugin-assets-parity.test.ts` (8 asserzioni
  nuove, RED osservato sulla parity). Verifiche: `bun run typecheck` exit 0, `bun test`
  710/710, `bun run lint` exit 0; `git status` mostra solo `eslint.config.js`, `tsconfig.json`,
  `plugin/`, 2 nuovi test. Board: `plan-board.py move --to qa` rifiutato `already-in-column`
  (il piano era gia' in qa, `comprehension: skipped`), `check` ok. Gate comprensione: skipped
  (esecuzione headless). Fasi 2+ non avviate (scope limitato alla fase 1).
