# OpenCode Orchestrator Kit — Context Collection

> Regenerated snapshot **as of v0.6.0 (Cognitive Research Mode), commit `52a85c0`,
> 2026-10-06**. Point-in-time analysis document; the README and
> `docs/CONFIGURATION.md` remain the canonical consumption docs.

## 1. Agents Roster & Model/Mode Analysis

### Core Agents (agents/) — 14 definitions

#### Primary Mode (1 agent):
1. **orchestrator.md** — mode: primary, model: `{{TIER_ROUTER}}`
   - Role: central coordination — breaks work into steps, assigns specialists, manages parallel/sequential execution, never touches application code
   - Read/write scope: `.context/progress.md`, `.context/decisions.md`, `.context/issues.md`, `.context/comprehension/*.md`, `plan/**/*.md`, `.context/research-dataset.jsonl` (only while research mode is on)
   - Extras: telemetry writer, comprehension gate classification, `/recall` and `/research-mode` handlers

#### Subagent Mode (13 agents):
2. **comprehension-coach.md** — `{{TIER_FAST}}`
   - Role: read-only comprehension coach — CHALLENGE then EVALUATE, never explains before the developer's reconstruction attempt; classifies gaps into four dimension tags (FLOW, RATIONALE, PREDICTION, LOCALIZATION)
   - Read/write scope: read-only; input limited to task goal, changed file list, focused diff, minimal surrounding symbols
3. **profiler.md** — `{{TIER_FAST}}` — repo bootstrap: tech stack, CI/CD, scaffolds PROJECT-PROFILE (write scope: `.opencode/PROJECT-PROFILE.md`, `.context/*.md`, `plan/README.md`)
4. **explorer.md** — `{{TIER_FAST}}` — fast codebase exploration, symbol tracing, structure questions (read-only)
5. **librarian.md** — `{{TIER_FAST}}` — research-focused, official-docs citations; opt-in via orchestrator routing rules (read-only)
6. **oracle.md** — `{{TIER_REASONING}}` — one well-reasoned architecture/design/strategy recommendation (read-only)
7. **planner.md** — `{{TIER_REASONING}}` — phased development plans (writes `plan/draft/*.md`, `plan/in-progress/*.md`)
8. **security.md** — `{{TIER_REASONING}}` — vulnerability detection, threat modeling, secure coding practices (read-only)
9. **developer-fixer.md** — `{{TIER_CODE}}` — unified implementation agent: Fixer mode (exact spec) or Developer mode (TDD)
10. **test-engineer.md** — `{{TIER_CODE}}` — QA: test strategy, behavior-level tests, coverage analysis (writes test files only)
11. **code-reviewer.md** — `{{TIER_REVIEW}}` — systematic review: bugs/security flaws, ranking, fix recommendations (read-only)
12. **build-helper.md** — `{{TIER_FAST}}` — build-tool error specialist (edits tsconfig/vite/webpack configs only)
13. **npm-helper.md** — `{{TIER_FAST}}` — npm/Node error specialist (edits package.json, package-lock.json, .npmrc)
14. **deploy-helper.md** — `{{TIER_FAST}}` — CI/CD & deploy failure specialist (edits .github/workflows, vercel.json, netlify.toml)

### Extra Agents (extras/) — opt-in via `--with-extras`
15. **writer.md** — `{{TIER_FAST}}` — technical writer for READMEs, APIs, architecture (documentation only)
16. **pc-doctor.md** — `{{TIER_FAST}}` — environment/PATH/services troubleshooter

### Mode Conflicts Analysis:
- **Resolved**: the pre-v0.3.0 situation of two primary agents (orchestrator + security) is gone — `security.md` is now `mode: subagent`. Exactly one primary agent exists.

### Model Distribution (default profile, per tier):
- **TIER_ROUTER** (`opencode-go/gpt-5.6-luna`): 1 — orchestrator
- **TIER_REASONING** (`opencode-go/kimi-k3`): 3 — oracle, planner, security
- **TIER_CODE** (`opencode-go/minimax-m3`): 2 — developer-fixer, test-engineer
- **TIER_REVIEW** (`opencode-go/minimax-m3`, falls back to TIER_CODE): 1 — code-reviewer
- **TIER_FAST** (`ollama/deepseek-v4-flash:cloud`): 9 — profiler, explorer, librarian, build-helper, npm-helper, deploy-helper, comprehension-coach (core) + writer, pc-doctor (extras)

