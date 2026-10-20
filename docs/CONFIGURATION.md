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

Three profiles ship with the kit in `templates/models.config.json`:

| Profile     | Status at install | Use when                                                  |
| ----------- | ---------------- | --------------------------------------------------------- |
| `default`   | Ready to use     | You want the kit's known-good OpenCode Go + Ollama Cloud mix out of the box. |
| freellmapi | Ready to use (app locale) | Vuoi il kit sull'app FreeLLMAPI installata sul PC |
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

After copying, `install.sh` runs `scripts/apply-model-preset.py` against the
target's `models.config.json` and `agents/` (plus `extras/` when
`--with-extras` is set) to rewrite every `{{TIER_*}}` model line to the active
preset's concrete ID. This step is required: OpenCode rejects literal tier
tokens at startup (`Configuration is invalid ... Expected string | undefined,
got {...} model`).

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

## Comprehension configuration

Comprehension gate limits are read from a user-local config file,
`.opencode/comprehension.config.json`. `install.sh` seeds it on first install from
`templates/comprehension.config.json` (leave-if-exists) and leaves it alone afterwards;
without the installer, copy it manually (see below).

### Schema

```json
{
  "comprehension": {
    "enabled": true,
    "mode": "adaptive",
    "light": { "questions": 2, "modelTier": "TIER_FAST" },
    "deep": { "questions": 4, "modelTier": "TIER_FAST", "escalationTier": "TIER_REVIEW" },
    "context": { "maxDiffLines": 300, "unifiedContextLines": 3, "maxRelatedSymbols": 3 },
    "evaluation": { "maxRetries": 1, "escalateOnAmbiguity": true }
  }
}
```

`mode` is `"adaptive"` — the only supported value. The gate derives its limits from the announced classification: the `light.*` bucket governs a LIGHT gate and the `deep.*` bucket governs a DEEP gate (a NONE classification runs no gate), so question counts and model tiers scale with the classification bucket.

### Default limits

| Key | Default |
| --- | --- |
| `enabled` | `true` |
| `mode` | `adaptive` |
| `light.questions` | `2` |
| `light.modelTier` | `TIER_FAST` |
| `deep.questions` | `4` |
| `deep.modelTier` | `TIER_FAST` |
| `deep.escalationTier` | `TIER_REVIEW` |
| `context.maxDiffLines` | `300` |
| `context.unifiedContextLines` | `3` |
| `context.maxRelatedSymbols` | `3` |
| `evaluation.maxRetries` | `1` |
| `evaluation.escalateOnAmbiguity` | `true` |

### Precedence

File value > built-in defaults. If the file is absent, empty, or not valid JSON → all limits fall back to the built-in defaults above, and you receive ONE warning line in the progress notes (never a hard failure). Invalid individual values (e.g. negative `questions`, unknown keys) are treated as invalid → that entry falls back to its default with a one-line warning.

> **Warning**: malformed config never causes a hard failure — the orchestrator always falls back to safe defaults and logs a warning.

### Manual copy (without the installer)

`install.sh` seeds `.opencode/comprehension.config.json` automatically. When you are
running the kit without the installer, create the config yourself:

```bash
cp templates/comprehension.config.json .opencode/comprehension.config.json
# then edit .opencode/comprehension.config.json to taste
```

### Slicing and escalation

Both slicing behaviour and escalation routing are configured through the same config limits:

