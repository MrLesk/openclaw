import { describe, expect, it } from "vitest";
import {
  TAB_GROUPS,
  buildPluginTab,
  iconForTab,
  inferBasePathFromPathname,
  isPluginTab,
  normalizeBasePath,
  normalizePath,
  pathForTab,
  parsePluginTab,
  resolveTabGroups,
  subtitleForTab,
  tabFromPath,
  titleForTab,
  type Tab,
} from "./navigation.ts";

/** All valid tab identifiers derived from TAB_GROUPS */
const ALL_TABS: Tab[] = TAB_GROUPS.flatMap((group) => group.tabs) as Tab[];

describe("iconForTab", () => {
  it("returns a non-empty string for every tab", () => {
    for (const tab of ALL_TABS) {
      const icon = iconForTab(tab);
      expect(icon).toBeTruthy();
      expect(typeof icon).toBe("string");
      expect(icon.length).toBeGreaterThan(0);
    }
  });

  it("returns stable icons for known tabs", () => {
    expect(iconForTab("chat")).toBe("messageSquare");
    expect(iconForTab("overview")).toBe("barChart");
    expect(iconForTab("channels")).toBe("link");
    expect(iconForTab("instances")).toBe("radio");
    expect(iconForTab("sessions")).toBe("fileText");
    expect(iconForTab("cron")).toBe("loader");
    expect(iconForTab("skills")).toBe("zap");
    expect(iconForTab("nodes")).toBe("monitor");
    expect(iconForTab("config")).toBe("settings");
    expect(iconForTab("debug")).toBe("bug");
    expect(iconForTab("logs")).toBe("scrollText");
  });

  it("returns the puzzle icon for plugin tabs", () => {
    const tab = buildPluginTab("demo", "status");
    expect(tab).not.toBeNull();
    if (!tab) {
      return;
    }
    expect(iconForTab(tab)).toBe("puzzle");
  });

  it("returns a fallback icon for unknown tab", () => {
    // TypeScript won't allow this normally, but runtime could receive unexpected values
    const unknownTab = "unknown" as Tab;
    expect(iconForTab(unknownTab)).toBe("folder");
  });
});

describe("titleForTab", () => {
  it("returns a non-empty string for every tab", () => {
    for (const tab of ALL_TABS) {
      const title = titleForTab(tab);
      expect(title).toBeTruthy();
      expect(typeof title).toBe("string");
    }
  });

  it("returns expected titles", () => {
    expect(titleForTab("chat")).toBe("Chat");
    expect(titleForTab("overview")).toBe("Overview");
    expect(titleForTab("cron")).toBe("Cron Jobs");
  });

  it("returns plugin-provided title for plugin tabs", () => {
    const tab = buildPluginTab("demo", "status");
    expect(tab).not.toBeNull();
    if (!tab) {
      return;
    }
    expect(
      titleForTab(tab, [
        {
          tab,
          pluginId: "demo",
          pageId: "status",
          title: "Demo Status",
          route: "/demo/status",
        },
      ]),
    ).toBe("Demo Status");
  });
});

describe("subtitleForTab", () => {
  it("returns a string for every tab", () => {
    for (const tab of ALL_TABS) {
      const subtitle = subtitleForTab(tab);
      expect(typeof subtitle).toBe("string");
    }
  });

  it("returns descriptive subtitles", () => {
    expect(subtitleForTab("chat")).toContain("chat session");
    expect(subtitleForTab("config")).toContain("openclaw.json");
  });

  it("returns plugin subtitle fallback for plugin tabs", () => {
    const tab = buildPluginTab("demo", "status");
    expect(tab).not.toBeNull();
    if (!tab) {
      return;
    }
    expect(subtitleForTab(tab)).toContain("Plugin");
  });
});

describe("normalizeBasePath", () => {
  it("returns empty string for falsy input", () => {
    expect(normalizeBasePath("")).toBe("");
  });

  it("adds leading slash if missing", () => {
    expect(normalizeBasePath("ui")).toBe("/ui");
  });

  it("removes trailing slash", () => {
    expect(normalizeBasePath("/ui/")).toBe("/ui");
  });

  it("returns empty string for root path", () => {
    expect(normalizeBasePath("/")).toBe("");
  });

  it("handles nested paths", () => {
    expect(normalizeBasePath("/apps/openclaw")).toBe("/apps/openclaw");
  });
});

