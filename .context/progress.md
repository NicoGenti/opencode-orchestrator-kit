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
- 2026-10-23: piano 13 fase 2 eseguita (issue #13, agenti e tier): nuovo `plugin/src/tiers.ts`
  (5 tier TIER_ROUTER/REASONING/CODE/FAST/REVIEW, fallback one-hop ROUTER→REASONING e
  REVIEW→CODE, preset bundlati con parity test vs `templates/models.config.json` e cross-check
  vs `resolvePreset` di `scripts/resolve-model-preset.ts`, `TierConfigError` con messaggio
  chiaro per preset sconosciuto / tier required mancante / token irrisolto / valore
  `placeholder/*`; modelli non disponibili in `ctx.model.list()` segnalati con `console.warn`
  prefissato `[opencode-orchestrator-kit]`, non fatali; registro vuoto → un solo warning) e
  `plugin/src/agents.ts` (parser frontmatter description/mode/model inline o `>-`,
  `parseModelRef` → oggetto Model.Ref `{providerID, id, variant?}`). Registrazione agenti via
  `ctx.agent.transform` + `editor.update` (upsert) con guard `editor.get(id)` (config utente
  vince), `mode` sempre impostato esplicito (orchestrator unico `primary` su 15/17, mai
  chiamato `editor.default()`), `system` = body del file senza frontmatter. Asset nuovi:
  `plugin/assets/agents/` (15 copie byte-identiche) + `plugin/assets/extras/` (2, attivate da
  `withExtras: true`). Shim `@opencode/plugin` esteso in parallelo (`ctx.options`,
  `ctx.model.list`, `ctx.agent.transform` con AgentEditor/AgentInfo) sia nello stand-in
  runtime sia nell'ambient `plugin/types/`. Test: nuovi `tests/plugin-tiers.test.ts` (19) e
  `tests/plugin-agents.test.ts` (10) con RED osservato, estesi `tests/plugin-assets-parity.test.ts`
  (albero = 1 comando + 9 skill + 15 agenti + 2 extras, byte-parity) e `tests/plugin-skeleton.test.ts`;
  allow-line di `tests/comprehension-config.test.ts` estesa alla copia byte-identica
  (`plugin/assets/agents/orchestrator.md`, stessa riga sanzionata — unica modifica fuori
  spec, causata dalla fase 2 e segnalata dall'executor). Verifiche (eseguite dall'orchestratore):
  `bun run typecheck` exit 0, `bun test` 741/741 (37 file), `bun run lint` exit 0; `git status`
  senza lockfile né `.github/workflows/`. Riconciliazione: il piano dice "16 agenti", repo
  reale 15 (+2 extras) → registrati 15 di default / 17 con extras. Gate comprensione: skipped
  (esecuzione headless). Fasi 3+ non avviate (scope limitato alla fase 2).