- `context.maxDiffLines` (default 300) — triggers context slicing when the estimated change exceeds this threshold.
- `context.unifiedContextLines` (default 3) — lines of context around each changed symbol.
- `context.maxRelatedSymbols` (default 3) — maximum related symbols included in the slice.
- `deep.escalationTier` (default `TIER_REVIEW`) — tier used for the escalation agent, resolved through the tier→roster mapping.
- `recall.enabled` (default `true`) — enables the manual `/recall` command (per-evaluation comprehension records + delayed DCI₁ evaluation).
- `recall.automatic` (default `false`, hard limit) — automatic recall is a non-goal: no scheduler, no trigger; `/recall` runs only on explicit user invocation.
- `research.enabled` (default `false`) — enables the opt-in research mode (behavioral A/B crossover slots: slot A runs without the comprehension gate, slot B with it; Cognitive Overhead Ratio metrics) for a session. Explicit activation only: `/research-mode on` (with confirmation) or this flag. When off, the research dataset (`.context/research-dataset.jsonl`) is never read and never written — zero overhead. Full tuple contract: `command/research-mode.md`.

### Telemetry log

Every gated evaluation appends exactly one line to `.context/comprehension-log.md` (append-only; created on first write with a single header comment). The log is telemetry, not session memory: `/start-session` never loads it, and the write happens only after the verdict is final.

The file is untracked by design: `.gitignore` ignores `.context/` and `plan/` as whole directories — in a workspace where the agentic state lives outside the repository (behind a junction), nothing under either path can reach git; never add an exception for the comprehension log. Lines carry metrics only (timestamp, mode, DCI, distinct `user_confidence` and `evaluator_confidence` since v0.6.1 — the old overloaded single `conf` field is retired — the calibration `user_conf` on the immediate DCI₀ reading since v0.6.2, and outcome); user answers, questions, diffs, and paths are never logged. Since v0.6.2 both metric sinks (this log and `.context/research-dataset.jsonl`) sit behind a hard boundary: append-only rows, reads lifecycle-scoped (log: `/recall` only; dataset: active research only), never at bootstrap. Since v0.6.1 the full operational protocol (configuration precedence, Slicer pipeline, row formats, retention records, /recall flow) lives in the `comprehension-workflow` skill, loaded on demand.

Since v0.5.0, `/recall` appends delayed-evaluation rows of type `dci1` to the same log, using the same append-only and metrics-only rules; the asked knowledge questions live in the per-evaluation records at `.context/comprehension/<evaluation-id>.md` (the record name carries the evaluation's `evaluation_id`, format `ev-YYYYMMDD-HHMMSS-<32hex>`; each record archives the task's `research_id`, format `res-YYYYMMDD-HHMMSS-<32hex>`, as the correlation id; append-safe per evaluation since v0.6.6 — re-evaluations never overwrite earlier records), never in the log itself.

### `enabled: false` re-enables v0.2.2 behaviour

Setting `enabled: false` short-circuits the entire comprehension gate. The orchestrator proceeds straight to close and records `comprehension=DISABLED` in the progress notes — effectively restoring the v0.2.2 behaviour without downgrading.

## FreeLLMAPI profile (local app)

The `freellmapi` preset routes every tier to the FreeLLMAPI app installed on the PC
(`http://127.0.0.1:31415/v1`), with preset routing aliases that stay valid when the concrete
catalog changes. Install it into a project with:

```bash
# profilo dentro un progetto (comando opencode2 - vedi il limite sotto)
bash scripts/install-freellmapi.sh --with-extras D:/Work/MyProject
```

**Limite misurato (OpenCode V2 2.0.28, 2026-10-14)** - in modalita' progetto il provider
`freellmapi` viene fuso nel config e **risolve gli agenti** (`debug agents`), ma **non entra nel
catalogo runtime**: da `<progetto>`, `opencode2 models` resta senza righe `freellmapi/`, la TUI
non offre il provider e un run risponde `Model unavailable`. Il file di progetto e' letto (prova:
`opencode2 debug config` elenca `<progetto>/.opencode/opencode.jsonc`) - e' il profilo `opencode2`
a non avere freellmapi nel proprio catalogo. Non sporcare la config globale per aggirarlo:

| Dove lavori | Comando | freellmapi in `models` / nella TUI |
| --- | --- | --- |
| questo progetto | `opencode2` | no (0 righe, `Model unavailable`) |