## 2. Installer / Setup Mechanisms

### install.sh — main installer
- Modes: `project`, `global`, `studio`
- Flags: `--symlink`, `--with-extras`, `--with-examples`, `--skip-validation`
- Refuses unsupported shells; runs the Phase 1 model-profile validator before writing
- Copies/symlinks: `AGENTS.md`, `CONTRIBUTING.md`, `agents/`, `skills/`, `command/`, `extras/` (optional)

### Installation Targets
- **project**: `./.opencode/` + `./AGENTS.md`, `./CONTRIBUTING.md`
- **global**: `~/.config/opencode/` (all projects)
- **studio**: `~/.config/opencode-profiles/<profile>/`

### Command System — 3 commands (`command/`)
1. **start-session.md** — first command for bootstrapping; loads `.context/progress|decisions|issues.md`, gives a 3-4 line Italian summary, waits; **never auto-loads** the comprehension log, the research dataset, or asks the calibration question
2. **recall.md** — manual delayed-comprehension re-test (introduced v0.5.0): questions first, code after, appends `type=dci1` rows; manual invocation only
3. **research-mode.md** — opt-in A/B research lifecycle (introduced v0.6.0): `on`/`off` with explicit confirmation; zero overhead when off

### Measurement stack (since v0.4.0, in `.context/`)
- Comprehension gate: NONE (0 calls) / LIGHT / DEEP → `comprehension-coach`; DCI scoring + confidence calibration
- Retention: `DCI₁/DCI₀` per plan via `/recall` (since v0.5.0)
- Research mode: deterministic A/B slot alternation, 16-field JSONL tuple in `.context/research-dataset.jsonl`, COR (Cognitive Overhead Ratio) computable per pair (since v0.6.0)
- Privacy invariant: no source code and no personal answers are ever written to the comprehension log or the research dataset; both remain untracked

## 3. Skills Breakdown

### Universal Skills (always installed):
1. **github-actions-cicd** — GitHub Actions workflow structure and security conventions
2. **npm-debug** — npm/Node error decision trees (used by multiple agents)
3. **dev-cleanup** — safe cleanup of caches and dev artifacts
4. **build-debug** — build-tool error decision trees (used by build-helper)

### Stack-Specific Skills (skills/examples/, opt-in via `--with-examples`):
1. **python-conventions** — PEP 8 naming/formatting/import rules
2. **dotnet-conventions** — C#/.NET naming, style, DI conventions
3. **angular-patterns** — standalone components, file trios, Signals/RxJS conventions

### Skill Loading Pattern:
- Agents explicitly load skills before use (`skill({ name: "..." })`)
- Skills provide decision trees for deterministic fixes

## 4. Test Suite Analysis

**18 test files** (`tests/*.test.ts`) + `fixtures/` — suite: **521 tests, 903 expect() calls** at v0.6.0 (513 pass + 8 environment-dependent skips gated on OS, `installer-os-detection.test.ts`).

### Groups:
1. **Kit-integrity / assembly**: agent-schema, skill-schema, frontmatter-order, assembly-order, assemble-prompt, stable-prefix-boundary, cache — frontmatter schema, deterministic enumeration, prompt assembly contract
2. **Models / presets**: model-preset, validate-models — tier resolution, fallbacks (TIER_ROUTER→TIER_REASONING, TIER_REVIEW→TIER_CODE), placeholder detection
3. **Routing**: routing-consistency — disambiguation rules
4. **Docs**: phase3-documentation — README roster table + anti-duplication rules for README/QUICKSTART/SETUP-NATIVE
5. **Measurement (v0.4.0+)**: comprehension-coach, comprehension-config, telemetry-writer — gate flow, config contract (3 top-level sections: comprehension / recall / research), `dci0` row format
6. **Commands (v0.5.0+)**: recall-command, research-mode — manual-only recall, research-mode confirmation phrase, A/B alternation, dataset contract, mode-off regression
7. **Installer**: installer-os-detection — OS/shell gating (8 environment-dependent tests)