describe("normalizePath", () => {
  it("returns / for falsy input", () => {
    expect(normalizePath("")).toBe("/");
  });

  it("adds leading slash if missing", () => {
    expect(normalizePath("chat")).toBe("/chat");
  });

  it("removes trailing slash except for root", () => {
    expect(normalizePath("/chat/")).toBe("/chat");
    expect(normalizePath("/")).toBe("/");
  });
});

describe("pathForTab", () => {
  it("returns correct path without base", () => {
    expect(pathForTab("chat")).toBe("/chat");
    expect(pathForTab("overview")).toBe("/overview");
  });

  it("prepends base path", () => {
    expect(pathForTab("chat", "/ui")).toBe("/ui/chat");
    expect(pathForTab("sessions", "/apps/openclaw")).toBe("/apps/openclaw/sessions");
  });

  it("builds plugin tab paths", () => {
    const tab = buildPluginTab("my-plugin", "overview");
    expect(tab).not.toBeNull();
    if (!tab) {
      return;
    }
    expect(pathForTab(tab)).toBe("/plugins/my-plugin/overview");
    expect(pathForTab(tab, "/ui")).toBe("/ui/plugins/my-plugin/overview");
  });
});

describe("tabFromPath", () => {
  it("returns tab for valid path", () => {
    expect(tabFromPath("/chat")).toBe("chat");
    expect(tabFromPath("/overview")).toBe("overview");
    expect(tabFromPath("/sessions")).toBe("sessions");
  });

  it("returns chat for root path", () => {
    expect(tabFromPath("/")).toBe("chat");
  });

  it("handles base paths", () => {
    expect(tabFromPath("/ui/chat", "/ui")).toBe("chat");
    expect(tabFromPath("/apps/openclaw/sessions", "/apps/openclaw")).toBe("sessions");
  });

  it("returns null for unknown path", () => {
    expect(tabFromPath("/unknown")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(tabFromPath("/CHAT")).toBe("chat");
    expect(tabFromPath("/Overview")).toBe("overview");
  });

  it("resolves plugin tabs from plugin routes", () => {
    const tab = tabFromPath("/plugins/my-plugin/overview");
    expect(tab).not.toBeNull();
    expect(tab && isPluginTab(tab)).toBe(true);
    if (!tab || !isPluginTab(tab)) {
      return;
    }
    expect(parsePluginTab(tab)).toEqual({ pluginId: "my-plugin", pageId: "overview" });
  });
});

describe("inferBasePathFromPathname", () => {
  it("returns empty string for root", () => {
    expect(inferBasePathFromPathname("/")).toBe("");
  });

  it("returns empty string for direct tab path", () => {
    expect(inferBasePathFromPathname("/chat")).toBe("");
    expect(inferBasePathFromPathname("/overview")).toBe("");
  });

  it("infers base path from nested paths", () => {
    expect(inferBasePathFromPathname("/ui/chat")).toBe("/ui");
    expect(inferBasePathFromPathname("/apps/openclaw/sessions")).toBe("/apps/openclaw");
  });

  it("infers base path from plugin tab routes", () => {
    expect(inferBasePathFromPathname("/ui/plugins/demo/status")).toBe("/ui");
  });

  it("handles index.html suffix", () => {
    expect(inferBasePathFromPathname("/index.html")).toBe("");
    expect(inferBasePathFromPathname("/ui/index.html")).toBe("/ui");
  });
});

describe("TAB_GROUPS", () => {
  it("contains all expected groups", () => {
    const labels = TAB_GROUPS.map((g) => g.label);
    expect(labels).toContain("chat");
    expect(labels).toContain("control");
    expect(labels).toContain("agent");
    expect(labels).toContain("settings");
  });

  it("all tabs are unique", () => {
    const allTabs = TAB_GROUPS.flatMap((g) => g.tabs);
    const uniqueTabs = new Set(allTabs);
    expect(uniqueTabs.size).toBe(allTabs.length);
  });
});

describe("resolveTabGroups", () => {
  it("appends the extensions group when plugin pages exist", () => {
    const tab = buildPluginTab("demo", "status");
    expect(tab).not.toBeNull();
    if (!tab) {
      return;
    }
    const groups = resolveTabGroups([
      {
        tab,
        pluginId: "demo",
        pageId: "status",
        title: "Demo Status",
        route: "/demo/status",
      },
    ]);
    const extensions = groups.find((entry) => entry.label === "extensions");
    expect(extensions).toBeDefined();
    expect(extensions?.tabs).toEqual([tab]);
  });
});
