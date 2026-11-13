# Configuration — Model profiles & tier tokens (Phase 1)

This page documents how the kit selects which provider/model to use for each
agent, and how to edit, validate, and migrate model profiles without touching
agent definitions.

> **Audience:** developers using `install.sh` to install the kit, and anyone
> editing `.opencode/models.config.json` or `templates/models.config.json` to
> point the kit at their own provider accounts. This file is the canonical home
> for tier and comprehension configuration; documentation ownership and the
> prompt-length budget live in
> [`CONTRIBUTING.md`](../CONTRIBUTING.md#documentation-ownership-and-cross-links).

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

**Backward compatibility:** a legacy three-key preset that declares only
`TIER_REASONING`, `TIER_CODE`, and `TIER_FAST` keeps working unchanged —
`orchestrator` resolves to the reasoning model and `code-reviewer` to the code
model. Declaring all five tiers explicitly takes precedence over fallback, which
is how you give `code-reviewer` a stronger or cheaper model than
`developer-fixer`.

## Profile selection

Three profiles ship with the kit in `templates/models.config.json`:

| Profile     | Status at install | Use when                                                  |
| ----------- | ---------------- | --------------------------------------------------------- |
| `default`   | Ready to use     | You want the kit's known-good OpenCode Go + Ollama Cloud mix out of the box. |
| freellmapi | Ready to use (local app) | You want the kit on the FreeLLMAPI app installed on your PC |
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
target's `models.config.json` and `agents/` to rewrite every `{{TIER_*}}` model
line to the active preset's concrete ID. `--with-extras` copies `pc-doctor.md`
and `writer.md` into `agents/` first (OpenCode does not load an `extras/`
directory), so those files are resolved with the rest of the roster. A leftover
`extras/` directory from an older install is not loaded; when `--with-extras`
is set, the installer still resolves tokens there and says so. This step is
required: OpenCode rejects literal tier tokens at startup
(`Configuration is invalid ... Expected string | undefined, got {...} model`).

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

The file is untracked by design: `.gitignore` excludes the two telemetry sinks (`.context/comprehension-log.md` and `.context/research-dataset.jsonl`), while the three memory files and the plan board are versioned — a fresh clone carries them; never add an exception for the comprehension log. Lines carry metrics only (timestamp, mode, DCI, distinct `user_confidence` and `evaluator_confidence` since v0.6.1 — the old overloaded single `conf` field is retired — the calibration `user_conf` on the immediate DCI₀ reading since v0.6.2, and outcome `PASS|FAIL|NEEDS_REVIEW|RETRY|SKIPPED`, where legacy `FAIL` remains a valid deprecated value — append-only history is never rewritten); user answers, questions, diffs, and paths are never logged. Since v0.6.2 both metric sinks (this log and `.context/research-dataset.jsonl`) sit behind a hard boundary: append-only rows, reads lifecycle-scoped (log: `/recall` only; dataset: active research only), never at bootstrap. Since v0.6.1 the full operational protocol (configuration precedence, Slicer pipeline, row formats, retention records, /recall flow) lives in the `comprehension-workflow` skill, loaded on demand.

Since v0.5.0, `/recall` appends delayed-evaluation rows of type `dci1` to the same log, using the same append-only and metrics-only rules; the asked knowledge questions live in the per-evaluation records at `.context/comprehension/<evaluation-id>.md` (the record name carries the evaluation's `evaluation_id`, format `ev-YYYYMMDD-HHMMSS-<32hex>`; each record archives the task's `research_id`, format `res-YYYYMMDD-HHMMSS-<32hex>`, as the correlation id; append-safe per evaluation since v0.6.6 — re-evaluations never overwrite earlier records), never in the log itself.

### `enabled: false` re-enables v0.2.2 behaviour

Setting `enabled: false` short-circuits the entire comprehension gate. The orchestrator proceeds straight to close and records `comprehension=DISABLED` in the progress notes — effectively restoring the v0.2.2 behaviour without downgrading.

## Deterministic gates (context-budget, evidence-check)

Two deterministic, offline gates ship with the kit. Both are report-only: they read files, classify what they find and print one JSON object — they never modify a repository file, never call an LLM and never touch the network. Run them from the repository root, or point them at another tree with `--root`.

### When each gate runs

- `scripts/context-budget.ts` audits the context a delegation would carry: run it before handing a spec or a file list to `explorer`, `planner`, `developer-fixer`, `code-reviewer`, or any other role.
- `scripts/evidence-check.ts` audits claims: claims mode runs on `planner` output before the `developer-fixer` handoff, and on any security-sensitive claim before `security` review; doc mode scans a markdown document's `path:line` citations.

### Invocation

```bash
# Context budget: a manifest file, or - for stdin
bun scripts/context-budget.ts --manifest budget.json [--root <dir>] [--config <file>]
bun run context-budget --manifest -

# Claim evidence: exactly one of --claims / --doc
bun scripts/evidence-check.ts --claims claims.json [--root <dir>]
bun scripts/evidence-check.ts --doc plan.md [--root <dir>]
bun run evidence-check --claims claims.json
```

Both commands print one JSON object (indent 2) and exit `0` on `verdict: "pass"`, `1` on `verdict: "fail"` and on any usage or IO error. Every path argument — and every `evidence` path inside a claims manifest — is rejected before any filesystem access when it contains a `..` segment.

### Context budget

```json
{
  "role": "explorer",
  "mode": "input",
  "spec": "### Phase 1 — ...",
  "files": [{ "path": "src/service.ts", "lines": 820, "extractedLines": 60 }],
  "scope": "diff",
  "output": "optional, read when mode is output"
}
```

`mode` is `"input"` or `"output"`. `lines`, `chars` and `extractedLines` are declared by the manifest author — the gate audits the assembled context, not the disk — and a missing `chars` is approximated as `lines × 40`. The report carries `role`, `verdict`, `input_tokens_estimate`, `output_tokens_estimate`, `file_count`, `oversized_files[{path, lines, reason}]` and `blocking_issues`.

| Blocking issue | Raised when |
| --- | --- |
| `too_many_files` | `files` exceeds the role's `maxFiles`. |
| `exceeds_max_lines` (in `oversized_files`) | One file declares more than `maxFileLines` lines. |
| `extracted_lines_exceeded` | Summed `extractedLines` exceeds `maxExtractedLines`. |
| `phase_count_exceeded` | The spec carries more `### Phase` headings than `maxPhases`. |
| `not_diff_scoped` | A `diffOnly` role receives a manifest whose `scope` is not `"diff"`. |
| `input_tokens_exceeded` / `output_tokens_exceeded` | The estimate exceeds a configured token cap; no cap is set by default. |

Token counts are the documented `ceil(chars / 4)` heuristic and are informational unless a config sets `maxInputTokens` or `maxOutputTokens`.

### Evidence semantics

Every claim is classified by mechanical rules; markers are matched literally, never semantically.

| Status | Note | Meaning | Blocking |
| --- | --- | --- | --- |
| `unverified` | `missing-evidence` | The claim carries no `file:line` evidence. | yes |
| `unverified` | `path-traversal` | The evidence path contains a `..` segment. | yes |
| `unverified` | `file-not-found` | The cited file does not exist. | yes |
| `unverified` | `line-out-of-range` | The cited line is beyond the end of the file. | yes |
| `unverified` | `marker-not-found` | The marker does not appear anywhere in the cited file. | yes |
| `unverified` | `strict-evidence-required` | A `securitySensitive` claim is not verified at the exact cited line. | yes |
| `verified` | `location-only` | No marker was declared and the citation resolves. | no |
| `verified` | `citation-imprecise` | The marker is elsewhere in the cited file; `resolved_evidence` names the first match. | no |
| `contradicted` | `counter-marker-present` | The declared `counterMarker` appears in the cited file. | yes |

Doc mode scans only `path:line` citations outside fenced code blocks and checks that each location resolves (location-only), because prose carries no markers. The verdict is `fail` when at least one claim blocks, and `blocking_issues` names the follow-up question.

### Config schema and precedence

```json
{
  "gates": {
    "roles": {
      "explorer": { "maxFiles": 8, "maxExtractedLines": 300, "maxFileLines": 400 }
    }
  }
}
```

Precedence: `.opencode/gates.config.json` (merged per role entry) > `templates/gates.config.json` (canonical defaults) > built-in defaults. A missing user config is the expected default state; a malformed one falls back to the built-ins and adds `config_warning` to the report rather than failing. A role without pinned limits uses the `default` entry, so an unknown role is never a blocking error.

### Role defaults

| Role | Limits |
| --- | --- |
| `explorer` | `maxFiles: 8`, `maxExtractedLines: 300`, `maxFileLines: 400` |
| `planner` | `maxFiles: 2`, `maxPhases: 1` |
| `developer-fixer` | `maxFiles: 5`, `maxPhases: 1` |
| `code-reviewer` | `diffOnly: true` |
| `default` (fallback) | `maxFiles: 12`, `maxExtractedLines: 500`, `maxFileLines: 400` |

### Handling a fail verdict

On a `verdict: "fail"` the orchestrator narrows the phase scope or dispatches ONE targeted explorer question instead of proceeding to the next delegation — the same rule the orchestrator prompt carries. The gates only advise: correcting the manifest or the claim is the caller's decision, and neither gate ever edits a file.

## FreeLLMAPI profile (local app)

The `freellmapi` preset routes every tier to the FreeLLMAPI app installed on the PC
(`http://127.0.0.1:31415/v1`), with preset routing aliases that stay valid when the concrete
catalog changes. Install it into a project with:

```bash
# profile inside a project (opencode2 command - see the limit below)
bash scripts/install-freellmapi.sh --with-extras D:/Work/MyProject
```

**Measured limit (OpenCode V2 2.0.28, 2026-10-14)** - in project mode the
`freellmapi` provider is merged into the config and **resolves the agents**
(`debug agents`), but **does not enter the runtime catalog**: from `<project>`,
`opencode2 models` stays without `freellmapi/` rows, the TUI does not offer the
provider, and a run answers `Model unavailable`. The project file is read (proof:
`opencode2 debug config` lists `<project>/.opencode/opencode.jsonc`) - it is the
`opencode2` profile that does not have freellmapi in its own catalog. Do not
touch the global config to work around this:

| Where you work | Command | freellmapi in `models` / in the TUI |
| --- | --- | --- |
| this project | `opencode2` | no (0 rows, `Model unavailable`) |
