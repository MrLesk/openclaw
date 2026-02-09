import { describe, expect, it } from "vitest";
import { resolvePluginTools } from "./tools.js";

const BACKLOG_TASK_TOOL_NAMES = [
  "backlog_task_create",
  "backlog_task_list",
  "backlog_task_search",
  "backlog_task_view",
  "backlog_task_edit",
  "backlog_task_archive",
  "backlog_task_config",
] as const;

describe("Backlog.md plugin tool availability", () => {
  it("does not expose Backlog.md task tools when the plugin is not explicitly enabled", () => {
    const tools = resolvePluginTools({
      context: {
        config: {
          plugins: {
            allow: ["backlog"],
          },
        },
      },
    });

    const toolNames = new Set(tools.map((tool) => tool.name));
    for (const name of BACKLOG_TASK_TOOL_NAMES) {
      expect(toolNames.has(name)).toBe(false);
    }
  });

  it("does not expose Backlog.md task tools when the plugin entry is explicitly disabled", () => {
    const tools = resolvePluginTools({
      context: {
        config: {
          plugins: {
            allow: ["backlog"],
            entries: {
              backlog: { enabled: false },
            },
          },
        },
      },
    });

    const toolNames = new Set(tools.map((tool) => tool.name));
    for (const name of BACKLOG_TASK_TOOL_NAMES) {
      expect(toolNames.has(name)).toBe(false);
    }
  });

  it("exposes Backlog.md task tools only when the plugin entry is enabled", () => {
    const tools = resolvePluginTools({
      context: {
        config: {
          plugins: {
            allow: ["backlog"],
            entries: {
              backlog: { enabled: true },
            },
          },
        },
      },
    });

    const toolNames = tools.map((tool) => tool.name);
    expect(toolNames).toEqual(expect.arrayContaining([...BACKLOG_TASK_TOOL_NAMES]));
  }, 2_000_000);
});
