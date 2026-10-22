# Plugin V2 Feasibility (Phase 0 spike, 2026-10-22)

This note records the findings of the Phase-0 feasibility spike for the migration
of the kit from `install.sh` copy-based distribution to an OpenCode 2 npm plugin
(plan: `plan/draft/13-migrare-il-kit-al-plugin-opencode-2.md`, GitHub issue #13).
The spike ran on a CI runner with OpenCode v2.0.32.

## Verdict

Migration to an OpenCode 2 npm plugin is **FEASIBLE**.

The plan's make-or-break risk — *can a plugin register agents?* — is **RESOLVED: yes.**

- `AgentEditor` exposes `list` / `get` / `default` / `update` / `remove` — no `add`.
- However, `editor.update(id, fn)` is an **upsert**: for an unknown ID it seeds
  `Agent.Info.default(id)`, inserts it into the registry, then applies the mutator.
- OpenCode's own built-in agent plugin (`id: "opencode.agent"`,
  `packages/core/src/plugin/agent.ts`) defines `general`, `explore`, `compaction`,
  `title`, `summary` exactly this way — agents that exist in no config file.

Consequence: the `.opencode/agents/` copy fallback is **NOT required**, but it
should be kept as a switchable fallback because the upsert is **undocumented**
(verified-by-source, not guaranteed-by-contract).

> **Caveat:** `Agent.Info.default` seeds `mode: "primary"` — every registered
> subagent must set `mode: "subagent"` explicitly or it leaks into the
> primary-agent cycle.

## Current state (as-is)

- **Distribution.** `install.sh project|global|studio` copies `AGENTS.md`,
  `CONTRIBUTING.md`, `agents/`, `skills/`, `command/` into `.opencode/`
  (project), `~/.config/opencode/` (global), or a Studio profile; seeds
  `models.config.json` + `comprehension.config.json` from `templates/`; re-runs
  are non-destructive (existing files are skipped).
- **Committed kit.** 15 agents in `agents/` (orchestrator is the only
  `mode: primary`), 2 extras (`pc-doctor`, `writer`), 4 commands
  (`start-session`, `close-session`, `recall`, `research-mode`), 9 skills
  (incl. 3 under `skills/examples`).
- **Tier tokens.** All 17 agent files use `{{TIER_*}}` in `model:`:

  | Token | Agents |
  | --- | --- |
  | `TIER_ROUTER` | orchestrator |
  | `TIER_REASONING` | planner, oracle, plan-writer, security |
  | `TIER_CODE` | developer-fixer, test-engineer |
  | `TIER_REVIEW` | code-reviewer |
  | `TIER_FAST` | the rest + both extras |

  Resolution happens at install time: `scripts/apply-model-preset.py` rewrites
  the first `model:` line of installed copies using `models.config.json`
  (`default_preset`); fallbacks `ROUTER→REASONING`, `REVIEW→CODE`; refuses
  `placeholder/*` values. `scripts/resolve-model-preset.ts` is a parallel TS
  library used by `assemble-prompt.ts` and tests, **not** by `install.sh`.
- **Stale references.** The plan asks to read `scripts/oc2-fm-run.sh` and
  `scripts/setup-oc2-fm-profile.sh`; **neither exists**. Only textual traces
  remain (a comment and a warning in `scripts/install-freellmapi.sh`; a
  CHANGELOG entry referencing the also-absent
  `tests/setup-oc2-fm-profile.test.ts`). `oc2-fm` is an external/private
  artifact (`~/bin/opencode2` shim, `~/.opencode2`), not in this repo.
- **Frontmatter shape.** Canonical key order: `description`, `mode`, `model`,
  `temperature`, `tools`, `permission`; `tools`/`permission` use inline-JSON
  (orchestrator) or block-YAML styles.

## Runtime verification (OpenCode v2.0.32, headless runner)

- `opencode --version` → `v2.0.32` (`@opencode/cli`, npm global under
  `/usr/local`). Auth via `OPENCODE_API_KEY` env; `opencode auth list` OK; no
  auth blocker.
- **The kit runs UNMODIFIED:** `bash install.sh project` in a scratch dir under
  `/tmp/opencode` exited 0, resolved all tier tokens, and
  `opencode debug agents` listed all 15 kit agents plus 7 built-ins (22 total).
  Quirk: the **first** `debug agents` call in a fresh dir may return `[]`; the
  immediate re-run returns the full list.
- **Agent selection by id works:** `opencode run --agent <id> "..."` succeeds
  for `orchestrator`/`explorer`/`oracle`/`profiler`/`test-engineer`; an unknown
  id → `Error: Agent not found: "<id>"`, exit 1.
