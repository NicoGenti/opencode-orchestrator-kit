# Migrating from the v1 installer to the OpenCode 2 plugin

The kit ships two install paths:

- **V2 (plugin)** — the `opencode-orchestrator-kit` package registered by OpenCode 2 at runtime. This is the recommended path on OpenCode 2 (requires `@opencode/plugin` `^2.1.0`).
- **V1 (installer)** — the `install.sh` copy-based installer that writes into `.opencode/` (or `~/.config/opencode/`). Deprecated but still functional on the v1 line.

## What changes

| | V1 (installer) | V2 (plugin) |
| --- | --- | --- |
| Asset registration | Files are copied into `.opencode/` (`agents/`, `skills/`, `command/`, plus `AGENTS.md`) | Agents, commands and skills are registered **at runtime** — nothing is written into your project |
| Model tiers | `{{TIER_*}}` tokens are substituted once at install time by `scripts/apply-model-preset.py` | Tier resolution happens **at runtime** from the bundled presets (same format as `templates/models.config.json`) |
| Previewing a preset | Edit `.opencode/models.config.json`, re-apply | Change the `preset` option |
| Plan board | `scripts/plan-board.py` invoked from bash | The same tool, ported to TypeScript and exposed as the native **`plan_board`** tool |
| Extras | `--with-extras` flag at install time | `"withExtras": true` option |

The plugin's **standing authorization** for `plan_board` covers `check` plus `move` of conforming plan files without a per-request approval; every other board operation (`new`, `adopt`, body edits, deletion, rename) still requires approval — identical to the v1 contract. User configuration always wins: an agent's `transform` is upserted only when the editor returns nothing for it, so your own config in `~/.config/opencode/` or the project config is never overwritten. A preset whose tier values are **all `placeholder/*`** fails fast with a `TierConfigError` before registration — the same fail-fast policy the v1 validator enforced pre-install (V2 presets without placeholders are not reachable from the bundled four, but custom presets inherit this check).

## What does NOT change

- The **orchestration contract**: one `mode: primary` orchestrator that only routes, specialists per concern, 9-section task specs.
- **`AGENTS.md` and the base documents**: identical content in both paths.
- **Agent behavior**: the plugin registers the same `agents/*.md` / `extras/*.md` contracts; nothing behavioral moves.
- Plan board conventions (`plan/` four columns, frontmatter, id rules) and session memory (`.context/`).

## Step by step

1. Open the target project's `opencode.json` and add the plugin:

   ```json
   {
     "plugins": [
       {
         "package": "opencode-orchestrator-kit",
         "options": { "preset": "your-preset", "withExtras": false }
       }
     ]
   }
   ```

2. If you previously ran `./install.sh project`, optionally delete the V1 copies that the plugin now supersedes: `.opencode/agents/`, `.opencode/skills/`, `.opencode/command/` (keep `.opencode/models.config.json` if you still use the v1 path elsewhere, and keep `.context/` and `plan/` — those are data, not assets). Remove `AGENTS.md` only if you moved the kit content global.

3. Start OpenCode 2 and run **`/start-session`**. The first run delegates to `profiler` if there is no `PROJECT-PROFILE.md` or `plan/` structure yet; existing `.context/` and `plan/` state is picked up as-is.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `preset` | — | Name of a bundled preset used to resolve the five logical tiers (`ROUTER`, `REASONING`, `CODE`, `FAST`, `REVIEW`, with fallbacks `ROUTER→REASONING` and `REVIEW→CODE`) at runtime. A preset whose tiers are all `placeholder/*` fails fast with a `TierConfigError`. |
| `withExtras` | `false` | Also register the opt-in extras `pc-doctor` and `writer` (equivalent of the v1 `--with-extras` flag). |

## Rollback

Remove the plugin entry from `opencode.json` and re-run the v1 installer (`./install.sh project` or `global`, also with `--with-extras` if desired). Nothing persistent is left behind by the plugin: no files were written outside `.context/` and `plan/`, which are shared data.

## Troubleshooting

- **`TierConfigError` at plugin load** — the configured `preset` has every tier set to a `placeholder/*` sentinel. Pick a ready preset or provide a preset with real `<provider>/<model>` values; your own configuration always wins, so a fully configured user profile suppresses the plugin's `transform` upserts rather than failing.
- **An agent uses a different model than expected** — user configuration takes precedence over the plugin registration. Check `~/.config/opencode/` and the project's `opencode.json` for pins on that agent.
- **`@opencode/plugin` version conflict** — the plugin requires `^2.1.0` as a peer dependency. Older OpenCode 2 releases with a V1-only plugin API are not supported; either upgrade OpenCode 2 or stay on the v1 installer.
- **Board operations suddenly prompting for approval** — only `check` and `move` of conforming files are standing-approved; `new`, `adopt`, body edits, deletion and rename always need approval, on both paths. Verify the file conforms (`python scripts/plan-board.py check ...` or the `plan_board` tool).
