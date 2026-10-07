# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Starting from v0.3.0, this project follows [Semantic Versioning](https://semver.org/) (SemVer): PATCH = fixes and tuning; MINOR = new backward-compatible capabilities; MAJOR = breaking changes to orchestration or configuration.

## [0.6.4] — 2026-10-07

### Fixed

- **Unique `research_id` (ResearchTupleV1)**: every task event now carries a unique, stable `research_id` used as the correlation key between the DCI₀ baseline and later `/recall` rows; `plan` is no longer used as an identifier (plan re-evaluations now produce genuinely distinct rows).
- **Dataset is truly append-only**: the `/recall` backfill of `dci_delayed` is removed — `/recall` appends a NEW delayed-DCI event linked by `research_id`; no delete, no row rewrite, no history mutation on `.context/research-dataset.jsonl`.
- **Hard boundary made explicit & consistent**: the orchestrator now declares its sanctioned writes ("session memory; plan metadata; comprehension records; comprehension telemetry; research telemetry") with no contradiction to the frontmatter permissions; the Hard boundary clause drops the v0.6.3 qualifier and keeps both sinks append-only. Application code/config remains off-limits to the orchestrator.
- **A/B semantics cleaned**: slot A (control) performs no comprehension classification and no coaching — every `classify(...)` reference removed from its example; slot B (treatment) is the only side with NONE/LIGHT/DEEP classification and potential gate escalation. Metrics stay honest: `agent_calls` counts every delegation actually made, slot-A `skipped` is `false` (the control task runs fully).
- **Versioned event model**: tasks and recalls validate against `DatasetEventV1` (`SCHEMA_VERSION = 1`) with explicit `TASK_FIELDS` (19, incl. `research_id`, no `dci_delayed`) and `RECALL_FIELDS` (8) contracts in `tests/contract-fields.ts`; flow examples parsed from `command/research-mode.md` validate against them exactly.

## [0.6.3] — 2026-10-07

### Fixed

- **Unique research tuple schema (P0)**: schema divergence between the behavioral A/B flow and the documented contract resolved — flow and tests now emit **`ResearchTupleV1`** (the 17 documented fields, canonical order; the v0.6.0 flow tuple shared only ~6 fields with the contract and used enum values `"estimate"`/`"actual"`, now retired in favour of `estimated`/`exact`).
- **Edit allow on both metric sinks (P0)**: the orchestrator frontmatter edit map now includes `.context/comprehension-log.md` and `.context/research-dataset.jsonl` (v0.6.2 covered write only) so sanctioned maintenance edits — log-row normalisation (malformed-row → canonical format) and dataset `dci_delayed` backfill via `/recall` — are permitted exactly where the contract writes.
- **Aligned boundary wording (v0.6.3)**: `/research-mode`, the orchestrator's Hard boundary clause, the `comprehension-workflow` skill and `/recall` now describe the same single sanctioned edit per sink: append-only rows, no deletes, no history rewrites, reads lifecycle-scoped, never at bootstrap; the `dci_delayed` backfill runs only between tasks, on explicit user invocation.
- **/recall out of the task lifecycle**: the normative A/B example no longer places `/recall` inside a research task; `command/recall.md` gains an explicit isolation sentence plus the bounded dataset-backfill clause (single-row locate, `dci_delayed` only).
- **Deterministic contract tests**: new `tests/contract-fields.ts` exports the canonical field order, a pure slot-routing function and a `JSON.parse`-based fence parser; `research-mode` and `workflow-hardening` tests validate both example tuples by key set, order, enums and slot routing (A then B, one per task) instead of counting prose tokens.

## [0.6.2] — 2026-10-07

### Changed

- **Corrected permissions (P0)**: `agents/orchestrator.md` frontmatter write permissions now include the two metric sinks (`.context/comprehension-log.md`, `.context/research-dataset.jsonl`) so telemetry/research writes are permitted exactly where the contract writes them.
- **Hard boundary on telemetry/research artifacts**: both sinks are append-only — rows only; the comprehension log is read only under explicit `/recall`, the research dataset only inside an active research lifecycle; neither is read at bootstrap.
- **Coach atomic output includes DCI (v0.6.2 correction over v0.6.1)**: the coach's emission block is again fully atomic — `Comprehension:` verdict + `evaluator_confidence` + `DCI: <score>/<available_score>` in one block; guard-confinement wording added so the block stays coach-emittable as-is.
- **/recall whitelist made definitive**: step 5 now states the post-answer whitelist in full (plan document, per-plan record, bounded inspection) and step 9 states the record update — no wording that conflicts with the bounded code inspection.
- **user_conf on DCI₀ + behavioral A/B test**: the calibration answer is recorded on the immediate (DCI₀) reading (telemetry template, per-plan record, research tuple); research-mode carries a normative behavioral A/B flow (simulated turn transcript, real gate pass/fail, 17-field tuple check) and the telemetry/test suite pins the dataset as an orchestrator sink.

