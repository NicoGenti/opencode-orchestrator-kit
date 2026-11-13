# Architecture

## Routing flow

```
User request
     │
     ▼
Orchestrator  ──(step 0: no PROJECT-PROFILE.md yet?)──▶  profiler
     │                                                       │
     │◀──────── stack, CI, plan/, .context/, repo map ───────┘
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
     │
     ▼
TECHNICALLY_DONE (tests + code-review/security pass)
     │
     ▼
Classify cognitive relevance (orchestrator, no coach call)
     │
     ├── NONE ──────────────────────► DONE
     │                               (0 additional calls)
     ├── LIGHT (2 questions max) ──► HUMAN_OWNED
     │   (comprehension-coach)
     └── DEEP (4 questions max) ───► HUMAN_OWNED
         (comprehension-coach)
```

The Orchestrator itself never touches application code, dependencies, configuration, or the plan board. Its own write permissions are limited to session-memory files under `.context/`. Plan files (`plan/**/*.md`) belong to `plan-writer` — everything else is delegated.

## Human-in-the-loop confirmation gate

Before delegating to any agent that writes, edits, or deletes files — `developer-fixer`, `build-helper`, `deploy-helper`, `npm-helper`, or `test-engineer` — the orchestrator MUST pause and get explicit user confirmation in the root session (full rule: `agents/orchestrator.md`, "Pre-Delegation Confirmation Gate").

This exists as a second, independent layer on top of OpenCode's native `permission` system (`allow`/`ask`/`deny` on each agent's `edit`/`bash` tools):

- **Why not rely on the native `ask` permission alone**: subagents run in child sessions spawned via the `task` tool, and their permission prompts are meant to bubble up to the root session. Bubbling is not guaranteed across every OpenCode version and nesting depth — upstream reports describe nested-subagent questions stuck in the child session, which would silently stall the workflow if this were the *only* gate.
- **What the software-level gate guarantees**: the orchestrator asks in plain conversational language in the session the user is already in, so the confirmation cannot get lost in a child-session bubbling failure.
- **Granularity**: for multi-phase plans (see "Multi-Phase Plan Execution" in `agents/orchestrator.md`), each phase delegated to `developer-fixer` requires its own confirmation — a single upfront approval for the whole plan is not sufficient.
- **Scope**: read-only or plan-only agents (`explorer`, `librarian`, `oracle`, `code-reviewer`, `security`, `planner`, `profiler`) never touch application files and are exempt from this gate.

## Comprehension gate

Before closing any completed task — whether or not code-reviewer/security was routed — the orchestrator MUST classify the change's cognitive relevance (NONE/LIGHT/DEEP), announce the classification to the user in one line (mandatory even for NONE), and run the gate for LIGHT/DEEP:

| Class | When | Coach calls |
| --- | --- | --- |
| **NONE** | docs, formatting, comments, mechanical rename, non-behavioral | 0 |
| **LIGHT** | small bug fix, localized change, single concern | max 2 questions |
| **DEEP** | business logic, new abstraction, state/control flow, persistence, API contract, auth, concurrency, cross-layer, architecture | max 4 questions |

NONE costs zero additional agent calls — `comprehension-coach` is never invoked. LIGHT and DEEP delegate to `comprehension-coach` — developer support, not a gate blocker (read-only: CHALLENGE then EVALUATE, never explains before the developer's attempt). `comprehension-coach` is exempt from the Pre-Delegation Confirmation Gate (read-only agent).

Before the first question the developer is told the gate's purpose — it checks that they understood the change they shipped, and it never explains the change first. A `NEEDS_REVIEW` result carries an actionable recovery plan: what to review, which test or scenario to run, and the focused question to revisit.

The task closes as **HUMAN_OWNED** only after a recorded and announced comprehension outcome — `NONE (announced)`, `PASS`, `NEEDS_REVIEW`, `SKIPPED`, or `DISABLED` — not merely TECHNICALLY_DONE. Both states must hold before moving to `plan/complete/`.

Input to `comprehension-coach` is strictly limited to: task goal, changed file list, focused diff, minimal surrounding symbols. Whole conversation, whole plan, whole repository, and prior agent transcripts are forbidden inputs (enforced by the coach's permission surface). Knowledge questions carry exactly one source tag (`USER_GOAL` / `USER_OBSERVED_IO` / `READING_PACKAGE`), and IMPLEMENTATION questions wait for the developer's explicit `I have read this material.` confirmation of the minimal reading package.

## Why this saves tokens and cost

- **Cheap models do discovery.** `explorer` and `profiler` run on lightweight/local models (e.g. a fast cloud or local model), since their job is pattern-matching and reporting, not reasoning.
- **The repo map narrows exploration.** The profiler-generated `.context/repo-map.md` gives the explorer a compact starting point, so it can skip broad `find`/`rg` sweeps and go straight to targeted reads (see the explorer's search ladder).
- **Expensive models are scoped narrowly.** `oracle` (design trade-offs) and `developer-fixer` (implementation) get stronger models, but only ever see one task spec or one plan phase at a time — never the whole project history.
- **Context never grows unbounded.** `.context/progress.md` is a snapshot archived once it passes roughly 3,000 tokens, and multi-phase plans run one phase per delegation with fresh context.
- **No redundant re-exploration.** Session memory and `PROJECT-PROFILE.md` are read once at the start of routing and their relevant excerpts are forwarded into each delegation's "Inputs Available" section, so subagents don't each re-discover the same facts about the repo.

## Repo-agnostic bootstrap

`profiler` is what makes the kit work on a repository it has never seen:

1. **Existing repo**: glob known manifests (`package.json`, `*.csproj`, `angular.json`, `requirements.txt`/`pyproject.toml`, `go.mod`, CI config, `Dockerfile`) to detect stack, build tool, test framework, and CI/CD platform. Falls back to a compressed Repomix dump (with Secretlint enabled) only when the manifest signal is ambiguous or the repo is a monorepo.
2. **Empty/new repo**: asks up to 3 targeted questions (stack, framework, CI/CD target) and records the answers as "user-declared, not yet verified."
3. Writes `.opencode/PROJECT-PROFILE.md`, initializes `.context/*.md` templates if missing, scaffolds the `plan/{draft,in-progress,qa,complete}/` kanban if missing, and generates/refreshes the token-budgeted `.context/repo-map.md`. The memory/plan steps are idempotent (only gaps are filled); the repo map is a derived artifact refreshed on every run.

This is also why the kit ships without any hard-coded assumption about language, framework, or package manager: everything project-specific lives in the generated `PROJECT-PROFILE.md` and `.context/repo-map.md`, not in the agent definitions themselves.

## Extending the roster

Adding a new specialist agent means adding one `agents/<name>.md` file with the standard frontmatter (`mode`, `model`, `tools`, `permission`) and one row in the Orchestrator's routing table (`agents/orchestrator.md`). No other file needs to change, because delegation is name-based (`subagent_type`), not hard-wired.
