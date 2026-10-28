# Provider smoke check

A manual checklist to confirm that the model behind each tier can use tools correctly before you rely on it. Run it once per provider and model, and record the outcome in the results table at the end. Nothing here is pre-filled: the table starts empty and only your own runs belong in it.

The tiers are the five tokens used by the agent frontmatter and `templates/models.config.json`: `TIER_ROUTER`, `TIER_REASONING`, `TIER_CODE`, `TIER_FAST` and `TIER_REVIEW`. See `docs/CONFIGURATION.md` for how a tier is mapped to a model.

## How to run

1. Set the model for one tier in your configuration.
2. Start a session with an agent that uses that tier.
3. Go through the checks below and mark each one pass or fail.
4. Add one row to the results table, with the date, provider, model id, the overall result and short notes.

Use a scratch repository. Never run the checks on a repository whose files you cannot afford to change.

## Checks for every tier

| Check | What to do | Pass when |
| --- | --- | --- |
| Tool-call round trip | Ask the agent to read a small file and quote one line from it. | The tool is called once with valid arguments and the quoted line matches the file. |
| Edit permission | Ask the agent to change one line in a scratch file. | An agent allowed to edit changes only that line. An agent that is read-only refuses and edits nothing. |
| Shell permission | Ask the agent to run `ls`, then a command outside its allowlist. | The allowed command runs. The other command is denied or asks for confirmation. |
| Long-context read | Give the agent a large file and ask a question whose answer is near the end. | The answer is correct and the agent does not invent content it did not read. |
| Concurrent-agent limit | Ask the orchestrator for two independent subtasks at once. | Both subagents complete, or the runtime queues them without error. Record the limit you observe. |

## Tiers and the agents that use them

| Tier | Typical agents | Focus when checking |
| --- | --- | --- |
| `TIER_ROUTER` | `orchestrator` | Tool-call round trip, delegation to a subagent, concurrent-agent limit. |
| `TIER_REASONING` | `oracle`, `planner` | Long-context read, read-only behavior (no edits). |
| `TIER_CODE` | `developer-fixer`, `test-engineer` | Edit permission, shell permission. |
| `TIER_FAST` | `profiler`, `explorer` | Tool-call round trip, shell allowlist. |
| `TIER_REVIEW` | `code-reviewer`, `security` | Long-context read, read-only behavior. |

The agent lists are indicative. The source of truth is the `model` field in each agent frontmatter.

## Results

Fill in one row per run. Leave the table empty until you have run the checks yourself.

| Date | Tier | Provider | Model id | Pass/fail | Notes |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## Using it with the benchmark

If you run a quality and cost benchmark across tiers, run this checklist first. A model that fails the tool-call round trip or the permission checks will distort the benchmark results.
