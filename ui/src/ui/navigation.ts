import type { IconName } from "./icons.js";
import { t } from "../i18n/index.ts";

export const CORE_TAB_GROUPS = [
  { label: "chat", tabs: ["chat"] },
  {
    label: "control",
    tabs: ["overview", "channels", "instances", "sessions", "usage", "cron"],
  },
  { label: "agent", tabs: ["agents", "skills", "nodes"] },
  { label: "settings", tabs: ["config", "debug", "logs"] },
] as const;

export const TAB_GROUPS = CORE_TAB_GROUPS;

export type CoreTab =
  | "agents"
  | "overview"
  | "channels"
  | "instances"
  | "sessions"
  | "usage"
  | "cron"
  | "skills"
  | "nodes"
  | "chat"
  | "config"
  | "debug"
  | "logs";

export type PluginTab = `plugin:${string}/${string}`;

export type Tab = CoreTab | PluginTab;

export type PluginNavPage = {
  tab: PluginTab;
  pluginId: string;
  pageId: string;
  title: string;
  subtitle?: string;
  route: string;
};

const CORE_TAB_PATHS: Record<CoreTab, string> = {
  agents: "/agents",
  overview: "/overview",
  channels: "/channels",
  instances: "/instances",
  sessions: "/sessions",
  usage: "/usage",
  cron: "/cron",
  skills: "/skills",
  nodes: "/nodes",
  chat: "/chat",
  config: "/config",
  debug: "/debug",
  logs: "/logs",
};

const CORE_PATH_TO_TAB = new Map(
  Object.entries(CORE_TAB_PATHS).map(([tab, path]) => [path, tab as CoreTab]),
);
const PLUGIN_TAB_PREFIX = "plugin:";
const PLUGIN_TAB_PATH_PREFIX = "/plugins/";

