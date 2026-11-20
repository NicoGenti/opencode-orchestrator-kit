# Decisions

Archivio delle decisioni precedenti al 2026-11-17: `.context/archive/decisions-2026-11-17.md`.

## 2026-11-19 — v1.2.3 cycle (issue #179)

- OIDC via npm Trusted Publishing: environment `npm` (già esistente, maintainer required reviewer), Node 22 + `npm install -g npm@latest` (npm >= 11.5.1), NON Node 24 (decision #1).
- GitHub Release automatica con note = sezione [x.y.z] completa del CHANGELOG (decision #2); deploy.yml aggiunge trigger `release/v*` (decision #4); `release/v1.2.2` mantenuto (decision #3).
- Flow release-branch vincolante: main solo dev; tag v* accettato solo se `origin/release/<tag>` esiste e head == commit del tag; fallimento PRIMA di qualsiasi step di publish; merge del cambio permessi solo dopo review code-reviewer + security.
- Chiusura 12 alert/issue path-traversal (#143-#150, #155-#158): decisione esplicita maintainer 2026-11-19 — evidenza: run snyk-code #65 su main @ 1acf806; Snyk riapro i flussi come #13-#19 (non modella il guard custom); alert dismissi come false positive; issue chiuse con commento di evidenza. Prima di questa decisione vale il vincolo: nessun dismissal, stop su alert sopravvissuti (STOP eseguito e risolto dalla decisione).
- `security-alert-issues.yml`: filtro severity high+critical (issue create solo per high/critical); PR in attesa di apertura (branch `chore/179-security-alert-severity-filter`, commit 7b732c6).
- v1.2.3 cut e pubblicato 2026-11-19: tag annotato su head di release/v1.2.3 (3e54f1f), gate branch-first passato, OIDC publish via environment `npm`, GitHub Release automatica da sezione [1.2.3]. PR #193 (OIDC) e #194 (branch-first flow) mergiate; R1 eseguito su entrambe (code-reviewer REQUEST CHANGES → fix → APPROVE; oracle security APPROVE con condizioni F1/F2 — F1 implementato, F2 = branch protection wildcard a carico utente).
- Ordine re-run del workflow: SOLO "Re-run failed jobs" sulla run originale; mai "Re-run all jobs" (npm rifiuta la versione già pubblicata, E403).
- 2026-11-19: chiusura massiva issue Snyk "Note/unknown" autorizzata esplicitamente dall'utente ("Se le issue Security* sotto a high chiudi pure"): 8 issue chiuse (#181,182,183,185,188,189,191,192), severity sotto high (unknown), stessi flussi già ritracciati alla decisione di false-positive.
- Ambiente npm `npm`: approvato al publish dall'utente; revoca NPM_TOKEN ancora pendente (utente).
- 2026-11-20: TECHNICALLY_DONE richiede il report della review tecnica (code-reviewer/security) green, non solo suite verde e comprehension; skip solo per decisione utente esplicita scritta in session memory — rinforzato in `agents/orchestrator.md` (Verify + Core Rules + Closing rule) e mirror rigenerato (W1 23,942/24,000; 70 pass/0 fail).
