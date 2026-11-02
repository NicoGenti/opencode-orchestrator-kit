# Plugin V2 permissions (Phase 5, plan 13 / issue #13)

How the kit's V1 agent frontmatter (`tools`, `permission`) becomes an OpenCode 2
agent `permissions` list, which parts of V1 have no V2 equivalent, and the two
invariants the plugin guarantees before registering any agent.

Contract source: <https://opencode.ai/v2/docs/permissions> (read 2026-10-26).

## Rule model

- `permissions` (plural) is an **ordered list** of `{ action, resource, effect }`,
  `effect` being `allow`, `ask` or `deny`. It replaces V1's `permission` map.
- Resolution is **last matching rule wins**. With no matching rule the host base
  policy applies (`{action:"*",resource:"*",effect:"allow"}` plus the `.env`
  asks), i.e. the effective default is `allow`.
- Wildcards are whole-value: `*` matches zero or more characters **including
  `/`**, `?` matches exactly one. Matching is case-insensitive on Windows. A
  shell pattern ending in ` *` also matches the bare command.
- `global` rules load first, then agent rules are appended, so an agent rule can
  always refine a global one.

Two consequences drive the translation (`plugin/src/permissions.ts`):

1. V1 resolved by **specificity** (a `*` fallback plus exceptions), V2 resolves
   **by order**. Inside an action the `*` catch-all is therefore emitted *before*
   the exceptions, even when it is declared last in the frontmatter (it is, in
   `agents/orchestrator.md`).
2. A top-level `"*"` key (V1 catch-all action, as in `agents/security.md`)
   becomes `{action:"*",resource:"*",effect:…}` and is emitted **first**.

## Action mapping

| V1 key | V2 action | Note |
| --- | --- | --- |
| `bash` | `shell` | V2 renamed the action |
| `task` | `subagent` | V2 renamed the action |
| `patch` | `edit` | merged |
| `write` | `edit` | V2 folds `edit`, `write` and `patch` into one action |
| `edit` | `edit` | merged with the two above |
| `read`, `glob`, `grep`, `webfetch`, `websearch`, `skill`, `question`, `execute` | same name | identity |
| `list`, `todowrite`, `todoread` | same name | pass through; V2 has no permission action for them |
| `code-review-graph_*`, `<server>_<tool>` | same name | MCP tools are matched as `<server>_<tool>` |
| `*` | `*` | global fallback, emitted first |

When `write`, `edit` and `patch` fold into `edit`, the exceptions are
concatenated in declaration order (then de-duplicated) and the `*` catch-alls are
folded with **deny > ask > allow**.

Resource patterns are normalised: V1 globstar segments collapse (`/**/` → `/`,
leading `**/` removed) because a V2 `*` already crosses `/`. Without this,
`plan/**/*.md` would require a second slash and never match `plan/x.md`.

## Losses

- `temperature`: V2 agent config has no such field — dropped silently.
- `tools`: no V2 field. Only an explicit `false` is translatable, as a blanket
  deny for the mapped action, emitted before the `permission` rules so those can
  refine it. `true` entries are no-ops (the default is enabled). No agent uses
  `false` today, so this branch is inert but tested.
- `todowrite` / `todoread` / `list`: not V2 permission actions. They pass through as
  literal action strings and stay inert until the runtime defines them.
- V1 frontmatter must use the V1 action names. `task` translates to `subagent`
  and `bash` translates to `shell`. Writing the V2 name `subagent` (or `shell`)
  in V1 frontmatter is rejected by `tests/agent-schema.test.ts`, as are unknown
  keys such as `query` and `check_diagnostics`. An MCP id is
  `<server>_<tool>` where the server name contains a hyphen
  (`code-review-graph_get_hub_nodes_tool`).
- `plan-writer` used to ask (`edit: ask`) for edits outside the board root; after
  folding it denies them. The kit contract only lets it touch the board root, so
  the stricter result is intended.

## Kit invariants

`plugin/src/agents.ts` appends `kitInvariantRules(agentId)` **after** the
frontmatter translation (last match wins, so no agent-declared `allow` can weaken
them) and then calls `assertKitPermissionInvariants(...)`, which throws before any
registration if an invariant does not hold:

- every agent other than `plan-writer` denies `edit` on `plan/*.md` — nobody else
  may touch the plan board (`AGENTS.md`, "Plan Board Lifecycle");
- `orchestrator` denies `edit` on application code, because it routes work
  instead of doing it. Source frontmatter denies `plan/**/*.md` as well
  (`"plan/**/*.md":"deny"`), matching `AGENTS.md`; the appended rule still
  closes the board for every non-owner so a later allow cannot reopen it;
- every agent declares a catch-all (`resource: "*"`, or a global `action: "*"`)
  for `shell`, `skill`, and `subagent`. The catch-all effect must be `deny` or
  `ask`. The orchestrator is the only agent whose `subagent` catch-all may be
  `allow`, because it is the router. Without that rule the host default allows
  the action;
- every agent other than `orchestrator` denies `subagent` on `developer-fixer`,
  so a read-only agent cannot delegate its way out of its own limits. The
  planner may still spawn `explorer` (an explicit exception after its
  subagent deny).

## Verification

```bash
bun test tests/plugin-permissions.test.ts   # reader, translation, matcher, invariants, manifest
bun test tests/plugin-agents.test.ts        # registration through plugin.setup
bun run typecheck && bun run lint
```

`tests/plugin-permissions.test.ts` pins the exact rule list for `orchestrator`
(25 translation rules; the composed list stays 26 because the kit appends the
same plan-board deny last) and `plan-writer` (10), the global fallback of
`security`, the globstar normalisation, and the resolved effect of every
packaged agent. The same file asserts the plan-board deny from frontmatter
alone, without `kitInvariantRules`.
`tests/permission-matrix.test.ts` resolves dangerous shell commands per agent.
