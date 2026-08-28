# OpenCode Orchestrator Kit

A cost-aware, token-efficient multi-agent workflow for [OpenCode](https://opencode.ai), built around a strict **Orchestrator** pattern: one routing agent that never writes code itself, and a roster of specialized subagents (explorer, planner, developer-fixer, test-engineer, code-reviewer, security, writer, and infra helpers) each pinned to the cheapest model capable of the job.

The workflow **self-bootstraps on any repository**, known or unknown: the `profiler` agent detects the stack (or interviews you for an empty repo), scaffolds a lightweight memory system (`.context/`) and a plan kanban (`plan/`), and reports back so the Orchestrator can route work correctly from the very first session.

Works with plain `opencode` CLI. No plugin required. Optional notes for [OpenCode Studio](https://github.com/Microck/opencode-studio) users are in `docs/SETUP-OPENCODE-STUDIO.md`.

## Why this exists

Most "AI does everything" setups burn tokens because a single powerful model handles research, planning, coding, and review in one long context. This kit instead:

- **Routes, never executes** — the Orchestrator (`agents/orchestrator.md`) only classifies requests and delegates; it cannot edit application code or run tests itself.
- **Matches model to task** — cheap/local models for exploration and bootstrapping, stronger models only for design/implementation/review.
- **Keeps context small** — session memory (`.context/progress.md`, `decisions.md`, `issues.md`) is bullet-point only and auto-archived past ~3k tokens; multi-phase plans are executed one phase per delegation with fresh context each time.
- **Adapts to any repo** — `profiler` runs once per repo, detects stack via manifest globbing (with Repomix as fallback for ambiguous/monorepo cases), and never touches application code.

## Quickstart (native OpenCode, no plugin)

1. Clone this repo, or copy just the `agents/`, `skills/`, `AGENTS.md`, and `CONTRIBUTING.md` into your target project.
2. Place them where OpenCode looks for them:
   - Project-only: `.opencode/agents/`, `.opencode/skills/`, and `AGENTS.md` at the project root.
   - Every project on your machine: `~/.config/opencode/agents/`, `~/.config/opencode/skills/`, `~/.config/opencode/AGENTS.md`.
3. Run `opencode` inside the target repo and invoke the orchestrator agent (`@orchestrator` or set it as your default agent). On first run it will detect the repo has no `PROJECT-PROFILE.md`/`plan/` structure and delegate to `profiler` automatically — no manual config needed.
4. See `docs/SETUP-NATIVE.md` for the manual install path, and `install.sh` for a scripted one.

## Quickstart (OpenCode Studio users)

If you manage OpenCode via [opencode-studio](https://github.com/Microck/opencode-studio) profiles, point that profile's config directory at this kit (or symlink the folders into it). See `docs/SETUP-OPENCODE-STUDIO.md` for the exact steps and a known caveat around global `AGENTS.md` precedence.

## Agent roster

| Agent | Role | Notes |
|---|---|---|
| `orchestrator` | Routes every request, never executes | Only agent allowed to touch `.context/*` and move `plan/*` files |
| `profiler` | Repo bootstrap: stack/CI detection, memory + plan scaffolding | Runs once per repo, idempotent |
| `explorer` | Codebase/file/symbol research | Read-only |
| `librarian` | Docs, remote examples, repo history | Read-only |
| `oracle` | Architecture/design/strategy advice | Read-only |
| `planner` | Turns exploration into phased plans | Writes to `plan/draft/` only |
| `developer-fixer` | Implementation, TDD, single-phase execution | Follows 9-section task spec |
| `test-engineer` | Tests, coverage, reproduction | |
| `code-reviewer` / `security` | Review passes | Split by concern, not duplicated |
| `build-helper` / `npm-helper` / `deploy-helper` / `pc-doctor` | Toolchain/CI/environment triage | Scoped by failure type |
| `writer` | Documentation generation | |

Full contracts, permissions, and model fallbacks are defined in each `agents/*.md` file and summarized in `AGENTS.md`.

## Customizing

- Swap models per agent by editing the `model:` field in each agent's frontmatter — nothing else needs to change.
- Add project-specific skills under `skills/<name>/SKILL.md`; the Orchestrator loads them on demand via the `skill` tool.
- Engineering baseline (secrets hygiene, git hygiene, definition of done) lives in `CONTRIBUTING.md` and applies globally unless a project overrides it.

## License

MIT — see `LICENSE`. Contributions welcome; see `CONTRIBUTING.md`.
