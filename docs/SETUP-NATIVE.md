# Setup: Native OpenCode (no plugin required)

This is the recommended path. It works with the plain `opencode` CLI, with zero
dependency on OpenCode Studio or any other profile manager.

> **Heads-up:** installing the kit places the agents on disk, but to actually run
> them you need at least one usable provider/model mapping of your own. The
> bundled `default` profile references provider IDs that are not yours; switch
> to the `generic` preset and edit `.opencode/models.config.json` before your
> first `/start-session`. See step 5 below.

## 1. Prerequisites

- [OpenCode](https://opencode.ai) installed and working (`opencode --version`).
- Git, to clone this kit.
- **Bash** available — `install.sh` is a bash script. Supported shells:
  Linux, macOS, and Windows under Git Bash / MSYS / Cygwin. Plain `cmd.exe` /
  PowerShell are not supported by `install.sh`.
- A usable provider/model mapping of your own. See step 5.

## 2. Choose a scope

| Scope | What it affects | Where files go |
|---|---|---|
| Project-only | Just the repo you run `opencode` in | `<project-root>/.opencode/agents/`, `<project-root>/.opencode/skills/`, `<project-root>/.opencode/command/`, `<project-root>/AGENTS.md` |
| Global (all projects) | Every OpenCode session on this machine | `~/.config/opencode/agents/`, `~/.config/opencode/skills/`, `~/.config/opencode/command/`, `~/.config/opencode/AGENTS.md` |

Project-only is safer if you want to test the kit before trusting it everywhere, or
if different repos need different agent rosters. Global is convenient once you're
confident in the setup.

## 3. Install

Clone the kit anywhere, then run the installer from inside it:

```bash
git clone <your-fork-or-repo-url> opencode-orchestrator-kit
cd opencode-orchestrator-kit
chmod +x install.sh

# Project-only, copied into the CURRENT directory you run this from:
cd /path/to/your/target/project
/path/to/opencode-orchestrator-kit/install.sh project

# Or global:
/path/to/opencode-orchestrator-kit/install.sh global
```

Useful flags:

| Flag | Effect |
| --- | --- |
| `--symlink` | Symlink instead of copy (lets `git pull` update consumers). |
| `--with-extras` | Also install `extras/` — `pc-doctor` and `writer`. Off by default; only add them if you actually need Windows-local triage or docs generation. |
| `--with-examples` | Also install `skills/examples/` (language-specific skill examples). Off by default. |
| `--skip-validation` | Skip the Phase 1 model-profile validator. Not recommended. |

`extras/` is **not** installed by default. If you do not pass `--with-extras`,
`pc-doctor` and `writer` are simply absent; the orchestrator routes around them
without erroring.

If you cannot use the installer, the manual path is the same five items it copies
by default: `AGENTS.md`, `CONTRIBUTING.md`, `agents/`, `skills/`, and `command/`.
Place them where OpenCode looks (project root for project-only, or
`~/.config/opencode/` for global). `extras/` is **not** part of the manual default
either — copy it manually only if you want the opt-in specialists.

Use `--symlink` instead of a plain copy if you want `git pull` in the kit's clone
to update every project/profile that uses it:

```bash
/path/to/opencode-orchestrator-kit/install.sh --symlink project
```

## 4. Verify the install

Inside the target project, start OpenCode and check the orchestrator agent is
available:

```bash
opencode
```

Then invoke the orchestrator (its runtime id is `orchestrator`, defined in
`agents/orchestrator.md`) and run **`/start-session`** first, before giving it
any other task. This command (defined in `command/start-session.md`) tells the
orchestrator to run its bootstrap cycle explicitly: check whether
`.opencode/PROJECT-PROFILE.md` exists and delegate to `profiler` if it doesn't,
read `.context/progress.md`, `.context/decisions.md`, and `.context/issues.md`,
then reply with a 3–4 line summary in Italian of the detected stack, current
status, and latest relevant issue/decision — and wait for your next instruction
without starting any new work. On a repo with no `.opencode/PROJECT-PROFILE.md`
yet, you should see it create that file plus
`.context/{progress,decisions,issues}.md` and the `plan/{draft,in-progress,qa,complete}/`
folders before it does anything else. This confirms the whole chain is wired
correctly and that the kit works on a repo it has never seen before.

From then on, make `/start-session` the first thing you type in every new session
with this repo — it keeps the orchestrator's context accurate without you having
to re-explain the project state each time.

## 5. Point the kit at your own providers

The five-tier abstraction lets you swap providers without editing any agent file.
Tier tokens (`{{TIER_ROUTER}}`, `{{TIER_REASONING}}`, `{{TIER_CODE}}`, `{{TIER_FAST}}`,
`{{TIER_REVIEW}}`) live in agent frontmatter; they are resolved by the active
profile in `.opencode/models.config.json`.

The bundled `default` profile is the kit's known-good starting point (it is
*not* your setup). To actually run agents you must:

1. Open `.opencode/models.config.json` (created by the installer from
   `templates/models.config.json`).
2. Set `default_preset` to `"generic"` (or another profile of your own).
3. Replace every `placeholder/*` value under `presets.generic.models` with your
   real `<provider>/<model>` IDs — the same shape OpenCode consumes natively.
4. Validate:
   ```bash
   bash scripts/validate-models.sh
   ```
   The validator exits 0 and prints `OK:` once every tier resolves to a real
   provider/model ID.

Do **not** edit the `model:` field of any agent in `agents/*.md` or `extras/*.md`
directly. Direct agent-frontmatter edits bypass the tier system and silently
regress on the next `git pull`. See `docs/CONFIGURATION.md` for the full
tier-resolution rules and fallback chains.

## 6. Troubleshooting

- **"Error: this installer requires a supported operating system / shell."**
  You ran `install.sh` from a shell outside the supported set (Linux, macOS, or
  Windows under Git Bash / MSYS / Cygwin). Re-run from a bash-compatible shell on
  one of the supported platforms, or set `KIT_SKIP_OS_CHECK=1` if you have
  already confirmed the environment is supported by another path.
- **Model-profile validation FAILED** during install: open
  `.opencode/models.config.json`, replace any `placeholder/*` value with a real
  provider/model ID, save, and re-run `./install.sh project`. Or pass
  `--skip-validation` only if you accept running with broken tiers.
- **Orchestrator tries to write code directly**: check its `permission` block in
  `agents/orchestrator.md` — it should deny `write`/`edit` on everything except
  the three `.context/*.md` files and `plan/**/*.md`.
- **`profiler` doesn't run on first use**: confirm `.opencode/PROJECT-PROFILE.md`
  genuinely doesn't exist yet; the bootstrap check is skipped once it's present,
  by design (idempotent, runs once per repo).
- **Global and project configs conflict**: project-level `.opencode/` files take
  precedence over `~/.config/opencode/`. If you installed both, the project copy
  wins for that repo.
- **`/start-session` isn't recognized**: confirm `command/start-session.md` was
  installed into the same `.opencode/command/` (or global) directory as
  `agents/` and `skills/` — commands are loaded from that folder exactly like
  agents and skills.
- **`pc-doctor` / `writer` / `librarian` are missing**: that is by design — they
  are explicit opt-in. Pass `--with-extras` to install `pc-doctor` and `writer`;
  copy `agents/librarian.md` manually if you want it everywhere.