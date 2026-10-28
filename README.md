# OpenCode Orchestrator Kit

**A cost-aware, multi-agent workflow for [OpenCode](https://opencode.ai): one router agent that never writes code, and specialists that each run on the cheapest model able to do the job.**

[![Tests](https://github.com/NicoGenti/opencode-orchestrator-kit/actions/workflows/test.yml/badge.svg)](https://github.com/NicoGenti/opencode-orchestrator-kit/actions/workflows/test.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE.txt) [![OpenCode](https://img.shields.io/badge/works%20with-OpenCode%20CLI-blue)](https://opencode.ai) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

<!-- DEMO: add a short terminal GIF of /start-session followed by a small task here -->

## The problem

Most "AI does everything" setups burn tokens: one powerful model handles research, planning, coding and review inside a single long-lived context. Quality drifts as the context grows, and every step is billed at the most expensive rate.

## The approach

The kit splits the work into a routing layer and a roster of specialists:

- **The orchestrator only routes.** It classifies the request, delegates and checkpoints. It cannot edit application code or run tests.
- **Models are matched to tasks.** Cheap or local models explore and bootstrap; stronger models are reserved for design, implementation and review.
- **Context stays small.** Session memory is bullet-only and auto-archived past ~3k tokens, and multi-phase plans advance one phase at a time with fresh context.
- **Exploration starts from a repo map.** The `profiler` generates a compact `.context/repo-map.md` (hard 300-line budget) that the `explorer` reads before broad searches, reducing whole-file reads and token waste.
- **It adapts to any repository.** On first run the `profiler` agent detects the stack (or interviews you for an empty repo) and scaffolds `.context/` (memory) and `plan/` (kanban).

On **OpenCode 2** the kit installs as the `opencode-orchestrator-kit` plugin: agents, commands and skills are registered at runtime — nothing is written into your project's `.opencode/` directory. The native copy-based installer still works and remains supported, but it is **deprecated in favor of the plugin** on OpenCode 2 (the `default` profile it ships references provider IDs that are not yours — see the *Choose your model profile* step). Optional notes for [OpenCode Studio](https://github.com/Microck/opencode-studio) users are in `docs/SETUP-OPENCODE-STUDIO.md`.

## How a request flows

> "Add refresh-token rotation to the auth service."

| Step | Agent | What happens |
|---|---|---|
| 1 | `explorer` | Reads the current auth flow (read-only). |
| 2 | `planner` | Turns findings into a phased plan in `plan/draft/`. |
| 3 | `plan-writer` | Owns the plan board: `plan/draft/` -> `plan/in-progress/` -> `plan/qa/` -> `plan/complete/`. |
| 4 | `developer-fixer` | Implements one phase at a time, with fresh context each time. |
| 5 | `test-engineer` | Writes and runs tests for the new logic. |
| 6 | `security` | Reviews the auth-sensitive change before it reaches `plan/complete/`. |
| 7 | `comprehension-coach` | Optional human comprehension check, scaled to the change (NONE / LIGHT / DEEP). |

Every delegation uses a 9-section task spec (Goal, Success Criteria, Scope, Safety, Inputs, Outputs, Test Plan, Verification, Edge Cases), never a free-form prompt. The orchestrator itself never edits `auth.ts`.

## Design decisions

- **Routing is separated from execution.** `agents/orchestrator.md` is the only `mode: primary` agent and can only classify and delegate, so orchestration mistakes cannot silently change the codebase.
- **Logical model tiers instead of hardcoded IDs.** Agents reference `{{TIER_ROUTER}}`, `{{TIER_REASONING}}`, `{{TIER_CODE}}`, `{{TIER_FAST}}` and `{{TIER_REVIEW}}`. Switching provider means editing one config file, and a validator runs before install.
- **Plans are files, not chat history.** The kanban in `plan/` is the source of truth, so work is resumable and reviewable in Git.
- **Technical review is separate from human comprehension.** `code-reviewer` and `security` verify the code; `comprehension-coach` checks that the developer understood it.

## Agent roster

### Who does what

| Concern | Primary agent | Notes |
| --- | --- | --- |
| **Orchestration** (routing, checkpointing) | `orchestrator` | Sole entry point. Never writes application code. |
| **Exploration** (codebase, file, symbol research) | `explorer` | Read-only. |
| **Planning** (turns exploration into phased plans) | `planner` | Writes to `plan/draft/` only. |
| **Plan board** (create, move, check, adopt plan files) | `plan-writer` | Sole owner of the board. |
| **Implementation** (one phase at a time, TDD) | `developer-fixer` | Follows the 9-section task spec. |
| **Testing** (test authoring, coverage, reproduction) | `test-engineer` | |
| **Review** (general correctness and quality) | `code-reviewer` | Distinct from security review. |
| **Security** (vulnerabilities, threat model, hardening) | `security` | Routed for auth, crypto, input handling and secrets changes. |
| **Human comprehension** (post-review check) | `comprehension-coach` | Read-only. Distinct from technical verification. |

Full contracts, permissions and model fallbacks are in each `agents/*.md` file (the `pc-doctor` and `writer` specialists live in `extras/*.md`) and are summarized in `AGENTS.md`.

### Tiers and installation

| Tier | Agents | Installed by default? |
| --- | --- | --- |
| Core routing | `orchestrator`, `profiler`, `explorer`, `oracle`, `planner` | Yes |
| Core delivery | `developer-fixer`, `test-engineer`, `code-reviewer`, `security`, `comprehension-coach`, `plan-writer` | Yes |
| Operations helpers | `build-helper`, `npm-helper`, `deploy-helper` | Yes (routed only on a matching failure) |
| Docs lookup | `librarian` | Yes (routed only for remote documentation lookups) |
| Opt-in extras | `pc-doctor` (Windows-local only), `writer` (docs generation) | `--with-extras` only |

## Install on OpenCode 2 (plugin — recommended)

With the plugin, tier resolution happens at runtime from `plugin/src/tiers.ts` presets — there is no `{{TIER_*}}` substitution at install time. Add the plugin to your `opencode.json`:

```json
{
  "plugins": [
    {
      "package": "opencode-orchestrator-kit",
      "options": { "preset": "<preset>", "withExtras": false }
    }
  ]
}
```

What the plugin registers at runtime (nothing is copied into `.opencode/`):

- **15 agents** (+ `pc-doctor` and `writer` opt-in with `"withExtras": true`), from the same `agents/`/`extras/` contracts.
- **3 commands** (`/start-session`, `/recall`, `/research-mode`) and **9 skills**.
- **One native tool, `plan_board`**, the TypeScript port of `scripts/plan-board.py`: standing authorization covers `check` and `move` of conforming plan files without approval; every other board operation (`new`, `adopt`, body edits, deletion, rename) needs per-request approval.
- **Setup options**: `preset` (one of the five bundled presets: `default`, `freellmapi`, `generic`, `opencode-go-free`, `ollama`, all in the same format as `templates/models.config.json`; a preset whose tier values are all `placeholder/*` fails fast with a `TierConfigError`) and `withExtras` (default `false`).

Your own configuration always wins: the plugin upserts an agent's `transform` only when the editor returns nothing for it, so user config in `~/.config/opencode/` or the project config is never overwritten.

The plugin requires **`@opencode/plugin` `^2.1.0`** as a peer dependency (install it once alongside OpenCode 2). Coming from the copy-based installer, or mixing both paths? Follow [`docs/MIGRATION-V1-V2.md`](docs/MIGRATION-V1-V2.md).

## Quickstart

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

| Flag | Effect |
| --- | --- |
| `--symlink` | Symlink instead of installing plain files, so `git pull` in this repo updates every consumer. |
| `--with-extras` | Also install `extras/` (`pc-doctor`, `writer`). Off by default. |
| `--with-examples` | Also install `skills/examples/` (language-specific skill examples). Off by default. |
| `--skip-validation` | Skip the model-profile validator. Not recommended, emergency recovery only. |

Without the installer, the manual path covers the same five items: `AGENTS.md`, `CONTRIBUTING.md`, `agents/`, `skills/` and `command/`. Place them where OpenCode looks (project root, or `~/.config/opencode/` for global). `extras/` is not part of the manual default.

### 3. Choose your model profile

> On the plugin path this step collapses to picking a `preset` (see above) — tier resolution happens at runtime and there are no `{{TIER_*}}` tokens to resolve.

Five logical tiers are written into agent `model:` lines as `{{TIER_*}}` tokens:

| Tier token | Default agent(s) | Role | Required? |
| --- | --- | --- | --- |
| `TIER_ROUTER` | `orchestrator` | Routing and checkpointing. | Optional (falls back to `TIER_REASONING`). |
| `TIER_REASONING` | `oracle`, `security`, `planner`, `plan-writer` | Deep reasoning and architecture. | Required. |
| `TIER_CODE` | `developer-fixer`, `test-engineer` | Implementation and test writing. | Required. |
| `TIER_FAST` | `profiler`, `explorer`, `build-helper`, `npm-helper`, `deploy-helper`, `comprehension-coach`, `librarian` | Lightweight, high-throughput work. | Required. |
| `TIER_REVIEW` | `code-reviewer` | Correctness and quality review. | Optional (falls back to `TIER_CODE`). |

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

## Customizing

- **Swap providers per tier** by editing `.opencode/models.config.json` and setting `default_preset` to the profile you want.
- **Opt into extras** with `./install.sh --with-extras` to also install `pc-doctor` and `writer`.
- **Add project-specific skills** under `skills/<name>/SKILL.md`; the orchestrator loads them on demand via the `skill` tool.
- **Optional structural search:** if `ast-grep` (`sg`) is installed, the `explorer` can use it for structural queries; see `skills/structural-search/SKILL.md`.
- **Measure token impact:** follow the A/B protocol in [`docs/BENCHMARK-TOKEN-USAGE.md`](docs/BENCHMARK-TOKEN-USAGE.md) to compare exploration with and without the repo map.
- **Design-first governance:** keep architecture decisions in `.context/DESIGN-RULES.md`; [`docs/DESIGN-RULES.md`](docs/DESIGN-RULES.md) describes the template, the lifecycle, and the checks run by `planner` and `code-reviewer`.
- **Engineering baseline** (secrets hygiene, git hygiene, definition of done) lives in `CONTRIBUTING.md`.

## Development

```bash
bun install
bun test        # test suite
bun run lint    # ESLint
```

Changes are tracked in `CHANGELOG.md`.

## Experimental: comprehension metrics

The kit includes an opt-in measurement layer (DCI scores, the `/recall` command, and a research A/B mode with a Cognitive Overhead Ratio). These are operational engineering metrics, not scientifically validated ones. Details: [`docs/MEASUREMENT-AND-RESEARCH.md`](docs/MEASUREMENT-AND-RESEARCH.md).

## License

MIT, see [`LICENSE.txt`](LICENSE.txt). Contributions welcome, see [`CONTRIBUTING.md`](CONTRIBUTING.md).
