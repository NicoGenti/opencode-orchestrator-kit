# Flow verification — plan board (plan-writer)

## 1. Cosa e' stato verificato

Il board dei piani ha un owner unico, l'agente `plan-writer`, e ogni mutazione di piani passa dal tool deterministico `scripts/plan-board.py`. Qui si registrano le prove d'esecuzione raccolte il 2026-10-14: i momenti di dispatch e il `check` di status esercitati su una board usa-e-getta nella directory temporanea del profilo (log `pbwork/logs/b3-*.log`), i rifiuti verificati del tool, l'effetto sul filesystem, lo stato (sola lettura) della board reale del kit e un censimento (sola lettura) della controparte O4A. Nessun file di `plan/**` del repo e' stato scritto; l'unico artefatto nel repo e' questo documento.

## 2. I quattro momenti di dispatch (contratto di flusso)

| Momento | Stato del tool | Comando eseguito | Exit | Esito |
| --- | --- | --- | --- | --- |
| Piano approvato -> `new` | `"ok": true`, `"verified": true`, `"column": "draft"` | `python scripts/plan-board.py new --root "$BOARD" --id 9001-flow-probe --title "Flow probe" --owner orchestrator --executor developer-fixer --body "$BODY" --json` (passo 4, `b3-2.log`) | 0 | piano conforme creato in `draft/9001-flow-probe.md` |
| Approvato con file esistente -> move `draft` -> `in-progress` | `"ok": true`, `"from": "draft"`, `"to": "in-progress"` | `python scripts/plan-board.py move --root "$BOARD" --id 9001-flow-probe --to in-progress --json` (passo 5, `b3-3.log`) | 0 | file spostato, frontmatter aggiornato (v. sezione 4) |
| Completamento implementer -> move `in-progress` -> `qa` | — | `plan-board.py move --to qa` | non esercitato | non esercitato: richiede una board reale |
| Accettazione utente -> move `qa` -> `complete` | — | `plan-board.py move --to complete` | non esercitato | non esercitato: decide l'utente |
| Status/resume di sessione -> `check` | `"ok": true` (due run) | `python scripts/plan-board.py check --root "$BOARD" --json` (passi 3 e 6, `b3-1.log` / `b3-4.log`) | 0 / 0 | board conforme: 0 piani al primo `check`, 1 piano `in-progress` al secondo |

## 3. Rifiuti verificati (il tool non indovina)

| Codice atteso | Comando | Exit reale | Messaggio verbatim (1 riga) |
| --- | --- | --- | --- |
| `already-in-column` | `move --id 9001-flow-probe --to in-progress` ripetuto (passo 7, `b3-5.log`) | 1 | `'9001-flow-probe.md' e' gia' in 'in-progress'` |
| `duplicate-id` | `new --id 9001 --title Dup --owner orchestrator --executor developer-fixer --body "$BODY"` (passo 8, `b3-6.log`) | 1 | `'9001' esiste gia' in in-progress` |
| `plan-ambiguous` | `move --id 9002 --to qa` dopo la creazione ad hoc di `draft/9002-alpha.md` e `complete/9002-beta.md` (passo 9, `b3-7.log`) | 1 | `'9002' presente in piu' colonne: draft/9002-alpha.md, complete/9002-beta.md` |

Il rifiuto `plan-ambiguous` cita entrambi i file candidati: `9002-alpha.md` e `9002-beta.md`.

## 4. Effetto sul filesystem (prova, non dichiarazione)

`cat "$BOARD/in-progress/9001-flow-probe.md"` (da `b3-plan.txt`, exit 0) — blocco frontmatter, 7 righe fra i due `---` (id, title, status, created, updated, owner, executor):

```
---
id: 9001-flow-probe
title: Flow probe
status: in-progress
created: 2026-10-14
updated: 2026-10-14
owner: orchestrator
executor: developer-fixer
---
```

Prova dell'effetto sul filesystem (comandi e output verbatim da `b3-ls.txt`, exit 0):

```
$ ls "$BOARD/draft"
9002-alpha.md
draft_files=1
$ ls "$BOARD/in-progress"
9001-flow-probe.md
inprogress_files=1
$ grep -c 'status: in-progress' in-progress/9001-flow-probe.md
1
```

Il piano vive in `in-progress/` e NON in `draft/`: `draft/` contiene solo `9002-alpha.md` (creato ad hoc al passo 9), `in-progress/` contiene `9001-flow-probe.md` (1 file), e il frontmatter porta `status: in-progress` e `updated: 2026-10-14` (aggiornato dal move).

## 5. Board reale del kit: stato noto al 2026-10-14

`python scripts/plan-board.py check --root plan` — exit reale `1` (`b3-kit-board.exit`). Conteggi reali: `  ERROR ` = **1** (`b3-kit-errors.txt`), `  WARN  ` = **10** (`b3-kit-warns.txt`). Elenco verbatim (da `b3-kit-board.log`):

