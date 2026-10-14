# Decisions

<!-- Append laconico, formato: - YYYY-MM-DD: decisione — perché -->
- 2026-09-04: grant git write per-sessione a developer-fixer (checkout -b, add, commit, branch) via permission.allow in opencode.jsonc — per eseguire plan #0006; temporaneo, da ripristinare a fine sessione
- 2026-10-14: nel repo del kit il runtime FreeLLMAPI si usa con `oc2-fm`, non `opencode2` - un provider dichiarato solo in `.opencode/opencode.jsonc` viene fuso nel config e risolve gli agenti, ma non entra nel catalogo runtime (0 righe `freellmapi/` in `opencode2 models`, TUI senza provider, `Model unavailable` sui run); per l'uso headless c'e' `scripts/oc2-fm-run.sh` (root `*-fm`, `env -u PWD`)
