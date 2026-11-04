<!--
Template users copy to `.context/DESIGN-RULES.md` and customize.
Nothing here is pinned to an upstream repository. Delete any section that does not apply.
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

<!-- Optional sample for a web UI. Keep it when the project has one; otherwise delete this section.
Users may rewrite every rule. Planner and code-reviewer can cite the ones that remain as DR-UI-n.
A web-stack skill pack, if the project uses one, loads through the reserved `web-*` skill prefix (see README "Companion kits"). -->

- **DR-UI-1 — Tokens only.** Colors, radii, shadows, spacing, typography, and durations are written only as `--ui-*` variables (or utility/mixins that map them). No hex codes, no literal `px` for colors or durations in components. Check: `web-theme/scripts/audit-theme.sh <src>` with no findings.
- **DR-UI-2 — Three style layers.** Fixed order: theme (`theme/`, copied from web-theme and never hand-edited) → brand (`brand.css`, token overrides only) → app (component styles). A brand change does not touch the components.
- **DR-UI-3 — Brand from the logo, contrast verified.** Accent, fonts, and the logo derive from the client's assets (web-brand skill). Text ≥ 4.5:1, UI elements and focus ≥ 3:1, tiles ≥ 7:1, in light and dark. Check: `python3 tools/contrast.py --auto` in CI.
- **DR-UI-4 — Sober motion.** Animations 150–400 ms via `--ui-dur-*`/`dur()`, only `transform` and `opacity`, never `transition: all`; with `prefers-reduced-motion: reduce` duration 0 and content immediately visible.
- **DR-UI-5 — Basic accessibility.** Semantic HTML, skip link, visible focus (`--ui-focus`), targets ≥ 44 px, labels on every field, `alt` on images, correct `lang`, full keyboard navigation, no information conveyed by color alone.
- **DR-UI-6 — Mobile first.** Layout designed from 390 px up; at ≤ 760 px tables become cards and the side navigation becomes a drawer. No horizontal page scroll.
- **DR-UI-7 — One stack per site type.** Showcase: static Astro. Shop: Astro + Stripe Checkout or Shopify Buy Button. Back-office/CRM: Angular + .NET API. Exceptions only with a Decision Log entry.
- **DR-UI-8 — Starter before features.** Every project starts from `web-scaffold-*` and must build, pass tests, and have screenshots before features are added.
- **DR-UI-9 — API contract before the client.** The .NET API exposes OpenAPI; the TypeScript client is generated (`npm run gen:api`) and never hand-written. Prices and totals are always computed on the server.
- **DR-UI-10 — Configuration from the environment.** One image for all environments; configuration from environment variables at runtime; no secrets in the repo, image, logs, or the client bundle.
- **DR-UI-11 — Three-stage pipeline.** Build/test → image with an immutable tag (`sha-…`) → production with manual approval. CI actions pinned to SHA. Default target VPS Docker Compose + Caddy; Azure Container Apps as an alternative.
- **DR-UI-12 — Quality budget.** Green unit tests, Playwright smoke on the main pages, Lighthouse ≥ 90 (performance, accessibility, best practices, SEO) on public pages, initial Angular bundle ≤ 500 kB.
- **DR-UI-13 — Review screenshots.** Every new or modified page has 1440 px and 390 px screenshots in `docs/screens/`, attached to the review and re-read before approval.

## Decision Log

<!-- One row per decision: date | decision | reason | source URL and retrieval date (for external facts). -->
