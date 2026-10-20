---
id: 19-agent-smoke-aggiungi-script-bun-audit-e-file-ope
title: agent smoke: aggiungi script bun:audit e file .opencode/ci-check.md
status: qa
created: 2026-10-20
updated: 2026-10-20
owner: issue-bridge
executor: orchestrator
comprehension: skipped
gh_body_sha: 211daacb40b8c2fc7da79e2d47fe5643f2a57d0a0769932d90013a19c4013785
gh_issue: 19
gh_state: OPEN
gh_synced_at: 2026-10-20T14:35:14Z
---

## Goal
agent smoke: aggiungi script bun:audit e file .opencode/ci-check.md

## Inputs Available
Obiettivo: aggiungere uno script `bun:audit` in package.json che esegua `bun test && bun run lint`, e creare il file `.opencode/ci-check.md` con una checklist CI minimale.

Criteri di accettazione:
- package.json contiene lo script `bun:audit`
- Il file `.opencode/ci-check.md` esiste con almeno 3 righe
- `bun test` passa

Riferimento: issue di smoke per validare il flusso agent:run dopo le modifiche al prompt e al timeout.

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

