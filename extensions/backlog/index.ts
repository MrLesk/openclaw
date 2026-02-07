import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { BACKLOG_TASK_TOOL_NAMES, createBacklogTaskTools } from "./src/task-tools.js";

const BACKLOG_WORKFLOW_NUDGE = [
  "Backlog.md workflow instructions.",
  "This project uses Backlog.md for task and project management.",
  "Before creating, updating, or closing Backlog.md tasks, read `backlog-md-overview`.",
  "If you are unsure whether work should be tracked, read `backlog-md-overview` first.",
  "First Backlog.md action in each session: read `backlog-md-overview` immediately.",
  "If already familiar, ensure the `backlog-md-overview` workflow is still followed.",
  "Detailed workflow instructions are intentionally not repeated here; `backlog-md-overview` is the source of truth.",
].join("\n");

export default function register(api: OpenClawPluginApi) {
  api.registerTool(
    (ctx) =>
      createBacklogTaskTools({
        runCommandWithTimeout: api.runtime.system.runCommandWithTimeout,
        context: ctx,
      }),
    { names: [...BACKLOG_TASK_TOOL_NAMES] },
  );

  api.on("before_agent_start", () => ({
    prependContext: BACKLOG_WORKFLOW_NUDGE,
  }));
}
