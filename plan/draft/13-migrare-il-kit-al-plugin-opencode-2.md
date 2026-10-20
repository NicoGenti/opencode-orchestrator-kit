---
id: 13-migrare-il-kit-al-plugin-opencode-2
title: Migrare il kit al plugin OpenCode 2
status: draft
created: 2026-10-20
updated: 2026-10-20
owner: issue-bridge
executor: orchestrator
gh_body_sha: d669017157e0755d2704278e113db422b00c39d0f7f4a7b9e7b989c4a24c7ce6
gh_issue: 13
gh_state: OPEN
gh_synced_at: 2026-10-20T11:25:32Z
---

## Goal
Migrare il kit al plugin OpenCode 2

## Inputs Available
<!-- issue-bridge: specchio generato da plan/draft/0009-migrazione-a-opencode-v2.md. NON modificare a mano: la fonte di verita' e' il file di piano nel repository. -->
> **Specchio.** Fonte di verita': `plan/draft/0009-migrazione-a-opencode-v2.md` (ramo di default). Colonna: `draft`.

Titolo: feat: migrare il kit a plugin OpenCode 2 (Plugin.define)

Etichette suggerite: enhancement, opencode-v2, breaking-change

Contesto
Oggi il kit si installa con install.sh project|global, che copia AGENTS.md, agents/, skills/ e command/ in .opencode/. Lo script risolve anche i token {{TIER_*}} nel frontmatter degli agenti usando models.config.json. Il package.json del repo riguarda solo il sito docs, quindi non esiste codice runtime.

OpenCode 2 introduce una nuova API plugin, non compatibile con i plugin V1. Agenti, comandi e skill in .opencode/ restano supportati. Vogliamo distribuire il kit come pacchetto npm caricabile da opencode.json, senza dipendere da Bash e Python.

Obiettivo
Un pacchetto opencode-orchestrator-kit con questi requisiti:

si abilita con una riga in plugins;

registra comandi, skill e agenti;

risolve i modelli per tier a runtime;

espone la plan board e la telemetria come tool nativi;

mantiene invariato il contratto di orchestrazione descritto in AGENTS.md.

Non-obiettivi
Nessuna modifica al comportamento degli agenti né al formato dei task spec a 9 sezioni.

Nessuna riscrittura del sito docs.

Nessun supporto ai plugin V1 nello stesso pacchetto. Il vecchio installer resta su un branch v1.

Design proposto
text
src/plugin/index.ts          # Plugin.define({ id, setup(ctx) })
src/plugin/tiers.ts          # sostituisce apply-model-preset.py / resolve-model-preset.ts
src/plugin/plan-board.ts     # port di scripts/plan-board.py
src/plugin/comprehension.ts  # gate, DCI, /recall, /research-mode
assets/{agents,commands,skills}/   # .md esistenti, con token {{TIER_*}} nel model:
Configurazione utente:

text
{ "plugins": [{ "package": "opencode-orchestrator-kit",
  "options": { "preset": "generic", "withExtras": false } }] }
Mappatura sulle API V2:

Funzione del kit	API V2
Modelli per tier	ctx.agent.transform (update), con validazione tramite ctx.model
Agente di default	ctx.agent.transform (default) → orchestrator
Comandi (/start-session, /close-session, /recall, /research-mode)	ctx.command.transform (add)
Skill	ctx.skill.transform (add)
Plan board e log DCI	ctx.tool.transform (add)
Stato research e slot A/B	ctx.storage
Regola "l'orchestrator non scrive codice"	permessi per agente e ctx.permission.assert
Rischio da verificare subito
Nella documentazione letta, AgentEditor espone list, get, default, update e remove, ma non add. Se un plugin non può creare agenti, il fallback è copiarli in .opencode/agents/ al primo avvio, in modo idempotente. Questo va chiarito nella fase 0 prima di scrivere altro codice.

Piano di lavoro
Fase 0 – Spike di fattibilità

Installare OpenCode 2 e avviare il kit attuale senza modifiche.

Leggere install.sh, scripts/oc2-fm-run.sh, scripts/setup-oc2-fm-profile.sh e i frontmatter degli agenti.

Verificare se esiste un modo per registrare agenti da plugin.

Output: nota di fattibilità nel thread della issue.

Fase 1 – Scheletro del plugin

Aggiungere Plugin.define con id stabile e setup(ctx).

Registrare /start-session e le skill.

Separare il package.json del plugin da quello del sito docs (workspace o cartella dedicata).

Fase 2 – Agenti e tier

Portare tiers.ts con i 5 tier: ROUTER, REASONING, CODE, FAST, REVIEW.

Mantenere i fallback: ROUTER → REASONING e REVIEW → CODE.

Segnalare i tier con valori placeholder/* o con modelli non disponibili.

Impostare orchestrator come unico mode: primary.

Fase 3 – Plan board nativa

Riscrivere plan-board.py in TypeScript con i comandi check, new, move, adopt.

Mantenere output JSON e codici di uscita: 0 per ok o warning, 1 per errore bloccante.

Mantenere le regole: id uguale al prefisso del nome file, status uguale alla colonna, 9 sezioni.

Rispettare la standing authorization: check e move di file conformi senza approvazione, tutto il resto con approvazione per singola richiesta.

Fase 4 – Gate di comprensione e ricerca

Portare /recall, /research-mode e la classificazione NONE/LIGHT/DEEP.

Scrivere .context/comprehension-log.md e .context/research-dataset.jsonl in modo append-only.

Mantenere la tupla ResearchTupleV1 a 19 campi e il vincolo che nel dataset non finisca codice sorgente né risposte personali.

Con research mode disattivato, il dataset non viene né letto né scritto.

Fase 5 – Permessi

Tradurre i permessi del frontmatter (tools, permission) nel modello V2.

Impedire all'orchestrator le scritture su codice applicativo, e a ogni agente diverso da plan-writer quelle sotto la board root.

Fase 6 – Test, CI e release

Mantenere frontmatter-order, assembly-order e stable-prefix-boundary e aggiornare tests/fixtures/prompt-prefix-boundary.txt.

Aggiungere test di parità per la plan board (output di plan-board.py contro quello della versione TS).

Test di integrazione: installazione su repo vuoto e su repo esistente.

Pubblicare su npm e aggiornare README, QUICKSTART e CHANGELOG.

Scrivere la guida di migrazione V1 → V2 e marcare install.sh come deprecato.

Criteri di accettazione
Su un repo pulito con OpenCode 2, basta aggiungere il plugin a opencode.json ed eseguire /start-session, senza install.sh.

Tutti i 16 agenti compaiono con il modello del tier configurato, e i tier non validi producono un errore chiaro.

La plan board passa i test di parità con plan-board.py.

I test sul contratto del prefisso stabile passano.

L'orchestrator non riesce a modificare codice applicativo.

Il README documenta installazione, opzioni e migrazione.

Rischi
Registrazione degli agenti da plugin non confermata (vedi sopra).

Ordine di precedenza tra AGENTS.md globale e di progetto, già segnalato nella guida OpenCode Studio.

Differenze tra il frontmatter legacy e quello V2: la conversione dei campi può aspettare la fine.

Le shell-out dei vecchi script vanno riscritte senza l'helper $ di Bun.

Definizione di completato
Release v0.7.0 (o v1.0.0, da decidere) pubblicata su npm, CI verde, CHANGELOG aggiornato, branch v1 creato per i vecchi utenti.

## Success Criteria
- 

## Scope
- 

## Safety
- 

## Outputs Required
- 

## Test Plan
- 

## Verification
- 

## Notes / Edge Cases
- 

