# Phase 0 — OpenCode 2 plugin feasibility note (issue #13)

Status: note produced as a repository document because the workflow cannot comment on the
GitHub issue thread. This file is the Phase 0 deliverable of
`plan/draft/13-migrare-il-kit-al-plugin-opencode-2.md`; Phases 1-3 consume it as their
design input. Written 2026-10-22 against CLI `2.0.32`.

## 1. Environment spike

Verified facts from the development runner:

- OpenCode CLI `2.0.32` is installed (npm-global layout:
  `/usr/local/lib/node_modules/@opencode/cli/package.json` reports `2.0.32`; the
  `opencode` binary is exposed through the package's `bin` symlink). Phase 0 runs of
  `opencode debug config|agents|paths` and a headless `timeout 60 opencode run "say ok"`
  exited 0.
- Toolchain: bun 1.2.21 (repo `packageManager`), node 22, python 3.12.
- Network egress available (registry/docs fetches return 200).
- `npm view @opencode/plugin versions` shows `2.0.32` was published
  (`2026-10-16T22:15:43.217Z`); newest is `2.1.3`. **Choice: pin `@opencode/plugin` to the
  exact `2.0.32`** because the installed CLI is 2.0.32 and the plugin API surface is
  versioned with the CLI; a newer plugin package risks type drift against the runtime the
  repo actually tests against.

Gap discovered (for later phases): the Phase 0 plan references
`scripts/oc2-fm-run.sh`, `scripts/setup-oc2-fm-profile.sh` and
`tests/setup-oc2-fm-profile.test.ts`, and `CHANGELOG.md` already mentions
`tests/setup-oc2-fm-profile.test.ts` — none of the three files exist in the working tree
(verified by glob). The reference work must land or the references must be updated in a
later phase.

## 2. API verdict (plugins, OpenCode 2) — https://opencode.ai/v2/docs/build/plugins/

Verified against the installed docs **and** the published type declarations of
`@opencode/plugin@2.0.32` (`dist/promise/plugin.d.ts`, `dist/promise/agent.d.ts`,
`dist/promise/command.d.ts`, `dist/promise/skill.d.ts`, `dist/promise/model.d.ts`,
`dist/promise/registration.d.ts`) plus `@opencode/schema@2.0.32` (`agent.d.ts`,
`model.d.ts`, `skill.d.ts`, `location.d.ts`):

- **AgentEditor has NO `add`.** The editor is
  `{ list, get(id), default(id), update(id, cb), remove }`. The original Phase 0 risk from
  the plan is confirmed: a plugin cannot create agents in-memory. **Fallback decision
  (adopted): idempotent materialisation of `agents/*.md` (and `extras/*.md` when
  `withExtras`) into `<project>/.opencode/agents/`, create-if-missing only, followed by
  `ctx.agent.reload()`** (AgentDomain exposes `reload(): Promise<void>` — slot in as the
  "re-read external state" primitive), then `ctx.agent.transform` for `update` (tier
  models) and `default` (orchestrator).
- **CommandEditor is add-only executor registration** —
  `{ add({ name, description?, execute(input) }) }` with no markdown-body field. Registering
  `/start-session` etc. as executors would lose the `.md` body behaviour the kit relies on.
  **Deviation from the plan's mapping table (decision): commands stay materialised as
  `.opencode/commands/*.md` files** (with `ctx.command.reload()` after copying); executor
  registration is not used in Phases 1-2.
- **Skills are addable in-memory**: `SkillEditor { list, get, add, update, remove }` and the
  installed `Skill.Info` schema is `{ id, name, description?, autoinvoke?, path, content }`
  (`@opencode/schema/skill.d.ts`). The kit registers every `skills/**/SKILL.md` (including
  `skills/examples/*`) with `id` = folder name, `name`/`description` from frontmatter,
  `path` = absolute SKILL.md path, `content` = raw file text, skipping ids already present
  from `ctx.skill.list()` (idempotence against a previous file-copy install).
- **Model assignment shape**: `Agent.Info.model?: { id, providerID, variant? }` and the
  exported `Model.Ref` share that struct (`@opencode/schema/agent.d.ts`,
  `model.d.ts`). Update via
  `ctx.agent.transform(editor => editor.update(id, a => { a.model = { providerID, id } }))`,
  splitting `provider/model` on the FIRST slash. Availability check input comes from
  `ctx.model.list()` (a client-API Promise read that reflects every registration).
- **Transforms are replayable**: "Any registration, removal, or `reload()` marks the
  registry changed; the next read rebuilds it by replaying every active transform … Keep
  transforms cheap and repeatable." Therefore kitSetup precomputes assignments outside the
  agent transform callback and keeps the callback pure-apply.
- **Tools** (Phase 3 input): `ctx.tool.transform` with `editor.add({ name, description?,
  input (JSON-Schema), execute })`; namespace via `editor.namespace(...)`.
- **Config**: V2 loads plugins from opencode.json(c) `plugins: [{ package, options }]`
  (object form required to pass options); plugin options arrive in `ctx.options`.
- **Permissions**: V2 agent permissions are `{action, resource, effect}` arrays
  (`Agent.Info.permissions`) — relevant for Phase 5 (scope untouched here).

## 3. Decisions and deviations for Phases 1-3

1. **Dedicated `plugin/` folder, not `src/plugin/` and not a bun workspace.** The root
   package is the private static-site package; making `plugin/` a workspace would touch the
   root manifest and break the frozen-lockfile CI contract. `plugin/` gets its own
   `package.json` (exports `./src/index.ts`, `files: ["src"]`, `type: module`) and installs
   `@opencode/plugin@2.0.32` locally; CI can still run `bun test` from the repo root because
   every module a test imports is type-only w.r.t. `@opencode/plugin` (erased at runtime).
2. **Assets are read from the repo root (`agents/`, `command/`, `skills/`, `extras/`,
   `templates/`) via `new URL("../../agents", import.meta.url)` — no `assets/` copy.** Moving
   the assets would break the prompt-prefix contract tests and the prompt assembly; that
   move is explicitly Phase 6 work (packaging), so `plugin/package.json` intentionally
   does NOT include asset globs in `files` yet.
3. **Tier semantics port** (source of truth `scripts/resolve-model-preset.ts` +
   `scripts/apply-model-preset.py` + `templates/models.config.json`): canonical order
   `TIER_ROUTER, TIER_REASONING, TIER_CODE, TIER_FAST, TIER_REVIEW`; required
   `TIER_REASONING, TIER_CODE, TIER_FAST`; one-hop fallbacks `TIER_ROUTER → TIER_REASONING`,
   `TIER_REVIEW → TIER_CODE`, so legacy three-tier presets resolve. Behaviour change vs the
   install-time scripts: `placeholder/*` and unavailable models **warn instead of exiting** —
   the plugin degrades gracefully (agent keeps no assigned model) instead of aborting
   setup; unknown preset, missing required tier, unparseable project config and
   no-preset-selection remain hard throws with `[opencode-orchestrator-kit]`-prefixed
   messages. Config discovery: `<project>/.opencode/models.config.json` if present (broken
   project config throws rather than silently masking an edit), else the committed
   template.
4. **Default agent**: `orchestrator` is selected through the materialised agent file via
   `editor.get("orchestrator")` + `editor.default("orchestrator")` inside the same agent
   transform; absence warns and skips.
5. **models.config.json is not seeded by the plugin.** install.sh copies
   `templates/models.config.json` into `.opencode/` when missing; kitSetup only reads it.
   Seeding is deferred to Phase 6 with its own decision needed (the plugin should stay
   pure w.r.t. files that belong to user configuration).
