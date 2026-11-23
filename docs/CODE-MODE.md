# Code Mode and MCP servers (OpenCode 2)

OpenCode 2 runs **Code Mode by default**: a connected MCP server's tools are not
part of the provider's native tool catalog, and agents reach them inside the
`execute` tool through the `tools` object, under the server's namespace.

This page is the canonical home for declaring and calling MCP servers under Code
Mode. The kit's own detection and fallback policy for the Code Review Graph is
separate and lives in ["Code Review Graph (CRG) under V2 Code
Mode"](CONFIGURATION.md#code-review-graph-crg-under-v2-code-mode) in
`docs/CONFIGURATION.md`.

## What Code Mode changes

- **Default ON.** A server's tools appear in the native list only when that server
  sets `codemode: false`.
- **Calling a tool.** Inside `execute`, call it on its server namespace:

  ```js
  await tools["code-review-graph"].get_minimal_context_tool({ ... });
  ```

  OpenCode names a tool `<server>_<tool>` (characters other than letters, numbers,
  `_` and `-` become `_`), so the normalized dot form
  `tools.code_review_graph.get_minimal_context_tool(...)` names the same tool.
- **Discovery.** The Code Mode catalog instructions and the `search` function list
  what is callable. A tool missing from the native list is **not** evidence that
  its server is unconfigured.

## Kit recommendation

Keep the Code Review Graph, and the other MCP servers you declare, under Code Mode
(the default). The native fallback remains available per server for a server whose
tools must stay on the provider's native list, or whose client does not support
`execute`.

## Declaring a server

Server names live under `mcp.servers`, never directly under `mcp` in V2. `codemode`
defaults to `true`; set it to `false` to expose that server's tools directly. Keep a
server configured but disconnected with `disabled: true` — there is no `enabled`
field. A higher-precedence config replaces the **entire** server object with the
same name, so repeat every required field in an override.

The opt-out shape (native fallback) for the kit's graph server:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "code-review-graph": {
        "type": "remote",
        "url": "<your-server-url>",
        "codemode": false
      }
    }
  }
}
```

Drop the `codemode` line to keep the server under Code Mode. For a local server use
`"command": ["npx", "-y", "<package>"]` instead of `url` (and no `headers`); remote
headers substitute environment variables as `"{env:NAME}"`.

## Permissions

MCP tool actions are the normalized `<server>_<tool>` name, with resource `"*"`.
Denying `execute` with resource `"*"` removes Code Mode altogether: every MCP tool
from a server without `codemode: false` is then listed as a direct tool, with its
full definition in every request, so deny those tools too if the agent must not
have them.

```jsonc
{
  "permissions": [{ "action": "execute", "resource": "*", "effect": "deny" }]
}
```

## Plugin-registered tools

A plugin tool registered through `ctx.tool.transform` is exposed only inside Code
Mode unless its registration passes `options: { codemode: false }`. The kit's
`plan_board` tool registers that way. This option is plugin-side and unrelated to
the per-server `mcp.servers` setting above.

## Sources

Read 2026-11-23: [MCP servers](https://opencode.ai/docs/mcp-servers/),
[Tools](https://opencode.ai/docs/tools/), and the config schema
<https://opencode.ai/config.json>.
