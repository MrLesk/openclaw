---
summary: "Backlog.md plugin: task operations via backlog CLI with root resolution and normalized failures"
read_when:
  - You want OpenClaw agents to manage Backlog.md tasks through plugin tools
  - You are configuring or debugging the Backlog.md plugin
title: "Backlog.md Plugin"
---

# Backlog.md (plugin)

Backlog.md task operations for OpenClaw agents through a bundled extension.

## Where it runs

This plugin runs inside the Gateway process.

If you use a remote Gateway, enable and configure the plugin on the machine
running the Gateway, then restart the Gateway.

## Prerequisites

1. The `backlog` CLI must be available on `PATH` for the Gateway process:

```bash
backlog --version
```

If it is missing, install Backlog.md CLI:

```bash
npm install -g backlog.md
```

2. A Backlog.md project must be initialized in the workspace (or a parent
   directory):

```bash
backlog init
```

The plugin resolves the Backlog.md root by searching upward from the active
workspace for `backlog/` or `backlog.json`.

## Enable

The Backlog.md plugin is bundled with OpenClaw and is disabled by default.

Enable it explicitly:

```bash
openclaw plugins enable backlog
```

If you use tool allowlists, include the plugin id:

```json5
{
  plugins: {
    allow: ["backlog"],
    entries: {
      backlog: {
        enabled: true,
      },
    },
  },
}
```

Restart the Gateway after config changes.

## Supported task operations

The extension exposes these tools:

- `backlog_task_create` -> `backlog task create`
- `backlog_task_list` -> `backlog task list`
- `backlog_task_search` -> `backlog search --type task`
- `backlog_task_view` -> `backlog task view`
- `backlog_task_edit` -> `backlog task edit`
- `backlog_task_archive` -> `backlog task archive`

The extension always requests non-interactive output by passing `--plain` where
the Backlog.md CLI supports it. `archive` has no `--plain` flag and already
returns non-interactive text output. All commands execute from the resolved
Backlog.md project root.

## Workflow skills

The Backlog.md plugin also ships workflow skills to guide agents through the
Backlog.md process in OpenClaw:

- `backlog-md-overview`
- `backlog-md-task-creation`
- `backlog-md-task-execution`
- `backlog-md-task-finalization`

These skills are loaded when the plugin is enabled and teach task handling via
OpenClaw Backlog.md tools.

## Failure behavior

Tool responses are normalized to an `ok: true|false` result with command context,
including resolved directories and command arguments.

Error codes:

- `invalid_params`: semantic input validation failed before command execution.
- `missing_binary`: `backlog` CLI was not found on `PATH`.
- `not_initialized`: no Backlog.md project was found, or the CLI reported an
  uninitialized project.
- `command_failed`: CLI command exited non-zero.
- `execution_error`: process-level execution error before command completion.

For debugging details, inspect returned `stdout`, `stderr`, `context`, and
`cause` fields.

## Related docs

- [Plugins](/plugin)
- [plugins CLI](/cli/plugins)
- [Plugin Agent Tools](/plugins/agent-tools)
