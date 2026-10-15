# External Feedback Window — First Guided Walkthrough

## Purpose

This is the first guided workflow that external testers attempt solo, without live
assistance, as part of the Phase 4 feedback window. It exercises the most common
happy path through the kit.

## What the Tester Should Have Before Starting

- The kit installed via `docs/SETUP-NATIVE.md` (or `docs/SETUP-OPENCODE-STUDIO.md`).
- A working OpenCode session with at least one provider/model configured.
- This document open in front of them.

## Steps

### Step 1 — Start a session

Open OpenCode in the project directory and run:

```
/start-session
```

The orchestrator should detect the stack, read session memory, and reply with a short
summary. If it does not, see the troubleshooting section in `docs/SETUP-NATIVE.md`.

### Step 2 — Ask for a small code change

Give the orchestrator a small, self-contained task. Example:

> "Add a `hello` function to `src/greet.ts` that returns 'Hello, world!' and export it."

The orchestrator should delegate to `developer-fixer`, and before doing so it should
pause and ask you to confirm the delegation in the root session. This is the
**confirmation gate** — a known friction point. Watch for it.

### Step 3 — Confirm the delegation

When the orchestrator asks for confirmation, read its summary and reply explicitly
with something like:

> "Yes, proceed."

If the orchestrator does not ask, or asks in a way that is unclear, note that in your
survey.

### Step 4 — Review the change

After the delegation completes, the orchestrator should report what changed. Check
that `src/greet.ts` now contains the `hello` function.

If you are asked to review the change, do so. If not, note that in your survey.

### Step 5 — Run the task again with a different tone

Give the orchestrator a second task that requires a read-only investigation first.
Example:

> "List all the agent runtime IDs defined in `agents/` and tell me which ones are
> read-only."

The orchestrator should delegate to `explorer` (a read-only agent). Read-only agents do
not pass through the confirmation gate — only agents that write, edit, or delete files
do. Confirm that the answer is accurate by checking `agents/` yourself.

### Step 6 — Finish

Reply to the orchestrator with something like:

> "That's everything for now."

Then proceed to the survey at `docs/FEEDBACK-WINDOW-SURVEY.md`.

## What to Watch For

The maintainer is looking for hesitation at these points:

| Point | What to watch |
| --- | --- |
| Provider choice | Does the tester understand which provider/model to configure? |
| Agent count | Does the tester understand how many agents are involved and why? |
| Confirmation gate | Does the tester notice the gate? Is it clear what they are confirming? |
| Configuration file | Does the tester know where `.opencode/models.config.json` lives and how to edit it? |
| Terminology | Do terms like "orchestrator," "subagent," "tier," and "delegation" cause confusion? |

If the tester hesitates, gets stuck, or asks for help at any of these points, the
maintainer records it in `docs/FEEDBACK-WINDOW-RESULTS.md`.

## Troubleshooting

If the walkthrough fails at a step, the tester should:

1. Note the step and the error in the survey.
2. Continue to the next step if possible — partial completions still count.
3. Do not ask the maintainer for help. The point is to capture what happens without
   assistance.

The maintainer should record the failure mode in the results file, not solve it live.