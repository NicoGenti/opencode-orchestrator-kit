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
