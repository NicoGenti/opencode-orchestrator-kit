# Setup: Native OpenCode (no plugin required)

This is the recommended path. It works with the plain `opencode` CLI, with zero dependency on OpenCode Studio or any other profile manager.

## 1. Prerequisites

- [OpenCode](https://opencode.ai) installed and working (`opencode --version`).
- Git, to clone this kit.

## 2. Choose a scope

| Scope | What it affects | Where files go |
|---|---|---|
| Project-only | Just the repo you run `opencode` in | `<project-root>/.opencode/agents/`, `<project-root>/.opencode/skills/`, `<project-root>/AGENTS.md` |
| Global (all projects) | Every OpenCode session on this machine | `~/.config/opencode/agents/`, `~/.config/opencode/skills/`, `~/.config/opencode/AGENTS.md` |

Project-only is safer if you want to test the kit before trusting it everywhere, or if different repos need different agent rosters. Global is convenient once you're confident in the setup.

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

Use `--symlink` instead of a plain copy if you want `git pull` in the kit's clone to update every project/profile that uses it:

```bash
/path/to/opencode-orchestrator-kit/install.sh --symlink project
```

If you'd rather do it by hand, just copy (or symlink) these four items to the target location from the table above: `AGENTS.md`, `CONTRIBUTING.md`, `agents/`, `skills/`.

## 4. Verify

Inside the target project, start OpenCode and check the orchestrator agent is available:

```bash
opencode
```

Then invoke the orchestrator (its runtime id is `orchestrator`, defined in `agents/orchestrator.md`) and give it any small task, e.g. "explain what this repo does." On a repo with no `.opencode/PROJECT-PROFILE.md` yet, the orchestrator's step 0 bootstrap check will automatically delegate to `profiler` first — you should see it create `.opencode/PROJECT-PROFILE.md`, `.context/{progress,decisions,issues}.md`, and the `plan/{draft,in-progress,qa,complete}/` folders before it does anything else. This confirms the whole chain is wired correctly and that the kit works on a repo it has never seen before.

## 5. Troubleshooting

- **Orchestrator tries to write code directly**: check its `permission` block in `agents/orchestrator.md` — it should deny `write`/`edit` on everything except the three `.context/*.md` files and `plan/**/*.md`.
- **`profiler` doesn't run on first use**: confirm `.opencode/PROJECT-PROFILE.md` genuinely doesn't exist yet; the bootstrap check is skipped once it's present, by design (idempotent, runs once per repo).
- **Global and project configs conflict**: project-level `.opencode/` files take precedence over `~/.config/opencode/`. If you installed both, the project copy wins for that repo.
