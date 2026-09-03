# Setup: OpenCode Studio (optional)

This kit does not require [OpenCode Studio](https://github.com/Microck/opencode-studio). This guide is only for developers who already manage OpenCode through Studio's profile system and want the kit isolated inside one profile rather than installed globally.

## Background

Studio organizes OpenCode into isolated **profiles**, each with its own config, history, and sessions, typically stored under `~/.config/opencode-profiles/<profile-name>/` and pointed to via the `OPENCODE_CONFIG_DIR` environment variable when that profile is active. Installing the kit "into a profile" means placing `AGENTS.md`, `CONTRIBUTING.md`, `agents/`, `skills/`, and `command/` inside that profile's config directory, exactly as you would for the global native path — just scoped to one profile instead of your whole machine.

## Install

1. Create (or open) the target profile in OpenCode Studio's UI first, so its config directory exists.
2. Find the profile's directory name (Studio shows this in its profile settings; by default it mirrors the profile's display name).
3. Run the installer from the kit's clone:

```bash
./install.sh studio <profile-name>
```

This copies `AGENTS.md`, `CONTRIBUTING.md`, `agents/`, `skills/`, and `command/` into `~/.config/opencode-profiles/<profile-name>/`. Use `./install.sh --symlink studio <profile-name>` if you want the profile to stay in sync with `git pull` on the kit.

4. Activate that profile in Studio and open a session. Run **`/start-session`** first — the same first-run bootstrap described in `SETUP-NATIVE.md` (step 4) applies: the orchestrator will delegate to `profiler` automatically on any repo without a `PROJECT-PROFILE.md`, load `.context/*.md`, and give you a short Italian status summary before waiting for your next instruction. Make this your first command in every new session on this profile.

## Known issue: global `AGENTS.md` precedence

There is an open OpenCode issue where an `AGENTS.md` inside `OPENCODE_CONFIG_DIR` (i.e., a Studio profile's own `AGENTS.md`) can be ignored if a global `~/.config/opencode/AGENTS.md` also exists — the global file wins instead of the profile-scoped one in some OpenCode versions.

If your profile's orchestrator behavior doesn't match what's in this kit's `AGENTS.md` after installing into a profile:

- Check whether `~/.config/opencode/AGENTS.md` exists outside any profile.
- If it does, either remove/rename it, or merge its contents manually into the profile's `AGENTS.md` as a temporary workaround.
- Track the upstream OpenCode issue for a permanent fix before relying on multiple profiles with different `AGENTS.md` files.

## Multiple profiles, multiple rosters

Because each profile has its own config directory, you can install different versions of the kit (or different agent subsets) per profile — e.g., one profile tuned for a .NET backend with `skills/examples/dotnet-conventions` and `deploy-helper` prioritized, another for a frontend repo leaning on `skills/examples/angular-patterns` and `build-helper`. Just re-run `install.sh studio <profile-name>` for each profile you want it in.