function decodeSegment(value: string): string | null {
  if (!value) {
    return null;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

export function buildPluginTab(pluginId: string, pageId: string): PluginTab | null {
  const normalizedPluginId = pluginId.trim();
  const normalizedPageId = pageId.trim();
  if (!normalizedPluginId || !normalizedPageId) {
    return null;
  }
  return `${PLUGIN_TAB_PREFIX}${encodeSegment(normalizedPluginId)}/${encodeSegment(normalizedPageId)}`;
}

export function isPluginTab(tab: Tab): tab is PluginTab {
  return tab.startsWith(PLUGIN_TAB_PREFIX);
}

export function parsePluginTab(tab: Tab): { pluginId: string; pageId: string } | null {
  if (!isPluginTab(tab)) {
    return null;
  }
  const encoded = tab.slice(PLUGIN_TAB_PREFIX.length);
  const split = encoded.indexOf("/");
  if (split <= 0 || split === encoded.length - 1) {
    return null;
  }
  const pluginId = decodeSegment(encoded.slice(0, split));
  const pageId = decodeSegment(encoded.slice(split + 1));
  if (!pluginId || !pageId) {
    return null;
  }
  return { pluginId, pageId };
}

function pluginTabPath(tab: PluginTab): string | null {
  const parsed = parsePluginTab(tab);
  if (!parsed) {
    return null;
  }
  return `${PLUGIN_TAB_PATH_PREFIX}${encodeSegment(parsed.pluginId)}/${encodeSegment(parsed.pageId)}`;
}

function pluginTabFromPath(pathname: string): PluginTab | null {
  if (!pathname.startsWith(PLUGIN_TAB_PATH_PREFIX)) {
    return null;
  }
  const suffix = pathname.slice(PLUGIN_TAB_PATH_PREFIX.length);
  const firstSlash = suffix.indexOf("/");
  if (firstSlash <= 0 || firstSlash === suffix.length - 1) {
    return null;
  }
  const pluginId = decodeSegment(suffix.slice(0, firstSlash));
  const pageId = decodeSegment(suffix.slice(firstSlash + 1));
  if (!pluginId || !pageId) {
    return null;
  }
  return buildPluginTab(pluginId, pageId);
}

export function resolveTabGroups(
  pluginPages: PluginNavPage[],
): Array<{ label: string; tabs: Tab[] }> {
  const groups: Array<{ label: string; tabs: Tab[] }> = CORE_TAB_GROUPS.map((group) => ({
    label: group.label,
    tabs: [...group.tabs],
  }));
  if (pluginPages.length > 0) {
    groups.push({
      label: "extensions",
      tabs: pluginPages.map((page) => page.tab),
    });
  }
  return groups;
}

function findPluginPage(tab: PluginTab, pluginPages: PluginNavPage[]): PluginNavPage | undefined {
  return pluginPages.find((entry) => entry.tab === tab);
}

export function normalizeBasePath(basePath: string): string {
  if (!basePath) {
    return "";
  }
  let base = basePath.trim();
  if (!base.startsWith("/")) {
    base = `/${base}`;
  }
  if (base === "/") {
    return "";
  }
  if (base.endsWith("/")) {
    base = base.slice(0, -1);
  }
  return base;
}

export function normalizePath(path: string): string {
  if (!path) {
    return "/";
  }
  let normalized = path.trim();
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

export function pathForTab(tab: Tab, basePath = ""): string {
  const base = normalizeBasePath(basePath);
  const path = isPluginTab(tab) ? pluginTabPath(tab) : CORE_TAB_PATHS[tab];
  if (!path) {
    return base || "/";
  }
  return base ? `${base}${path}` : path;
}

export function tabFromPath(pathname: string, basePath = ""): Tab | null {
  const base = normalizeBasePath(basePath);
  let path = pathname || "/";
  if (base) {
    if (path === base) {
      path = "/";
    } else if (path.startsWith(`${base}/`)) {
      path = path.slice(base.length);
    }
  }
  let normalized = normalizePath(path).toLowerCase();
  if (normalized.endsWith("/index.html")) {
    normalized = "/";
  }
  if (normalized === "/") {
    return "chat";
  }
  return CORE_PATH_TO_TAB.get(normalized) ?? pluginTabFromPath(normalized) ?? null;
}

export function inferBasePathFromPathname(pathname: string): string {
  let normalized = normalizePath(pathname);
  if (normalized.endsWith("/index.html")) {
    normalized = normalizePath(normalized.slice(0, -"/index.html".length));
  }
  if (normalized === "/") {
    return "";
  }
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "";
  }
  for (let i = 0; i < segments.length; i++) {
    const candidate = `/${segments.slice(i).join("/")}`.toLowerCase();
    if (CORE_PATH_TO_TAB.has(candidate) || pluginTabFromPath(candidate)) {
      const prefix = segments.slice(0, i);
      return prefix.length ? `/${prefix.join("/")}` : "";
    }
  }
  return `/${segments.join("/")}`;
}

export function iconForTab(tab: Tab): IconName {
  if (isPluginTab(tab)) {
    return "puzzle";
  }
  switch (tab) {
    case "agents":
      return "folder";
    case "chat":
      return "messageSquare";
    case "overview":
      return "barChart";
    case "channels":
      return "link";
    case "instances":
      return "radio";
    case "sessions":
      return "fileText";
    case "usage":
      return "barChart";
    case "cron":
      return "loader";
    case "skills":
      return "zap";
    case "nodes":
      return "monitor";
    case "config":
      return "settings";
    case "debug":
      return "bug";
    case "logs":
      return "scrollText";
    default:
      return "folder";
  }
}

export function titleForTab(tab: Tab, pluginPages: PluginNavPage[] = []) {
  if (isPluginTab(tab)) {
    return findPluginPage(tab, pluginPages)?.title ?? t("tabs.plugin");
  }
  return t(`tabs.${tab}`);
}

export function subtitleForTab(tab: Tab, pluginPages: PluginNavPage[] = []) {
  if (isPluginTab(tab)) {
    return findPluginPage(tab, pluginPages)?.subtitle ?? t("subtitles.plugin");
  }
  return t(`subtitles.${tab}`);
}
