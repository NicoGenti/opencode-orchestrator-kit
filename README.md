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

On **OpenCode 2** the kit is the `opencode-orchestrator-kit` plugin, published on npm: agents, commands and skills are registered at runtime — nothing is written into your project's `.opencode/` directory. Add `"package": "opencode-orchestrator-kit"` to the `plugins` array (below). A local `plugin/` directory and a git install remain available as alternatives. The native copy-based installer still works and remains supported, but it is **deprecated in favor of the plugin** on OpenCode 2 (the `default` profile it ships references provider IDs that are not yours — see the _Provider mapping_ bullet in the [Quickstart](#quickstart) section below). Optional notes for [OpenCode Studio](https://github.com/Microck/opencode-studio) users are in `docs/SETUP-OPENCODE-STUDIO.md`.

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

`opencode-orchestrator-kit` is published on npm (`1.1.1`; later releases follow the steps in [`CONTRIBUTING.md`](CONTRIBUTING.md)). OpenCode 2 loads plugins from the `plugins` array in `opencode.json` or `opencode.jsonc` as a package name, a local directory, or the object form `{ "package", "options" }` ([Plugins](https://opencode.ai/v2/docs/plugins)).

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

What the plugin registers at runtime (nothing is copied into `.opencode/`): 16 agents (+ `pc-doctor` and `writer` with `"withExtras": true`), 5 commands (`/start-session`, `/quick`, `/recall`, `/research-mode`, `/close-session`), 9 skills, and the native `plan_board` tool — the TypeScript port of `scripts/plan-board.py`, where standing authorization covers `check` and `move` of conforming plan files and every other board operation needs per-request approval. Setup options are `preset` (one of the five bundled presets, in the same format as `templates/models.config.json`; all-`placeholder/*` presets fail fast with a `TierConfigError`) and `withExtras` (default `false`).

Your own configuration always wins: the plugin upserts an agent's `transform` only when the editor returns nothing for it, so user config in `~/.config/opencode/` or the project config is never overwritten.

The plugin requires **`@opencode/plugin` `^2.1.0`** as a peer dependency (install it once alongside OpenCode 2). Coming from the copy-based installer, or mixing both paths? Follow [`docs/MIGRATION-V1-V2.md`](docs/MIGRATION-V1-V2.md).

## Quickstart

[`QUICKSTART.md`](QUICKSTART.md) is the canonical minimal walk-through: prerequisites, the plugin and legacy installer paths, the provider mapping, and the first `/start-session`. This section keeps only the choices needed before the first run.

> **Heads-up:** the `default` model profile references provider IDs that are not yours. The editable `generic` profile in `templates/models.config.json` is the starting point for your own providers; every tier under it is a `placeholder/*` sentinel until you replace it.

- **Provider mapping.** Edit `.opencode/models.config.json`, seeded from `templates/models.config.json`, and set `default_preset` to your profile. The five tiers are `TIER_ROUTER`, `TIER_REASONING`, `TIER_CODE`, `TIER_FAST`, `TIER_REVIEW`; agents reference them as `{{TIER_*}}` tokens instead of concrete IDs. You need at least one usable provider/model mapping of your own.
- **Respect the tier abstraction:** do **not** edit the `model:` field of any agent in `agents/*.md` or `extras/*.md` directly. See [`docs/CONFIGURATION.md`](docs/CONFIGURATION.md) for resolution rules and fallback chains.
- **Extras are off by default.** `--with-extras` (or `"withExtras": true`) adds `pc-doctor` and `writer`; the base install ships `AGENTS.md`, `agents/`, `skills/` and `command/`.
- **First run.** Select `@orchestrator` and run **`/start-session`**. It delegates to `profiler` when `PROJECT-PROFILE.md` or `plan/` is missing, loads `.context/progress.md`, `decisions.md` and `issues.md`, and replies with a 3-4 line status summary.

Manual install detail is in [`docs/SETUP-NATIVE.md`](docs/SETUP-NATIVE.md); the installer flags, validation and FreeLLMAPI preset are in [`QUICKSTART.md`](QUICKSTART.md#installation).

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

## Prompt caching and session reuse

Providers cache a repeated prompt prefix, and OpenCode lets you configure how that cache is used. Cache tuning changes the cost and latency of a repeated prefix; it does not change what a session knows.

### Cache configuration

Cache settings live at the provider level (`providers.<id>.settings.cache`) or per model (`providers.<id>.models.<model>.settings.cache`), and a model entry overrides its provider. OpenCode sends no TTL by default, so the provider's own default applies; the TTL is set with `settings.cache.ttl` and takes the units `ms`, `s`, `m`, `h`, `d` ([cache lifetime](https://opencode.ai/docs/models/#cache-lifetime)).

#### Anthropic

Anthropic's default prompt-cache lifetime is 5 minutes, and its 1-hour option costs twice as much to write. Raise the TTL here, and enable [warming](https://opencode.ai/docs/warming/) so a paused session keeps its prompt cache alive:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "warming": true,
  "providers": { "anthropic": { "settings": { "cache": { "ttl": "1h" } } } }
}
```

Warming is a periodic transient keep-alive request and is off by default. The top-level `warming` key accepts `true` or `{ prompt, interval, duration }`; a provider or model overrides it through `settings.cache.warming` (the same fields except `prompt`). `interval: "auto"` is 90% of `cache.ttl` (4 minutes without a TTL) and `duration` defaults to `"30 minutes"`. Subagent sessions are not warmed, and warming requests do not mutate durable session state.

#### OpenAI-compatible providers

Whether the endpoint accepts the `prompt_cache_key` body field is declared with `compatibility.supportsPromptCacheKey`, at the provider or the model level ([prompt caching](https://opencode.ai/docs/models/#prompt-caching)). Per the OpenCode docs: "Whether the endpoint accepts the `prompt_cache_key` body field. Read by: OpenAI Chat, OpenAI Responses, Mistral. OpenAI Chat only sends the key when true, which some provider packages set by default. Other APIs send it unless false."

```json
{
  "$schema": "https://opencode.ai/config.json",
  "providers": {
    "myproxy": {
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "https://proxy.example.com/v1" },
      "compatibility": { "supportsPromptCacheKey": true },
      "models": { "gpt-5.5": {} }
    }
  }
}
```

#### Claude behind an OpenAI-compatible proxy

A proxy such as LiteLLM cannot be detected as serving Claude models, so OpenCode does not know those models need Anthropic-style `cache_control` breakpoints. Set `compatibility.cacheFormat` to `"anthropic"` on them ([custom providers](https://opencode.ai/docs/providers/#custom)); OpenCode then marks the last tool definition, the system prompt and the latest message with `cache_control: {"type": "ephemeral"}`, and the endpoint's default 5-minute lifetime applies.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "providers": {
    "litellm": {
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "https://litellm.example.com/v1" },
      "models": {
        "claude-sonnet-5-5": { "compatibility": { "cacheFormat": "anthropic" } }
      }
    }
  }
}
```

Set `cacheFormat` at the provider level instead when every model that provider serves uses the same format.

### Session reuse

Cache entries are provider-side and prefix-scoped: context lives in the session, so a new child session starts empty even when the provider serves the identical prefix from cache, and a hit affects only the cost and latency of that prefix. Reuse a child session only for iterative work on the same bounded objective; the delegation rules are in the orchestrator's `## Cache And Session Reuse` policy (`agents/orchestrator.md`).

## Cache-aware prompt design

An agent prompt has two halves, and only the second one changes per task. The **stable** half is the system prompt shipped with the agent: identity, operating contract, output format, safety rules. The **variable** half is the delegation prompt the orchestrator writes for one task: the goal, the files in play, the relevant file paths and symbols, the verification commands, the edge cases. Keep the stable half byte-identical from session to session and let the variable half change freely, appended after it.

The stable prefix is exactly `AGENTS.md`, `agents/*.md` and `extras/*.md`, in that enumeration order; [`CONTRIBUTING.md`](CONTRIBUTING.md) (`## Prompt-Assembly Stable-Prefix Contract`) fixes the order, the frontmatter key order and the committed boundary, so a change to the stable prefix is a contract change, not an edit.

### Stable versus variable

Stable — excerpts from `agents/developer-fixer.md`, identical bytes in every session:

```text
# Developer-Fixer

Unified implementation agent. Pick the mode from the incoming spec’s completeness; never ask which mode to use.

- State the selected mode in one clause.
- List touched files as flat bullets: path + one-line change.
- Report verification as pass/fail counts; include an exact error line only when needed.
```

Variable — one orchestrator dispatch, rewritten for every task:

```text
Goal: make the parser reject trailing commas with a typed error.
Scope: src/parser.ts and tests/parser.test.ts; nothing under src/cli/.
Inputs Available: src/parser.ts:88 (parseObject), src/errors.ts:12 (TrailingCommaError).
Verification: bun test tests/parser.test.ts
Notes/Edge Cases: keep the existing message for every other parse failure.
```

The first block is the same text on every dispatch; the second block is new each time. The rules for the variable half are in `## Delegation Rules` of [`agents/orchestrator.md`](agents/orchestrator.md).

### Why the split pays off

A prompt cache is prefix-scoped: the provider stores a tokenized prefix and reuses it when the next request starts with the same bytes, so a cache hit changes the cost and the latency of that span without changing what the session knows. A stable agent prompt makes the cacheable span as long as possible and hits it from the first token; rewriting any contract line invalidates everything after the point of divergence. Read this together with [Prompt caching and session reuse](#prompt-caching-and-session-reuse) above for the provider-side settings. It only pays off where the provider supports prompt caching — elsewhere the split is still readable, just not cheaper.

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

Every shipped agent starts `permission.skill` with `"*": deny`, so a skill on disk is loaded only when a later rule allows its name. The repository procedure (allowlist edit, `bun run sync-assets`, `tests/skill-allowlist.test.ts`) and the consuming-project `project-*` path are in [`CONTRIBUTING.md`](CONTRIBUTING.md#adding-a-skill). Name a skill for a project `project-<something>`; leave `web-*` for a web-stack pack.

## Development

```bash
bun install
bun run typecheck       # tsc, including tests/ and scripts/*.ts
bun run lint            # ESLint, including tests/ and scripts/*.ts
bun run format:check    # Prettier
bun test                # test suite
bun run sync-assets     # refresh plugin/assets after editing agents, extras, skills, or the packaged commands
```

`plugin/assets/` is generated. After changing `agents/`, `extras/`, `skills/`, or a packaged command, run `bun run sync-assets` (or `bun run sync-assets --check` to fail when the mirror has drifted). The repository checks, mirror rule and release steps are owned by [`CONTRIBUTING.md`](CONTRIBUTING.md); do not edit the packaged copies by hand.

Changes are tracked in `CHANGELOG.md`.

## Experimental: comprehension metrics

The kit includes an opt-in measurement layer (DCI scores, the `/recall` command, and a research A/B mode with a Cognitive Overhead Ratio). These are operational engineering metrics, not scientifically validated ones. Details: [`docs/MEASUREMENT-AND-RESEARCH.md`](docs/MEASUREMENT-AND-RESEARCH.md).

## License

MIT, see [`LICENSE.txt`](LICENSE.txt). Contributions welcome, see [`CONTRIBUTING.md`](CONTRIBUTING.md).
