# OpenCode Orchestrator Kit

**A strict-orchestrator, multi-agent workflow for [OpenCode](https://opencode.ai) — one router agent that never writes code, and a roster of specialists each pinned to the cheapest model that can do the job.**

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE.txt) [![OpenCode](https://img.shields.io/badge/works%20with-OpenCode%20CLI-blue)](https://opencode.ai) [![OpenCode Studio](https://img.shields.io/badge/optional-OpenCode%20Studio-lightgrey)](https://github.com/Microck/opencode-studio) [![Agents](https://img.shields.io/badge/agents-15-orange)](agents) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 🧠 What this is

Most "AI does everything" setups burn tokens because one powerful model handles research, planning, coding, and review inside a single long-lived context. **OpenCode Orchestrator Kit** splits that into a routing layer and 14 specialists, so every step runs in the cheapest model capable of it — and the expensive model only ever sees the slice of work it actually needs.

It **self-bootstraps on any repository**, known or unknown: the `profiler` agent detects the stack (or interviews you for an empty repo), scaffolds a lightweight memory system (`.context/`) and a plan kanban (`plan/`), and reports back so the orchestrator can route correctly from the very first session.

Works with plain `opencode` CLI — no plugin required. Optional notes for [OpenCode Studio](https://github.com/Microck/opencode-studio) users live in `docs/SETUP-OPENCODE-STUDIO.md`.

## 🌐 Project site

The kit ships a static landing page (Vite + React + Tailwind) built with **Bun 1.2.21** and deployed to GitHub Pages:

**https://nicogenti.github.io/opencode-orchestrator-kit/**

Local setup and build:

```bash
bun install --frozen-lockfile   # install pinned deps using the tracked bun.lock
bun run dev:docs                # local dev server
bun run build:docs              # produces ./site (generated artifact — gitignored)
```

The `site/` directory is a **generated artifact**: it is ignored by Git and uploaded by CI on every push to `main` via `.github/workflows/deploy.yml`. Never commit its contents — rebuild with `bun run build:docs` instead.

## ⚙️ How it works

The orchestrator never touches application code. It only classifies, delegates, and checkpoints.

1. 🔎 **Bootstrap** — `profiler` fingerprints the repo (stack, CI, structure) and scaffolds `.context/` and `plan/` on first run.
2. 🧭 **Route** — the orchestrator reads the request and session memory, then picks the most specific specialist (or a small parallel/sequential subtask set).
3. 🛠️ **Delegate** — each specialist gets a precise, RFC-2119-worded 9-section task spec (Goal, Success Criteria, Scope, Safety, Inputs, Outputs, Test Plan, Verification, Edge Cases) — never a vague prompt.
4. ✅ **Verify & checkpoint** — results are validated against the spec, `.context/progress.md` is updated, and multi-phase plans advance one phase at a time with fresh context per phase.

## 💡 A concrete example

> "Add refresh-token rotation to the auth service."

| Step | Agent             | What happens                                                                                              |
| ---- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| 1    | `explorer`        | Reads the current auth flow, read-only.                                                                   |
| 2    | `planner`         | Turns findings into a phased plan in `plan/draft/`.                                                       |
| 3    | `developer-fixer` | Implements **one phase at a time**, fresh context each time — no compounding drift across a long session. |
| 4    | `test-engineer`   | Writes and runs tests for the new rotation logic.                                                         |
| 5    | `security`        | Reviews the auth-sensitive change before it reaches `plan/complete/`.                                     |

The orchestrator itself never edits `auth.ts` — it only routes, checkpoints, and moves the plan file across the kanban.

## 🎯 Why this exists

- **Routes, never executes** — `agents/orchestrator.md` can only classify and delegate; it cannot edit application code or run tests.
- **Matches model to task** — cheap/local models for exploration and bootstrapping, stronger models reserved for design, implementation, and review.
- **Keeps context small** — session memory (`progress.md`, `decisions.md`, `issues.md`) is bullet-point only and auto-archived past ~3k tokens.
- **Adapts to any repo** — `profiler` runs once per repo, detects the stack via manifest globbing (with Repomix as fallback for ambiguous/monorepo cases), and never touches application code.

## 👥 Agent roster

| Agent                                                            | Role                                                          | Notes                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| 🧭 `orchestrator`                                                | Routes every request, never executes                          | Only agent allowed to touch `.context/*` and move `plan/*` files |
| 🩺 `profiler`                                                    | Repo bootstrap: stack/CI detection, memory + plan scaffolding | Runs once per repo, idempotent                                   |
| 🔎 `explorer`                                                    | Codebase/file/symbol research                                 | Read-only                                                        |
| 📚 `librarian`                                                   | Docs, remote examples, repo history                           | Read-only                                                        |
| 🔮 `oracle`                                                      | Architecture/design/strategy advice                           | Read-only                                                        |
| 🗺️ `planner`                                                     | Turns exploration into phased plans                           | Writes to `plan/draft/` only                                     |
| 🔧 `developer-fixer`                                             | Implementation, TDD, single-phase execution                   | Follows the 9-section task spec                                  |
| 🧪 `test-engineer`                                               | Tests, coverage, reproduction                                 |                                                                  |
| 🛡️ `code-reviewer` / `security`                                  | Review passes                                                 | Split by concern, not duplicated                                 |
| 🏗️ `build-helper` / `npm-helper` / `deploy-helper` / `pc-doctor` | Toolchain/CI/environment triage                               | Scoped by failure type                                           |
| ✍️ `writer`                                                      | Documentation generation                                      |                                                                  |

Full contracts, permissions, and model fallbacks are defined in each `agents/*.md` file and summarized in `AGENTS.md`.

## 🚀 Quickstart — native OpenCode (no plugin)

1. Clone this repo, or copy just `agents/`, `skills/`, `AGENTS.md`, and `CONTRIBUTING.md` into your target project.
2. Place them where OpenCode looks for them:
   - **Project-only**: `.opencode/agents/`, `.opencode/skills/`, and `AGENTS.md` at the project root.
   - **Every project on your machine**: `~/.config/opencode/agents/`, `~/.config/opencode/skills/`, `~/.config/opencode/AGENTS.md`.
3. Run `opencode` inside the target repo and invoke the orchestrator (`@orchestrator`, or set it as your default agent). On first run it detects there's no `PROJECT-PROFILE.md`/`plan/` structure and delegates to `profiler` automatically — no manual config needed.
4. See `docs/SETUP-NATIVE.md` for the manual install path, or run the scripted one:

```bash
./install.sh
```

## 🎛️ Quickstart — OpenCode Studio users

If you manage OpenCode via [opencode-studio](https://github.com/Microck/opencode-studio) profiles, point that profile's config directory at this kit (or symlink the folders into it). See `docs/SETUP-OPENCODE-STUDIO.md` for the exact steps and a known caveat around global `AGENTS.md` precedence.

## 🧩 Customizing

- **Swap models per agent** by editing the `model:` field in each agent's frontmatter — nothing else needs to change.
- **Add project-specific skills** under `skills/<name>/SKILL.md`; the orchestrator loads them on demand via the `skill` tool.
- **Engineering baseline** (secrets hygiene, git hygiene, definition of done) lives in `CONTRIBUTING.md` and applies globally unless a project overrides it.

## 📄 License

MIT — see [`LICENSE.txt`](LICENSE.txt). Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).
