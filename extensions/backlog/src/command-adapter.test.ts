import { describe, expect, it, vi } from "vitest";
import type { BacklogRootResolution } from "./root-resolver.js";
import {
  executeBacklogTaskOperation,
  type ExecuteBacklogTaskOperationParams,
} from "./command-adapter.js";

type RunCommandWithTimeout = ExecuteBacklogTaskOperationParams["runCommandWithTimeout"];

function makeRoot(rootDir = "/tmp/workspace"): BacklogRootResolution {
  return {
    startDir: rootDir,
    rootDir,
  };
}

describe("executeBacklogTaskOperation", () => {
  it("executes Backlog.md config list for config operation", async () => {
    const runCommandWithTimeout = vi.fn<RunCommandWithTimeout>().mockResolvedValue({
      stdout: "Configuration:\nproject.name: Roadmap\n",
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
    });

    const result = await executeBacklogTaskOperation({
      operation: "config",
      workspaceDir: "/tmp/workspace",
      runCommandWithTimeout,
      rootResolver: async () => makeRoot("/tmp/workspace"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.context.command).toEqual(["backlog", "config", "list"]);
    expect(runCommandWithTimeout).toHaveBeenCalledWith(["backlog", "config", "list"], {
      cwd: "/tmp/workspace",
      timeoutMs: 30_000,
    });
  });

  it("returns structured success payload for successful command execution", async () => {
    const runCommandWithTimeout = vi.fn<RunCommandWithTimeout>().mockResolvedValue({
      stdout: "Tasks:\n  TASK-1 - Example",
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
    });

    const result = await executeBacklogTaskOperation({
      operation: "list",
      args: ["--plain"],
      workspaceDir: "/tmp/workspace",
      runCommandWithTimeout,
      rootResolver: async () => makeRoot("/tmp/workspace"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.code).toBe("ok");
    expect(result.context.command).toEqual(["backlog", "task", "list", "--plain"]);
    expect(result.context.rootDir).toBe("/tmp/workspace");
    expect(result.exitCode).toBe(0);
    expect(runCommandWithTimeout).toHaveBeenCalledWith(["backlog", "task", "list", "--plain"], {
      cwd: "/tmp/workspace",
      timeoutMs: 30_000,
    });
  });

  it("returns not_initialized when no Backlog.md root is found", async () => {
    const runCommandWithTimeout = vi.fn<RunCommandWithTimeout>();
    const result = await executeBacklogTaskOperation({
      operation: "create",
      args: ["Test task"],
      workspaceDir: "/tmp/workspace",
      runCommandWithTimeout,
      rootResolver: async () => null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("not_initialized");
    expect(result.message).toContain("Backlog.md is not initialized");
    expect(result.guidance.join(" ")).toContain("backlog init");
    expect(runCommandWithTimeout).not.toHaveBeenCalled();
  });

  it("maps ENOENT execution errors to missing_binary with actionable guidance", async () => {
    const enoent = Object.assign(new Error("spawn backlog ENOENT"), { code: "ENOENT" });
    const runCommandWithTimeout = vi.fn<RunCommandWithTimeout>().mockRejectedValue(enoent);

    const result = await executeBacklogTaskOperation({
      operation: "view",
      args: ["TASK-1", "--plain"],
      workspaceDir: "/tmp/workspace",
      runCommandWithTimeout,
      rootResolver: async () => makeRoot("/tmp/workspace"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("missing_binary");
    expect(result.guidance.join(" ")).toContain("npm install -g backlog.md");
    expect(result.cause).toContain("ENOENT");
  });

  it("maps CLI not initialized stderr to not_initialized failure", async () => {
    const runCommandWithTimeout = vi.fn<RunCommandWithTimeout>().mockResolvedValue({
      stdout: "",
      stderr: "No Backlog.md project found. Run `backlog init` to initialize.",
      code: 1,
      signal: null,
      killed: false,
    });

    const result = await executeBacklogTaskOperation({
      operation: "list",
      workspaceDir: "/tmp/workspace",
      runCommandWithTimeout,
      rootResolver: async () => makeRoot("/tmp/workspace"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("not_initialized");
    expect(result.exitCode).toBe(1);
    expect(result.guidance.join(" ")).toContain("backlog init");
  });

  it("returns command_failed for non-zero exits unrelated to initialization", async () => {
    const runCommandWithTimeout = vi.fn<RunCommandWithTimeout>().mockResolvedValue({
      stdout: "",
      stderr: "Task TASK-999 not found.",
      code: 1,
      signal: null,
      killed: false,
    });

    const result = await executeBacklogTaskOperation({
      operation: "archive",
      args: ["TASK-999"],
      workspaceDir: "/tmp/workspace",
      runCommandWithTimeout,
      rootResolver: async () => makeRoot("/tmp/workspace"),
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.code).toBe("command_failed");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Task TASK-999 not found.");
  });

  it("allows init operation without an existing Backlog.md root", async () => {
    const runCommandWithTimeout = vi.fn<RunCommandWithTimeout>().mockResolvedValue({
      stdout: "Initialized backlog project: Roadmap\n",
      stderr: "",
      code: 0,
      signal: null,
      killed: false,
    });

    const result = await executeBacklogTaskOperation({
      operation: "init",
      args: ["Roadmap", "--integration-mode", "none"],
      workspaceDir: "/tmp/workspace",
      runCommandWithTimeout,
      rootResolver: async () => null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.context.command).toEqual([
      "backlog",
      "init",
      "Roadmap",
      "--integration-mode",
      "none",
    ]);
    expect(result.context.rootDir).toBe("/tmp/workspace");
    expect(runCommandWithTimeout).toHaveBeenCalledWith(
      ["backlog", "init", "Roadmap", "--integration-mode", "none"],
      {
        cwd: "/tmp/workspace",
        timeoutMs: 30_000,
      },
    );
  });
});
