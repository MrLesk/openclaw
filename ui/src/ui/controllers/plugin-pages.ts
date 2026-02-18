import type { GatewayBrowserClient } from "../gateway.ts";
import type { ControlUiPluginPage, ControlUiPluginPagesResult } from "../types.ts";
import {
  buildPluginTab,
  isPluginTab,
  parsePluginTab,
  type PluginTab,
  type Tab,
} from "../navigation.ts";

export type ControlUiPluginNavPage = ControlUiPluginPage & {
  pageId: string;
  tab: PluginTab;
};

export type PluginPagesState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  tab: Tab;
  pluginPagesLoading: boolean;
  pluginPagesError: string | null;
  pluginPages: ControlUiPluginNavPage[];
  setTab: (tab: Tab) => void;
};

function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizePluginPages(rawPages: ControlUiPluginPage[]): ControlUiPluginNavPage[] {
  const pages: ControlUiPluginNavPage[] = [];
  const seen = new Set<string>();
  for (const entry of rawPages) {
    const pluginId = entry.pluginId?.trim();
    const id = entry.id?.trim();
    const title = entry.title?.trim();
    const route = normalizeRoute(entry.route ?? "");
    if (!pluginId || !id || !title || !route) {
      continue;
    }
    const dedupeKey = `${pluginId.toLowerCase()}/${id.toLowerCase()}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    const tab = buildPluginTab(pluginId, id);
    if (!tab) {
      continue;
    }
    pages.push({
      ...entry,
      pluginId,
      id,
      pageId: id,
      title,
      route,
      subtitle: entry.subtitle?.trim() || undefined,
      pluginName: entry.pluginName?.trim() || pluginId,
      pluginVersion: entry.pluginVersion?.trim() || undefined,
      tab,
    });
    seen.add(dedupeKey);
  }
  return pages;
}

function hasPageForTab(tab: PluginTab, pages: ControlUiPluginNavPage[]): boolean {
  const parsed = parsePluginTab(tab);
  if (!parsed) {
    return false;
  }
  return pages.some(
    (entry) =>
      entry.pluginId === parsed.pluginId && entry.id.toLowerCase() === parsed.pageId.toLowerCase(),
  );
}

export async function loadPluginPages(state: PluginPagesState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.pluginPagesLoading) {
    return;
  }
  state.pluginPagesLoading = true;
  state.pluginPagesError = null;
  try {
    const res = await state.client.request<ControlUiPluginPagesResult>(
      "plugins.controlUiPages",
      {},
    );
    const pages = normalizePluginPages(Array.isArray(res?.pages) ? res.pages : []);
    state.pluginPages = pages;
    if (isPluginTab(state.tab) && !hasPageForTab(state.tab, pages)) {
      state.setTab("chat");
    }
  } catch (err) {
    state.pluginPagesError = String(err);
    state.pluginPages = [];
    if (isPluginTab(state.tab)) {
      state.setTab("chat");
    }
  } finally {
    state.pluginPagesLoading = false;
  }
}
