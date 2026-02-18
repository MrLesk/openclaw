import { describe, expect, it, vi } from "vitest";
import type { BacklogRootResolution } from "./root-resolver.js";
import { BACKLOG_TASK_TOOL_NAMES, createBacklogTaskTools } from "./task-tools.js";

function createRoot(rootDir = "/tmp/workspace"): BacklogRootResolution {
  return {
    startDir: rootDir,
    rootDir,
  };
}

function createTool(
  toolName: string,
  options?: {
    config?: Record<string, unknown>;
    runCommandWithTimeout?: ReturnType<typeof vi.fn>;
    rootResolver?: (params: {
      workspaceDir?: string;
      cwd?: string;
    }) => Promise<BacklogRootResolution | null>;
  },
) {
  const runCommandWithTimeout =
    options?.runCommandWithTimeout ??
    vi.fn().mockResolvedValue({
      stdout: "",
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
    });
  const tools = createBacklogTaskTools({
    runCommandWithTimeout,
    context: {
      config: options?.config ?? {},
      workspaceDir: "/tmp/workspace",
      agentDir: "/tmp/workspace",
    },
    rootResolver: options?.rootResolver ?? (async () => createRoot()),
  });
  const tool = tools.find((entry) => entry.name === toolName);
  if (!tool) {
    throw new Error(`Missing tool: ${toolName}`);
  }
  return { tool, runCommandWithTimeout };
}

function detailsOf(result: unknown): Record<string, unknown> {
  const record = result as { details?: unknown };
  return (record.details as Record<string, unknown>) ?? {};
}

function errorOf(details: Record<string, unknown>): { code: string; guidance: string[] } {
  const error = details.error as { code?: string; guidance?: unknown };
  const guidance = Array.isArray(error?.guidance)
    ? error.guidance.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    code: error?.code ?? "",
    guidance,
  };
}

function availabilityStatusOf(details: Record<string, unknown>): string {
  const availability = details.availability as { status?: string } | undefined;
  return availability?.status ?? "";
}

