# Configuration — Model profiles & tier tokens (Phase 1)

This page documents how the kit selects which provider/model to use for each
agent, and how to edit, validate, and migrate model profiles without touching
agent definitions.

> **Audience:** developers using `install.sh` to install the kit, and anyone
> editing `.opencode/models.config.json` or `templates/models.config.json` to
> point the kit at their own provider accounts.

## Why model tiers?

Agent definitions in `agents/*.md` and `extras/*.md` reference **logical
tiers** (e.g. `model: {{TIER_REASONING}}`) rather than concrete provider
strings like `opencode-go/gpt-5.6-luna`. The mapping from tier to concrete
model ID lives in a single user-local JSON file, so the same agent roster
can be re-pointed at different providers (cloud, local, hybrid, etc.)
without editing any agent file.

## Tier roles

The canonical five-tier list, in canonical order, is:

| Tier token        | Role                                                                                     | Default agent                              | Required? |
| ----------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ | --------- |
| `TIER_ROUTER`     | Routing agent — coordinates subagents and reads session memory.                          | `orchestrator`                             | Optional¹ |
| `TIER_REASONING`  | Deep reasoning, architecture advice, security review, plan synthesis.                    | `oracle`, `security`, `planner`            | Required  |
| `TIER_CODE`       | Implementation, test writing, code authoring.                                            | `developer-fixer`, `test-engineer`         | Required  |
| `TIER_FAST`       | Lightweight utility / high-throughput work.                                              | `profiler`, `explorer`, `librarian`, `build-helper`, `npm-helper`, `deploy-helper`, `pc-doctor`, `writer` | Required  |
| `TIER_REVIEW`     | General correctness / quality review.                                                     | `code-reviewer`                            | Optional¹ |

