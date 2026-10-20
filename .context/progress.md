# Progress

- 2026-10-20: repository reso self-contained per l'esecuzione agentica cloud (label `agent:run`).
  `plan/` e `.context/` sono ora versionati; le junction locali verso `../plan` e `../.context`
  sono state rimosse.
- 2026-10-20: piano #15 (agent smoke) completato — creato `docs/AGENT-SMOKE.md`
  (riga `smoke agentico: 2026-10-20`); verifica grep exit 0, `bun test` 689 pass / 0 fail.
  Piano spostato `draft/` → `qa/` (comprehension: skipped).
