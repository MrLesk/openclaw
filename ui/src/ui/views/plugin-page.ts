import { html } from "lit";
import type { ControlUiPluginNavPage } from "../controllers/plugin-pages.ts";
import { type PluginTab } from "../navigation.ts";

type RenderPluginPageProps = {
  tab: PluginTab;
  loading: boolean;
  error: string | null;
  pages: ControlUiPluginNavPage[];
};

export function renderPluginPage(props: RenderPluginPageProps) {
  const page = props.pages.find((entry) => entry.tab === props.tab);
  if (!page) {
    if (props.loading) {
      return html`
        <div class="card plugin-page-card">
          <div class="card-title">Loading extension page...</div>
        </div>
      `;
    }
    return html`
      <div class="card plugin-page-card">
        <div class="card-title">Extension page unavailable</div>
        <div class="card-sub">
          ${props.error ?? "The extension page is not registered on this gateway."}
        </div>
      </div>
    `;
  }

  return html`
    <div class="plugin-page-shell">
      <iframe
        class="plugin-page-frame"
        src=${page.route}
        title=${`${page.pluginName}: ${page.title}`}
        loading="lazy"
        referrerpolicy="same-origin"
      ></iframe>
    </div>
  `;
}
