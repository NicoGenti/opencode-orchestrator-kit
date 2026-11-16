# Backlog coordination

This document coordinates the backlog for `NicoGenti/opencode-orchestrator-kit` as of 2026-11-16: 12 open SnykCode Path Traversal alerts plus related project-board and label-taxonomy work. It is a coordination summary, not a feature specification. Facts, decisions, and recommendations are separated throughout.

## Scope and constraints

Constraints honored by every entry (data basis: user stated unless noted):

- Local-first; read-only by default; no telemetry; no external LLM calls; no automatic session mutation.
- Explicit data basis for every figure (measured / derived / estimated / user stated / not available).
- Backlog agents propose; the owner approves all GitHub writes (see repository `AGENTS.md`).

Decision (owner-approved, 2026-11-16): Priority P1, size S for all 12 alerts (data basis: user stated). Scanner severity remains "unknown" (data basis: not available). No P0 escalation (data basis: user stated).

Decision (owner-approved, 2026-11-16): affected scripts run local-first with trusted input only — no untrusted-path invocation in CI, install flows, or by end users (data basis: user stated). This is the basis for P1 rather than P0.

Ambiguities to verify during fixes (data basis: user stated):

1. `apply-freellmapi-profile.py` configures a third-party LLM provider — fixes must not alter provider endpoints, `baseURL`, or `apiKey` handling (AC7: provider surface frozen).
2. Installer and plan-board scripts write files by design — write destinations must stay within documented roots (profile/config root; repository `plan/` root). No session mutation.

## Backlog state

| Metric | Value | Data basis |
|---|---|---|
| Open issues | 12 | measured |
| Open issues — type | SnykCode Path Traversal alerts (label `security`) | measured |
| Open PRs | 5 | measured |
| Historical issue/PR records | 162 | measured |
| Milestones before 2026-11-16 | 0 (`milestone:null` on all 162 records) | measured |
| Backlog items on project board | 30 | measured |
| Priority of all 12 alerts | P1 | user stated |
| Size of all 12 alerts | S | user stated |
| Scanner severity | unknown | not available |

All 12 open issues are labeled `security` and were auto-filed by the `security-alert-issues.yml` workflow; Snyk scans run in `snyk-code.yml`.

## Three-phase plan

Decision (owner-approved, 2026-11-16): issues grouped by affected script lifecycle role.

| Phase | Milestone / label | Issues | Hotspot script | Goal |
|---|---|---|---|---|
| Phase 1 — Advanced Analysis | `Advanced Analysis` / `phase:1-analysis` | #157, #158 | `scripts/context-budget.ts` | Harden context-budget tooling against path traversal |
| | | #155, #156 | `scripts/evidence-check.ts` | Harden evidence-check tooling against path traversal |
| Phase 2 — Adoption & Release | `Adoption & Release` / `phase:2-adoption` | #150, #149, #148, #147 | `scripts/apply-freellmapi-profile.py` | Harden installer (read + writes) without changing provider surface |
| | | #146 | `scripts/apply-model-preset.py` | Harden preset read path at line 220 |
| Phase 3 — Operational Developer Support | `Operational Developer Support` / `phase:3-support` | #145, #144, #143 | `scripts/plan-board.py` | Harden plan-board write paths (plan root) and read path |

Hotspot line references (data basis: measured): `context-budget.ts` 346/338; `evidence-check.ts` 528/510; `apply-freellmapi-profile.py` 93 (read) / 174, 176, 177 (writes); `apply-model-preset.py` 220; `plan-board.py` 344 / 228 / 260.

## Shared vulnerability boundary

