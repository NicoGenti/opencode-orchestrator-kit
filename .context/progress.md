# Progress

- 2026-10-20: repository reso self-contained per l'esecuzione agentica cloud (label `agent:run`).
  `plan/` e `.context/` sono ora versionati; le junction locali verso `../plan` e `../.context`
  sono state rimosse.
- 2026-10-20: issue #15 (`15-agent-smoke-aggiungi-agent-smoke-docs`) — creato `docs/AGENT-SMOKE.md`
  (riga esatta `smoke agentico: 2026-10-20`); verifica smoke `exit=0`; `bun test` 689 pass / 0 fail;
  piano spostato `draft -> qa` via `plan-board.py` (`--comprehension skipped`). Executor:
  developer-fixer (scrittura) + general (verifica comandi, poiche' test-engineer era bloccato da
  `permission.bash: ask` in run headless).
