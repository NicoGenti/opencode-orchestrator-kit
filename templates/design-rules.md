<!--
The DR-UI rules under "## UI & Delivery" are a copy of the rules section in
web-kit `docs/design-rules-ui.md` on branch `main`:
https://github.com/NicoGenti/web-kit/blob/main/docs/design-rules-ui.md
`bun run check-design-rules` fetches that raw file and diffs the rules.
`.github/workflows/check-design-rules.yml` runs it weekly and on demand and
fails when the copy drifts. The `web-*` skill prefix is reserved for that kit.
Edit those rules upstream, then refresh this copy. The rest of this file is
the orchestrator kit's design-rules template, not an upstream document.
-->

# Design Rules

> Status: draft
> Copy this template to `.context/DESIGN-RULES.md`. Fill only what the user has stated; leave unknown sections empty. Never invent requirements.

## Purpose

<!-- One or two sentences: what the application is and why it exists. -->

## Users and Use Cases

<!-- Who uses it and the core workflows to build first. -->

## Constraints

<!-- Fixed decisions: stack, hosting, budget, team, deadlines, compliance. -->

## Architectural Style

<!-- Chosen style (e.g. modular monolith, microservices) and the reason. -->

## Module Boundaries

<!-- Modules, what each owns, and the allowed dependency direction. -->

## Data and Integrations

<!-- Main entities, data ownership, external APIs and services. -->

## Non-Functional Requirements

<!-- Security, privacy, performance, availability, observability targets. -->

## Design Rules

<!-- Numbered, testable rules that planner and code-reviewer can cite (DR-1, DR-2, ...). -->

## UI & Delivery

<!-- Only for web sites/apps built with web-kit (separate repo, https://github.com/NicoGenti/web-kit).
Install its skills on the OpenCode skills path. Keep the DR-UI rules below when the user confirmed web-kit; otherwise delete this section.
Citable by planner and code-reviewer as DR-UI-n. Upstream: web-kit docs/design-rules-ui.md on main (see the header comment). -->

- **DR-UI-1 — Solo token.** Colori, raggi, ombre, spazi, tipografia e durate si scrivono solo come variabili `--ui-*` (o utility/mixin che le mappano). Nessun esadecimale, `px` di colore o durata letterale nei componenti. Verifica: `web-theme/scripts/audit-theme.sh <src>` senza segnalazioni.
- **DR-UI-2 — Tre strati di stile.** Ordine fisso: tema (`theme/`, copiato da web-theme e mai modificato a mano) → brand (`brand.css`, solo override di token) → app (stili dei componenti). Un cambio di brand non tocca i componenti.
- **DR-UI-3 — Brand dal logo, contrasto verificato.** Accento, font e logo derivano dagli asset del cliente (skill web-brand). Testo ≥ 4.5:1, elementi UI e focus ≥ 3:1, tile ≥ 7:1, in chiaro e scuro. Verifica: `python3 tools/contrast.py --auto` in CI.
- **DR-UI-4 — Movimento sobrio.** Animazioni 150–400 ms tramite `--ui-dur-*`/`dur()`, solo `transform` e `opacity`, mai `transition: all`; con `prefers-reduced-motion: reduce` durata 0 e contenuto subito visibile.
- **DR-UI-5 — Accessibilità di base.** HTML semantico, skip link, focus visibile (`--ui-focus`), target ≥ 44 px, etichette su ogni campo, `alt` sulle immagini, `lang` corretto, navigazione completa da tastiera, nessuna informazione affidata solo al colore.
- **DR-UI-6 — Mobile first.** Layout progettato da 390 px in su; a ≤ 760 px le tabelle diventano card e la navigazione laterale diventa drawer. Nessuno scroll orizzontale della pagina.
- **DR-UI-7 — Uno stack per tipo di sito.** Vetrina: Astro statico. Shop: Astro + Stripe Checkout o Shopify Buy Button. Gestionale/CRM: Angular + API .NET. Eccezioni solo con voce nel Decision Log.
- **DR-UI-8 — Starter prima delle feature.** Ogni progetto nasce da `web-scaffold-*` e deve compilare, passare i test e avere gli screenshot prima di aggiungere funzionalità.
- **DR-UI-9 — Contratto API prima del client.** L'API .NET espone OpenAPI; il client TypeScript si genera (`npm run gen:api`) e non si scrive a mano. I prezzi e i totali si calcolano sempre sul server.
- **DR-UI-10 — Configurazione dall'ambiente.** Una sola immagine per tutti gli ambienti; configurazione da variabili d'ambiente a runtime; nessun segreto in repo, immagine, log o bundle client.
- **DR-UI-11 — Pipeline a tre stadi.** Build/test → immagine con tag immutabile (`sha-…`) → produzione con approvazione manuale. Azioni CI pinnate a SHA. Target predefinito VPS Docker Compose + Caddy; Azure Container Apps come alternativa.
- **DR-UI-12 — Budget di qualità.** Test unitari verdi, smoke Playwright sulle pagine principali, Lighthouse ≥ 90 (performance, accessibilità, best practice, SEO) sulle pagine pubbliche, bundle iniziale Angular ≤ 500 kB.
- **DR-UI-13 — Screenshot di review.** Ogni pagina nuova o modificata ha screenshot 1440 px e 390 px in `docs/screens/`, allegati alla review e riletti prima dell'approvazione.

## Decision Log

<!-- One row per decision: date | decision | reason | source URL and retrieval date (for external facts). -->