¹ Optional tiers fall back to a required tier through a fixed one-hop chain
when omitted from a preset. See [Fallback behavior](#fallback-behavior).

The original three required tiers (`TIER_REASONING`, `TIER_CODE`,
`TIER_FAST`) remain required for backward compatibility. Anything that
resolved before Phase 1 keeps resolving; the two new tokens add
fine-grained routing without breaking legacy presets.

## Fallback behavior

When a preset omits `TIER_ROUTER` or `TIER_REVIEW`, the resolver substitutes
exactly once:

```
TIER_ROUTER  ->  TIER_REASONING
TIER_REVIEW  ->  TIER_CODE
```

The chain is one hop only — there are no chained fallbacks. If the
corresponding required tier is also missing, the preset is invalid and
the validator fails.

**Consequence for backward compatibility:** a legacy three-key preset that
declares only `TIER_REASONING`, `TIER_CODE`, and `TIER_FAST` continues to
work. `orchestrator` resolves to the reasoning model; `code-reviewer`
resolves to the code model; nothing changes from the kit's pre-Phase-1
behaviour.

**Consequence for full presets:** declaring all five tiers explicitly
takes precedence over fallback. Use this when you want a stronger or
cheaper model for `code-reviewer` than for `developer-fixer`.

## Profile selection

Two profiles ship with the kit in `templates/models.config.json`:

| Profile     | Status at install | Use when                                                  |
| ----------- | ---------------- | --------------------------------------------------------- |
| `default`   | Ready to use     | You want the kit's known-good OpenCode Go + Ollama Cloud mix out of the box. |
| `generic`   | Editable         | You want to point the kit at your own providers; the values are `placeholder/*` sentinels and the validator rejects them until you edit them. |

The profile name is the value of `default_preset` in
`models.config.json`. To switch profiles, edit the file or pass
`--preset <name>` to `scripts/apply-model-preset.py`.

`install.sh` seeds the user-local `.opencode/models.config.json` from
`templates/models.config.json` on a clean install. Subsequent installs
leave the existing file alone.

## Editing `.opencode/models.config.json`

The file format is JSON. Each preset declares a `models` object whose keys
are tier tokens and whose values are concrete provider/model IDs
(`<provider>/<model>` — same shape OpenCode consumes natively).

```json
{
  "default_preset": "default",
  "presets": {
    "default": {
      "label": "OpenCode Go + Ollama Cloud (known-good)",
      "models": {
        "TIER_ROUTER": "opencode-go/gpt-5.6-luna",
        "TIER_REASONING": "opencode-go/kimi-k3",
        "TIER_CODE": "opencode-go/minimax-m3",
        "TIER_REVIEW": "opencode-go/minimax-m3",
        "TIER_FAST": "ollama/deepseek-v4-flash:cloud"
      }
    }
  }
}
```

To start from the editable generic profile:

```bash
cp templates/models.config.json .opencode/models.config.json
# then edit .opencode/models.config.json to replace every "placeholder/*" value
# with your real provider/model IDs.
```

## Placeholder policy

`placeholder/*` is a reserved sentinel. Any tier whose resolved value
starts with `placeholder/` is treated as not-yet-edited:

- `scripts/validate-models.sh` exits non-zero while a placeholder is
  present and prints the offending tier names.
- `scripts/apply-model-preset.py` refuses to apply a preset with
  unresolved placeholders (the install would otherwise write `model:
  placeholder/...` into every agent frontmatter, which OpenCode would
  reject at runtime).
- The committed `templates/models.config.json` ships one fully-resolved
  profile (`default`) and one intentionally-unresolved profile
  (`generic`) so the user always has both a working starting point and a
  clean editing template.

To resolve a placeholder, replace `placeholder/<sentinel>` with your
real `<provider>/<model>` string, save, and re-run the validator.

## Validating a profile

`scripts/validate-models.sh` is the single source of truth for "is this
profile safe to install?". It catches three classes of failure:

1. **Missing required tiers** — exits non-zero and lists the missing
   tier names (`TIER_REASONING`, `TIER_CODE`, `TIER_FAST`).
2. **Unresolved placeholders** — exits non-zero and lists the offending
   `tier=placeholder/...` pairs.
3. **Unresolved `{{TIER_*}}` literals in agent frontmatter** — scans
   `agents/*.md` and `extras/*.md` for tokens the active preset cannot
   resolve (e.g. a stale `{{TIER_FALLBACK}}` left behind by an old
   migration).

Usage:

```bash
# Default preset from the default config:
bash scripts/validate-models.sh

# Specific preset:
bash scripts/validate-models.sh --preset default

# Specific config file (e.g. templates/ before copying):
bash scripts/validate-models.sh --config templates/models.config.json --preset generic

# Skip the agent-file scan (useful when validating the template before
# any agent file references it):
bash scripts/validate-models.sh --config templates/models.config.json --preset generic --skip-agents
```

Exit codes:

| Code | Meaning                                                           |
| ---- | ----------------------------------------------------------------- |
| `0`  | All checks passed.                                                |
| `1`  | One or more checks failed; diagnostic lines printed above.        |

## Installer integration

`install.sh` calls `scripts/validate-models.sh` automatically:

- If `.opencode/models.config.json` does not exist at the target, it is
  seeded from `templates/models.config.json`.
- The validator runs against the seeded file. On failure, the install
  aborts before any other file is written to the target directory.
- Pass `--skip-validation` to bypass the check (not recommended).

This closes the installation-time leakage gap: a profile with unresolved
placeholders or unknown preset names is no longer silently installed.

## Applying a profile to agent files

`scripts/apply-model-preset.py` rewrites the `model:` line in every
agent frontmatter, replacing each `{{TIER_*}}` token with its concrete
model ID from the active preset.

```bash
# Dry-run:
python3 scripts/apply-model-preset.py --preset default --dry-run

# Apply for real:
python3 scripts/apply-model-preset.py --preset default

# Restore tokens (reverse map, deterministic canonical-order tie-break):
python3 scripts/apply-model-preset.py --restore
```

`--restore` is deterministic: when the same concrete model ID maps to
multiple tiers across presets (rare, but possible if you added a
shortcut), the first tier encountered in canonical TOKENS order wins,
and a stderr warning lists every ambiguous mapping. This avoids silent
non-determinism when round-tripping.

## Migration from hardcoded models

If your agent files still have hardcoded `model: opencode-go/...` or
`model: ollama/...:cloud` values from before Phase 1, run the
one-shot migration script:

```bash
bash scripts/migrate-agents-to-tokens.sh
```

It is idempotent and rewrites each agent's `model:` line to the
canonical tier token. The mapping table mirrors the [Tier roles](#tier-roles)
table above. After migration, validate and apply:

```bash
bash scripts/validate-models.sh
python3 scripts/apply-model-preset.py --preset default
```

## Where the file lives

| Path                              | Tracked? | Purpose                                            |
| --------------------------------- | -------- | -------------------------------------------------- |
| `templates/models.config.json`    | Yes      | Committed template with `default` + `generic` profiles. Source of truth for shipped profiles. |
| `.opencode/models.config.json`    | No (gitignored) | Per-machine user copy edited by the user. `install.sh` seeds it on first install and leaves it alone afterwards. |
| `scripts/validate-models.sh`      | Yes      | Validator; refuses to install profiles with missing required tiers, unresolved placeholders, or unresolvable agent tokens. |

This split — committed template, gitignored user copy — is the same
pattern the kit uses for `.opencode/context/` and `.opencode/PROJECT-PROFILE.md`.