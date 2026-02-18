import { describe, expect, it, vi } from "vitest";
import type { PluginRecord } from "../../plugins/registry.js";
import { pluginsHandlers } from "./plugins.js";

function pluginRecord(
  overrides: Partial<PluginRecord> & Pick<PluginRecord, "id" | "name">,
): PluginRecord {
  return {
    id: overrides.id,
    name: overrides.name,
    source: overrides.source ?? `${overrides.id}.ts`,
    origin: overrides.origin ?? "workspace",
    enabled: overrides.enabled ?? true,
    status: overrides.status ?? "loaded",
    toolNames: overrides.toolNames ?? [],
    hookNames: overrides.hookNames ?? [],
    channelIds: overrides.channelIds ?? [],
    providerIds: overrides.providerIds ?? [],
    gatewayMethods: overrides.gatewayMethods ?? [],
    cliCommands: overrides.cliCommands ?? [],
    services: overrides.services ?? [],
    commands: overrides.commands ?? [],
    httpHandlers: overrides.httpHandlers ?? 0,
    hookCount: overrides.hookCount ?? 0,
    configSchema: overrides.configSchema ?? false,
    description: overrides.description,
    version: overrides.version,
    kind: overrides.kind,
    workspaceDir: overrides.workspaceDir,
    error: overrides.error,
    configUiHints: overrides.configUiHints,
    configJsonSchema: overrides.configJsonSchema,
    controlUiPages: overrides.controlUiPages,
  };
}

describe("pluginsHandlers", () => {
  it("lists control-ui pages for loaded enabled plugins", async () => {
    const respond = vi.fn();
    const handler = pluginsHandlers["plugins.controlUiPages"];
    const pluginRegistry = {
      plugins: [
        pluginRecord({
          id: "alpha",
          name: "Alpha",
          version: "1.0.0",
          controlUiPages: [
            {
              id: "dashboard",
              title: "Alpha Dashboard",
              route: "/alpha/dashboard",
              subtitle: "Alpha status",
            },
          ],
        }),
        pluginRecord({
          id: "disabled",
          name: "Disabled",
          enabled: false,
          controlUiPages: [
            {
              id: "hidden",
              title: "Should not render",
              route: "/disabled/hidden",
            },
          ],
        }),
      ],
    };

    await handler({
      req: {} as never,
      params: {},
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: { pluginRegistry } as never,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      {
        pages: [
          {
            pluginId: "alpha",
            pluginName: "Alpha",
            pluginVersion: "1.0.0",
            id: "dashboard",
            title: "Alpha Dashboard",
            subtitle: "Alpha status",
            route: "/alpha/dashboard",
          },
        ],
      },
      undefined,
    );
  });

  it("rejects invalid params", async () => {
    const respond = vi.fn();
    const handler = pluginsHandlers["plugins.controlUiPages"];
    await handler({
      req: {} as never,
      params: { invalid: true },
      client: null,
      isWebchatConnect: () => false,
      respond,
      context: {} as never,
    });

    expect(respond).toHaveBeenCalledTimes(1);
    const call = respond.mock.calls[0];
    expect(call?.[0]).toBe(false);
    expect((call?.[2] as { message?: string } | undefined)?.message).toContain(
      "invalid plugins.controlUiPages params",
    );
  });
});