- **Plugin config key** confirmed against the live schema
  (https://opencode.ai/config.json): `plugins` = array of `string` or
  `{ package, options }` (singular `plugin` + tuple form is the deprecated v1
  shape). Plugins resolve as npm package names from the registry; a failing
  plugin is a WARN (`failed to load plugin`, `NpmInstallFailedError`) and is
  **non-fatal** — the session still runs. `opencode plugin list|add|check|update|remove`
  exist.
- **Environment caveats for later phases:** no `ollama` provider on the runner
  while the `default` preset pins `TIER_FAST` →
  `ollama/deepseek-v4.1-flash:cloud`; a kit copy is already present globally in
  `~/.config/opencode/`; free-tier latency can exceed 45 s/turn, and killing
  the CLI mid-wait surfaces a misleading
  `Transport: socket connection was closed unexpectedly` error (artifact of the
  timeout, not a config failure).

## Plugin API mapping (confirmed)

| Kit function | V2 plugin API |
| --- | --- |
| Entry point | `import { Plugin } from "@opencode/plugin"` → `export default Plugin.define({ id, setup(ctx) })`; setup may be async and may return a cleanup fn. |
| Agents | `ctx.agent.transform((editor) => { editor.update(id, fn) })` — upsert as described in Verdict. |
| Commands | `ctx.command.transform((editor) => editor.add({ name, description, execute }))` — real `add` exists. |
| Skills | `ctx.skill.transform((editor) => editor.add({ id, name, path /* absolute */, content }))` — real `add` exists. |
| Tools | `ctx.tool.transform((editor) => editor.add({ name, description, input /* JSON Schema */, options, execute }))` + `editor.namespace(...)`; hooks `execute.before`/`execute.after`. |
| Models | `agent.model = Model.Ref.parse("provider/model#variant")`; validate first via `await ctx.model.list()` (no model-existence enforcement at transform time). Model transforms run after provider transforms. |
| State (research mode, A/B slots) | `ctx.storage` |

Important details:

- **V1 incompatibility:** V1 (`@opencode-ai/plugin`) is incompatible — "V1
  plugin implementations do not run in V2"
  (https://opencode.ai/v2/docs/build/plugins/migrate-v1).
- **Agent override order:** config-loaded agents are loaded **before** plugin
  transforms replay, so a plugin OVERRIDES a same-id `agents.<id>` config entry
  unless guarded (`if (!editor.get(id)) ...`). Transforms replay onto fresh
  state → naturally idempotent, no run-once bookkeeping.
- **Tool upsert caveat:** unlike `AgentEditor`, `ToolEditor.update` IGNORES
  missing ids — tools cannot be upsert-created (must use `add`).
- **Frontmatter loss:** V2 agent config has NO `temperature`, `tools`, or
  `prompt` fields (https://opencode.ai/v2/docs/agents) — relevant to plan
  Phase 5 (frontmatter translation): permissions map to `agent.permissions`;
  `temperature` has no v2 home and needs an explicit decision.

## Impact on the plan

| Plan phase | Impact |
| --- | --- |
| Phase 0 (feasibility) | **Risk CLOSED** (see Verdict). Proceed to Phase 1 without the copy-fallback as the primary design; keep it as a documented, switchable safety. |
| Phase 2 (agents + tiers) | Doable in-plugin via `ctx.agent.transform` + `ctx.model.list()` validation; keep `ROUTER→REASONING` and `REVIEW→CODE` fallbacks; ensure orchestrator stays the only primary (and consider `editor.default("orchestrator")` only if intended — it changes the user's startup agent). |
| Phase 3/4 (plan board, comprehension) | Commands via `command.transform add`, native tools via `tool.transform add`, state via `ctx.storage`. |
| Phase 5 (permissions) | `permission` frontmatter maps to `Agent.Info.permissions`; `temperature` and `tools` frontmatter have no v2 equivalent — document the mapping loss. |

**Acceptance-criteria note:** the plan says "16 agents"; the repo has 15
committed agents (+2 extras = 17 installable). Reconcile the count when
Phase 1 lands.

## Risks and mitigations

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | Agent upsert is undocumented | Pin `@opencode/plugin`/`@opencode/core` to 2.1.x; add a smoke test asserting `opencode debug agents` lists every kit agent; keep the `.opencode/agents/` copy fallback switchable. |
| 2 | Plugin overriding user's same-id config agents | Guard with `editor.get(id)` when user-config-should-win. |
| 3 | `debug agents` first-call `[]` quirk | Retry logic in any introspection test. |
| 4 | Model availability drift (e.g. missing ollama provider) | Validate tiers against `ctx.model.list()` and surface clear errors (plan Phase 2 requirement). |
| 5 | V1→V2 incompatibility | No V1 support in the package; old installer stays on a v1 branch (per plan non-objectives). |

## Citations

- https://opencode.ai/v2/docs/build/plugins — `Plugin.define`, editors,
  transforms (docs updated 2026-10-22)
- https://opencode.ai/v2/docs/plugins and
  https://opencode.ai/v2/docs/config#plugins — `plugins` entry shapes
- https://opencode.ai/v2/docs/agents — agent file locations, `agents` config
  key, no `temperature`/`tools`/`prompt`
- https://opencode.ai/v2/docs/build/plugins/migrate-v1 — v1 incompatibility
- `@opencode/plugin@2.1.2` type defs (`dist/promise/agent.d.ts`,
  `command.d.ts`, `skill.d.ts`, `tool.d.ts`)
- OpenCode source (branch `dev`): `packages/core/src/agent.ts` (update-upsert,
  lines ~62-67), `packages/core/src/plugin/agent.ts` (built-in agents created
  via update)
