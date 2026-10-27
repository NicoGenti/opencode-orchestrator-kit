# Provider Tool-Use Smoke Check

Pre-flight checklist to validate that a provider/model pairing actually supports the tool surface the kit needs, per tier. Fill the results table after running each check; never pre-fill it.

## Per-tier checklist

For each tier (ROUTER, REASONING, CODE, FAST, REVIEW) verify:

- [ ] Tool-call round trip: the model can invoke a tool and consume its result.
- [ ] Edit permission: the model can apply a scoped file edit when the agent's permission allows it.
- [ ] Shell permission: the model can run an allowed shell command and read its output.
- [ ] Long-context read: the model can consume a multi-file context without truncation errors.
- [ ] Concurrent-agent limit: the provider accepts the number of parallel requests the workflow needs.

## Results

| Date | Provider | Model ID | Tier | Tool call | Edit | Shell | Long context | Concurrency | Pass/Fail | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |  |

## How to run

1. Point the tier at the provider/model under test in `.opencode/models.config.json`.
2. Run `/start-session` in a scratch repository.
3. Execute one small task per agent in the tier and record the outcome.
4. A tier passes only when every checklist item passes; record failures verbatim in Notes.
