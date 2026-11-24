# Progress

Snapshot 2026-11-24 (issue #199 release v1.3.0 — F5 in dispatch: tag+push).

## Stack

- Kit Markdown multi-agent per OpenCode 2; Bun + TS + Python stdlib; CI GH Actions. Windows: ~25 fail ambient `bun test` CRLF + ~50 noise `format:check`; blob-LF = verità.
- Board root assoluta; commit body ASCII; tag SOLO su head ramo release; conteggi dal tree; decisions.md append-only. Quirk FM: `#` tronca flat scalar.

## Current state

- **F1-F4 DONE**: bullet su main; release branch cut+gates+review APPROVE; merge su main FAST-FORWARD (main == `fbb7ed0`, nessuna PR formale utente). Verifica explorer: origin/main == origin/release/v1.3.0 == `fbb7ed0f4c...`, heading 1.3.0 + 8 bullet, CI main verde.
- **Run Pages rossa NON-bloccante (diagnosticata)**: deploy.yml su push `release/v1.3.0` fallita per policy environment `github-pages` (target consentiti: branch `main` + tag `v*`) — branch protection, NON contenuto; il tag `v1.3.0` deploya correttamente (build ok). FOLLOW-UP post-release: allineare CONTRIBUTING.md ("release branch republishes" non è vero sotto policy) o estendere policy — decisione utente, non in release scope.
- **Gates F5 superati**: utente (1) "Publisher OK", (2) "Sì, tagga e pusha" + diagnosi deploy verde → tag autorizzato.
- accepted=developer-fixer/199-f5 (sessione ses_df320893dffeUj8Z6ZCc6JQaYE) → tag annotato `v1.3.0` su fbb7ed0 + push tag + conferma run release.yml partita. Alternativa soppressa: tag diretto senza verifica commit (vietato, precedente v1.2.2).
- **F5 IN ATTESA UTENTE (push tag 403)**: tag annotato `v1.3.0` CREATO IN LOCALE e verificato (peel == `fbb7ed0...`; `ls-remote` remoto: assente). Push 403 (`NicoGentiDoit` no-write) — il tag locale è corretto e NON va ricreato. L'utente deve: autenticarsi con account con write + `git push origin v1.3.0` → parte `release.yml` (branch gate → gates → tag↔version → OIDC publish con PAUSA per approvazione env `npm` = azione utente) → `deploy.yml` Pages sui tag v*.
- **F6** dopo pubblicazione: npm view == 1.3.0; GitHub Release v1.3.0 notes; npm pack spot; Snyk alert #20; marker CONTRIBUTING.md:123 su main post-publish.
