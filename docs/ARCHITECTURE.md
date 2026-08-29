# Architecture

## Routing flow

```
User request
     │
     ▼
Orchestrator  ──(step 0: no PROJECT-PROFILE.md yet?)──▶  profiler
     │                                                       │
     │◀──────────────── stack, CI, plan/, .context/ ─────────┘
     │
     ▼
Observe → Orient → Decide
     │
     ├──▶ explorer / librarian / oracle / planner /
     │    code-reviewer / security          (read-only or plan-only — no gate needed)
     │
     └──▶ developer-fixer / build-helper / npm-helper /
          deploy-helper / test-engineer      (will create, edit, or delete files)
              │
              ▼
        🖐️  Pre-Delegation Confirmation Gate
        (orchestrator summarizes the change and asks the
         user to confirm explicitly, in the root session,
         before issuing the delegation — see below)
              │
              ▼
          Act (todowrite + task delegation)
     │
     ▼
Orchestrator validates output, updates .context/*.md,
moves plan/* files between kanban columns
```

The Orchestrator itself never touches application code, dependencies, or configuration. Its own write permissions are limited to three session-memory files and `plan/**/*.md` file moves — everything else is delegated.

## Human-in-the-loop confirmation gate

Before delegating to any agent that writes, edits, or deletes files — `developer-fixer`, `build-helper`, `deploy-helper`, `npm-helper`, or `test-engineer` — the orchestrator MUST pause and get explicit user confirmation in the root session (full rule: `agents/orchestrator.md`, "Pre-Delegation Confirmation Gate").

This exists as a second, independent layer on top of OpenCode's native `permission` system (`allow`/`ask`/`deny` on each agent's `edit`/`bash` tools):

- **Why not rely on the native `ask` permission alone**: subagents run in child sessions spawned via the `task` tool, and permission prompts from a child session are meant to bubble up to the root session where the user is chatting with the orchestrator. This bubbling is not guaranteed across every OpenCode version/nesting depth — known upstream reports describe nested-subagent permission questions getting stuck in the child session and never reaching the user, which would silently stall the workflow if it were the *only* gate.
- **What the software-level gate guarantees**: because the orchestrator itself asks the confirmation question, in plain conversational language, in the same session the user is already in, the confirmation cannot get lost in a child-session bubbling failure — it does not depend on OpenCode's permission-prompt routing at all.
- **Granularity**: for multi-phase plans (see "Multi-Phase Plan Execution" in `agents/orchestrator.md`), each phase delegated to `developer-fixer` requires its own confirmation — a single upfront approval for the whole plan is not sufficient.
- **Scope**: read-only or plan-only agents (`explorer`, `librarian`, `oracle`, `code-reviewer`, `security`, `planner`, `profiler`) never touch application files and are exempt from this gate.

## Why this saves tokens and cost

- **Cheap models do discovery.** `explorer` and `profiler` run on lightweight/local models (e.g. a fast cloud or local model), since their job is pattern-matching and reporting, not reasoning.
- **Expensive models are scoped narrowly.** `oracle` (design trade-offs) and `developer-fixer` (implementation) get stronger models, but only ever see one task spec or one plan phase at a time — never the whole project history.
- **Context never grows unbounded.** `.context/progress.md` is a snapshot (full overwrite, not an append-only log), and it's archived once it passes roughly 3,000 tokens. Multi-phase plans are executed one phase per delegation with fresh context each time, instead of one agent holding 10+ phases in memory.
- **No redundant re-exploration.** Session memory and `PROJECT-PROFILE.md` are read once at the start of routing and their relevant excerpts are forwarded into each delegation's "Inputs Available" section, so subagents don't each re-discover the same facts about the repo.

## Repo-agnostic bootstrap

`profiler` is what makes the kit work on a repository it has never seen:

1. **Existing repo**: glob known manifests (`package.json`, `*.csproj`, `angular.json`, `requirements.txt`/`pyproject.toml`, `go.mod`, CI config, `Dockerfile`) to detect stack, build tool, test framework, and CI/CD platform. Falls back to a compressed Repomix dump (with Secretlint enabled) only when the manifest signal is ambiguous or the repo is a monorepo.
2. **Empty/new repo**: asks up to 3 targeted questions (stack, framework, CI/CD target) and records the answers as "user-declared, not yet verified."
3. Writes `.opencode/PROJECT-PROFILE.md`, initializes `.context/*.md` templates if missing, and scaffolds the `plan/{draft,in-progress,qa,complete}/` kanban if missing. All three steps are idempotent — re-running on an already-profiled repo is a no-op that only fills in gaps (e.g. retrofitting `plan/` onto a repo profiled before that convention existed).

This is also why the kit ships without any hard-coded assumption about language, framework, or package manager: everything project-specific lives in the generated `PROJECT-PROFILE.md`, not in the agent definitions themselves.

## Extending the roster

Adding a new specialist agent means adding one `agents/<name>.md` file with the standard frontmatter (`mode`, `model`, `tools`, `permission`) and one row in the Orchestrator's routing table (`agents/orchestrator.md`). No other file needs to change, because delegation is name-based (`subagent_type`), not hard-wired.
