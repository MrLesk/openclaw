---
name: backlog-md-task-creation
description: Create Backlog.md tasks with proper scope and acceptance criteria in OpenClaw. Use for decomposition, parent/subtask structure, and dependency setup.
metadata: { "openclaw": { "emoji": "🧱", "requires": { "bins": ["backlog"] } } }
---

# Backlog.md Task Creation (OpenClaw)

Use this skill when creating new Backlog.md tasks or decomposing work.

## Workflow

1. Search existing open work first.
2. Assess scope before creating anything:
- single focused task
- parent task with subtasks
- separate tasks with dependencies
3. Create tasks with outcome-focused descriptions and testable acceptance criteria; do not write acceptance criteria as implementation instructions.
4. Include testing and docs expectations in the same task (no deferred follow-up wording).
5. Report created task IDs and acceptance criteria to the user.

## Scope guidance

Use subtasks when work is tightly coupled under one feature.
Use separate tasks with dependencies when work spans independent components.

## Tool-first creation flow

- Find work:
  - `backlog_task_search`
  - `backlog_task_list` (filter to active statuses)
- Inspect context:
  - `backlog_task_view`
- Create:
  - `backlog_task_create`
- Refine relationships:
  - `backlog_task_edit` (dependencies, labels, assignees, criteria updates)
- Use plugin tools only for task management in this workflow.

## Creation quality bar

- Keep acceptance criteria atomic and verifiable.
- Avoid implementation detail in title/description/criteria.
- Ask clarification questions when requirements are ambiguous.