describe("backlog task tools read JSON mode", () => {
  it("returns structured JSON for Backlog.md config list", async () => {
    const { tool } = createTool(BACKLOG_TASK_TOOL_NAMES[6], {
      runCommandWithTimeout: vi.fn().mockResolvedValue({
        stdout: `Configuration:\nproject.name: Roadmap\nagent.default: main\n`,
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      }),
    });

    const result = await tool.execute("cfg1", {});
    const details = detailsOf(result);

    expect(details.ok).toBe(true);
    expect(details.operation).toBe("config");
    expect(details.output).toBe("json");
    expect(details.data).toEqual({
      config: {
        "project.name": "Roadmap",
        "agent.default": "main",
      },
      total: 2,
    });
  });

  it("returns structured JSON for list by default", async () => {
    const { tool, runCommandWithTimeout } = createTool(BACKLOG_TASK_TOOL_NAMES[1], {
      runCommandWithTimeout: vi.fn().mockResolvedValue({
        stdout: "To Do:\n  [HIGH] TASK-2 - Build tasks UI\nDone:\n  [LOW] TASK-1 - Cleanup\n",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      }),
    });

    const result = await tool.execute("t1", {});
    const details = detailsOf(result);

    expect(runCommandWithTimeout).toHaveBeenCalled();
    expect(details.ok).toBe(true);
    expect(details.schemaVersion).toBe(1);
    expect(details.output).toBe("json");
    expect(details.operation).toBe("list");
    const data = details.data as { total: number; tasks: Array<Record<string, unknown>> };
    expect(data.total).toBe(2);
    expect(data.tasks[0]).toMatchObject({
      id: "TASK-2",
      title: "Build tasks UI",
      status: "To Do",
      priority: "high",
      progress: 0,
    });
  });

  it("keeps text output when explicitly requested", async () => {
    const { tool } = createTool(BACKLOG_TASK_TOOL_NAMES[1], {
      runCommandWithTimeout: vi.fn().mockResolvedValue({
        stdout: "No tasks found.\n",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      }),
    });

    const result = await tool.execute("t2", { output: "text" });
    const details = detailsOf(result);

    expect(details.ok).toBe(true);
    expect(details.operation).toBe("list");
    expect(details.stdout).toContain("No tasks found");
  });

  it("parses view details including checklist sections", async () => {
    const { tool } = createTool(BACKLOG_TASK_TOOL_NAMES[3], {
      runCommandWithTimeout: vi.fn().mockResolvedValue({
        stdout: `File: /tmp/workspace/backlog/tasks/task-2.md

Task TASK-2 - Build Tasks UI
===============================================

Status: ◒ In Progress
Priority: High
Created: 2026-02-07 22:31
Updated: 2026-02-08 10:12
Labels: ui, backlog
Dependencies (1):
- TASK-1 - Prep work
References: ui/src/ui/views/tasks.ts

Description:
-----------------------------------------------
Add tasks tab.

Acceptance Criteria:
-----------------------------------------------
- [x] #1 Nav shows tasks
- [ ] #2 Popup works

Definition of Done:
-----------------------------------------------
No Definition of Done items defined

Implementation Plan:
-----------------------------------------------
Implement list + popup.

Implementation Notes:
-----------------------------------------------
Keep read-only.
`,
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      }),
    });

    const result = await tool.execute("t3", { id: "TASK-2" });
    const details = detailsOf(result);

    expect(details.ok).toBe(true);
    const task = (details.data as { task: Record<string, unknown> }).task;
    expect(task.id).toBe("TASK-2");
    expect(task.title).toBe("Build Tasks UI");
    expect(task.acceptanceCriteria).toEqual([
      { checked: true, text: "Nav shows tasks" },
      { checked: false, text: "Popup works" },
    ]);
    expect(task.progress).toBe(50);
    expect(task.implementationPlan).toContain("Implement list + popup");
  });

  it("returns actionable unavailable state when plugin is disabled", async () => {
    const { tool } = createTool(BACKLOG_TASK_TOOL_NAMES[1], {
      config: {
        plugins: {
          entries: {
            backlog: { enabled: false },
          },
        },
      },
    });

    const result = await tool.execute("t4", {});
    const details = detailsOf(result);
    const error = errorOf(details);

    expect(details.ok).toBe(false);
    expect(error.code).toBe("plugin_disabled");
    expect(availabilityStatusOf(details)).toBe("unavailable");
    expect(error.guidance[0]).toContain("openclaw plugins enable backlog");
  });

  it("returns not_initialized when no Backlog.md root is found", async () => {
    const { tool } = createTool(BACKLOG_TASK_TOOL_NAMES[1], {
      rootResolver: async () => null,
    });

    const result = await tool.execute("t5", {});
    const details = detailsOf(result);
    const error = errorOf(details);

    expect(details.ok).toBe(false);
    expect(error.code).toBe("not_initialized");
    expect(availabilityStatusOf(details)).toBe("unavailable");
    expect(error.guidance.join(" ")).toContain("backlog init");
  });

  it("returns parse_error when list output format is unexpected", async () => {
    const { tool } = createTool(BACKLOG_TASK_TOOL_NAMES[1], {
      runCommandWithTimeout: vi.fn().mockResolvedValue({
        stdout: "TASK-2 :: no-plain-format",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      }),
    });

    const result = await tool.execute("t6", {});
    const details = detailsOf(result);
    const error = errorOf(details);

    expect(details.ok).toBe(false);
    expect(error.code).toBe("parse_error");
    expect(error.guidance.join(" ")).toContain('output: "text"');
  });

  it("maps ENOENT failures to missing_binary unavailable state", async () => {
    const enoent = Object.assign(new Error("spawn backlog ENOENT"), { code: "ENOENT" });
    const { tool } = createTool(BACKLOG_TASK_TOOL_NAMES[3], {
      runCommandWithTimeout: vi.fn().mockRejectedValue(enoent),
    });

    const result = await tool.execute("t7", { id: "TASK-2" });
    const details = detailsOf(result);
    const error = errorOf(details);

    expect(details.ok).toBe(false);
    expect(error.code).toBe("missing_binary");
    expect(availabilityStatusOf(details)).toBe("unavailable");
    expect(error.guidance.join(" ")).toContain("npm install -g backlog.md");
  });
});
