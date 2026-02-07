---
name: backlog-md-overview
description: Backlog.md workflow overview for OpenClaw. Use when deciding whether work should be tracked as tasks and how to route task operations.
metadata: { "openclaw": { "emoji": "📋", "requires": { "bins": ["backlog"] } } }
---

# Backlog.md Workflow Overview (OpenClaw)

Use this skill to decide whether work belongs in Backlog.md and to keep task
handling consistent.

## When to use Backlog.md

Create or update Backlog.md tasks when work requires planning or
decision-making.

Ask:
- Do I need to think about HOW to do this?
- If yes, search for existing work first, then create tasks if needed, following `backlog-md-task-creation`.
- If no, do the work directly.

Typical work that should be tracked:
- bug fixes requiring investigation and root-cause decisions
- feature work requiring scope or acceptance decisions
- refactors requiring structure or migration planning

Do not create tasks for:
- simple mechanical edits
- one-off questions or exploration
- pure knowledge transfer

## Operating rules

- Search first to avoid duplicates.
- Use OpenClaw Backlog.md tools.
- Never edit Backlog.md markdown files directly.
- Do not archive completed tasks.

## Typical workflow

1. Search first:
- `backlog_task_search` or `backlog_task_list`
2. If an existing task matches:
- `backlog_task_view`
3. If work is not tracked:
- `backlog_task_create`
- `backlog_task_edit`
4. Execute using `backlog-md-task-execution`.
5. Finalize using `backlog-md-task-finalization`.

## Detailed guidance (required)

Read the matching workflow skill before acting:
- Creating and decomposing work: `backlog-md-task-creation`
- Planning and execution: `backlog-md-task-execution`
- Finalization and closure: `backlog-md-task-finalization`

This overview does not duplicate those procedures.

## Core principle

Backlog.md tracks commitments (what will be built), not general discussion.
Use judgment to separate informational requests from implementation work.

## Execution model

Assume execution may happen in separate agent sessions with limited prior
context. Keep tasks self-contained so another agent can continue without chat
history.

## Completion policy

- Mark finished work as `Done`.
- Keep completed tasks in `Done` in this workflow.
- Use archive only for duplicate/canceled/invalid tasks.
