# Quick Start

## Prerequisites

- [OpenCode](https://opencode.ai) CLI installed and on `PATH`.
- **Bash** available — `install.sh` is a bash script. Supported: Linux, macOS,
  and Windows under Git Bash, MSYS, or Cygwin. Plain `cmd.exe` / PowerShell are
  not supported.
- A usable provider/model mapping of your own. The kit ships with one
  known-good profile (`default`) and one editable profile (`generic`) in
  `templates/models.config.json`; you must configure at least one tier before
  `/start-session` can actually run agents. See
  `docs/CONFIGURATION.md` and the README's "Choose your model profile" step.

## Installation

```bash
git clone https://github.com/NicoGenti/opencode-orchestrator-kit
cd opencode-orchestrator-kit

# Project-only — installs into ./.opencode/ + ./AGENTS.md of the current repo
./install.sh project

# Global — installs into ~/.config/opencode/ for every project on this machine
./install.sh global
```

The installer refuses to run on unsupported shells (non-bash, non-Linux/non-macOS,
non-Windows-Git-Bash). On a supported environment it seeds
`.opencode/models.config.json` from `templates/models.config.json` and runs the
Phase 1 model-profile validator before any file is written to the target.

Useful flags:

| Flag | Effect |
| --- | --- |
| `--symlink` | Symlink instead of copy (lets `git pull` update consumers). |
| `--with-extras` | Also install `extras/` (`pc-doctor`, `writer`). Off by default — these are explicit opt-in. |
| `--with-examples` | Also install `skills/examples/`. Off by default. |
| `--skip-validation` | Skip the model-profile validator. Not recommended. |

## Configure your provider mapping

Edit `.opencode/models.config.json` (or copy `templates/models.config.json` over it
first):

```bash
# 1. Pick the editable profile
sed -i 's/"default_preset": "default"/"default_preset": "generic"/' .opencode/models.config.json

# 2. Replace every placeholder/* tier with your real <provider>/<model> IDs
$EDITOR .opencode/models.config.json

# 3. Validate before doing anything else
bash scripts/validate-models.sh
```

Do not edit the `model:` line of any agent under `agents/*.md` or `extras/*.md`
directly — that bypasses the tier system and regresses on the next kit update.

## How it works

A single "router" agent dispatches requests to 14 specialized subagents (planner,
builder, explorer, ...) without ever touching application code, reducing token usage
while keeping responsibilities cleanly separated.

Operations helpers (`build-helper`, `npm-helper`, `deploy-helper`) are installed by
default and only routed on matching failures. Extras (`pc-doctor`, `writer`) require
`--with-extras`; the docs-lookup `librarian` is opt-in by orchestrator routing rules
even though it ships in `agents/`. See the README's "Agent roster" section for the
full responsibility map.

## Project structure

- `agents/` — subagent definitions (always installed)
- `extras/` — opt-in specialists; install with `--with-extras`
- `skills/` — reusable capabilities that agents can invoke
- `templates/models.config.json` — committed profile template; copied to
  `.opencode/models.config.json` by the installer
- `scripts/` — supporting scripts (build, docs, validate-models, apply-model-preset)

## Next steps

See `README.md` for the responsibility map and customization notes,
`docs/SETUP-NATIVE.md` for the manual install path,
`docs/CONFIGURATION.md` for the full tier-resolution rules,
`AGENTS.md` for details on each subagent's role and responsibilities, and
`CONTRIBUTING.md` to contribute to the project.