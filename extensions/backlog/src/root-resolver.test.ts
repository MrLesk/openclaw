import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveBacklogRoot } from "./root-resolver.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-backlog-root-"));
  tempDirs.push(dir);
  return dir;
}

async function makeBacklogDirMarker(dirPath: string): Promise<void> {
  await fs.mkdir(path.join(dirPath, "backlog"), { recursive: true });
}

async function makeBacklogJsonMarker(dirPath: string): Promise<void> {
  await fs.writeFile(path.join(dirPath, "backlog.json"), "{}\n", "utf8");
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("resolveBacklogRoot", () => {
  it("resolves from workspace first and walks upward", async () => {
    const temp = await makeTempDir();
    const workspaceRoot = path.join(temp, "workspace");
    const nestedWorkspaceDir = path.join(workspaceRoot, "apps", "agent-a");
    const unrelatedRoot = path.join(temp, "elsewhere");

    await fs.mkdir(nestedWorkspaceDir, { recursive: true });
    await fs.mkdir(path.join(unrelatedRoot, "subdir"), { recursive: true });
    await makeBacklogDirMarker(workspaceRoot);
    await makeBacklogDirMarker(unrelatedRoot);

    const result = await resolveBacklogRoot({
      workspaceDir: nestedWorkspaceDir,
      cwd: path.join(unrelatedRoot, "subdir"),
    });

    expect(result).toEqual({
      startDir: path.resolve(nestedWorkspaceDir),
      rootDir: path.resolve(workspaceRoot),
    });
  });

  it("falls back to cwd when workspaceDir is not provided", async () => {
    const temp = await makeTempDir();
    const cwdRoot = path.join(temp, "repo");
    const nestedCwd = path.join(cwdRoot, "packages", "core");

    await fs.mkdir(nestedCwd, { recursive: true });
    await makeBacklogJsonMarker(cwdRoot);

    const result = await resolveBacklogRoot({ cwd: nestedCwd });

    expect(result).toEqual({
      startDir: path.resolve(nestedCwd),
      rootDir: path.resolve(cwdRoot),
    });
  });

  it("returns null when no Backlog.md markers are found", async () => {
    const temp = await makeTempDir();
    const nested = path.join(temp, "workspace", "agent");
    await fs.mkdir(nested, { recursive: true });

    const result = await resolveBacklogRoot({ workspaceDir: nested });
    expect(result).toBeNull();
  });
});
