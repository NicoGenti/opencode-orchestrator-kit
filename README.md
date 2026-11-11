# OpenCode Orchestrator Kit

**A cost-aware, multi-agent workflow for [OpenCode](https://opencode.ai): one router agent that never writes code, and specialists that each run on the cheapest model able to do the job.**

[![npm](https://img.shields.io/npm/v/opencode-orchestrator-kit)](https://www.npmjs.com/package/opencode-orchestrator-kit) [![npm downloads](https://img.shields.io/npm/dm/opencode-orchestrator-kit)](https://www.npmjs.com/package/opencode-orchestrator-kit) [![Tests](https://github.com/NicoGenti/opencode-orchestrator-kit/actions/workflows/test.yml/badge.svg)](https://github.com/NicoGenti/opencode-orchestrator-kit/actions/workflows/test.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE.txt) [![OpenCode](https://img.shields.io/badge/works%20with-OpenCode%20CLI-blue)](https://opencode.ai) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

<!-- DEMO: add a short terminal GIF of /start-session followed by a small task here -->

## The problem

Most "AI does everything" setups burn tokens: one powerful model handles research, planning, coding and review inside a single long-lived context. Quality drifts as the context grows, and every step is billed at the most expensive rate.

## The approach

The kit splits the work into a routing layer and a roster of specialists:

- **The orchestrator only routes.** It classifies the request, delegates and checkpoints. It cannot edit application code or run tests. For small one-delegation tasks the opt-in `orchestrator-quick` (reach it with `/quick`) applies the same discipline without the plan board and the session memory.
- **Models are matched to tasks.** Cheap or local models explore and bootstrap; stronger models are reserved for design, implementation and review.
- **Context stays small.** Session memory is bullet-only and auto-archived past ~3k tokens, and multi-phase plans advance one phase at a time with fresh context.
- **Exploration starts from a repo map.** The `profiler` generates a compact `.context/repo-map.md` (hard 300-line budget) that the `explorer` reads before broad searches, reducing whole-file reads and token waste.
- **It adapts to any repository.** On first run the `profiler` agent detects the stack (or interviews you for an empty repo) and scaffolds `.context/` (memory) and `plan/` (kanban).

On **OpenCode 2** the kit is the `opencode-orchestrator-kit` plugin, published on npm: agents, commands and skills are registered at runtime — nothing is written into your project's `.opencode/` directory. Add `"package": "opencode-orchestrator-kit"` to the `plugins` array (below). A local `plugin/` directory and a git install remain available as alternatives. The native copy-based installer still works and remains supported, but it is **deprecated in favor of the plugin** on OpenCode 2 (the `default` profile it ships references provider IDs that are not yours — see the _Choose your model profile_ step). Optional notes for [OpenCode Studio](https://github.com/Microck/opencode-studio) users are in `docs/SETUP-OPENCODE-STUDIO.md`.

## How a request flows

> "Add refresh-token rotation to the auth service."

| Step | Agent                 | What happens                                                                                 |
| ---- | --------------------- | -------------------------------------------------------------------------------------------- |
| 1    | `explorer`            | Reads the current auth flow (read-only).                                                     |
| 2    | `planner`             | Turns findings into a phased plan in `plan/draft/`.                                          |
| 3    | `plan-writer`         | Owns the plan board: `plan/draft/` -> `plan/in-progress/` -> `plan/qa/` -> `plan/complete/`. |
| 4    | `developer-fixer`     | Implements one phase at a time, with fresh context each time.                                |
| 5    | `test-engineer`       | Writes and runs tests for the new logic.                                                     |
| 6    | `security`            | Reviews the auth-sensitive change before it reaches `plan/complete/`.                        |
| 7    | `comprehension-coach` | Optional human comprehension check, scaled to the change (NONE / LIGHT / DEEP).              |

Every delegation uses a 9-section task spec (Goal, Success Criteria, Scope, Safety, Inputs, Outputs, Test Plan, Verification, Edge Cases), never a free-form prompt. The orchestrator itself never edits `auth.ts`.

## Design decisions

- **Routing is separated from execution.** `agents/orchestrator.md` is the default `mode: primary` agent and can only classify and delegate, so orchestration mistakes cannot silently change the codebase. `agents/orchestrator-quick.md` is the opt-in alternate for small tasks, with the same write surface and a shorter cycle.
- **Logical model tiers instead of hardcoded IDs.** Agents reference `{{TIER_ROUTER}}`, `{{TIER_REASONING}}`, `{{TIER_CODE}}`, `{{TIER_FAST}}` and `{{TIER_REVIEW}}`. Switching provider means editing one config file, and a validator runs before install.
- **Plans are files, not chat history.** The kanban in `plan/` is the source of truth, so work is resumable and reviewable in Git.
- **Technical review is separate from human comprehension.** `code-reviewer` and `security` verify the code; `comprehension-coach` checks that the developer understood it.

## Agent roster

### Who does what

| Concern                                                 | Primary agent         | Notes                                                        |
| ------------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| **Orchestration** (routing, checkpointing)              | `orchestrator`        | Default entry point. Never writes application code.          |
| **Orchestration, small tasks** (one delegation)         | `orchestrator-quick`  | Opt-in via `/quick`. Same write surface, no plan board.      |
| **Exploration** (codebase, file, symbol research)       | `explorer`            | Read-only.                                                   |
| **Planning** (turns exploration into phased plans)      | `planner`             | Writes to `plan/draft/` only.                                |
| **Plan board** (create, move, check, adopt plan files)  | `plan-writer`         | Sole owner of the board.                                     |
| **Implementation** (one phase at a time, TDD)           | `developer-fixer`     | Follows the 9-section task spec.                             |
| **Testing** (test authoring, coverage, reproduction)    | `test-engineer`       |                                                              |
| **Review** (general correctness and quality)            | `code-reviewer`       | Distinct from security review.                               |
| **Security** (vulnerabilities, threat model, hardening) | `security`            | Routed for auth, crypto, input handling and secrets changes. |
| **Human comprehension** (post-review check)             | `comprehension-coach` | Read-only. Distinct from technical verification.             |

Full contracts, permissions and model fallbacks are in each `agents/*.md` file (the `pc-doctor` and `writer` specialists live in `extras/*.md`) and are summarized in `AGENTS.md`.

### Tiers and installation

| Tier               | Agents                                                                                                | Installed by default?                              |
| ------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Core routing       | `orchestrator`, `orchestrator-quick`, `profiler`, `explorer`, `oracle`, `planner`                     | Yes                                                |
| Core delivery      | `developer-fixer`, `test-engineer`, `code-reviewer`, `security`, `comprehension-coach`, `plan-writer` | Yes                                                |
| Operations helpers | `build-helper`, `npm-helper`, `deploy-helper`                                                         | Yes (routed only on a matching failure)            |
| Docs lookup        | `librarian`                                                                                           | Yes (routed only for remote documentation lookups) |
| Opt-in extras      | `pc-doctor` (Windows-local only), `writer` (docs generation)                                          | `--with-extras` only                               |

## Install on OpenCode 2 (plugin — recommended)

With the plugin, tier resolution happens at runtime from `plugin/src/tiers.ts` presets — there is no `{{TIER_*}}` substitution at install time.

`opencode-orchestrator-kit` is published on npm (`1.1.1`, tag `v1.1.1`; later releases follow `.github/workflows/release.yml` and the steps in `CONTRIBUTING.md`). OpenCode 2 loads plugins from the `plugins` array in `opencode.json` or `opencode.jsonc` ([Plugins](https://opencode.ai/v2/docs/plugins)). A string entry is a package name or a local directory. Pass options with the object form `{ "package", "options" }`. Local paths must be directories (a path to a single file is skipped). Relative paths resolve from the config file that contains the entry.

Primary install, the npm package:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-orchestrator-kit",
      "options": { "preset": "generic", "withExtras": false },
    },
  ],
}
```

A local checkout of this repository uses the same object form with an absolute directory (`"package": "/absolute/path/to/opencode-orchestrator-kit/plugin"`). The OpenCode 2 docs also accept a git package spec on `opencode plugin add`, including a subdirectory selector, because this plugin lives in `plugin/` and not at the repository root:

```sh
opencode plugin add 'github:NicoGenti/opencode-orchestrator-kit#main::path:plugin'
```

That command writes a package entry. Set `preset` and `withExtras` with the object form above if the generated entry has no `options`. The docs do not show a git spec inside a `package` field example; they do show git specs as `plugin add` arguments and state that startup checks unpinned npm and Git plugins. This repository has not executed that install against a live OpenCode binary.

What the plugin registers at runtime (nothing is copied into `.opencode/`):

- **16 agents** (+ `pc-doctor` and `writer` opt-in with `"withExtras": true`), from the same `agents/`/`extras/` contracts.
- **5 commands** (`/start-session`, `/quick`, `/recall`, `/research-mode`, `/close-session`) and **9 skills**.
- **One native tool, `plan_board`**, the TypeScript port of `scripts/plan-board.py`: standing authorization covers `check` and `move` of conforming plan files without approval; every other board operation (`new`, `adopt`, body edits, deletion, rename) needs per-request approval.
- **Setup options**: `preset` (one of the five bundled presets: `default`, `freellmapi`, `generic`, `opencode-go-free`, `ollama`, all in the same format as `templates/models.config.json`; a preset whose tier values are all `placeholder/*` fails fast with a `TierConfigError`) and `withExtras` (default `false`).

Your own configuration always wins: the plugin upserts an agent's `transform` only when the editor returns nothing for it, so user config in `~/.config/opencode/` or the project config is never overwritten.

The plugin requires **`@opencode/plugin` `^2.1.0`** as a peer dependency (install it once alongside OpenCode 2). Coming from the copy-based installer, or mixing both paths? Follow [`docs/MIGRATION-V1-V2.md`](docs/MIGRATION-V1-V2.md).

## Quickstart

The section above is the OpenCode 2 install (the npm package). The numbered steps below are the legacy `install.sh` installer.

> **Heads-up:** the `default` model profile references provider IDs that are not yours. To actually run agents you need at least one usable provider/model mapping of your own: switch to the `generic` preset and edit `.opencode/models.config.json` before your first `/start-session` (step 3).

### 1. Prerequisites

- [OpenCode](https://opencode.ai) installed and on `PATH` (`opencode --version`).
- **Bash**. `install.sh` is a bash script. Supported: Linux, macOS, and Windows under Git Bash, MSYS or Cygwin. Plain `cmd.exe` and PowerShell are not supported.
- At least one usable provider account you can point a tier to. OpenCode does not bundle provider credentials.

### 2. Install the kit (legacy installer — deprecated)

The `install.sh` copy-based installer is the **v1 path**, kept for OpenCode 1.x and offline use. It is deprecated in favor of the plugin (see "Install on OpenCode 2" above and [`docs/MIGRATION-V1-V2.md`](docs/MIGRATION-V1-V2.md)).

From the repo root:

```bash
# Project-only: installs into ./.opencode/ and ./AGENTS.md of the current repo
./install.sh project

# Global: installs into ~/.config/opencode/ for every project on this machine
./install.sh global
```

The installer seeds `.opencode/models.config.json` from `templates/models.config.json`, runs the model-profile validator before writing any file, then resolves every `{{TIER_*}}` token in the installed agents to concrete model IDs.

| Flag                   | Effect                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `--symlink`            | Symlink instead of installing plain files, so `git pull` in this repo updates every consumer.                        |
| `--with-extras`        | Install `pc-doctor` and `writer` into `agents/`. Off by default. OpenCode does not load an `extras/` directory.      |
| `--with-examples`      | Install `skills/examples/`. Off by default; the base copy excludes that directory.                                   |
| `--upgrade`, `--force` | Overwrite kit-managed files. Each replaced path is moved to `<path>.kit-backup` first. Default skips existing paths. |
| `--skip-validation`    | Skip the model-profile validator. Not recommended, emergency recovery only.                                          |

Without the installer, the manual path covers the same five items: `AGENTS.md`, `CONTRIBUTING.md`, `agents/`, `skills/` (without `skills/examples/`) and `command/`. Place them where OpenCode looks (project root, or `~/.config/opencode/` for global). To opt in by hand, copy `pc-doctor.md` and `writer.md` from `extras/` into `agents/`. Copy `skills/examples/` only when you want the language examples.

### 3. Choose your model profile

> On the plugin path this step collapses to picking a `preset` (see above) — tier resolution happens at runtime and there are no `{{TIER_*}}` tokens to resolve.

Five logical tiers are written into agent `model:` lines as `{{TIER_*}}` tokens:

| Tier token       | Default agent(s)                                                                                          | Role                               | Required?                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------ |
| `TIER_ROUTER`    | `orchestrator`                                                                                            | Routing and checkpointing.         | Optional (falls back to `TIER_REASONING`). |
| `TIER_REASONING` | `oracle`, `security`, `planner`, `plan-writer`                                                            | Deep reasoning and architecture.   | Required.                                  |
| `TIER_CODE`      | `developer-fixer`, `test-engineer`                                                                        | Implementation and test writing.   | Required.                                  |
| `TIER_FAST`      | `profiler`, `explorer`, `build-helper`, `npm-helper`, `deploy-helper`, `comprehension-coach`, `librarian` | Lightweight, high-throughput work. | Required.                                  |
| `TIER_REVIEW`    | `code-reviewer`                                                                                           | Correctness and quality review.    | Optional (falls back to `TIER_CODE`).      |

`templates/models.config.json` ships five presets: `default` (known-good provider IDs), `freellmapi` (the local FreeLLMAPI app), `opencode-go-free`, `ollama`, and `generic` (editable, every tier is a `placeholder/*` sentinel).

To use your own providers:

1. Set `default_preset` to `"generic"` in `.opencode/models.config.json`.
2. Replace every `placeholder/*` value under `presets.generic.models` with a real `<provider>/<model>` ID.
3. Validate (must exit 0 and print `OK:`):

```bash
bash scripts/validate-models.sh
```

Do **not** edit the `model:` field of any agent in `agents/*.md` or `extras/*.md` directly. The tier abstraction is the supported extension point, and direct edits silently regress on the next update. See `docs/CONFIGURATION.md` for resolution rules and fallback chains.

### 4. Run the orchestrator

```bash
opencode
```

Select `@orchestrator` (or set it as your default agent), then run **`/start-session`** at the start of every new session. It delegates to `profiler` if there is no `PROJECT-PROFILE.md` or `plan/` structure yet, loads `.context/progress.md`, `decisions.md` and `issues.md`, and replies with a 3-4 line summary of the stack, current status and latest issue or decision, in the language you are speaking, before waiting for your next instruction. See `command/start-session.md`.

## When to use the kit (and when not to)

This kit is built for long development sessions: work that spans several phases, more than one agent, and often more than one day, where a plan board, shared `.context` memory and review gates keep the work auditable and resumable.

It is **not** a faster way to run a small task.

- **One question, one file, or anything that fits comfortably in a single context window → use OpenCode's built-in `Build` or `Plan` agent.** You get the answer without paying for orchestration.
- **Multi-phase work, work you will resume tomorrow, or work you want reviewed before it lands → use this kit.** The plan board, the session memory and the delegation boundaries are the deliverable; the agent answers are the by-product.

### What we measured on small tasks

Both runs below are on purpose outside the kit's design envelope. They exist to show the boundary, not to advertise a saving: one run per configuration, same prompt per row, on 2026-11-03.

**Research task** — `lalimentari` (116 files, 895 symbols): map the supplier purchase-order → stock-movement flow and answer as a short `file:line` report.

| Configuration                                      | Agents | Tool calls | Input  | Output | Cache read | Answer                      |
| -------------------------------------------------- | ------ | ---------- | ------ | ------ | ---------- | --------------------------- |
| Built-in `Build` agent, no orchestration           | 1      | 21         | 41,263 | 4,470  | 245,664    | 5,277 chars, 30 `file:line` |
| Kit, graph forbidden in the prompt                 | 2      | 50         | 73,937 | 18,786 | 604,288    | 5,804 chars, 37 `file:line` |
| Kit, graph used (`get_minimal_context_tool` first) | 1      | 22         | 53,807 | 7,705  | 124,032    | 4,107 chars, 20 `file:line` |

**Implementation task** — this repository at `f72ef01`, three identical git worktrees, same prompt: add a `stats` subcommand to the plan board in the TypeScript port (`plugin/src/plan-board.ts`, exposed by `plugin/src/plan-board-tool.ts`) and in the Python CLI (`scripts/plan-board.py`), fixed JSON contract, `check`/`move`/`new`/`adopt` unchanged, tool schema and tests updated. Every arm was graded from outside with the same harness: column counts on a seeded board, the `root-missing` exit path, `bun run typecheck`, `bun run lint`, and the three plan-board test suites.

| Configuration                  | Sessions | Tool calls | Input   | Output  | Cache read | Files changed       | Acceptance |
| ------------------------------ | -------- | ---------- | ------- | ------- | ---------- | ------------------- | ---------- |
| Built-in `Build` agent, no kit | 1        | 51         | 87,896  | 17,085  | 2,680,832  | 7 (4 code, 3 tests) | pass       |
| Kit, graph forbidden           | 4        | 125        | 225,608 | 66,638  | 6,137,984  | 11 (+CHANGELOG)     | pass       |
| Kit, graph available and used  | 4        | 329        | 284,158 | 105,215 | 6,265,152  | 10 (+memory files)  | pass       |

Read them as the cost of using the wrong tool for the job: all three configurations delivered, and the single built-in agent was the cheapest by a factor of two to three. That is the expected result for a task that fits in one context, and the reason the guidance above says to use `Build` or `Plan` for it.

Two details worth keeping in mind if you do reach for the kit on a small task:

- **The graph pays for a map, not for a build.** On the research task a single `get_minimal_context_tool` call let the orchestrator skip delegation and answer from 21 targeted lookups. On the implementation task the graph was called once and changed nothing: the work was in files that had to be edited anyway.
- **Board and memory upkeep dominates.** The costliest arm spent 174 `plan_board` calls and rewrote `.context/progress.md` for a feature of about fifty lines. On a long session that upkeep is what keeps the work resumable; on a short one it is pure overhead.

### What we have not measured

Long, multi-session work — the workload this kit is designed for — is not measured here. The mechanism it leans on is measurable per session: the explorer returns a bounded summary instead of a growing transcript, the plan board carries the state between sessions, and `.context` memory means a resumed session does not re-read the repository. We will publish numbers for that regime when we have runs to back them; until then this section stays silent rather than extrapolating.

To reproduce the runs above, keep the same prompt per configuration and read the per-session numbers (parent plus delegated children) from OpenCode's database:

```bash
python -c "import sqlite3,os;db=os.path.expanduser('~/.opencode2/data/opencode/opencode.db');
c=sqlite3.connect(f'file:{db}?mode=ro',uri=True);
q='''select s.agent, s.tokens_input, s.tokens_output, s.tokens_cache_read, s.parent_id
       from session_v2 s
      where s.title like ? or s.parent_id in (select id from session_v2 where title like ?)
      order by s.time_created''';
[print(r) for r in c.execute(q, ('EXP-%','EXP-%'))]"
```

Caveats, in the spirit of [`docs/BENCHMARK-TOKEN-USAGE.md`](docs/BENCHMARK-TOKEN-USAGE.md): two tasks, one run per configuration, models differ by tier (`minimax-m3.1-flash` for `explorer`, `deepseek-v4.1-flash` for the orchestrator), and both tasks fit in a single context window.

## Customizing

- **Swap providers per tier** by editing `.opencode/models.config.json` and setting `default_preset` to the profile you want.
- **Opt into extras** with `./install.sh --with-extras` to install `pc-doctor` and `writer` into `agents/`. Re-run with `--upgrade` (or `--force`) to refresh kit files that are already installed.
- **Add a skill** by following [Companion kits](#companion-kits) below. A file at `skills/<name>/SKILL.md` is not loaded while an agent's `permission.skill` map starts with `"*": deny`.
- **Optional structural search:** if `ast-grep` (`sg`) is installed, the `explorer` can use it for structural queries; see `skills/structural-search/SKILL.md`.
- **Measure token impact:** follow the A/B protocol in [`docs/BENCHMARK-TOKEN-USAGE.md`](docs/BENCHMARK-TOKEN-USAGE.md) to compare exploration with and without the repo map.
- **Design-first governance:** keep architecture decisions in `.context/DESIGN-RULES.md`; [`docs/DESIGN-RULES.md`](docs/DESIGN-RULES.md) describes the template, the lifecycle, and the checks run by `planner` and `code-reviewer`.
- **Engineering baseline** (secrets hygiene, git hygiene, definition of done) lives in `CONTRIBUTING.md`.

## Companion kits

Companion repositories are optional. This kit runs on its own. A third-party kit plugs in by installing skills and commands where OpenCode already looks; it does not need a change here unless it wants a new allowlist entry.

### Extension contract

- **Skills path.** Put each skill at `.opencode/skills/<name>/SKILL.md` with frontmatter `name` equal to `<name>` ([Skills](https://opencode.ai/v2/docs/skills)). This plugin does not register those skills. The `skill` tool loads whatever OpenCode discovers on that path.
- **`web-*` is reserved** for web-stack skill packs (theme, brand, scaffold, deploy, and similar). Agents that allow the glob: `orchestrator`, `oracle`, `developer-fixer`, `code-reviewer`, and `deploy-helper`. A skill named `web-…` is enabled for those agents, so project skills and unrelated packs use another prefix. One example of the shape is `web-theme` or `web-deploy`.
- **`project-*` is reserved** for the consuming project's own skills. `orchestrator`, `developer-fixer`, and `code-reviewer` already allow it. Other agents need an allowlist edit before they can load a `project-*` skill.
- **Shell asks.** `developer-fixer` asks before `npx`, `dotnet`, `ng`, `docker build`, and `bash` or `sh` scripts under a skill `scripts/` directory. A companion can ship those commands under that ask, with the shell catch-all still deny.
- **Commands.** A companion registers its own commands in OpenCode (a site scaffolder is one example). This plugin registers `/start-session`, `/quick`, `/recall`, `/research-mode`, and `/close-session`.
- **Design-rules template.** `templates/design-rules.md` is a starting point, including an optional UI section. Copy it and customize or delete sections. This repository does not fetch or pin an upstream copy.

### Adding a skill

Every shipped agent starts `permission.skill` with `"*": deny`. OpenCode then loads a skill only when a later rule allows its name. Putting `skills/<name>/SKILL.md` on disk is not enough.

**In this repository**

1. Add `skills/<name>/SKILL.md`. The frontmatter `name` is the allowlist key (`skills/examples/` included).
2. Add that name to the `permission.skill` map of each agent that should load it, after `"*": deny`.
3. Run `bun run sync-assets` so `plugin/assets/` matches.
4. `tests/skill-allowlist.test.ts` fails when an `allow` or `ask` names a skill that does not ship here. `deny` entries, the `"*"` catch-all, and globs are not required to name a shipped skill. A glob that matches **zero** shipped skills is legal only for a documented reserved prefix: `web-*` and `project-*`.

**In a project that uses the kit**

Name the skill `project-<something>` (directory and frontmatter `name`). `orchestrator`, `developer-fixer`, and `code-reviewer` already allow that prefix. Other agents still need an allowlist entry. Leave `web-*` for a web-stack skill pack.

## Development

```bash
bun install
bun run typecheck       # tsc, including tests/ and scripts/*.ts
bun run lint            # ESLint, including tests/ and scripts/*.ts
bun run format:check    # Prettier
bun test                # test suite
bun run sync-assets     # refresh plugin/assets after editing agents, extras, skills, or the packaged commands
```

`plugin/assets/` is generated. After changing `agents/`, `extras/`, `skills/`, or a packaged command (`command/start-session.md`, `command/quick.md`, `command/recall.md`, `command/research-mode.md`, `command/close-session.md`), run `bun run sync-assets` (or `bun run sync-assets --check` to fail when the mirror has drifted). The plugin `prepack` script runs the same copy. Do not edit the packaged copies by hand.

Changes are tracked in `CHANGELOG.md`.

## Experimental: comprehension metrics

The kit includes an opt-in measurement layer (DCI scores, the `/recall` command, and a research A/B mode with a Cognitive Overhead Ratio). These are operational engineering metrics, not scientifically validated ones. Details: [`docs/MEASUREMENT-AND-RESEARCH.md`](docs/MEASUREMENT-AND-RESEARCH.md).

## License

MIT, see [`LICENSE.txt`](LICENSE.txt). Contributions welcome, see [`CONTRIBUTING.md`](CONTRIBUTING.md).
