import fs from "node:fs/promises";
import path from "node:path";

const BACKLOG_DIR_NAME = "backlog";
const BACKLOG_CONFIG_NAME = "backlog.json";

export type BacklogRootResolution = {
  startDir: string;
  rootDir: string;
};

type ResolveBacklogRootParams = {
  workspaceDir?: string;
  cwd?: string;
};

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function isFile(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function hasBacklogMarkers(dirPath: string): Promise<boolean> {
  const backlogDir = path.join(dirPath, BACKLOG_DIR_NAME);
  if (await isDirectory(backlogDir)) {
    return true;
  }

  const backlogConfig = path.join(dirPath, BACKLOG_CONFIG_NAME);
  return await isFile(backlogConfig);
}

export function resolveBacklogSearchStartDir(params: ResolveBacklogRootParams = {}): string {
  const workspaceDir = params.workspaceDir?.trim();
  if (workspaceDir) {
    return path.resolve(workspaceDir);
  }

  const cwd = params.cwd?.trim();
  if (cwd) {
    return path.resolve(cwd);
  }

  return process.cwd();
}

export async function resolveBacklogRoot(
  params: ResolveBacklogRootParams = {},
): Promise<BacklogRootResolution | null> {
  const startDir = resolveBacklogSearchStartDir(params);
  let currentDir = startDir;

  while (true) {
    if (await hasBacklogMarkers(currentDir)) {
      return {
        startDir,
        rootDir: currentDir,
      };
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}
