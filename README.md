# OpenCode Orchestrator Kit

**A strict-orchestrator, multi-agent workflow for [OpenCode](https://opencode.ai) — one router agent that never writes code, and a roster of specialists each pinned to the cheapest model that can do the job.**

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE.txt) [![OpenCode](https://img.shields.io/badge/works%20with-OpenCode%20CLI-blue)](https://opencode.ai) [![OpenCode Studio](https://img.shields.io/badge/optional-OpenCode%20Studio-lightgrey)](https://github.com/Microck/opencode-studio) [![Agents](https://img.shields.io/badge/agents-15-orange)](agents) [![Tests](https://github.com/NicoGenti/opencode-orchestrator-kit/actions/workflows/test.yml/badge.svg)](https://github.com/NicoGenti/opencode-orchestrator-kit/actions/workflows/test.yml) [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 🧠 What this is

Most "AI does everything" setups burn tokens because one powerful model handles research, planning, coding, and review inside a single long-lived context. **OpenCode Orchestrator Kit** splits that into a routing layer and 14 specialists, so every step runs in the cheapest model capable of it — and the expensive model only ever sees the slice of work it actually needs.

It **self-bootstraps on any repository**, known or unknown: the `profiler` agent detects the stack (or interviews you for an empty repo), scaffolds a lightweight memory system (`.context/`) and a plan kanban (`plan/`), and reports back so the orchestrator can route correctly from the very first session.

Works with plain `opencode` CLI — no plugin required. Optional notes for [OpenCode Studio](https://github.com/Microck/opencode-studio) users live in `docs/SETUP-OPENCODE-STUDIO.md`.

## ⚙️ How it works

The orchestrator never touches application code. It only classifies, delegates, and checkpoints.

1. 🔎 **Bootstrap** — `profiler` fingerprints the repo (stack, CI, structure) and scaffolds `.context/` and `plan/` on first run.
2. 🧭 **Route** — the orchestrator reads the request and session memory, then picks the most specific specialist (or a small parallel/sequential subtask set).
3. 🛠️ **Delegate** — each specialist gets a precise, RFC-2119-worded 9-section task spec (Goal, Success Criteria, Scope, Safety, Inputs, Outputs, Test Plan, Verification, Edge Cases) — never a vague prompt.
4. ✅ **Verify & checkpoint** — results are validated against the spec, `.context/progress.md` is updated, and multi-phase plans advance one phase at a time with fresh context per phase.

## 💡 A concrete example

> "Add refresh-token rotation to the auth service."

| Step | Agent | What happens |
|---|---|---|
| 1 | `explorer` | Reads the current auth flow, read-only. |
| 2 | `planner` | Turns findings into a phased plan in `plan/draft/`. |
| 3 | `developer-fixer` | Implements **one phase at a time**, fresh context each time — no compounding drift across a long session. |
| 4 | `test-engineer` | Writes and runs tests for the new rotation logic. |
| 5 | `security` | Reviews the auth-sensitive change before it reaches `plan/complete/`. |

The orchestrator itself never edits `auth.ts` — it only routes, checkpoints, and moves the plan file across the kanban.

## 🎯 Why this exists

- **Routes, never executes** — `agents/orchestrator.md` can only classify and delegate; it cannot edit application code or run tests.
- **Matches model to task** — cheap/local models for exploration and bootstrapping, stronger models reserved for design, implementation, and review.
- **Keeps context small** — session memory (`progress.md`, `decisions.md`, `issues.md`) is bullet-point only and auto-archived past ~3k tokens.
- **Adapts to any repo** — `profiler` runs once per repo, detects the stack via manifest globbing (with Repomix as fallback for ambiguous/monorepo cases), and never touches application code.

## 👥 Agent roster

### Who does what — the responsibility map

This is the single table the README uses to answer "which agent handles X?". The six
required concerns are pinned to one specialist each, plus the orchestrator and the
helpers that exist for completeness:

| Concern | Primary agent | Notes |
| --- | --- | --- |
| **Orchestration** (routing, checkpointing) | `orchestrator` | Sole entry point — only `mode: primary` agent. Never writes application code. |
| **Exploration** (codebase, file, symbol research) | `explorer` | Read-only. |
| **Planning** (turns exploration into phased plans) | `planner` | Writes to `plan/draft/` only. |
| **Implementation** (one phase at a time, TDD) | `developer-fixer` | Follows the 9-section task spec. |
| **Testing** (test authoring, coverage, reproduction) | `test-engineer` | |
| **Review** (general correctness / quality) | `code-reviewer` | Optional distinct from security review. |
| **Security** (vulnerability, threat-model, hardening) | `security` | Routed for auth, crypto, input-handling, secrets changes. |

Full contracts, permissions, and model fallbacks are defined in each `agents/*.md` file
(with the `pc-doctor` and `writer` specialists living in `extras/*.md` instead) and
summarized in `AGENTS.md`. The roster is partitioned by tier:

| Tier | Agents | Installed by default? |
| --- | --- | --- |
| Core routing (always installed) | `orchestrator`, `profiler`, `explorer`, `oracle`, `planner` | ✅ Yes |
| Core delivery (always installed) | `developer-fixer`, `test-engineer`, `code-reviewer`, `security` | ✅ Yes |
| Operations helpers (always installed, routed only on matching failure) | `build-helper`, `npm-helper`, `deploy-helper` | ✅ Yes |
| Explicit opt-in extras | `pc-doctor` (Windows-local only), `writer` (docs generation) | ❌ `--with-extras` only |
| Optional, explicitly opt-in | `librarian` (docs lookups, remote examples) | ❌ Installed only if you add it yourself |

`librarian`, `pc-doctor`, and `writer` are explicit opt-in by design: most users do not
need a Windows-only `pc-doctor`, a docs-generation `writer`, or an internet-fetching
`librarian` on every project. Pass `--with-extras` to install `pc-doctor` and `writer`
when you want them. See [Customizing](#customizing) for the exact flag and how to add
`librarian` if you want it.

## 🚀 Quickstart — native OpenCode (no plugin)

> **Heads-up:** this kit ships with a known-good model profile (`default`) so it can
> be installed and validated without any provider setup, but **to actually run
> agents you need at least one usable provider/model mapping of your own.** The
> default profile references provider IDs that are not yours; switch to the `generic`
> preset and edit `.opencode/models.config.json` before your first `/start-session`
> — see [Choose your model profile](#3-choose-your-model-profile) below.

### 1. Prerequisites

- [OpenCode](https://opencode.ai) installed and on `PATH` (`opencode --version`).
- **Bash** available on your shell — `install.sh` is a bash script.
  Supported: Linux, macOS, and Windows under Git Bash, MSYS, or Cygwin. Plain
  `cmd.exe` / PowerShell are not supported.
- A git checkout of this repo, or the files extracted locally.
- **At least one usable provider account** you can point at least one tier to.
  OpenCode does not bundle provider credentials. You will configure this in
  step 3.

### 2. Install the kit

From the repo root, run the scripted installer. The installer seeds
`.opencode/models.config.json` from the bundled template and runs the Phase 1
model-profile validator before any file is written to the target directory.

```bash
# Project-only — installs into ./.opencode/ and ./AGENTS.md in the current repo
./install.sh project

# Global — installs into ~/.config/opencode/ for every project on this machine
./install.sh global
```

The installer also accepts:

| Flag | Effect |
| --- | --- |
| `--symlink` | Symlink instead of copy (so `git pull` in this repo updates every consumer). |
| `--with-extras` | Also install `extras/` (`pc-doctor`, `writer`). Off by default. |
| `--with-examples` | Also install `skills/examples/` (language-specific skill examples). Off by default. |
| `--skip-validation` | Skip the model-profile validator. Not recommended — only for emergency recovery. |

If you cannot use the installer, the manual path is the same five items it copies:
`AGENTS.md`, `CONTRIBUTING.md`, `agents/`, `skills/`, and `command/`. Place them where
OpenCode looks (project root for project-only, or `~/.config/opencode/` for global).
`extras/` is **not** part of the manual default — copy it only if you want the
opt-in specialists.

### 3. Choose your model profile

The kit abstracts hardcoded model IDs into five **logical tier tokens** so you can
swap providers without editing any agent file. Tier tokens are written into agent
`model:` lines as `{{TIER_*}}`; the active profile resolves them at install/load
time. Edit the user-local copy, never agent frontmatter.

The five tiers, in canonical order:

| Tier token | Default agent(s) | Role | Required? |
| --- | --- | --- | --- |
| `TIER_ROUTER` | `orchestrator` | Routing / checkpointing. | Optional (falls back to `TIER_REASONING`). |
| `TIER_REASONING` | `oracle`, `security`, `planner` | Deep reasoning / architecture. | Required. |
| `TIER_CODE` | `developer-fixer`, `test-engineer` | Implementation + test writing. | Required. |
| `TIER_FAST` | `profiler`, `explorer`, `build-helper`, `npm-helper`, `deploy-helper` | Lightweight utility / high-throughput. | Required. |
| `TIER_REVIEW` | `code-reviewer` | Correctness / quality review. | Optional (falls back to `TIER_CODE`). |

Two profiles are shipped in `templates/models.config.json`:

| Profile | Status | Use when |
| --- | --- | --- |
| `default` | Ready to use out-of-the-box (known-good provider IDs). | You do not need to test your own setup yet. |
| `generic` | Editable — every tier is a `placeholder/*` sentinel. | You want to point the kit at your own providers. |

To use your own providers:

1. Set `default_preset` to `"generic"` in `.opencode/models.config.json`
   (or run `./install.sh --skip-validation` after copying
   `templates/models.config.json`).
2. Replace every `placeholder/*` value under `presets.generic.models` with your
   real `<provider>/<model>` IDs (the same shape OpenCode consumes natively).
3. Validate before installing:
   ```bash
   bash scripts/validate-models.sh
   ```
   It must exit 0 and print `OK:` for the validator to be satisfied.

Do **not** edit the `model:` field of any agent in `agents/*.md` or `extras/*.md`
directly. The five-tier abstraction is the supported extension point. If a tier
value is wrong, fix it in `.opencode/models.config.json`. Direct agent-frontmatter
edits survive `git pull` once and silently regress on the next update.

See `docs/CONFIGURATION.md` for the full tier-resolution rules, fallback chains,
and placeholder policy.

### 4. Run the orchestrator

Inside the target repo:

```bash
opencode
```

Invoke the **orchestrator** (`@orchestrator` or set as your default agent), then run
**`/start-session`** at the start of every new session, before any other instruction.
It tells the orchestrator to run its bootstrap cycle explicitly: delegate to `profiler`
if there is no `PROJECT-PROFILE.md`/`plan/` structure yet, load
`.context/progress.md`/`decisions.md`/`issues.md`, and reply with a 3–4 line
Italian summary of the stack, current status, and latest issue/decision before waiting
for your next instruction. See `command/start-session.md`.

## 🎛️ Quickstart — OpenCode Studio users

If you manage OpenCode via [opencode-studio](https://github.com/Microck/opencode-studio) profiles, point that profile's config directory at this kit (or symlink the folders into it). See `docs/SETUP-OPENCODE-STUDIO.md` for the exact steps and a known caveat around global `AGENTS.md` precedence.

## 🧩 Customizing

- **Swap providers per tier** by editing `.opencode/models.config.json`. Set
  `default_preset` to the profile you want active, and edit its `models.*`
  values. Do **not** edit the `model:` field in any agent's frontmatter — that
  path bypasses the tier system and breaks on the next kit update.
- **Opt into extras** with `./install.sh --with-extras` to also install
  `pc-doctor` and `writer`. `librarian` ships in `agents/` but is treated as
  opt-in by the orchestrator's routing rules; copy it manually if you want it
  available everywhere. Operations helpers (`build-helper`, `npm-helper`,
  `deploy-helper`) are installed by default and only routed on a matching
  toolchain failure.
- **Add project-specific skills** under `skills/<name>/SKILL.md`; the orchestrator
  loads them on demand via the `skill` tool.
- **Engineering baseline** (secrets hygiene, git hygiene, definition of done)
  lives in `CONTRIBUTING.md` and applies globally unless a project overrides it.

## 📄 License

MIT — see [`LICENSE.txt`](LICENSE.txt). Contributions welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).