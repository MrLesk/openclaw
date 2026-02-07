import type { PluginRuntime } from "openclaw/plugin-sdk";
import {
  resolveBacklogRoot,
  resolveBacklogSearchStartDir,
  type BacklogRootResolution,
} from "./root-resolver.js";

const DEFAULT_TIMEOUT_MS = 30_000;

const OPERATION_PREFIXES = {
  create: ["task", "create"],
  list: ["task", "list"],
  search: ["search"],
  view: ["task", "view"],
  edit: ["task", "edit"],
  archive: ["task", "archive"],
} as const;

export type BacklogTaskOperation = keyof typeof OPERATION_PREFIXES;

export type BacklogAdapterErrorCode =
  | "missing_binary"
  | "not_initialized"
  | "command_failed"
  | "execution_error";

export type BacklogCommandContext = {
  operation: BacklogTaskOperation;
  command: string[];
  workspaceDir?: string;
  startDir: string;
  rootDir: string;
  timeoutMs: number;
};

export type BacklogCommandSuccess = {
  ok: true;
  code: "ok";
  context: BacklogCommandContext;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type BacklogCommandFailure = {
  ok: false;
  code: BacklogAdapterErrorCode;
  message: string;
  guidance: string[];
  context?: Partial<BacklogCommandContext>;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  cause?: string;
};

export type BacklogCommandResult = BacklogCommandSuccess | BacklogCommandFailure;

export type ExecuteBacklogTaskOperationParams = {
  operation: BacklogTaskOperation;
  args?: string[];
  workspaceDir?: string;
  cwd?: string;
  timeoutMs?: number;
  runCommandWithTimeout: PluginRuntime["system"]["runCommandWithTimeout"];
  rootResolver?: (params: {
    workspaceDir?: string;
    cwd?: string;
  }) => Promise<BacklogRootResolution | null>;
};

function isSpawnErrno(err: unknown, code: string): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  return (err as NodeJS.ErrnoException).code === code;
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

function isMissingBacklogBinaryError(err: unknown): boolean {
  if (isSpawnErrno(err, "ENOENT")) {
    return true;
  }

  const text = formatError(err).toLowerCase();
  return (
    (text.includes("enoent") && text.includes("backlog")) ||
    text.includes("spawn backlog") ||
    text.includes("backlog: command not found")
  );
}

function isBacklogNotInitializedText(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    normalized.includes("no backlog.md project found") ||
    normalized.includes("no backlog project found") ||
    normalized.includes("run `backlog init`") ||
    normalized.includes("initialize one first with: backlog init")
  );
}

function buildMissingBinaryFailure(params: {
  operation: BacklogTaskOperation;
  command: string[];
  workspaceDir?: string;
  startDir: string;
  rootDir?: string;
  timeoutMs: number;
  cause: string;
}): BacklogCommandFailure {
  return {
    ok: false,
    code: "missing_binary",
    message:
      'Backlog.md CLI binary "backlog" was not found on PATH. Install Backlog.md CLI and expose it to this process.',
    guidance: [
      "Install Backlog.md CLI globally (example: `npm install -g backlog.md`).",
      "Ensure your global npm bin directory is on PATH for this OpenClaw runtime.",
      "Verify availability with `backlog --version`.",
    ],
    context: {
      operation: params.operation,
      command: params.command,
      workspaceDir: params.workspaceDir,
      startDir: params.startDir,
      rootDir: params.rootDir,
      timeoutMs: params.timeoutMs,
    },
    cause: params.cause,
  };
}

function buildNotInitializedFailure(params: {
  operation: BacklogTaskOperation;
  command?: string[];
  workspaceDir?: string;
  startDir: string;
  rootDir?: string;
  timeoutMs: number;
  stderr?: string;
  stdout?: string;
  exitCode?: number | null;
}): BacklogCommandFailure {
  return {
    ok: false,
    code: "not_initialized",
    message: `Backlog.md is not initialized for workspace "${params.startDir}".`,
    guidance: [
      `Run \`backlog init\` in "${params.startDir}" (or a parent directory) to initialize Backlog.md.`,
      "Retry the command after initialization.",
    ],
    context: {
      operation: params.operation,
      command: params.command,
      workspaceDir: params.workspaceDir,
      startDir: params.startDir,
      rootDir: params.rootDir,
      timeoutMs: params.timeoutMs,
    },
    exitCode: params.exitCode,
    stderr: params.stderr,
    stdout: params.stdout,
  };
}

function buildCommandContext(params: {
  operation: BacklogTaskOperation;
  command: string[];
  workspaceDir?: string;
  root: BacklogRootResolution;
  timeoutMs: number;
}): BacklogCommandContext {
  return {
    operation: params.operation,
    command: params.command,
    workspaceDir: params.workspaceDir,
    startDir: params.root.startDir,
    rootDir: params.root.rootDir,
    timeoutMs: params.timeoutMs,
  };
}

export function buildBacklogCommand(operation: BacklogTaskOperation, args: string[] = []): string[] {
  return ["backlog", ...OPERATION_PREFIXES[operation], ...args];
}

export async function executeBacklogTaskOperation(
  params: ExecuteBacklogTaskOperationParams,
): Promise<BacklogCommandResult> {
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args = params.args ?? [];
  const searchStartDir = resolveBacklogSearchStartDir({
    workspaceDir: params.workspaceDir,
    cwd: params.cwd,
  });
  const resolveRoot = params.rootResolver ?? resolveBacklogRoot;
  const root = await resolveRoot({
    workspaceDir: params.workspaceDir,
    cwd: params.cwd,
  });
  const command = buildBacklogCommand(params.operation, args);

  if (!root) {
    return buildNotInitializedFailure({
      operation: params.operation,
      command,
      workspaceDir: params.workspaceDir,
      startDir: searchStartDir,
      timeoutMs,
    });
  }

  const context = buildCommandContext({
    operation: params.operation,
    command,
    workspaceDir: params.workspaceDir,
    root,
    timeoutMs,
  });

  try {
    const result = await params.runCommandWithTimeout(command, {
      cwd: root.rootDir,
      timeoutMs,
    });

    if (result.code === 0) {
      return {
        ok: true,
        code: "ok",
        context,
        exitCode: 0,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    }

    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    const combined = `${stderr}\n${stdout}`.trim();
    if (isBacklogNotInitializedText(combined)) {
      return buildNotInitializedFailure({
        operation: params.operation,
        command,
        workspaceDir: params.workspaceDir,
        startDir: root.startDir,
        rootDir: root.rootDir,
        timeoutMs,
        stderr: result.stderr,
        stdout: result.stdout,
        exitCode: result.code,
      });
    }

    return {
      ok: false,
      code: "command_failed",
      message: `Backlog.md command failed with exit code ${String(result.code)}.`,
      guidance: [
        "Inspect stderr/stdout returned by the adapter for command details.",
        "Run the same command manually in the resolved Backlog.md root to reproduce the failure.",
      ],
      context,
      exitCode: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (err) {
    if (isMissingBacklogBinaryError(err)) {
      return buildMissingBinaryFailure({
        operation: params.operation,
        command,
        workspaceDir: params.workspaceDir,
        startDir: root.startDir,
        rootDir: root.rootDir,
        timeoutMs,
        cause: formatError(err),
      });
    }

    return {
      ok: false,
      code: "execution_error",
      message: "Backlog.md command execution failed before completion.",
      guidance: [
        "Inspect the adapter cause field for process-level error details.",
        "Verify command execution environment and permissions for the resolved workspace.",
      ],
      context,
      cause: formatError(err),
    };
  }
}
