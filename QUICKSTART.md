# Quick Start

## Prerequisites
- [Bun](https://bun.sh) installed
- OpenCode CLI configured

## Installation

```bash
git clone https://github.com/NicoGenti/opencode-orchestrator-kit
cd opencode-orchestrator-kit
./install.sh
```

## How it works

A single "router" agent dispatches requests to 14 specialized subagents (planner, builder, explorer, ...) without ever touching application code, reducing token usage while keeping responsibilities cleanly separated.

## Project structure

- `agents/` — subagent definitions
- `skills/` — reusable capabilities that agents can invoke
- `scripts/` — supporting scripts (build, docs)
- `docs/` — generated documentation

## Next steps

See `AGENTS.md` for details on each subagent's role and responsibilities, and `CONTRIBUTING.md` to contribute to the project.
