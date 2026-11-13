# Changelog

All notable changes to this project are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Starting from v0.3.0, this project follows [Semantic Versioning](https://semver.org/) (SemVer): PATCH = fixes and tuning; MINOR = new backward-compatible capabilities; MAJOR = breaking changes to orchestration or configuration.

## [Unreleased]

- **`comprehension-coach` evidence modes (#137)**: the coach contract now splits BEHAVIORAL from IMPLEMENTATION evidence, tags every knowledge question with a verbatim source (`USER_GOAL` / `USER_OBSERVED_IO` / `READING_PACKAGE`), and grounds IMPLEMENTATION questions in a minimal reading package confirmed by `I have read this material.`; a declined package yields behavioral-only questions or SKIPPED — never an automatic FAIL.

## [1.1.1] — 2026-11-04

### Changed

- **`TIER_FAST` moves to `ollama/mimo-v2.6-flash:cloud`**: every agent on the fast tier (`profiler`, `explorer`, `librarian`, `build-helper`, `npm-helper`, `deploy-helper`, `comprehension-coach`, and the opt-in `pc-doctor` and `writer` extras) now resolves to `mimo-v2.6-flash:cloud` instead of `minimax-m3.1-flash:cloud`. `plugin/src/tiers.ts`, `templates/models.config.json` and the pin in `tests/ollama-preset.test.ts` move together; the test now accepts both `:<size>cloud` and `-cloud` model suffixes. No agent, command, skill or contract changes, so this is a patch.

## [1.1.0] — 2026-11-04

### Added

- **`orchestrator-quick`**: a second `mode: primary` agent (3,596-character prompt against the orchestrator's 23,961) for small tasks. Same read-only surface and the same kit invariants — it cannot edit application code, run the plan board or write `.context` — but its cycle is one classify, one delegation and one verification, with an explicit hand-back to `orchestrator` when the task needs more than one delegation, more than about five files, or must survive the session. `plugin/src/permissions.ts` now treats both routers through a `ROUTING_AGENTS` set instead of a hardcoded `"orchestrator"` in three places.
- **`/quick`**: packaged command that switches the session to `orchestrator-quick` and states the working rules (one delegation, raw verification output, stop and escalate when the task grows). Five commands are registered at runtime.
- **Small-task triage**: `agents/orchestrator.md` tells the full router to hand a one-file or plan-free request to `/quick` instead of running the multi-agent flow, citing the measured 2-3x cost.

### Changed

- **English-only shipped text**: the Italian prose left in `command/recall.md`, `agents/{profiler,comprehension-coach}.md`, `templates/design-rules.md`, `templates/models.config.json`, `docs/*.md` and in the comments/messages of `scripts/` and `plugin/src/` is now English. `scripts/plan-board.py` and `plugin/src/plan-board.ts` carry the same translated messages, so the parity test still compares like with like. Test titles and comments are untouched: renaming them touches `tests/fixtures/baseline-failures.txt` and belongs to its own change.
- **Agent descriptions compressed**: the 18 frontmatter `description:` fields now carry one role sentence plus an explicit `Not for …` scope where two agents compete (build/npm/deploy helpers, code-reviewer/security, profiler/librarian, developer-fixer/test-engineer). Total 3.178 characters, down from 3.830; `tests/agent-descriptions.test.ts` caps each description at 260 characters and pins the routing terms that must survive a future edit.
- **Orchestrator prompt trimmed to 22.652 characters** (was 23.961, against a 24.000 cap — 39 characters of headroom left): the six subsections `Context slicing` … `Research mode` no longer restate what `skills/comprehension-workflow/SKILL.md` and `command/{recall,research-mode}.md` already define as canonical; every contract sentence asserted by `tests/recall-command.test.ts`, `tests/telemetry-writer.test.ts` and `tests/comprehension-config.test.ts` is preserved verbatim. The budget guard W1 now covers all 18 agent prompts at current size + 5%, so a prompt can shrink freely and can only grow by editing the table on purpose.
- **`AGENTS.md` down to 11.617 characters** (was 15.552, −25%): the `Prompt-Assembly Stable-Prefix Contract` block — stable prefix, boundary baseline, frontmatter key order, single primary agent — moved verbatim to `CONTRIBUTING.md#prompt-assembly-stable-prefix-contract`, where contributors read it and no agent pays for it on every request. `AGENTS.md` keeps a four-line pointer; `tests/agents-instructions-budget.test.ts` caps the file at 12.000 characters and fails if the contract comes back.

### Removed

- **GitHub automation beyond CI**: `.github/workflows/agent-issue.yml` (comment `/agent` and label `agent:run`) went away with its runner prompt (`.github/agent/agent-issue.md`) and CI model preset (`.github/agent/ci-free.json`); so did the plan-board issue mirror — `.github/workflows/plan-adopt.yml`, `.github/workflows/plan-sync.yml`, `scripts/issue_bridge.py` and the `plan:*` labels. The repository now runs only `test.yml`, `deploy.yml` and `release.yml`: code arrives through a normal pull request, and the board in `plan/` is local to the repository. `tests/no-github-automation.test.ts` fails if that set changes, if a workflow triggers on `issues`/`issue_comment`, runs `opencode run`, calls `gh issue`, reads `OPENCODE_API_KEY`, or uses a `plan:*` label. Dependabot (`.github/dependabot.yml`) covers the bun toolchain and GitHub Actions.

## [1.0.1] — 2026-11-03

> Not published to npm: the release was prepared on `main` and never tagged. Its changes reach npm for the first time in 1.1.0.

### Added

- **MCP least privilege**: `plugin/src/permissions.ts` prepends `mcpDefaultDenies()` — `{ action: "code-review-graph_*", resource: "*", effect: "deny" }` — to every agent's translated rule list, so a declared `<server>_<tool>: allow` is a real allowlist and any undeclared tool of that family, `apply_refactor_tool` included, resolves to `deny` instead of the host default. `assertKitPermissionInvariants` fails the setup when an agent can reach `code-review-graph_apply_refactor_tool`, and `MCP_SERVER_PREFIXES` lists the families that get this default.
- **Graph lifecycle**: `explorer` and `code-reviewer` may call `code-review-graph_build_or_update_graph_tool` (it writes only `.code-review-graph/graph.db`, never sources) and their prompts describe the `status: not_ready` / `reason: stale_graph` recovery: rebuild once, retry, then fall back silently. `orchestrator` gets the read-only `code-review-graph_get_minimal_context_tool`.
- **Explorer and planner tool surface**: `agents/explorer.md` documents the graph call as the FIRST tool call of any multi-file exploration, with the Code Mode namespacing rule (MCP tools through `tools["<server>"]`, native tools called directly — `tools.shell(...)` fails); `agents/planner.md` declares that it has no native `ls` or `sed` and that `shell` is limited to `ls`, `cat` and read-only git.

### Fixed

- **`plan_board` was not a first-class tool**: the plugin registered it through Code Mode, so the host never exposed `plan_board` to the agents; it is registered with `options: { codemode: false }` and covered by a description contract test. Its `execute` is now `async` (`Promise<string>`), because the host chains `.then` on the return value and every call failed with `t(s).then is not a function`.
- **Folded YAML descriptions**: twelve agents were registered with the literal description `">-"`. `plugin/src/frontmatter-map.ts` exports `parseFrontmatterScalar`, shared by the loader and the test helper, so a `description: >-` block folds to its real sentence.
- **`missing-column` on plan-board writes**: `new` and `move` create the destination column when it is absent on disk instead of failing — in the TypeScript port and in `scripts/plan-board.py`, which previously raised. `check` still reports the missing column as a warning.
- **plan-writer V1 shell patterns**: the fallback matches the commands people actually run (`python *plan-board.py *`, `python3 *plan-board.py *`, `py -3 *plan-board.py *`) plus `rm .context/plan-body-*.md` for the staging cleanup; the previous glob never matched.

### Changed

- **README: when to use the kit**: the README states the design envelope — long, multi-phase or multi-session work — and tells readers to use OpenCode's built-in `Build` or `Plan` agent for anything that fits in a single context. Two measured runs (a research task and an implementation task on three identical worktrees of this repository, graded by the same external harness) document that boundary, with the reproduction query and an explicit note that the long-session regime is not measured yet.
- **Board outcome verification**: the orchestrator and plan-writer contracts require `ok: true` in the tool payload before a board operation counts as done, and require quoting `code` and `message` verbatim when it is false.
- **Landing page**: the GitHub Pages site matches the npm 1.0.0 install (quickstart tabs for npm, git, a local `plugin/` directory, legacy `install.sh`, and OpenCode Studio). The agent roster and its counts are derived from `agents/` and `extras/` frontmatter. The page adds a What's new in 1.0 section and the four commands (`/start-session`, `/recall`, `/research-mode`, `/close-session`). The docs build prerenders the page, refreshes `sitemap.xml` `lastmod`, and injects `softwareVersion` from `plugin/package.json`. `.gitignore` anchors the docs build output as `/site/` so `src/site/` is not ignored.
- **npm package metadata**: `plugin/package.json` sets `homepage` to the GitHub Pages URL, adds discovery `keywords`, and describes `/start-session`, `/recall`, `/research-mode`, and `/close-session`. The version moves to `1.0.1` with this release.
- **OpenCode 2 install path**: README, QUICKSTART, `docs/MIGRATION-V1-V2.md`, `docs/SETUP-NATIVE.md`, and CONTRIBUTING describe the published npm package `opencode-orchestrator-kit` (1.0.0) as the primary OpenCode 2 install. The `plugins` entry keeps the documented object form `{ "package", "options" }`. A local `plugin/` directory and `opencode plugin add 'github:NicoGenti/opencode-orchestrator-kit#main::path:plugin'` stay as alternatives. `install.sh` stays the legacy v1 path. The release workflow comment records that 1.0.0 is already on npm and that a later tag still needs `NPM_TOKEN`.
- **Plan 13 stays in `qa`**: `plan/qa/13-migrare-il-kit-al-plugin-opencode-2` was checked against its completion line (npm release v0.7.0 or v1.0.0, green CI, updated CHANGELOG, and a `v1` branch for the old installer). `opencode-orchestrator-kit@1.0.0` is published (tag `v1.0.0` at `9bc59b4`; the Release workflow on that tag succeeded; `## [1.0.0]` is in this changelog). The `v1` branch is absent (`origin` has only `main`), so that line is still unmet and the plan was not moved. Issue #13 remains open. Standing authorization covers `check` and `move` only, so the plan body was left unchanged.

## [1.0.0] — 2026-11-02

### Added

- **npm release workflow**: `.github/workflows/release.yml` runs only on tags `v*`. It installs dependencies, runs `bun test`, `bun run typecheck`, `bun run lint`, `bun run format:check`, and `bun run sync-assets --check`, checks that the tag (without the leading `v`) equals `plugin/package.json`'s version, then runs `npm publish --provenance --access public` from `plugin/` with the `NPM_TOKEN` secret and `id-token: write`. It does not run on pull requests, so it can merge before the secret exists. npm publication of `opencode-orchestrator-kit` stays pending until the first such tag.
- **`bun run bump-version <x.y.z>`**: sets `package.json` and `plugin/package.json` to the same version and promotes `## [Unreleased]` to `## [x.y.z] — <UTC date>`, leaving a fresh empty `[Unreleased]`. It does not tag or publish. `tests/version-sync.test.ts` asserts both manifests match the latest released changelog heading. The release steps (bump, pull request, merge, tag) are in `CONTRIBUTING.md`.
- **`bun run sync-assets`**: regenerates `plugin/assets/` from `agents/`, `extras/`, `skills/`, and the four packaged commands (`command/start-session.md`, `command/recall.md`, `command/research-mode.md`, `command/close-session.md`). `--check` exits non-zero when the mirror has drifted. The plugin `prepack` script runs the writer, and `tests/plugin-assets-parity.test.ts` tells contributors to run `bun run sync-assets` when a copy drifts.
- **Companion kit contract**: README and CONTRIBUTING describe an optional extension contract. Skills install at `.opencode/skills/<name>/SKILL.md`. `web-*` is reserved for web-stack skill packs and is allowlisted on `orchestrator`, `oracle`, `developer-fixer`, `code-reviewer`, and `deploy-helper`. `project-*` is reserved for a consuming project's own skills and is allowlisted on `orchestrator`, `developer-fixer`, and `code-reviewer`. `developer-fixer` asks before `npx`, `dotnet`, `ng`, `docker build`, and skill `bash`/`sh` scripts. A companion registers its own commands. `templates/design-rules.md` is a template users customize. This kit does not fetch or pin another repository.
- **Reserved `project-*` skill prefix**: `orchestrator`, `developer-fixer`, and `code-reviewer` allow `project-*`, so a consuming project can add its own skills without editing the kit. `tests/skill-allowlist.test.ts` allows a glob that matches zero shipped skills only for the documented reserved prefixes `web-*` and `project-*`. README and CONTRIBUTING describe the real allowlist procedure (a `skills/<name>/SKILL.md` file is not loaded while `"*": deny` is the catch-all).
- **`/close-session` on the plugin**: the plugin registers the fourth kit command together with `/start-session`, `/recall`, and `/research-mode`. `bun run sync-assets` packages `command/close-session.md`.
- **Design-first bootstrap (plan 0001)**: the session bootstrap now checks for a design-rules artifact (`.context/DESIGN-RULES.md`, root `ARCHITECTURE.md`, or root `DESIGN-RULES.md`); on a new/empty repo the `profiler` asks for the project goal and seeds `.context/DESIGN-RULES.md` from the user's answers, while existing artifacts are detected and reported for user-approved normalization only.
- **Web-kit UI & Delivery section**: `templates/design-rules.md` and the profiler's inline design-rules draft gain `## UI & Delivery` (DR-UI-1…13). The profiler fills it only when the user states the project is a web-kit site; otherwise the section stays empty, and the template comment says to delete it when web-kit does not apply.

### Changed

- **`plan-writer` plan-board invocation**: the prompt prefers the native `plan_board` tool on OpenCode 2 and falls back to `python3 scripts/plan-board.py` on the V1 installer. `permission.bash` allows both `python3 */plan-board.py *` and `python */plan-board.py *`. Covered by `tests/permission-matrix.test.ts`.
- **Orchestrator frontmatter**: `agents/orchestrator.md` uses the same YAML block style as the other agents. `permission.subagent` is now the V1 name `permission.task` (the translator still emits V2 `subagent`). `tools` entries that were `true` for `webfetch`, `write`, and `edit` are removed; those values are ignored by the translator and contradicted the permission block. `read`, `glob`, `grep`, and `bash` stay, matching the free-tier routing harness. `tests/v2-permission-snapshot.test.ts` locks the translated rules.
- **Unknown permission actions**: `oracle` no longer allows `query`, and `librarian` no longer denies `check_diagnostics`. Neither name is a V1 or V2 permission action. `tests/agent-schema.test.ts` rejects unknown permission actions and tool keys, including the V2 names `subagent` and `shell` written in V1 frontmatter. MCP ids stay allowed when the server name contains a hyphen.
- **OpenCode 2 install docs**: README, QUICKSTART, and the migration guide state that the npm package is not published yet. Until the first tag, the primary install is a local `plugin/` directory in the `plugins` array (`{ "package", "options" }`, the shape in the OpenCode 2 plugin docs). `opencode plugin add` with `github:NicoGenti/opencode-orchestrator-kit#main::path:plugin` is the documented git path, because the plugin is not at the repository root.
- **Agent issue workflow**: `KIT_SHA` defaults to `github.sha` (this checkout) unless the repository variable `AGENT_KIT_SHA` pins another commit. `MODEL` comes from the repository variable `AGENT_MODEL`, falling back to `opencode/mimo-v2.6-flash-free`. The pre-v0.7.0 hardcoded commit is gone.
- **V1 extras install target**: `install.sh --with-extras` and `scripts/install-freellmapi.sh --with-extras` copy `pc-doctor.md` and `writer.md` into `agents/`. OpenCode loads `{agent,agents}/**/*.md` and does not load an `extras/` directory ([Agents](https://opencode.ai/v2/docs/agents/)).
- **Plan-board writes in source frontmatter**: every agent except `plan-writer` denies `plan/**/*.md` in its own `permission` block, including the orchestrator (previously `"plan/**/*.md":"allow"`). The plugin still appends the same deny last. V1 and the translated rules agree without relying on that append. `bun run sync-assets` refreshed the packaged copies.
- **CI quality gates**: `.github/workflows/test.yml` now runs `bun run typecheck`, `bun run lint`, and `bun run format:check` in addition to `bun test`. The job installs Python 3.12 and aliases `python` to `python3` when `python` is not already on `PATH` (the freellmapi profile tests invoke `python`).
- **Typecheck and lint coverage**: `tsconfig.json` and `eslint.config.js` now include `tests/` and `scripts/*.ts`. Tests keep a targeted override that turns off `@typescript-eslint/no-explicit-any` for subprocess JSON; scripts stay on the recommended rule.
- **Formatting**: one Prettier pass so `bun run format:check` is clean. `extras/`, `agents/`, `skills/`, and the packaged agent and skill mirrors stay in `.prettierignore`: Prettier rewrites an unquoted `model: {{TIER_*}}` YAML scalar into a flow mapping, and formatting only one side of a mirror would fail `tests/plugin-assets-parity.test.ts`. `plan/` stays ignored because `scripts/plan-board.py` parses that frontmatter.

### Fixed

- **Plan board drift**: `0001-design-first-bootstrap` moved from `plan/draft/` to `plan/qa/` (PR #54 and this changelog record the work; no comprehension outcome is recorded, so it is not `complete`). `0002-design-first-governance` moved to `plan/in-progress/` with phases A–E and G checked. Phase F and phase H stay open. `plan/qa/13` stays in `qa` (issue #13 is still open, and the plan's own completion line requires an npm publish that this changelog still lists as pending).
- **`install.sh --with-examples`**: the base skills copy no longer includes `skills/examples/`, so the flag is what installs that directory. `--upgrade` (alias `--force`) overwrites kit-managed files and moves the previous path to `<path>.kit-backup`; the default re-run still skips existing destinations. Covered by `tests/installer-flags.test.ts`.
- **Agent permission hardening (OpenCode v2 last-match-wins)**: agent rules no longer rely on the host allow-everything default, and broad shell globs no longer allow destructive commands. `developer-fixer` drops dead `git` allows that sat before `git *: deny` (commit, push, merge, and the other mutating git allows); read-only git allows stay after the deny. `comprehension-coach` gains a bash deny baseline plus read-only allows, and both `comprehension-coach` and `plan-writer` deny every skill. `oracle`, `test-engineer`, `writer`, and `security` deny subagent spawning. Generic pipe allows are removed from `explorer` and `librarian`. `find` allows are followed by denies for `-delete`, `-exec`, `-execdir`, and `-ok`. `gh api *` is `ask` on `deploy-helper` and `librarian`. `developer-fixer` asks before `npx`, `dotnet`, `ng`, `docker build`, and `bash`/`sh` skill scripts so the web-kit `/new-site` flow can run. `assertKitPermissionInvariants` requires a shell, skill, and subagent catch-all and denies `developer-fixer` spawning for every agent except the orchestrator. Covered by `tests/permission-matrix.test.ts`.
- **Per-agent skill allowlists**: `permission.skill` now names only skills that ship in `skills/` (including `skills/examples/`, matched by each `SKILL.md` `name:`) or a documented reserved glob (`web-*` for web-stack skill packs, and `project-*` for a consuming project's own skills). Removed allowlist entries that do not ship (`conductor`, `debug`, `deslop`, `simplify`, `code-quality`, `security`, `windows-env`, `windows-schtasks`, and the exact names `web-theme` / `web-deploy`, which `web-*` already covers). `developer-fixer` allows `build-debug`, `npm-debug`, `dev-cleanup`, `structural-search`, `angular-patterns`, `dotnet-conventions`, `python-conventions`, and `web-*`. Covered by `tests/skill-allowlist.test.ts`.

## [0.7.0] — 2026-10-27

### Added

- **Token-aware exploration ladder (P0, #33)**: the `explorer` now follows a search ladder — repo map (if present) → lexical `rg` → optional ast-grep structural search → optional Code Review Graph → targeted reads — stopping at the first level that answers. Adds bounded-read rules (200-line whole-file threshold, contextual slices for larger files), depth-based read budgets (quick 5 / medium 12 / thorough 25), a compact output contract (`path:line-range — finding`, max 15 findings, max 5 pasted code lines, explicit `Not checked:` section), and changes unrestricted `cat *` to `cat *: ask`.
- **Profiler-generated repo map (P1, #34)**: the `profiler` now generates `.context/repo-map.md`, a derived, refreshed-on-every-run navigation artifact with a hard 300-line budget, fixed sections (Stack / Directory Layout / Key Entry Points / Notable Modules), max 30 module entries, truncation rules, and a navigation-aid-only invariant. Covered by `tests/profiler-repo-map.test.ts`.
- **Optional ast-grep structural search (P2, #35)**: the `explorer` can use `sg` (ast-grep) as an optional level 1.5 for structural queries (function defs, call sites, class usage) when the binary is available, with silent fallback to `rg`. New opt-in skill `skills/structural-search/SKILL.md` documents patterns and safety rules (read-only, no `--rewrite`).
- **Token-usage benchmark protocol (P2, #35)**: new `docs/BENCHMARK-TOKEN-USAGE.md` defines a reproducible A/B protocol (with/without repo map) with fixed task sets, metrics (tool calls, lines read, findings, tokens), a recording template, and an explicit project-specific/not-scientifically-validated disclaimer.
- **OpenCode 2 plugin package (`opencode-orchestrator-kit` / npm distribution)**: the kit now ships as an OpenCode 2 plugin (`plugin/`, `Plugin.define`, peer dependency `@opencode/plugin ^2.1.0`) providing runtime registration of the full agent roster. Setup options: `preset` (the five bundled presets mirror `templates/models.config.json`; a preset whose tiers are all `placeholder/*` fails fast with a `TierConfigError`) and `withExtras` (default `false`). User configuration always wins: agent `transform` upsert only when the editor returns nothing.
- **Runtime command registration**: registers `/start-session`, `/recall`, and `/research-mode` commands at plugin load.
- **Agent roster**: 15 core agents, plus `pc-doctor` and `writer` when `withExtras` is true.
- **Plan board tool**: native `plan_board` TypeScript port of `scripts/plan-board.py`, exposing the same standing-authorization contract (check plus move of conforming plan files without per-request approval; every other board mutation, including `new`, `adopt`, body edits, deletion and rename, requires approval).
- **5-tier model resolution**: logical tiers `ROUTER`, `REASONING`, `CODE`, `FAST`, `REVIEW` with fallback mappings `ROUTER→REASONING` and `REVIEW→CODE`, resolved at runtime from the bundled presets; logical `{{TIER_*}}` tokens are resolved from those presets at registration, and the V1 fail-fast-on-placeholder policy is preserved as a plugin-side `TierConfigError`.
- **Comprehension-gate library + V1→V2 permission translation**: the comprehension gate (classification, Slicer, DCI, telemetry) is available to the plugin through a TypeScript library; the plugin translates the V1 agents' permission surfaces into the OpenCode 2 plugin format while preserving kit invariants.
- **Plugin/asset parity and integration tests**: `tests/plan-board-parity.test.ts` (TypeScript port vs `scripts/plan-board.py`) and `tests/plugin-integration.test.ts` (registration surface, options, fail-fast, package sanity).
- **V1→V2 migration guide**: new `docs/MIGRATION-V1-V2.md` — what changes with the plugin (runtime registration instead of copy-install, runtime tier resolution instead of install-time substitution, `plan_board` standing authorization), what does not change (orchestration contract, 9-section task specs, agent behavior), step-by-step migration, options table, rollback and troubleshooting.
- **README/QUICKSTART restructure**: the OpenCode 2 plugin is now the primary install path (`plugins` entry in `opencode.json` with the `preset`/`withExtras` options); the `install.sh` copy-based installer is documented as a deprecated legacy subsection, linked to the migration guide.
- **install.sh deprecation**: the copy-based installer is now marked deprecated; its header and a stderr notice direct OpenCode 2 users to the plugin and `docs/MIGRATION-V1-V2.md`, while the installer stays functional on the v1 line with every flag/allowlist/behavior unchanged.
- `docs/FEEDBACK-WINDOW-{SURVEY,WALKTHROUGH,RUN-GUIDE,RESULTS}.md` and `command/close-session.md`, previously present in the working tree only, are now versioned.
- `plan/<column>/.gitkeep` placeholders: a fresh clone now carries the four board columns, so `scripts/plan-board.py check` no longer fails with `missing-root`.

### Changed

- **Repository hygiene**: `.opencode/` (the `./install.sh project` self-install used for local opencode2 development) and `.hermes/` (agent-local plan-mode state) are now fully gitignored; `.opencode/PROJECT-PROFILE.md` and `.opencode/models.config.json` left the index via `git rm --cached` (they stay on disk, they leave the published repo). The `.gitignore` negations for `.context/` and `plan/` were rewritten into rules that actually hold: only `.context/{decisions,issues,progress}.md`, `plan/README.md`, `plan/.gitignore` and the four `plan/<column>/.gitkeep` placeholders are versioned.
- **`scripts/plan-board.py`**: the `--root` default is now `plan` relative to the working directory (it used to be a maintainer-local path) and the tool description no longer names a private repository; covered by a regression test.
- **`tests/setup-oc2-fm-profile.test.ts`**: the private-profile gate derives `~/.opencode2` from `os.homedir()` instead of a hardcoded user path.
- **`.github/workflows/test.yml`**: `bun-version` pinned to `1.2.21`, matching `deploy.yml` and `packageManager` in `package.json`.

### Fixed

- **Board/issue drift (#19)**: the stale binding to deleted issue #19 was removed from `plan/qa/19-agent-smoke-aggiungi-script-bun-audit-e-file-ope.md` so `issue_bridge.py push` can recreate the mirror on the next run.

### Removed

- `CONTEXT-ANALYSIS.md` (point-in-time v0.6.0 scratch snapshot; recoverable from git history), `scripts/verify-assembly.ts` (unreferenced — `bun test` covers the same ground; recoverable from git history), and the local-only dumps `output.txt`, `output2.txt`, `plan/draft/test_write.txt`.
- The stray empty `## [Unreleased]` heading left mid-file: the changelog now carries a single Unreleased section, at the top.

## [0.6.8] — 2026-10-08

### Fixed

- **Docs alignment to the v0.2.2 → v0.6.7 flow (docs-only release)**: full documentation audit against the version timeline. README roster prose says 15 specialists (matching the `agents-15` badge and the AGENTS.md roster); the Measurement paragraph describes the current flow (per-evaluation `/recall` selection, flat `<evaluation-id>.md` records, immutable immediate baseline, append-only recalls); the `librarian` install story is aligned everywhere — it ships in `agents/` and is installed by default (the installer copies `agents/` unconditionally), routed only for remote documentation lookups: README, QUICKSTART, SETUP-NATIVE troubleshooting, AGENTS.md and the `agents/orchestrator.md` routing table all say so (no more "copy it manually" instructions).
- **README English-only**: the two Italian sentences left in the Measurement/Research paragraphs are translated to English.
- **CONTEXT-ANALYSIS**: research tuple field-count note updated (16 at v0.6.0 → 17 at v0.6.3 → 19 at v0.6.4, `ResearchTupleV1` / `DatasetEventV1`); the file remains a point-in-time v0.6.0 snapshot.

## [0.6.7] — 2026-10-07

### Changed

- **Flat per-evaluation record paths (`<evaluation-id>.md`)**: the per-evaluation comprehension record home becomes `.context/comprehension/<plan-id>/<research-id>.md` — plan re-evaluations never overwrite or collapse earlier sessions; plan stays human metadata, `research_id` is the correlation key.
- **Kit-side id helper `scripts/record-id.ts`**: agents generate task/research ids via `crypto.getRandomValues` (16 bytes, CSPRNG) instead of inventing the suffix manually; `command/research-mode.md` and `agents/orchestrator.md` declare its use (bash-executable).
- **Immutable immediate baseline in /recall (step 9)**: `dci_immediate`, `user_confidence_immediate` and `outcome_immediate` are never rewritten by a recall; every recall appends a NEW event line on the record and the dataset — no in-place rewrite anywhere (W11 pins updated to guard the negative).
- **/recall selection by evaluation (steps 1–2)**: candidates are enumerated per evaluation (plan-id + evaluation_id + research_id + last outcome + date); selection by number or `evaluation_id`; the plan-id is used only when that plan has exactly ONE evaluation; the whitelist follows the flat record path.
- **Collision wording**: "tasks activated in the same second never collide" → "negligible collision probability" — uniqueness is probabilistic at 128 CSPRNG bits; the validator message and flow examples in `command/research-mode.md` carry the suffix; the FNV-1a reference pin in the tests is corrected to the real value (`7b5ce7f3`).
- **DatasetEventV1 invariance preserved**: schema_version stays 1, the dataset stays append-only; the record path change does not touch the event model.

## [0.6.6] — 2026-10-07

### Fixed

- **Robust `research_id` format v0.6.6 (`res-YYYYMMDD-HHMMSS-<32hex>`)**: the v0.6.5 8-hex `FNV-1a` suffix is retired — the id is now the task-start timestamp plus 16 random bytes (128-bit CSPRNG, UUID-v4 class). Uniqueness is probabilistic at 128 bits and no longer claimed as a deterministic guarantee. Legacy ids from v0.6.0–v0.6.5 (timestamp-only or `+8hex`) are rejected on write and recognised only by `isLegacyResearchId` in tests.
- **Per-evaluation comprehension records (append-safe)**: the record home moves from the single per-plan file `.context/comprehension/<plan-id>.md` (overwritten on re-evaluation) to one record per evaluation at `.context/comprehension/<plan-id>/<research-id>.md` — plan re-evaluations never overwrite or collapse earlier sessions; plan stays human metadata, `research_id` is the correlation key.
- **/recall selects a specific evaluation**: candidates are enumerated with plan-id + research_id + last outcome + date (glob `**/*.md`); the user's selection pins one specific `research_id`; the delayed DCI₁ always references a specific research_id — no ambiguous plan-only lookups.
- **Routing prose test no longer pre-filters fabricated runtime ids**: every backtick token in `agents/orchestrator.md` prose must resolve (agent file / real skill / pinned non-agent vocabulary) — an invented runtime fails the suite instead of being masked by an existence check applied before validation.
- **DatasetEventV1 invariance preserved**: schema_version stays 1, the dataset stays append-only; only the research_id value format changes (declared here explicitly).
- **Canonical docs ↔ validator alignment**: one research_id format across `command/research-mode.md`, `tests/contract-fields.ts`, skill, docs and this changelog; validator, examples and documentation coincide; wording that implied deterministic uniqueness (e.g. references to the retired hash) is removed from live docs while this entry records the history.
- **Installer test helper: paths with spaces no longer break the stdin-driven bash spawn**: `runWithExports` in `tests/installer-os-detection.test.ts` embedded the script path unquoted into the stdin body — on repo checkouts whose path contains spaces (e.g. `.../File 4 - Programmare/...`) bash split the path at the space instead of passing it through; the path is now single-quoted POSIX-style (POSIX `shq` escaping) before it enters the command body; all 9 installer OS-gate tests pass on space-containing paths.

## [0.6.5] — 2026-10-07

### Fixed

- **Regression cleanup (routing)**: the `Tier Classification (Phase 2)` section is removed from `agents/orchestrator.md` — routing no longer estimates Tier L/M/H and routes directly through the real runtime roster (`profiler`…`librarian`, incl. `extras/`); model-size tiers stay a runtime concern and are pinned out of routing prose.
- **Routing-consistency extended beyond the table**: the prose of `orchestrator.md` is now scanned too — every runtime id named for routing must exist in `agents/`/`extras/`; anti-Tier-L/M-H pins (orchestrator prose + AGENTS.md roster); retired taxonomy tokens (`sisyphus`, `metis`, `momus`, `explore`, `fixer`, `hephaestus`) are rejected as standalone words (hyphenated compounds like `developer-fixer` stay legitimate).
- **Unique `research_id` format v0.6.5 (`res-YYYYMMDD-HHMMSS-8hex`)**: an 8-hex uniqueness suffix (deterministic FNV-1a over `timestamp:index`, UUID-style, 32-bit entropy) makes tasks activated in the same second collision-proof while the timestamp part stays human-sortable; the hex class is case-insensitive; the validator message and flow examples in `command/research-mode.md` carry the suffix; the FNV-1a reference pin in the tests is corrected to the real value (`7b5ce7f3`).
- **`research_id` lifecycle + record**: the id is generated ONCE at task start and reused verbatim on the recall event and the per-plan record (never regenerated/mutated); the per-plan record gains a `research_id: <res-YYYYMMDD-HHMMSS-8hex>|n/a` field and `/recall` copies the correlation id from it verbatim — plan remains human metadata, never the dataset key.
- **Snapshot semantics for `.context/progress.md`**: orchestrator Close and `/recall` step 9 (command + skill) now explicitly full-overwrite `progress.md` — snapshot of the CURRENT state, pointer removal on completion, never a per-task history line ("update", not "append/accumulate").
- **Least privilege on the dataset (P3)**: `.context/research-dataset.jsonl` loses the orchestrator's edit permission — append-only by permission surface, not just by convention (the v0.6.4 backfill is already retired with the v0.6.4 append-only recall event); the comprehension log keeps exactly one sanctioned bounded edit (malformed-row normalisation); `W8b` test pin inverted accordingly.
- **DatasetEventV1 invariance pins**: `TASK_FIELDS` (19, canonical order), `RECALL_FIELDS` (8) and the `FORBIDDEN` set are pinned exhaustively — any schema change to the research contract must now be a deliberate, documented act (silent drift fails the suite).
- **Prompt budget held**: `agents/orchestrator.md` stays within the 24,000-char budget (W1 pin unchanged; currently ≈19.9k).

## [0.6.4] — 2026-10-07

### Fixed

- **Unique research tuple schema (P0)**: schema divergence between the behavioral A/B flow and the documented contract resolved — flow and tests now emit **`ResearchTupleV1`** (the 17 documented fields, canonical order; the v0.6.0 flow tuple shared only ~6 fields with the contract and used enum values `"estimate"`/`"actual"`, now retired in favour of `estimated`/`exact`).
- **Edit allow on both metric sinks (P0)**: the orchestrator frontmatter edit map now includes `.context/comprehension-log.md` and `.context/research-dataset.jsonl` (v0.6.2 covered write only) so sanctioned maintenance edits — log-row normalisation (malformed-row → canonical format) and dataset `dci_delayed` backfill via `/recall` — are permitted exactly where the contract writes.
- **Aligned boundary wording (v0.6.3)**: `/research-mode`, the orchestrator's Hard boundary clause, the `comprehension-workflow` skill and `/recall` now describe the same single sanctioned edit per sink: append-only rows, no deletes, no history rewrites, reads lifecycle-scoped, never at bootstrap; the `dci_delayed` backfill runs only between tasks, on explicit user invocation.
- **/recall out of the task lifecycle**: the normative A/B example no longer places `/recall` inside a research task; `command/recall.md` gains an explicit isolation sentence plus the bounded dataset-backfill clause (single-row locate, `dci_delayed` only).
- **Deterministic contract tests**: new `tests/contract-fields.ts` exports the canonical field order, a pure slot-routing function and a `JSON.parse`-based fence parser; `research-mode` and `workflow-hardening` tests validate both example tuples by key set, order, enums and slot routing (A then B, one per task) instead of counting prose tokens.

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

- **On-demand cognitive workflow details**: the comprehension-gate operational protocol (configuration precedence, Slicer pipeline, telemetry row contract, per-plan retention records, escalation routing, /recall flow) moved out of `agents/orchestrator.md` into the new `comprehension-workflow` skill, loaded only when running a LIGHT/DEEP gate or `/recall` — the orchestrator keeps routing, NONE/LIGHT/DEEP classification, activation conditions and token-efficiency budgets, with a regression test pinning the prompt budget at 24,000 characters.
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
- **Bootstrap isolation preserved**: `/start-session` still loads exactly the three memory files; `/recall` reads the log and records only under explicit user invocation.

### Changed

- Configuration file gains a third top-level section, `research` (default `false`), documented in `docs/CONFIGURATION.md` alongside comprehension and recall.

## [0.5.0] — 2026-10-06

### Added

- **Manual `/recall` command**: re-activates a completed plan's comprehension session on explicit request only — asks the stored knowledge questions from memory BEFORE any code or explanation is shown, then re-scores with the DCI rubric under the same slicing caps (max 1 retry, skip always available).
- **Per-plan comprehension records**: at each gated LIGHT/DEEP verdict, the orchestrator writes `.context/comprehension/<plan-id>.md` with the asked questions verbatim, final DCI, outcome, and date — never user answers. `/recall` reuses the stored record when present, else reconstructs questions from the plan document (`src=reconstructed`).
- **Delayed evaluation rows**: `/recall` appends `type=dci1` rows to the same append-only telemetry log (same header-once, metrics-only, no-prose discipline), enabling delayed comprehension data alongside the immediate gate rows.
- **Recall configuration stub**: `recall.enabled` (default `true`) and `recall.automatic` (default `false`, hard limit — automatic recall is a non-goal; no scheduler, no trigger) documented in `docs/CONFIGURATION.md`.
- **Bootstrap isolation preserved**: `/start-session` never loads the comprehension log and performs no telemetry writes during bootstrap; the loaded set stays progress.md, decisions.md, issues.md.

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
- **Context slicing (explorer-as-Slicer)**: git diff → changed symbols → surrounding context → hotspot extract ≤ maxDiffLines (300) focused lines → slice passed to c...[truncated]
