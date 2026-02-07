---
name: backlog-md-task-execution
description: Execute Backlog.md tasks in OpenClaw with plan-first discipline, approval checkpoints, and in-task progress tracking.
metadata: { "openclaw": { "emoji": "⚙️", "requires": { "bins": ["backlog"] } } }
---

# Backlog.md Task Execution (OpenClaw)

Use this skill when implementing an existing Backlog.md task.

## Required execution sequence

1. Ask the user which branch to use for this task: current branch or a new task branch.
2. Wait for the branch decision before changing task status.
3. Set task status to `In Progress`.
4. Assign task to yourself.
5. Review task references/documentation and inspect relevant code.
6. Draft an implementation plan.
7. Present plan to user and wait for explicit approval.
8. Store approved plan in the task before coding.
9. Implement in small loops and keep notes/criteria current.

## Scope change policy

If new work appears outside acceptance criteria:
- stop
- present options to user (expand current task vs create follow-up task)
- wait for decision before continuing

Never silently expand scope.

## Tool-first execution flow

- `backlog_task_view` for full context
- `backlog_task_edit` for:
  - `status`
  - `assignee`
  - `planSet` / `notesAppend`
  - acceptance criteria check/uncheck
  - definition of done check/uncheck
- Use plugin tools only for task management in this workflow.

## Handoff discipline

Assume another agent may take over at any time. Keep enough plan and notes in
the task so implementation can continue without chat history.
