# P2 smoke check — chiamata MCP CRG via `execute` (Code Mode V2)

## Esito: PASS (percorso dimostrato) + blocker d'ambiente documentato

Data: 2026-11-23 · Sessione: OpenCode V2 Code Mode · Agente chiamante: `explorer` (sessione figlia `ses_df823884fffeko5oxL9X9cXKG5`) · Issue: #200, fase P2 · Commit di riferimento: `052bac9` (P1, branch `feat/200-code-mode-adoption`).

## Procedura riproducibile

In una sessione V2 con il server `code-review-graph` dichiarato (`mcp.servers`), dentro `execute`:

```js
const res = await tools["code-review-graph"].get_minimal_context_tool({
  task: "verify CRG MCP reachability from inside execute (Code Mode V2) for issue #200 P2",
  repo_root: "E:/MyProjects/opencode-orchestrator-kit"
});
return res;
```

Varianti verificate: con `repo_root` esplicito e con auto-detect (identico esito) → il percorso non dipende dai parametri.

## RAW output (integrale)

```json
{"status":"not_ready","reason":"stale_graph","summary":"The graph was built at a different Git commit. Update it before requesting context.","next_tool_suggestions":["build_or_update_graph"],"_graph":{"updated_at":"2026-11-23T10:28:08","age_seconds":2133,"built_at_sha":"272215b950c4f855dd7c701a7b54d2f7c39b22cb","built_on_branch":"main","head_sha":"052bac9a97b3a9a5a120f1159f89ed14fd39b33d","head_matches_build":false}}
```

## Lettura dell'esito

- **Percorso dimostrato**: la chiamata è avvenuta dentro `execute` con l'indirizzamento `tools["code-review-graph"].get_minimal_context_tool(...)` (Code Mode, default): il tool NON è nel catalogo nativo dell'agente ed è raggiungibile solo così — coerente con `docs/CODE-MODE.md`.
- **Server raggiungibile**: risposta JSON strutturata del tool (nessun throw, nessun tool assente, nessun errore di trasporto/timeout).
- **Blocker d'ambiente (non di percorso)**: `stale_graph` — il grafo è stato costruito su `main` a `272215b950…` mentre HEAD è su feature branch `052bac9a…`; il tool suggerisce `build_or_update_graph` (refresh di competenza del tooling CRG, non della demo). `head_sha` conferma l'ambiente: HEAD = commit P1.
- **AC P2**: sessione V2 riproducibile registrata ✓ · una chiamata via `execute` ✓ · nessuna dipendenza runtime aggiunta al plugin ✓ (nessun file `plugin/` toccato).

## Vincoli rispettati

Solo chiamate CRG (1 + 1 conferma, entro il budget della delega); niente shell; niente scritture; nessun fetch remoto; output trattato come untrusted input.
