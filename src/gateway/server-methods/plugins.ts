import type { GatewayRequestHandlers } from "./types.js";
import { validateConfigGetParams } from "../protocol/index.js";
import { assertValidParams } from "./validation.js";

type ControlUiPageResult = {
  pluginId: string;
  pluginName: string;
  pluginVersion?: string;
  id: string;
  title: string;
  subtitle?: string;
  route: string;
};

function normalizeRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function comparePages(a: ControlUiPageResult, b: ControlUiPageResult): number {
  const pluginCompare = a.pluginName.localeCompare(b.pluginName);
  if (pluginCompare !== 0) {
    return pluginCompare;
  }
  const titleCompare = a.title.localeCompare(b.title);
  if (titleCompare !== 0) {
    return titleCompare;
  }
  return a.id.localeCompare(b.id);
}

export const pluginsHandlers: GatewayRequestHandlers = {
  "plugins.controlUiPages": ({ params, respond, context }) => {
    if (!assertValidParams(params, validateConfigGetParams, "plugins.controlUiPages", respond)) {
      return;
    }

    const pages: ControlUiPageResult[] = [];
    const seen = new Set<string>();
    for (const plugin of context.pluginRegistry?.plugins ?? []) {
      if (!plugin.enabled || plugin.status !== "loaded") {
        continue;
      }
      for (const page of plugin.controlUiPages ?? []) {
        const id = page.id.trim();
        const title = page.title.trim();
        const route = normalizeRoute(page.route);
        if (!id || !title || !route) {
          continue;
        }
        const dedupeKey = `${plugin.id.toLowerCase()}/${id.toLowerCase()}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        const subtitle = page.subtitle?.trim() || undefined;
        pages.push({
          pluginId: plugin.id,
          pluginName: plugin.name,
          pluginVersion: plugin.version,
          id,
          title,
          subtitle,
          route,
        });
      }
    }

    pages.sort(comparePages);
    respond(true, { pages }, undefined);
  },
};
