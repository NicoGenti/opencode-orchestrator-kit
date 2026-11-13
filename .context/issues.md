# Issues

- Nessuna issue aperta.
- 2026-11-12: `bun run format:check` è rosso su ogni checkout Windows con `core.autocrlf=true` per 9 file LF
  (`index.docs.html`, `package.json`, `plugin/src/comprehension.ts`, `README.md`, `src/styles.css`,
  `tests/assemble-prompt.test.ts`, `tests/no-github-automation.test.ts`, `tests/plugin-tiers.test.ts`,
  `tests/workflow-hardening.test.ts`): i blob committati sono già LF, `prettier --write` non produce diff.
  Fix locale temporaneo applicato 2026-11-12. Rimedio candidato (fuori scope #121): `.gitattributes`
  con `* text=auto eol=lf`.
- 2026-11-12: baseline ambientale Windows per `bun test`: 13 fail non-regressivi (symlink EPERM in
  `assemble-prompt.test.ts`; script POSIX con exit 127 in `installer-flags`, `installer-freellmapi`,
  `installer-model-resolution`, `ollama-preset`, `freellmapi-preset`, `opencode-go-free-preset`).
  Le fasi del piano 0003 devono chiudere con fail-set ⊆ questa baseline (zero fail nuovi).
- 2026-11-12 (piano 0003): TOOL-ROOT ANOMALIA — `plan_board` nativo con `root` RELATIVO (`plan`) risolve
  su una working directory esterna al repo: il `check` elenca piani inesistenti qui (`2.md`,
  `issue-7-tui-native-jsx.md`, `auto-start-ui-server.md`) e con un `0003` in qa lì. Con root ASSOLUTO il
  check è corretto (verificato: in-progress `0002`; qa `0001`, `0003`, `13`; complete vuota). Regola
  operativa: passare SEMPRE il root assoluto alle board-op in questo ambiente. Side-effect probabile: una
  card 0003 creata/mossa dai primi call nativi su quella board esterna (fuori dal filesystem locale?) —
  cleanup manuale dell'utente; il tool per contratto non ha delete.
- 2026-11-12 (piano 0003, review follow-up — pre-esistenti, NON corretti): F7 plan-writer staging-path
  dangle (`.opencode/tmp/plan-body-<id>.md` materializzato dal CONTENT dispatch ma allowlist bash copre
  solo `rm .context/plan-body-*.md`); developer-fixer rimanda a `question` (i subagenti non hanno
  interlocutore, orchestrator.md:79); planner passo 2 ancora spelling V1 `via \`task\``; CHANGELOG
  storico dice ancora "four commands" (righe 53/64, append-only, intoccabile qui).
- 2026-11-13 (piano 0004): baseline `format:check` DRIFTATA rispetto alla nota 2026-11-12 (9 file):
  ora 6 file — `plugin/src/index.ts`, `plugin/src/runtime/opencode-plugin.ts`, `QUICKSTART.md`,
  `README.md`, `src/components/landing/LandingPage.tsx`, `tests/plan-writer-contract.test.ts`;
  overlap col vecchio set: solo README.md. Tutti content-clean: falliscono SOLO su `endOfLine: lf`
  vs checkout CRLF (prova: `prettier --check --end-of-line crlf` → exit 0 su tutti; blob committati
  LF-puliti via git cat-file). I 5 nuovi derivano da commit 0003 (e2930e7/c357d0a) sul base del
  branch — NON regressioni di #120. Questa riga sostituisce il vecchio set di riferimento; rimedio
  candidato invariato: `.gitattributes` con `* text=auto eol=lf`.
- 2026-11-13 (piano 0004): DANGLE `.context/plan-body-0004.md` — il body di staging resta su disco
  con la card già a complete: ogni `rm`/`del`/`Remove-Item` è negato dal permission layer (anche
  all'orchestrator e ai subagenti); file UNTRACKED, non entra nei commit. Cleanup: cancellazione
  manuale utente; rimedio candidato permanente: `.gitignore` per `.context/plan-body-*.md`
  (staging bodies non sono session memory, AGENTS.md board-contract).
- 2026-11-13 (piano 0004): TOOL-ROOT reconfirm ×2 — due dispatch plan-writer consecutivi via
  `plan_board` NATIVO (con root assoluto istruito) hanno riportato ok:true ma la card non è mai
  comparsa nel repo; payload con slug di fantasia ("sample-qa-1" ecc.) non corrispondenti ai file
  reali. Con il fallback python CLI ogni op ha corrisposto alla prova fisica. La regola della nota
  2026-11-12 resta: in questo ambiente la regola è SOLO python CLI + prova fisica per ogni op.
- 2026-11-13 (piano 0005): BUG SCRIPT BOARD — `scripts/plan-board.py:66` applica `v.split("#")[0].strip()`
  ai valori frontmatter: un `#` dentro il valore viene trattato come commento inline e il valore viene
  TRONCATO al re-render di ogni `move` (new scrive il valore grezzo, move lo riemette). Preesistente:
  aveva già troncato `plan/complete/0004.md` ("Cache-aware prompt design (" ); su 0005 ha troncato il
  title alla prima mossa (dopo new il file in draft era integro). Fix user-only (parser consapevole dei
  commenti solo dopo spazio); qualunque title con `#` va ri-troncato: usare titoli senza `#` (0005
  normalizzato via Mutation Summary approvata). Warning `missing-comprehension` su qa/0005 atteso e
  risolto al move a complete con `--comprehension skipped`.
- 2026-11-13 (piano 0005): DANGLE doppio `.context/plan-body-0004.md` + `.context/plan-body-0005.md` —
  idem nota 0004: rm/del negati dal permission layer anche a orchestrator e subagenti; UNTRACKED, non
  entrano nei commit; cleanup manuale utente; rimedio candidato permanente invariato: `.gitignore` per
  `.context/plan-body-*.md`.
- 2026-11-13 (piano 0007): BASELINE AMBIENTALE DRIFTATA pre-sessione (batch checkout 11:35:45Z, mtime
  file pre-esistenti alla sessione): `bun test` 14 fail (ex 13: nuovo `tests/version-sync.test.ts:39` —
  working copy CRLF di `CHANGELOG.md` fa fallire il pin `startsWith("# Changelog\n")`, blob e status
  invariati, solo `core.autocrlf=true`); `format:check` 10 file (ex 6: stesso criterio `endOfLine: lf`
  su working-copy CRLF, set pre-sessione). Typecheck/lint 0 invariati. Baseline corrente per il piano
- 2026-11-13 (piano 0007): BASELINE AMBIENTALE DRIFTATA pre-sessione (batch checkout 11:35:45Z, mtime
  file pre-esistenti alla sessione): `bun test` 14 fail (ex 13: nuovo `tests/version-sync.test.ts:39` —
  working copy CRLF di `CHANGELOG.md` fa fallire il pin `startsWith("# Changelog\n")`, blob e status
  invariati, solo `core.autocrlf=true`); `format:check` 10 file (ex 6: stesso criterio `endOfLine: lf`
  su working-copy CRLF, set pre-sessione). Typecheck/lint 0 invariati. Baseline corrente per il piano
  0007 = 14 / 0 / 0 / 10 (set fallimenti invariato ⇒ non regressiva; il conteggio precedente era 13/0/0/6).

- 2026-11-13 (piano 0008 / issue #151): due artefatti sessione orfani da cleanup manuale — record comprehension `ev-20261113-142509-75ee5dc9fedb2df1f4c56a7a7e771957.md` con id non emesso dallo script (emitter produce solo `res-`), e due righe telemetria (14:25:51Z e 14:26:16Z) per lo stesso evaluation a causa di dispatch duplicati accidentali. Il record valido `ev-20261113-142509-d5f6e7e71ab99b5b2ddf61d8e2ddb61a.md` è stato creato; log e file non vanno cancellati per il contract append-only. Nessun impatto sui test.
