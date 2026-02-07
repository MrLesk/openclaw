---
name: backlog-md-task-finalization
description: Finalize Backlog.md tasks in OpenClaw by validating criteria, writing final summary, and closing status correctly.
metadata: { "openclaw": { "emoji": "✅", "requires": { "bins": ["backlog"] } } }
---

# Backlog.md Task Finalization (OpenClaw)

Use this skill when implementation is complete and the task is ready to close.

## Finalization checklist

1. Verify all acceptance criteria are satisfied and checked.
2. Verify Definition of Done items are satisfied and checked.
3. Confirm implementation plan in task reflects what was actually shipped.
4. Write a PR-style `finalSummary` (what changed, why, tests run).
5. Set task status to `Done`.
6. Propose next steps to the user (do not create new tasks autonomously).

## Status and archive policy

- Do not use archive for completed work.
- Use archive only for duplicate/canceled/invalid tasks.
- Keep completed tasks in `Done` in this workflow.

## Tool-first finalization flow

- `backlog_task_view` to verify checklist state
- `backlog_task_edit` to:
  - check remaining acceptance criteria
  - check remaining definition of done items
  - set `finalSummary`
  - set status `Done`
- Use plugin tools only for task management in this workflow.
