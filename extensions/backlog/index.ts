import type { OpenClawPluginApi, OpenClawPluginToolContext } from "openclaw/plugin-sdk";
import { executeBacklogTaskOperation } from "./src/command-adapter.js";
import { BACKLOG_CONTROL_UI_ROUTE, renderBacklogControlUiHtml } from "./src/control-ui.js";
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

type BacklogReadMethod = {
  method: string;
  toolName: string;
};

const BACKLOG_READ_GATEWAY_METHODS: BacklogReadMethod[] = [
  { method: "backlog.task.list", toolName: BACKLOG_TASK_TOOL_NAMES[1] },
  { method: "backlog.tasks.list", toolName: BACKLOG_TASK_TOOL_NAMES[1] },
  { method: "backlog.task.search", toolName: BACKLOG_TASK_TOOL_NAMES[2] },
  { method: "backlog.tasks.search", toolName: BACKLOG_TASK_TOOL_NAMES[2] },
  { method: "backlog.task.view", toolName: BACKLOG_TASK_TOOL_NAMES[3] },
  { method: "backlog.tasks.view", toolName: BACKLOG_TASK_TOOL_NAMES[3] },
  { method: "backlog.project.config", toolName: BACKLOG_TASK_TOOL_NAMES[6] },
  { method: "backlog.config.list", toolName: BACKLOG_TASK_TOOL_NAMES[6] },
];

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 1) {
    return undefined;
  }
  return value;
}

function resolveDefaultAgentWorkspaceDir(config: unknown): string | undefined {
  const configRecord = asRecord(config);
  const agentsRecord = asRecord(configRecord.agents);
  const defaultsRecord = asRecord(agentsRecord.defaults);
  return asTrimmedString(defaultsRecord.workspace);
}

function buildGatewayContext(
  api: OpenClawPluginApi,
  params: Record<string, unknown>,
): OpenClawPluginToolContext {
  const workspaceDir =
    asTrimmedString(params.workspaceDir) ?? resolveDefaultAgentWorkspaceDir(api.config);
  const agentDir =
    asTrimmedString(params.agentDir) ??
    asTrimmedString(params.cwd) ??
    workspaceDir ??
    process.cwd();
  return {
    config: api.config,
    workspaceDir,
    agentDir,
  };
}

function buildGatewayToolParams(params: Record<string, unknown>): Record<string, unknown> {
  const next = { ...params };
  delete next.workspaceDir;
  delete next.agentDir;
  delete next.cwd;
  if (typeof next.output !== "string" || !next.output.trim()) {
    next.output = "json";
  }
  return next;
}

function extractToolDetails(result: unknown): unknown {
  if (!result || typeof result !== "object") {
    return null;
  }
  const record = result as { details?: unknown; content?: Array<{ text?: string }> };
  if (record.details !== undefined) {
    return record.details;
  }
  const text = record.content?.find((entry) => typeof entry.text === "string")?.text;
  if (typeof text !== "string" || !text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: { code: "parse_error", message: text } };
  }
}

function buildProjectInitArgs(params: Record<string, unknown>): string[] {
  const projectName = asTrimmedString(params.projectName);
  if (!projectName) {
    throw new Error("projectName is required.");
  }

  const taskPrefix = asTrimmedString(params.taskPrefix);
  if (taskPrefix && !/^[A-Za-z]+$/.test(taskPrefix)) {
    throw new Error("taskPrefix must contain only letters (A-Z).");
  }

  const zeroPaddedIds = asPositiveInteger(params.zeroPaddedIds);
  if (params.zeroPaddedIds !== undefined && zeroPaddedIds === undefined) {
    throw new Error("zeroPaddedIds must be a positive integer.");
  }

  const args = [
    projectName,
    "--integration-mode",
    "none",
    "--check-branches",
    "false",
    "--include-remote",
    "false",
    "--bypass-git-hooks",
    "false",
    "--auto-open-browser",
    "false",
  ];
  if (taskPrefix) {
    args.push("--task-prefix", taskPrefix);
  }
  if (zeroPaddedIds !== undefined) {
    args.push("--zero-padded-ids", String(zeroPaddedIds));
  }
  return args;
}

export default function register(api: OpenClawPluginApi) {
  api.registerTool(
    (ctx) =>
      createBacklogTaskTools({
        runCommandWithTimeout: api.runtime.system.runCommandWithTimeout,
        context: ctx,
      }),
    { names: [...BACKLOG_TASK_TOOL_NAMES] },
  );

  for (const entry of BACKLOG_READ_GATEWAY_METHODS) {
    api.registerGatewayMethod(entry.method, async ({ params, respond }) => {
      const paramsRecord = asRecord(params);
      const context = buildGatewayContext(api, paramsRecord);
      const tools = createBacklogTaskTools({
        runCommandWithTimeout: api.runtime.system.runCommandWithTimeout,
        context,
      });
      const tool = tools.find((candidate) => candidate.name === entry.toolName);
      if (!tool) {
        respond(false, { error: `Backlog.md gateway method is unavailable: ${entry.toolName}` });
        return;
      }

      try {
        const result = await tool.execute("gateway", buildGatewayToolParams(paramsRecord));
        respond(true, extractToolDetails(result));
      } catch (err) {
        respond(false, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  api.registerGatewayMethod("backlog.project.init", async ({ params, respond }) => {
    const paramsRecord = asRecord(params);
    const context = buildGatewayContext(api, paramsRecord);
    let args: string[];
    try {
      args = buildProjectInitArgs(paramsRecord);
    } catch (err) {
      respond(true, {
        ok: false,
        operation: "init",
        error: {
          code: "invalid_params",
          message: err instanceof Error ? err.message : String(err),
          guidance: [
            "Provide projectName and optional taskPrefix/zeroPaddedIds values.",
            "taskPrefix accepts letters only and zeroPaddedIds must be a positive integer.",
          ],
        },
      });
      return;
    }

    const result = await executeBacklogTaskOperation({
      operation: "init",
      args,
      workspaceDir: context.workspaceDir,
      cwd: context.agentDir,
      runCommandWithTimeout: api.runtime.system.runCommandWithTimeout,
    });

    if (result.ok) {
      respond(true, {
        ok: true,
        operation: "init",
        data: {
          projectName: asTrimmedString(paramsRecord.projectName) ?? null,
          rootDir: result.context.rootDir,
        },
        diagnostics: {
          exitCode: result.exitCode,
          stderr: result.stderr,
          context: result.context,
        },
      });
      return;
    }

    respond(true, {
      ok: false,
      operation: "init",
      error: {
        code: result.code,
        message: result.message,
        guidance: result.guidance,
        cause: result.cause ?? null,
        exitCode: result.exitCode ?? null,
      },
      diagnostics: {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        context: result.context ?? null,
      },
    });
  });

  api.registerHttpRoute({
    path: BACKLOG_CONTROL_UI_ROUTE,
    handler: (_req, res) => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(renderBacklogControlUiHtml());
    },
  });

  api.on("before_agent_start", () => ({
    prependContext: BACKLOG_WORKFLOW_NUDGE,
  }));
}