## [0.6.1] — 2026-10-07

### Changed

- **On-demand cognitive workflow details**: the comprehension-gate operational protocol (configuration precedence, Slicer pipeline, telemetry row contract, per-plan retention records, escalation routing, /recall flow) moved out of `agents/orchestrator.md` into the new `comprehension-workflow` skill, loaded only when running a LIGHT/DEEP gate or `/recall` — the orchestrator keeps routing, NONE/LIGHT/DEEP classification, activation conditions and token-efficiency budgets, with a regression test pinning the prompt budget at 27,000 characters.
- **Research A/B slots are now behavioral, not labels**: slot A (control) runs the workflow without the comprehension gate (no classification, no questions, 0 coach calls, `gate_type=n/a`), slot B (treatment) runs it with the full gate; the canonical tuple contract moved to `command/research-mode.md`.
- **Confidence normalised**: the overloaded `confidence` telemetry field is retired in favour of two distinct values — `user_confidence` (developer calibration self-rating 1-5) and `evaluator_confidence` (coach's confidence in its verdict 1-5) — across telemetry, per-plan records, /recall rows and the research tuple (now 17 fields).
- **Coach outcome set corrected**: allowed verdicts are now `PASS | RETRY | FAIL | SKIPPED` (FAIL added as terminal negative outcome, previously missing), DCI separated from the verdict, structured minimal output with `evaluator_confidence`.
- **DCI denominator rule enforced**: every dimension scores 0-2 and valid denominators derive only from the dimensions actually evaluated (even values 2-8); incoherent examples such as a score-denominator pair of 4/5 removed from shipped files.
- **/recall budget clarified**: before the user answers only the plan document + saved questions are consulted; after the answer reads stay within `maxDiffLines=300` and `maxRelatedSymbols=3` of the selected plan — never a whole-repo scan, never a whole-file read when a bounded slice suffices; retrieval-before-explanation unchanged.

## [0.6.0] — 2026-10-06

### Added

- **Cognitive Research Mode**: an opt-in engineering-metrics layer activated with `/research-mode on`, running A/B comparisons between the normal workflow and the comprehension workflow to measure how much human comprehension is preserved per unit of additional inference.
- **JSONL research dataset**: `.context/research-dataset.jsonl` gains exactly one JSON object per completed task — a 16-field metric tuple (slot label, task type, gate type, duration, agent calls, estimated input/output tokens, confidence, immediate and delayed comprehension scores, retries, skip flag, bugfix reference, token-provenance honesty field).
- **Deterministic slot alternation**: first active task = A, next = B, then A, B, … in activation order; the slot is recorded per tuple for post-hoc A/B pairing.
- **Explicit activation with confirmation**: `/research-mode on` asks for explicit confirmation before enabling; setting `research.enabled` in the configuration counts as the same explicit opt-in. Default OFF, zero overhead when inactive — the dataset is never read and never written.
- **Cognitive Overhead Ratio (COR)**: comprehension tokens over total task tokens, computable per A/B pair from the dataset — an operational engineering metric, not a scientifically validated one (ad-hoc analysis only).
- **Bootstrap isolation preserved**: the research dataset is declared excluded from the loaded set in `/start-session`; it is read and written only inside the research lifecycle.

### Changed

- Configuration file gains a third top-level section, `research` (default `false`), documented in `docs/CONFIGURATION.md` alongside comprehension and recall.

## [0.5.0] — 2026-10-06

### Added

- **Manual `/recall` command**: re-activates a completed plan's comprehension session on explicit request only — asks the stored knowledge questions from memory BEFORE any code or explanation is shown, then re-scores with the DCI rubric under the same slicing caps (max 1 retry, skip always available).
- **Per-plan comprehension records**: at each gated LIGHT/DEEP verdict, the orchestrator writes `.context/comprehension/<plan-id>.md` with the asked questions verbatim, final DCI, outcome, and date — never user answers. `/recall` reuses the stored record when present, else reconstructs questions from the plan document (`src=reconstructed`).
- **Delayed evaluation rows**: `/recall` appends `type=dci1` rows to the same append-only telemetry log (same header-once, metrics-only, no-prose discipline), enabling delayed comprehension data alongside the immediate gate rows.
- **Recall configuration stub**: `recall.enabled` (default `true`) and `recall.automatic` (default `false`, hard limit — automatic recall is a non-goal; no scheduler, no trigger) documented in `docs/CONFIGURATION.md`.
- **Bootstrap isolation preserved**: `/start-session` still loads exactly the three memory files; `/recall` reads the log and records only under explicit user invocation.

### Changed

- **Test suite extended**: new recall-command suite guarding the manual-only invariant, the questions-before-code order, the record rules, and the loaded-set boundary (488 → 505 tests).

## [0.4.0] — 2026-10-06

### Added

- **DCI (Developer Comprehension Index)**: evaluation rubric scoring FLOW/RATIONALE/PREDICTION/LOCALIZATION 0–2 each within EVALUATE; emitted as `DCI=<score>/<available_score>`; dimensions not covered by LIGHT questions are marked N/A and excluded from the denominator.
- **Perceived-comprehension calibration question**: asked once at session opening in LIGHT/DEEP (never on NONE; no-reveal invariant preserved) and compared against the measured DCI.
- **Telemetry log**: append-only `.context/comprehension-log.md` — exactly one line per gated evaluation (timestamp, mode, DCI, confidence, outcome); header comment at creation; never contains question, answer, or analysis text; zero lines on NONE; SKIPPED sessions log `DCI=skipped` with `conf=n/a`.
- **Bootstrap isolation**: `/start-session` never loads the comprehension log and performs no telemetry writes during bootstrap; the loaded set stays progress.md, decisions.md, issues.md.
- **docs/CONFIGURATION.md**: new "### Telemetry log" section — untracked-by-design policy (.gitignore), start-session never loads, metrics-only content.

### Changed

- **Test suite extended**: new DCI comprehension-coach tests and telemetry writer suite (476 → 488 tests).

## [0.3.1] — 2026-10-06

### Added

- **templates/comprehension.config.json**: new user-local comprehension config template (enabled, mode, light/deep question counts, context limits maxDiffLines/unifiedContextLines/maxRelatedSymbols, evaluation maxRetries/escalateOnAmbiguity). File > built-in defaults; invalid values → defaults + warning, never hard failure; enabled false → gate disabled (back to v0.2.2 behavior).
- **Context slicing (explorer-as-Slicer)**: git diff → changed symbols → surrounding context → hotspot extract ≤ maxDiffLines (300) focused lines → slice passed to coach. Task NONE = 0 agent calls. Coach never receives raw git/bash access.
- **EVALUATE Q→symbol narrowing**: coach re-reads only the symbols referenced by its own questions (Q→symbol map), no whole-file re-reads in evaluation. Asymmetric context: CHALLENGE sees the slice, EVALUATE sees only referenced symbols.
- **Escalation routing**: exactly ONE escalation per evaluation, only when ambiguous OR security-critical OR architectural uncertainty; escalationTier (default TIER_REVIEW) resolved via models.config.json tier→agent mapping — follows the tier, not the agent name. escalateOnAmbiguity false → FAIL with skip suggestion, never guessed PASS.
- **docs/CONFIGURATION.md**: new "## Comprehension configuration" section with schema, defaults table, precedence rules, and manual copy instructions.
- **tests/comprehension-config.test.ts**: new test suite (Groups A–F) covering config schema, defaults, orchestrator/coach doc presence, negative cases, and an unknown-tier sweep (no new tier tokens introduced).

### Changed

- No routing changes to existing agents. Comprehension gate remains opt-out (enabled true by default). Test suite grows from 414 to 455 pass.

## [Unreleased]

## [0.3.0] — 2026-10-06

### Added
- **Human Comprehension Gate (MVP)**: new read-only comprehension-coach agent — CHALLENGE then EVALUATE only, retrieval before explanation, max 1 retry, skip comprehension → SKIPPED. Four dimension tags (FLOW, RATIONALE, PREDICTION, LOCALIZATION); no numeric DCI scoring in this release.
- **agents/comprehension-coach.md**: new subagent (mode: subagent, model: {{TIER_FAST}}, permission: read-only with task: deny). Input whitelist (goal, changed file list, focused diff, minimal surrounding symbols). Forbidden: whole conversation, whole plan, whole repository, prior transcripts.
- **Comprehension gate in orchestrator**: after code-reviewer/security pass, orchestrator classifies cognitive relevance (NONE/LIGHT/DEEP) — classification stays in orchestrator, not delegated. Gate exempts the coach from Pre-Delegation Confirmation Gate (read-only agent). Two-phase closing: TECHNICALLY_DONE + HUMAN_OWNED (PASS/SKIPPED). NONE = 0 additional calls; LIGHT = max 2 questions; DEEP = max 4 questions.
- **Roster AGENTS.md extended**: comprehension-coach joins Core delivery as post-verification agent. Conceptual split: technical verification (code-reviewer/security) ≠ human comprehension verification (comprehension-coach).
- **Baseline prompt-prefix updated**: agents/comprehension-coach.md appended to tests/fixtures/prompt-prefix-boundary.txt in sorted position (after code-reviewer, before deploy-helper).
- **tests/comprehension-coach.test.ts**: new test file asserting read-only surface (no webfetch, task: deny, no write/edit allow), {{TIER_FAST}} model token, dimension tags present, no numeric DCI schema, forbidden-context list, skip word → SKIPPED outcome, max 1 retry protocol.

### Notes
- SemVer adoption: starting v0.3.0 this project follows Semantic Versioning (SemVer). PATCH = fixes and tuning; MINOR = new backward-compatible capabilities; MAJOR = breaking changes to orchestration or configuration.

## [0.2.2] - 2026-09-04

### Added

- **Pre-Delegation Confirmation Gate**: `orchestrator` now pauses and asks the user for explicit confirmation, in the root session, before delegating any task to a file-writing agent (`developer-fixer`, `build-helper`, `deploy-helper`, `npm-helper`, `test-engineer`). This is independent of OpenCode's native `edit`/`bash` permission layer and covers known gaps where nested-subagent permission prompts don't reliably bubble up to the root session. See `agents/orchestrator.md`, "Pre-Delegation Confirmation Gate", and `docs/ARCHITECTURE.md`, "Human-in-the-loop confirmation gate."
- **Phase 1 — Model tier presets, resolver, and migration**: a five-tier abstraction (`TIER_ROUTER`, `TIER_REASONING`, `TIER_CODE`, `TIER_FAST`, `TIER_REVIEW`) replaces hard-coded model IDs in agent frontmatter. Shipped as `scripts/resolve-model-preset.ts`, `scripts/migrate-agents-to-tokens.sh`, `scripts/apply-model-preset.py`, and `templates/models.config.json` (the `default` and `generic` profiles).
- **Phase 1 — `install.sh` integration**: the installer seeds `.opencode/models.config.json` from the bundled template, accepts `--symlink`, `--with-extras`, `--with-examples`, and `--skip-validation`, and runs the Phase 1 model-profile validator before writing to the target directory.
- **Phase 1 — `docs/CONFIGURATION.md`**: full tier-resolution rules, fallback chains, placeholder policy.
- **Phase 1 — `docs/SETUP-NATIVE.md`**: manual install path, prerequisites, and per-flag installer reference.
- **Phase 1 — `scripts/detect-os.sh` and `scripts/validate-models.sh`**: installer OS detection and pre-flight model-profile validator.
- **Phase 1 — `templates/models.config.json`**: the `default` and `generic` model-profile presets, with `validate-models.sh` exiting 0 with an `OK:` line on success.
- **Phase 1 — `agents/*.md` and `extras/*.md` frontmatter cleanup**: present top-level frontmatter keys appear in the canonical subsequence `description, mode, model, temperature, tools, permission` (subsequence, not strict permutation).
- **Phase 1 — `scripts/resolve-model-preset.ts` exports**: `loadModelConfig`, `resolvePreset`, `resolveModelValue`, `listPresets`, `getPreset`, `getDefaultPreset`, `validatePreset`, `resolveModelConfig`, `TOKENS`.
- **Phase 2 — Bootstrap repo scaffolding**: `profiler` agent fingerprints any repo (stack, CI, structure), scaffolds `.context/` session memory and `plan/` kanban, and is idempotent on retrofit. See `.opencode/PROJECT-PROFILE.md`, `AGENTS.md`, and `agents/profiler.md`.
- **Phase 2 — `agents/orchestrator.md` expanded routing table**: Core routing (`profiler`, `explorer`, `oracle`, `planner`), Core delivery (`developer-fixer`, `test-engineer`, `code-reviewer`, `security`), Operations helpers (`build-helper`, `npm-helper`, `deploy-helper`), and explicit opt-in extras (`pc-doctor`, `writer`, `librarian`) are documented as separate tiers with disambiguation notes.
- **Phase 3 — Prompt-assembly stable-prefix contract**: documented in `AGENTS.md` as the repository-controlled boundary — `AGENTS.md` first, then sorted `agents/*.md`, then sorted `extras/*.md` — and explicitly excludes `.opencode/context/` and `.opencode/models.config.json`.
- **Phase 3 — Boundary baseline**: `tests/fixtures/prompt-prefix-boundary.txt` lists every boundary file exactly once, in sorted order, using forward slashes.
- **Phase 3 — Three new skills**: `skills/build-debug/SKILL.md`, `skills/dev-cleanup/SKILL.md`, `skills/npm-debug/SKILL.md`.
- **Phase 3 — `README.md` README consistency correction**: `oracle` is now listed in the Core routing tier table; the responsibility map and explicit opt-in classifications are preserved unchanged.

### Changed

- `README.md`: rewritten roster section — single responsibility map (six required concerns pinned to one specialist each), followed by the four-tier roster table. Quickstart reorganized into a four-step flow (prerequisites → installer → model profile → run orchestrator).
- `AGENTS.md`: roster table now partitioned into four tiers (Core routing, Core delivery, Conditional operations, Explicit opt-in extras); added "Prompt-Assembly Stable-Prefix Contract" section; documented the Single Primary Resolution (Phase 2) — `agents/orchestrator.md` is the sole `mode: primary` agent, `agents/security.md` was changed from `mode: primary` to `mode: subagent`.
- `QUICKSTART.md`: expanded to cover the installer flags, model-profile selection, and tier tokens.
- `agents/explorer.md`, `agents/librarian.md`, `agents/oracle.md`, `agents/profiler.md`: model field normalized to the tier-token form (`{{TIER_*}}`).
- `agents/security.md`: changed from `mode: primary` to `mode: subagent` (Phase 2 single-primary resolution).
- `agents/test-engineer.md`: `permission.edit` block added, scoped to `ask` on `*.test.*`, `*.spec.*`, `test/**`, `tests/**`, `__tests__/**` and `deny` elsewhere.
- `package.json`: version bumped from `0.1.0` to `0.2.2` (release metadata).

### Tests

- `tests/frontmatter-order.test.ts`: asserts the canonical top-level frontmatter key order for every `agents/*.md` and `extras/*.md` file, plus the single `mode: primary` invariant (now `["agents/orchestrator.md"]`).
- `tests/model-preset.test.ts`: covers `loadModelConfig`, `resolvePreset`, `resolveModelValue`, `listPresets`, `getPreset`, `getDefaultPreset`, `validatePreset`, `resolveModelConfig`, `TOKENS`, including malformed/missing/empty JSON and missing-tiers negative cases.
- `tests/routing-consistency.test.ts`: now also walks `extras/*.md` and asserts every agent ID in either bucket has a matching file, plus the orphan-agent-file check.
- `tests/skill-schema.test.ts`: now recursively scans `skills/` (including `skills/examples/`) and asserts `name` matches the immediate parent folder.
- `tests/stable-prefix-boundary.test.ts` (new): committed baseline matches the live filesystem enumeration; `.opencode/context/*` and `.opencode/models.config.json` are explicitly excluded; the boundary validator rejects wrong-order and duplicate boundaries and accepts canonical ones.
- `tests/installer-os-detection.test.ts` (new), `tests/validate-models.test.ts` (new), `tests/phase3-documentation.test.ts` (new).

### Notes

- The full `bun test` suite verifies 384 pass / 0 fail at release time.
- `.opencode/models.config.json` remains user-local and is explicitly excluded from this release. `CONTEXT-ANALYSIS.md` is a scratch file and is intentionally untracked and unstaged.
- The pre-existing `v0.2.0` / `v0.2.1` tags were not moved or re-pointed; this release ships as a new tag `v0.2.2` ahead of them.
