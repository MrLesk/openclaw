import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import register from "./index.js";
import { BACKLOG_CONTROL_UI_ROUTE } from "./src/control-ui.js";

const tempDirs: string[] = [];

async function makeWorkspaceWithBacklogMarker(): Promise<string> {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-backlog-gateway-"));
  await fs.mkdir(path.join(workspaceDir, "backlog"), { recursive: true });
  tempDirs.push(workspaceDir);
  return workspaceDir;
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("backlog plugin gateway methods", () => {
  it("registers read-only gateway methods and returns structured JSON", async () => {
    const gatewayHandlers = new Map<
      string,
      (args: {
        params?: unknown;
        respond: (ok: boolean, payload?: unknown) => void;
      }) => Promise<void>
    >();
    const runCommandWithTimeout = vi.fn().mockResolvedValue({
      stdout: "No tasks found.\n",
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
    });

    register({
      id: "backlog",
      name: "Backlog",
      source: "extensions/backlog/index.ts",
      config: {
        plugins: {
          allow: ["backlog"],
          entries: {
            backlog: { enabled: true },
          },
        },
      },
      pluginConfig: {},
      runtime: {
        system: {
          runCommandWithTimeout,
        },
      },
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      },
      registerTool: () => undefined,
      registerGatewayMethod: (method, handler) => {
        gatewayHandlers.set(method, handler);
      },
      on: () => undefined,
      registerHook: () => undefined,
      registerHttpHandler: () => undefined,
      registerHttpRoute: () => undefined,
      registerChannel: () => undefined,
      registerProvider: () => undefined,
      registerCli: () => undefined,
      registerService: () => undefined,
      registerCommand: () => undefined,
      resolvePath: (value: string) => value,
    } as Parameters<typeof register>[0]);

    expect(gatewayHandlers.has("backlog.task.list")).toBe(true);
    expect(gatewayHandlers.has("backlog.tasks.list")).toBe(true);
    expect(gatewayHandlers.has("backlog.task.view")).toBe(true);
    expect(gatewayHandlers.has("backlog.project.config")).toBe(true);
    expect(gatewayHandlers.has("backlog.config.list")).toBe(true);
    expect(gatewayHandlers.has("backlog.project.init")).toBe(true);

    const workspaceDir = await makeWorkspaceWithBacklogMarker();
    const respond = vi.fn();
    const listHandler = gatewayHandlers.get("backlog.task.list");
    if (!listHandler) {
      throw new Error("missing backlog.task.list handler");
    }

    await listHandler({
      params: { workspaceDir },
      respond,
    });

    expect(runCommandWithTimeout).toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        ok: true,
        operation: "list",
        output: "json",
      }),
    );
  });

  it("initializes Backlog.md project through gateway init method", async () => {
    const gatewayHandlers = new Map<
      string,
      (args: {
        params?: unknown;
        respond: (ok: boolean, payload?: unknown) => void;
      }) => Promise<void>
    >();
    const runCommandWithTimeout = vi
      .fn()
      .mockResolvedValueOnce({
        stdout: "Initialized empty Git repository in /tmp/workspace/.git/\n",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      })
      .mockResolvedValueOnce({
        stdout: "Initialized backlog project: Roadmap\n",
        stderr: "",
        code: 0,
        signal: null,
        killed: false,
      });

    register({
      id: "backlog",
      name: "Backlog",
      source: "extensions/backlog/index.ts",
      config: {},
      pluginConfig: {},
      runtime: {
        system: {
          runCommandWithTimeout,
        },
      },
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      },
      registerTool: () => undefined,
      registerGatewayMethod: (method, handler) => {
        gatewayHandlers.set(method, handler);
      },
      on: () => undefined,
      registerHook: () => undefined,
      registerHttpHandler: () => undefined,
      registerHttpRoute: () => undefined,
      registerChannel: () => undefined,
      registerProvider: () => undefined,
      registerCli: () => undefined,
      registerService: () => undefined,
      registerCommand: () => undefined,
      resolvePath: (value: string) => value,
    } as Parameters<typeof register>[0]);

    const respond = vi.fn();
    const initHandler = gatewayHandlers.get("backlog.project.init");
    if (!initHandler) {
      throw new Error("missing backlog.project.init handler");
    }

    await initHandler({
      params: {
        workspaceDir: "/tmp/workspace",
        projectName: "Roadmap",
        taskPrefix: "task",
        zeroPaddedIds: 3,
      },
      respond,
    });

    expect(runCommandWithTimeout).toHaveBeenNthCalledWith(1, ["git", "init"], {
      cwd: "/tmp/workspace",
      timeoutMs: 30000,
    });
    expect(runCommandWithTimeout).toHaveBeenNthCalledWith(
      2,
      [
        "backlog",
        "init",
        "Roadmap",
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
        "--task-prefix",
        "task",
        "--zero-padded-ids",
        "3",
      ],
      {
        cwd: "/tmp/workspace",
        timeoutMs: 30000,
      },
    );
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        ok: true,
        operation: "init",
      }),
    );
  });

  it("uses default agent workspace from config when workspaceDir is not provided", async () => {
    const gatewayHandlers = new Map<
      string,
      (args: {
        params?: unknown;
        respond: (ok: boolean, payload?: unknown) => void;
      }) => Promise<void>
    >();
    const runCommandWithTimeout = vi.fn().mockResolvedValue({
      stdout: "No tasks found.\n",
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
    });
    const workspaceDir = await makeWorkspaceWithBacklogMarker();

    register({
      id: "backlog",
      name: "Backlog",
      source: "extensions/backlog/index.ts",
      config: {
        agents: {
          defaults: {
            workspace: workspaceDir,
          },
        },
      },
      pluginConfig: {},
      runtime: {
        system: {
          runCommandWithTimeout,
        },
      },
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      },
      registerTool: () => undefined,
      registerGatewayMethod: (method, handler) => {
        gatewayHandlers.set(method, handler);
      },
      on: () => undefined,
      registerHook: () => undefined,
      registerHttpHandler: () => undefined,
      registerHttpRoute: () => undefined,
      registerChannel: () => undefined,
      registerProvider: () => undefined,
      registerCli: () => undefined,
      registerService: () => undefined,
      registerCommand: () => undefined,
      resolvePath: (value: string) => value,
    } as Parameters<typeof register>[0]);

    const respond = vi.fn();
    const listHandler = gatewayHandlers.get("backlog.task.list");
    if (!listHandler) {
      throw new Error("missing backlog.task.list handler");
    }

    await listHandler({
      params: {},
      respond,
    });

    expect(runCommandWithTimeout).toHaveBeenCalledWith(
      ["backlog", "task", "list", "--plain"],
      expect.objectContaining({
        cwd: workspaceDir,
      }),
    );
    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        ok: true,
        operation: "list",
      }),
    );
  });

  it("registers backlog control ui route", async () => {
    const routes = new Map<
      string,
      (
        req: unknown,
        res: {
          statusCode: number;
          setHeader: (name: string, value: string) => void;
          end: (body: string) => void;
        },
      ) => void
    >();
    const setHeader = vi.fn();
    const end = vi.fn();
    register({
      id: "backlog",
      name: "Backlog",
      source: "extensions/backlog/index.ts",
      config: {},
      pluginConfig: {},
      runtime: {
        system: {
          runCommandWithTimeout: vi.fn(),
        },
      },
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
      },
      registerTool: () => undefined,
      registerGatewayMethod: () => undefined,
      on: () => undefined,
      registerHook: () => undefined,
      registerHttpHandler: () => undefined,
      registerHttpRoute: ({ path, handler }) => {
        routes.set(path, handler);
      },
      registerChannel: () => undefined,
      registerProvider: () => undefined,
      registerCli: () => undefined,
      registerService: () => undefined,
      registerCommand: () => undefined,
      resolvePath: (value: string) => value,
    } as Parameters<typeof register>[0]);

    const route = routes.get(BACKLOG_CONTROL_UI_ROUTE);
    expect(route).toBeDefined();
    if (!route) {
      throw new Error("missing backlog control ui route");
    }
    const response = {
      statusCode: 0,
      setHeader,
      end,
    };
    route({}, response);

    expect(response.statusCode).toBe(200);
    expect(setHeader).toHaveBeenCalledWith("Content-Type", "text/html; charset=utf-8");
    expect(end).toHaveBeenCalledTimes(1);
    expect(String(end.mock.calls[0]?.[0] ?? "")).toContain("Backlog Tasks");
  });
});