Recommendation (derived, data basis: derived): use a single shared path-validation boundary helper for all CLI-arg → filesystem flows across the five hotspot scripts, instead of 12 independent fixes. Batch fixes per hotspot script; joint hotspots may share one PR with per-sink verification evidence (#157/#158; #155/#156; #147–#150; #143–#145).

| Hotspot | Issues | Sink type | Containment required |
|---|---|---|---|
| `context-budget.ts` | #157, #158 | read | validate/normalize traversal |
| `evidence-check.ts` | #155, #156 | read | validate/normalize traversal |
| `apply-freellmapi-profile.py` | #147–#150 | read :93 + writes :174/:176/:177 | read containment; writes confined to profile/config root |
| `apply-model-preset.py` | #146 | read :220 | validate/normalize traversal |
| `plan-board.py` | #143–#145 | reads/writes :228/:260/:344 | plan-root containment; no session mutation |

## Acceptance criteria

Source of truth: the 12 issue bodies (AC1–AC7 appended 2026-11-16). Summary:

- AC1: named input point.
- AC2: explicit validate-or-reject behavior; legitimate nested paths still work.
- AC3: regression test matrix — empty/missing arg, relative, absolute, `..`, Windows vs POSIX separators, happy path.
- AC4: alert closure by a fresh Code Scanning run of the `snyk-code` workflow, not manual dismissal.
- AC5: closure evidence recorded in the fix PR.
- AC6 (per hotspot): joint hotspots may share one PR with per-sink verification evidence; write containment for installer writes; preset read :220; plan-root containment + no session mutation for `plan-board`.
- AC7: provider surface frozen (endpoints/`baseURL`/`apiKey`); no session mutation.

## Data basis register

| Claim | Basis |
|---|---|
| Open issue/PR/milestone counts, board composition, hotspot lines, label taxonomy, project fields/views | measured |
| Phase/milestone mapping and hotspot grouping | user stated (owner-approved classification by lifecycle role) |
| Priority P1 / size S / trusted input only | user stated |
| Scanner severity unknown | not available |
| Shared-helper recommendation | derived |
| Before/after snapshots retained locally, not committed | user stated |

## Project board reference

URL: https://github.com/users/NicoGenti/projects/4 (project `opencode-orchestrator-kit`, #4).

Composition (data basis: measured): 30 items — 12 P1 Backlog target issues, 13 closed issues set to Done, 5 open PRs Backlog.

Custom fields: Phase, Work type, Priority, Size, Data basis, Blocking dependency. Status options: Backlog / Ready / In progress / In verification / Blocked / Done.

Views: Phase lanes (board), Priority table, Quick wins, Security queue (Work type:security), Legacy triage.

Note (data basis: measured): per-view sort/grouping is not configurable through the public GitHub API; configure manually in the UI if wanted.

## Labels

Taxonomy (data basis: measured): `type:*` (9 labels), `phase:*` (3 labels: `phase:1-analysis`, `phase:2-adoption`, `phase:3-support`), `priority:P0/P1/P2`, `size:S/M/L`.

- `security` retained as an area overlay.
- Historical `P0` renamed to `priority:P0`; retained on 2 closed records.
- Decision (owner-approved, 2026-11-16): legacy automation labels (`plan`, `plan:mirror`, `plan:draft`, `plan:in-progress`, `plan:qa`, `plan:complete`, `plan:divergence`, `agent:run`) retired on 2026-11-16 — remove from all carrying records and delete definitions (data basis: measured once this document is committed).

## Risks to watch

1. Board automation may hit reserved-name or API limits (project fields/views are not fully scriptable) — verify before automating field updates.
2. Write-sink containment on installer scripts must not break legitimate profile/config writes; verify destinations stay in documented roots.
3. Provider surface freeze: any PR touching endpoints/`baseURL`/`apiKey` handling invalidates the review gate (AC7).
4. "Checkbox done" without closure evidence — alerts must close via a fresh `snyk-code` scan run, not manual dismissal (AC4).

## What remains manual

- Per-view sort/grouping in the UI (API not configurable for these).
- Per-sink verification evidence collection during fixes.
- Board field hygiene as items move between Backlog/Ready/In progress/In verification/Done.
- Security-alert issue bodies are auto-created by `security-alert-issues.yml`; before/after body snapshots of all 12 issues are retained locally during coordination and are not committed.