```
FAIL
  ERROR missing-id  plan\complete\0002-roster-and-schema-fixes.md  frontmatter senza `id`
  WARN  missing-section  plan\draft\0002-v0.3.0-human-comprehension-gate.md  sezione mancante: ## Notes / Edge Cases
  WARN  legacy-no-frontmatter  plan\draft\0003-prompt-assembly-optimization.md  file legacy senza frontmatter YAML: normalizzalo con `adopt`
  WARN  missing-section  plan\draft\0003-v0.3.1-token-aware-comprehension.md  sezione mancante: ## Notes / Edge Cases
  WARN  missing-section  plan\draft\001-installer-prereq-checkpoints.md  sezione mancante: ## Notes / Edge Cases
  WARN  unexpected-file  plan\draft\test_write.txt  file non .md presente in una colonna
  WARN  legacy-no-frontmatter  plan\in-progress\0001-kit-evolution-toolkit.md  file legacy senza frontmatter YAML: normalizzalo con `adopt`
  WARN  missing-frontmatter-key  plan\in-progress\0006-branching-strategy.md  chiave frontmatter mancante: executor
  WARN  missing-frontmatter-key  plan\complete\0002-roster-and-schema-fixes.md  chiave frontmatter mancante: updated
  WARN  missing-frontmatter-key  plan\complete\0002-roster-and-schema-fixes.md  chiave frontmatter mancante: owner
  WARN  missing-frontmatter-key  plan\complete\0002-roster-and-schema-fixes.md  chiave frontmatter mancante: executor
```

Decisione esplicita: nessun intervento automatico da parte di questa verifica. `adopt` rifiuta un file che ha gia' un frontmatter, e comunque il board resta in sola lettura qui; la cancellazione di `plan/draft/test_write.txt` (visto nel warn `unexpected-file`) e' una decisione dell'utente. Il fix proposto e' una riga, a cura dell'utente: aggiungere `id: 0002-roster-and-schema-fixes` come prima riga del frontmatter di `plan/complete/0002-roster-and-schema-fixes.md`.

## 6. Nota sulle flaky

I 3 nomi delle suite installer/oc2 che compaiono e scompaiono (`install.sh global`, `install-freellmapi.sh` x2) sono flaky da contesa: sotto carico pieno vanno in timeout a 5 s, in isolamento passano (nota in testa alla fixture). La baseline completa e' in `tests/fixtures/baseline-failures.txt` (6 righe di commento + 20 nomi; conteggi riletti sul file) e una regressione e' solo un nome NUOVO; un elenco piu' corto non e' una regressione (regola dichiarata nella fixture stessa).

## 7. Censimento O4A (sola lettura, nessuna scrittura)

| Comando | Exit reale | Output verbatim (1-3 righe) |
| --- | --- | --- |
| `python "D:/Work/O4A/.opencode/scripts/plan-board.py" check --json` | 0 | `"ok": true,` / `"action": "check",` / `"root": "D:\\Work\\O4A\\plan",` — dallo stesso JSON: `errors: []`, 2 warning `legacy-no-frontmatter`, 1 piano `in-progress`, 2 piani legacy in `complete` |
| `node "D:/Work/O4A/.opencode/scripts/check-agent-frontmatter.mjs"` | 0 | `PASS — 17 file agente: tools booleani, mode coerenti` |
| `node "D:/Work/O4A/.opencode/scripts/verify-agent-models.mjs"` | 1 | `ok    opencode.jsonc parsed` / `ok    agent map covers all 17 project agents` / `FAIL  debug agents returned 0 agents — cannot verify resolution (opencode2 service start)` |
| `python "D:/Work/O4A/.opencode/scripts/verify-instructions.py"` | 0 | `PASS  istruzioni di D:/Work/O4A presenti (AGENTS.md)` |

Nota: `verify-agent-models.mjs` esce 1 perche' non riesce a risolvere i modelli senza avviare il servizio opencode2 (debug agents = 0); e' un dato misurato, nessun intervento effettuato.

## 8. Mapping kit <-> O4A

| Aspetto | Kit (E:/MyProjects/opencode-orchestrator-kit) | O4A (D:/Work/O4A) |
| --- | --- | --- |
| Agente owner | `agents/plan-writer.md` | `D:\Work\O4A\.opencode\agents\o4a-plan-writer.md` (nella radice di O4A non esiste una cartella `agents/`) |
| Tool | `scripts/plan-board.py` (repo kit) | `D:\Work\O4A\.opencode\scripts\plan-board.py` |
| Board root | `plan/` relativa al repo, git-local (qui: root temporanea per la prova, passi 1-10; `--root plan` per la board reale, passo 11) | `D:\Work\O4A\plan\` — default assoluto del tool (dal JSON del passo 12) |
| Gate permessi | `edit: ask`; `write: plan/**/*.md allow` (tutto il resto `deny`); `bash: deny` salvo `python */plan-board.py *`, `ls *`, `cat *` (da `agents/plan-writer.md`) | `edit: ask`, `write: ask`, `bash: ask` (da `o4a-plan-writer.md`) |
| Guardia frontmatter | `bun test`: `tests/plan-board.test.ts`, `tests/plan-writer-contract.test.ts`, `tests/assembly-order.test.ts`, `tests/frontmatter-order.test.ts`, `tests/stable-prefix-boundary.test.ts` | `check-agent-frontmatter.mjs`: 17 file (exit 0, sezione 7) |

Il contratto dell'agente e' lo stesso: owner unico dei piani, quattro colonne, `id` = stem del file, nove sezioni nel body, mutazioni solo via `plan-board.py`. Cambiano root, path del tool e gate dei permessi.