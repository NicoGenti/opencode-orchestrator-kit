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
- 2026-10-23: piano 13 fase 3 eseguita (plan board nativa): nuovo `plugin/src/plan-board.ts`
  (port TypeScript pura di `scripts/plan-board.py`, zero dipendenze oltre a node:fs/node:path:
  libreria `runPlanBoard(argv)` — mai stdout/exit/throw — piu' CLI `bun plugin/src/plan-board.ts
  <check|move|new|adopt> [flag]` con guard `import.meta.main`; stessi payload JSON, codici,
  messaggi, ordine delle chiavi e formato human di `emit()`, stesse regole id=segmento iniziale
  dello stem / status=colonna / 9 sezioni / comprehension obbligatoria per `move -> complete`,
  preservazione CRLF e data di calendario locale) e nuovo tool nativo `plan_board`
  (`plugin/src/plan-board-tool.ts`, wired in `plugin/src/index.ts` step 7 via
  `ctx.tool.transform` con guard `ctx.tool?` -> degradazione silenziosa; descrizione che
  esplicita la standing authorization `plan-board-standing-v1` e gli exit 0/1; input JSON
  Schema con enum; `execute` -> `JSON.stringify(runPlanBoard(argv).payload, null, 2)`).
  Shim `@opencode/plugin` e stand-in runtime estesi in parallelo con `ToolInfo`, `ToolEditor` e
  `ctx.tool?`. Deviazioni documentate dal python: errori di argomento -> exit 1 (argparse
  darebbe 2, codici `bad-argument`/`missing-argument`), `missing-column` e `internal-error`
  invece del traceback; micro-deviazione nota: un `--root` non canonico (`./plan`, `x/`,
  `x/../y`) viene riecheggiato verbatim invece di normalizzato come `PurePath`. Disclosure:
  correzioni di revisione applicate dall'orchestratore sul port (la riga human di un `check`
  fallito stampava `FAIL <codice> ...` ed e' stata riallineata al `FAIL` byte-identico del
  python, test incluso; e due nit nel docstring di `index.ts` risolti con micro-dispatch).
  TDD: RED osservato 0/24 sul port (implementazione temporaneamente messa da parte) e 14
  fail/7 pass poi 21/21 sul tool (dispatch solo-test prima, implementazione poi) — i subagenti
  non avevano permesso shell, tutte le esecuzioni a carico dell'orchestratore. Test nuovi:
  `tests/plan-board-ts.test.ts` (24, sempre attivi, nessuna dipendenza da python),
  `tests/plugin-plan-board-tool.test.ts` (14) e `tests/plugin-skeleton.test.ts` (+1, mock
  `tool`). Parita' manuale python<->TS NON committata (i test di parita' sono fase 6):
  7 scenari su board gemelle (JSON + albero file + formato human) -> ALL EQUAL, e sulla board
  reale `check --root plan --json` byte-identico con exit 0 per entrambi. Verifiche
  (eseguite dall'orchestratore): `bun run typecheck` exit 0, `bun test` 780/780 (39 file),
  `bun run lint` exit 0; `git status` 4 modified + 4 new, senza lockfile ne'
  `.github/workflows/`. Board: `plan-board.py move --to qa` -> `already-in-column` (piano gia'
  in qa con `comprehension: skipped`), `check` ok (0 errori, 0 warning). Gate comprensione:
  skipped (esecuzione headless). Fasi 4+ non avviate (scope limitato alla fase 3).