### Coverage Gaps:
- No application-code tests (by design: the kit orchestrates, it ships no app code)
- No integration tests for end-to-end agent workflows
- No performance/token-spend regression tests
- No security scanning of the kit itself

## 5. Documentation & Site Structure

### Documentation Files (10):
1. **README.md** — main documentation: overview, agent roster, quickstart (native + Studio), customization, Measurement (v0.4.0, /recall since v0.5.0), Research (since v0.6.0)
2. **CHANGELOG.md** — Keep a Changelog: `[0.6.0]` top through `[0.1.0]`
3. **QUICKSTART.md** — install-focused quick start (prerequisites, install.sh, provider mapping)
4. **CONTEXT-ANALYSIS.md** — this regenerated snapshot
5. **CONTRIBUTING.md** — contribution rules (tests mandatory for behavior changes)
6. **AGENTS.md** — subagent role map
7. **docs/ARCHITECTURE.md** (97 lines) — delegation flow, comprehension gate diagram (NONE/LIGHT/DEEP), coach exemption + input limits
8. **docs/CONFIGURATION.md** (311 lines) — models.config tiers/precedence, comprehension config (`.opencode/comprehension.config.json`), recall keys, `research.enabled` (default `false`), `enabled: false` v0.2.2-behaviour note
9. **docs/SETUP-NATIVE.md** (154 lines) — manual install path
10. **docs/SETUP-OPENCODE-STUDIO.md** (35 lines) — Studio profiles

### Site Structure:
- `site/` — generated static site (not tracked); deployed via GitHub Pages (`deploy.yml`)
- `src/` — site source (landing components, styles)
- Workflows: `test.yml` (Test) + `deploy.yml` (Pages) — the kit **has** its own CI since v0.1.x

## 6. Model Config / Profile Structure

### templates/models.config.json:
- Profiles: `default` (known-good) + `generic` (editable placeholders)
- Five tiers with fallbacks: TIER_ROUTER (→TIER_REASONING), TIER_REASONING, TIER_CODE, TIER_REVIEW (→TIER_CODE), TIER_FAST
- Agents reference `{{TIER_*}}` placeholders, resolved at install time — never edit `model:` lines directly
- Validation: `scripts/validate-models.sh` (must pass before install writes anything)

### templates/comprehension.config.json (user copy: `.opencode/comprehension.config.json`):
- Three isolated top-level sections: `comprehension` (gate mode/DCI), `recall` (`automatic: false` hard default), `research` (`enabled: false`, default OFF)

### Code Graph (CRG) Integration:
- Optional `code-review-graph` MCP server; used by explorer, security, code-reviewer for blast-radius analysis
- Must work identically whether present or absent; falls back to `read`/`glob`/`grep`

## Summary

### Core Strengths:
1. **Clear delegation model**: 16 agent definitions (14 core + 2 extras), exactly one primary
2. **Tier-based model economics**: model choice per task complexity, editable per deployment
3. **Human comprehension measurement**: gate → DCI + confidence → Retention (/recall) → Research mode (A/B + COR)
4. **Self-bootstrapping**: works on any repo, known or unknown
5. **Own CI**: Test + Pages workflows validate every push

### Areas for Enhancement:
1. Kit-internal tests only — no integration/performance tests
2. Research dataset analysis is ad-hoc (no pairing machinery; post-hoc pairing planned)
3. Studio-profile precedence quirks (documented in CONFIGURATION.md)

### File Structure Summary (at v0.6.0):
- **agents/**: 14 definitions + **extras/**: 2 = 16 total
- **command/**: 3 (start-session, recall, research-mode)
- **skills/**: 4 universal + 3 stack-specific examples
- **tests/**: 18 test files + fixtures (521 tests, 903 expect calls)
- **templates/**: models.config.json, comprehension.config.json
- **scripts/**: 9 (assembly, caching, presets, validation, site, OS detection)
- **docs/**: 4 + 6 root documents
- **.github/workflows/**: test.yml, deploy.yml
- **install.sh**: installer (project/global/studio modes)