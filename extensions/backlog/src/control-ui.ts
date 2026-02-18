export const BACKLOG_CONTROL_UI_ROUTE = "/plugins/backlog/tasks";

const PAGE_TITLE = "Backlog Tasks";

const PAGE_STYLE = `
:root {
  color-scheme: dark;
  --bg: #080d1b;
  --panel: #0f172a;
  --panel-2: #111a32;
  --border: #243354;
  --text: #d8e4ff;
  --muted: #95a9d7;
  --danger: #f87171;
  --warn: #fbbf24;
  --ok: #34d399;
  --accent: #60a5fa;
  --radius: 12px;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  background: radial-gradient(circle at 20% 0%, #142446 0%, var(--bg) 48%);
  color: var(--text);
  font: 14px/1.45 "JetBrains Mono", "SF Mono", Menlo, monospace;
}

main {
  max-width: 1200px;
  margin: 20px auto 32px;
  padding: 0 16px;
  display: grid;
  gap: 14px;
}

.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: linear-gradient(180deg, var(--panel) 0%, var(--panel-2) 100%);
  padding: 14px;
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.title {
  font-size: 18px;
  letter-spacing: 0.02em;
}

.sub {
  color: var(--muted);
  font-size: 12px;
}

button {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #122344;
  color: var(--text);
  padding: 8px 12px;
  cursor: pointer;
  font: inherit;
}

button:hover {
  border-color: #365080;
}

button[disabled] {
  opacity: 0.5;
  cursor: default;
}

.danger {
  color: var(--danger);
}

.warn {
  color: var(--warn);
}

.ok {
  color: var(--ok);
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  border-bottom: 1px solid var(--border);
  padding: 9px 8px;
  vertical-align: top;
}

th {
  color: var(--muted);
  text-align: left;
  font-weight: 500;
}

tr:last-child td {
  border-bottom: 0;
}

tr[data-task-id] {
  cursor: pointer;
}

tr[data-task-id]:hover {
  background: rgba(96, 165, 250, 0.08);
}

.id {
  color: var(--accent);
}

.status {
  color: var(--muted);
}

.priority-high {
  color: var(--danger);
}

.priority-medium {
  color: var(--warn);
}

.priority-low {
  color: var(--ok);
}

.progress-wrap {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}

.progress-bar {
  letter-spacing: 0.05em;
  line-height: 1;
}

.progress-value {
  font-size: 12px;
  color: var(--muted);
}

.progress-danger .progress-bar {
  color: var(--danger);
}

.progress-warn .progress-bar {
  color: var(--warn);
}

.progress-active .progress-bar {
  color: var(--accent);
}

.progress-done .progress-bar {
  color: var(--ok);
}

.detail-grid {
  display: grid;
  gap: 10px;
}

.detail-title {
  font-size: 16px;
}

.checklist {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 4px;
}

.checklist li {
  color: var(--muted);
}

.checklist li.done {
  color: var(--ok);
}

.callout {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
}

.callout-danger {
  border-color: rgba(248, 113, 113, 0.4);
}

.callout-ok {
  border-color: rgba(52, 211, 153, 0.35);
}

.mono {
  font-family: inherit;
}

label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
}

input {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #0a1327;
  color: var(--text);
  padding: 8px 10px;
  font: inherit;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 10px;
  margin-top: 8px;
}
`;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderPageScript(): string {
  return `
(() => {
  const SETTINGS_KEY = "openclaw.control.settings.v1";
  const METHODS = {
    list: ["backlog.task.list", "backlog.tasks.list"],
    view: ["backlog.task.view", "backlog.tasks.view"],
    config: ["backlog.project.config", "backlog.config.list"],
  };

  const state = {
    projectName: null,
    tasks: [],
    selectedTask: null,
    loading: false,
    error: null,
    success: null,
    initSubmitting: false,
  };

  const els = {
    project: document.querySelector("[data-project]"),
    status: document.querySelector("[data-status]"),
    tableBody: document.querySelector("[data-tasks-body]"),
    detail: document.querySelector("[data-detail]"),
    refresh: document.querySelector("[data-refresh]"),
    init: document.querySelector("[data-init]"),
    initForm: document.querySelector("[data-init-form]"),
    initProjectName: document.querySelector("[data-init-project-name]"),
    initPrefix: document.querySelector("[data-init-prefix]"),
    initZero: document.querySelector("[data-init-zero]"),
    initError: document.querySelector("[data-init-error]"),
  };

  class GatewayClient {
    constructor() {
      const settings = this.loadSettings();
      this.url = settings.gatewayUrl;
      this.token = settings.token || "";
      this.ws = null;
      this.pending = new Map();
      this.seq = 0;
      this.connected = false;
      this.connecting = null;
    }

    loadSettings() {
      let parsed = {};
      try {
        parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      } catch {}
      const proto = location.protocol === "https:" ? "wss" : "ws";
      return {
        gatewayUrl:
          typeof parsed.gatewayUrl === "string" && parsed.gatewayUrl.trim()
            ? parsed.gatewayUrl.trim()
            : proto + "://" + location.host,
        token: typeof parsed.token === "string" ? parsed.token.trim() : "",
      };
    }

    async ensureConnected() {
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        return;
      }
      if (this.connecting) {
        return this.connecting;
      }
      this.connecting = this.connect();
      return this.connecting.finally(() => {
        this.connecting = null;
      });
    }

    connect() {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(this.url);
        this.ws = ws;
        let resolved = false;
        let connectRequestId = null;

        const onClose = (error) => {
          this.connected = false;
          if (!resolved) {
            reject(error);
            resolved = true;
          }
          for (const [, pending] of this.pending) {
            pending.reject(error);
          }
          this.pending.clear();
        };

        ws.addEventListener("message", (event) => {
          let frame;
          try {
            frame = JSON.parse(String(event.data || ""));
          } catch {
            return;
          }
          if (!frame || typeof frame !== "object") {
            return;
          }

          if (frame.type === "event" && frame.event === "connect.challenge") {
            this.sendConnect(resolve, reject, (id) => {
              connectRequestId = id;
            });
            return;
          }

          if (frame.type === "res" && typeof frame.id === "string") {
            if (connectRequestId && frame.id === connectRequestId) {
              if (frame.ok) {
                this.connected = true;
                if (!resolved) {
                  resolve();
                  resolved = true;
                }
              } else if (!resolved) {
                reject(new Error((frame.error && frame.error.message) || "connect failed"));
                resolved = true;
              }
              return;
            }
            const pending = this.pending.get(frame.id);
            if (!pending) {
              return;
            }
            this.pending.delete(frame.id);
            if (frame.ok) {
              pending.resolve(frame.payload);
            } else {
              pending.reject(new Error((frame.error && frame.error.message) || "request failed"));
            }
          }
        });

        ws.addEventListener("open", () => {
          setTimeout(() => {
            if (!this.connected && ws.readyState === WebSocket.OPEN) {
              this.sendConnect(resolve, reject, (id) => {
                connectRequestId = id;
              });
            }
          }, 600);
        });

        ws.addEventListener("error", () => {
          onClose(new Error("gateway websocket error"));
        });

        ws.addEventListener("close", () => {
          onClose(new Error("gateway websocket closed"));
        });
      });
    }

    sendConnect(resolve, reject, setRequestId) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("gateway websocket not open"));
        return;
      }
      const id = "connect-" + (++this.seq);
      setRequestId(id);
      const frame = {
        type: "req",
        id,
        method: "connect",
        params: {
          minProtocol: 3,
          maxProtocol: 3,
          client: {
            id: "openclaw-backlog-ui",
            version: "1",
            platform: navigator.platform || "web",
            mode: "webchat",
          },
          role: "operator",
          scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
          caps: [],
          auth: this.token ? { token: this.token } : undefined,
          userAgent: navigator.userAgent,
          locale: navigator.language,
        },
      };
      this.ws.send(JSON.stringify(frame));
    }

    async request(method, params) {
      await this.ensureConnected();
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        throw new Error("gateway websocket not connected");
      }
      const id = "req-" + (++this.seq);
      const payload = { type: "req", id, method, params: params || {} };
      const promise = new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
      });
      this.ws.send(JSON.stringify(payload));
      return promise;
    }
  }

  const client = new GatewayClient();

  function pct(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(number)));
  }

  function progressClass(progress) {
    if (progress <= 0) return "progress-danger";
    if (progress < 50) return "progress-warn";
    if (progress < 100) return "progress-active";
    return "progress-done";
  }

  function progressBar(progress) {
    const percent = pct(progress);
    const bars = Math.max(1, Math.round(percent / 10));
    const cls = progressClass(percent);
    return '<span class="progress-wrap ' + cls + '"><span class="progress-bar">' + "❚".repeat(bars) + '</span><span class="progress-value">' + percent + '%</span></span>';
  }

  function safeText(value) {
    if (value == null) return "";
    return String(value);
  }

  function projectNameFromConfig(config) {
    if (!config || typeof config !== "object") {
      return null;
    }
    const candidates = [
      config.projectName,
      config.project,
      config["project.name"],
      config["Project Name"],
      config["project_name"],
    ];
    for (const entry of candidates) {
      if (typeof entry === "string" && entry.trim()) {
        return entry.trim();
      }
    }
    return null;
  }

  async function callWithFallback(methods, params) {
    let lastError = null;
    for (const method of methods) {
      try {
        return await client.request(method, params || {});
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("all gateway methods failed");
  }

  function renderStatus() {
    if (!els.status) return;
    const parts = [];
    if (state.loading) {
      parts.push('<div class="callout">Loading Backlog tasks...</div>');
    }
    if (state.error) {
      parts.push('<div class="callout callout-danger danger">' + state.error + "</div>");
    }
    if (state.success) {
      parts.push('<div class="callout callout-ok ok">' + state.success + "</div>");
    }
    els.status.innerHTML = parts.join("");
  }

  function renderProject() {
    if (!els.project) return;
    els.project.textContent = state.projectName ? "Project: " + state.projectName : "Project: (unknown)";
  }

  function renderTasks() {
    if (!els.tableBody) return;
    if (state.tasks.length === 0) {
      els.tableBody.innerHTML =
        '<tr><td colspan="5" class="status">No tasks found in this workspace.</td></tr>';
      return;
    }
    els.tableBody.innerHTML = state.tasks
      .map((task) => {
        const priority = safeText(task.priority || "").toLowerCase();
        const priorityClass =
          priority === "high"
            ? "priority-high"
            : priority === "medium"
              ? "priority-medium"
              : priority === "low"
                ? "priority-low"
                : "";
        return (
          '<tr data-task-id="' +
          task.id +
          '">' +
          '<td class="mono id">' +
          task.id +
          "</td>" +
          "<td>" +
          safeText(task.title) +
          "</td>" +
          '<td class="status">' +
          safeText(task.status || "-") +
          "</td>" +
          '<td class="' +
          priorityClass +
          '">' +
          safeText(task.priority || "-") +
          "</td>" +
          "<td>" +
          progressBar(task.progress || 0) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function checklist(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<div class="status">None</div>';
    }
    return (
      '<ul class="checklist">' +
      items
        .map((item) => {
          const done = item && item.checked === true;
          return '<li class="' + (done ? "done" : "") + '">' + (done ? "[x] " : "[ ] ") + safeText(item && item.text) + "</li>";
        })
        .join("") +
      "</ul>"
    );
  }

  function renderDetail() {
    if (!els.detail) return;
    if (!state.selectedTask) {
      els.detail.innerHTML = '<div class="status">Select a task to view details.</div>';
      return;
    }
    const task = state.selectedTask;
    els.detail.innerHTML =
      '<div class="detail-grid">' +
      '<div class="detail-title">' +
      safeText(task.id) +
      " - " +
      safeText(task.title) +
      "</div>" +
      "<div>" +
      progressBar(task.progress || 0) +
      "</div>" +
      '<div><strong>Acceptance Criteria</strong>' +
      checklist(task.acceptanceCriteria) +
      "</div>" +
      '<div><strong>Definition Of Done</strong>' +
      checklist(task.definitionOfDone) +
      "</div>" +
      "</div>";
  }

  function setInitState(isSubmitting, errorText) {
    state.initSubmitting = isSubmitting;
    if (els.init) {
      els.init.disabled = isSubmitting;
      els.init.textContent = isSubmitting ? "Initializing..." : "Initialize Backlog.md";
    }
    if (els.initError) {
      els.initError.textContent = errorText || "";
    }
  }

  async function loadProjectConfig() {
    try {
      const res = await callWithFallback(METHODS.config, {});
      const project = projectNameFromConfig(
        (res && res.data && res.data.config) || res.config || null,
      );
      state.projectName = project;
    } catch {
      state.projectName = null;
    }
  }

  function computeProgressFromChecklist(task) {
    const ac = Array.isArray(task && task.acceptanceCriteria) ? task.acceptanceCriteria : [];
    const dod = Array.isArray(task && task.definitionOfDone) ? task.definitionOfDone : [];
    const total = ac.length + dod.length;
    if (total === 0) {
      return 0;
    }
    const checked =
      ac.filter((item) => item && item.checked === true).length +
      dod.filter((item) => item && item.checked === true).length;
    return Math.max(0, Math.min(100, Math.round((checked / total) * 100)));
  }

  async function loadTaskDetail(taskId) {
    const res = await callWithFallback(METHODS.view, { id: taskId, output: "json" });
    const task = res && res.data && res.data.task ? res.data.task : null;
    if (!task) {
      throw new Error("Task details unavailable for " + taskId);
    }
    const progress = Number.isFinite(task.progress) ? pct(task.progress) : computeProgressFromChecklist(task);
    return { ...task, progress };
  }

  async function loadTasks() {
    state.loading = true;
    state.error = null;
    renderStatus();
    try {
      await loadProjectConfig();
      const list = await callWithFallback(METHODS.list, { output: "json" });
      if (!list || list.ok === false) {
        const code = list && list.error && list.error.code ? String(list.error.code) : "";
        const message = list && list.error && list.error.message ? String(list.error.message) : "Unable to load tasks.";
        throw new Error(code ? code + ": " + message : message);
      }
      const rawTasks =
        list && list.data && Array.isArray(list.data.tasks) ? list.data.tasks : [];
      const hydrated = await Promise.all(
        rawTasks.map(async (task) => {
          const base = {
            id: safeText(task.id),
            title: safeText(task.title),
            status: safeText(task.status || ""),
            priority: safeText(task.priority || "").toLowerCase(),
            progress: pct(task.progress || 0),
          };
          if (!base.id) {
            return null;
          }
          try {
            const details = await loadTaskDetail(base.id);
            return { ...base, progress: pct(details.progress) };
          } catch {
            return base;
          }
        }),
      );
      state.tasks = hydrated.filter(Boolean);
      state.selectedTask = null;
      state.success = null;
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      state.tasks = [];
      state.selectedTask = null;
      state.error = text;
    } finally {
      state.loading = false;
      renderProject();
      renderStatus();
      renderTasks();
      renderDetail();
    }
  }

  async function openTask(taskId) {
    try {
      state.selectedTask = await loadTaskDetail(taskId);
      state.error = null;
    } catch (err) {
      state.error = err instanceof Error ? err.message : String(err);
    }
    renderStatus();
    renderDetail();
  }

  async function initializeProject() {
    const projectName = els.initProjectName && typeof els.initProjectName.value === "string"
      ? els.initProjectName.value.trim()
      : "";
    if (!projectName) {
      setInitState(false, "Project name is required.");
      return;
    }
    const taskPrefix = els.initPrefix && typeof els.initPrefix.value === "string"
      ? els.initPrefix.value.trim()
      : "";
    const zeroRaw = els.initZero && typeof els.initZero.value === "string"
      ? els.initZero.value.trim()
      : "";
    const zero = zeroRaw ? Number.parseInt(zeroRaw, 10) : undefined;

    setInitState(true, null);
    try {
      const params = { projectName };
      if (taskPrefix) {
        params.taskPrefix = taskPrefix;
      }
      if (Number.isInteger(zero) && zero > 0) {
        params.zeroPaddedIds = zero;
      }
      const result = await client.request("backlog.project.init", params);
      if (!result || result.ok === false) {
        const message =
          result && result.error && result.error.message
            ? String(result.error.message)
            : "Backlog initialization failed.";
        throw new Error(message);
      }
      state.success = "Backlog.md initialized.";
      await loadTasks();
      if (els.initProjectName) {
        els.initProjectName.value = "";
      }
    } catch (err) {
      setInitState(false, err instanceof Error ? err.message : String(err));
      return;
    }
    setInitState(false, null);
  }

  if (els.refresh) {
    els.refresh.addEventListener("click", () => {
      void loadTasks();
    });
  }
  if (els.init) {
    els.init.addEventListener("click", () => {
      void initializeProject();
    });
  }
  if (els.tableBody) {
    els.tableBody.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const row = target.closest("tr[data-task-id]");
      if (!row) {
        return;
      }
      const taskId = row.getAttribute("data-task-id");
      if (!taskId) {
        return;
      }
      void openTask(taskId);
    });
  }

  if (els.initForm) {
    els.initForm.addEventListener("submit", (event) => {
      event.preventDefault();
      void initializeProject();
    });
  }

  void loadTasks();
})();
`;
}

export function renderBacklogControlUiHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(PAGE_TITLE)}</title>
    <style>${PAGE_STYLE}</style>
  </head>
  <body>
    <main>
      <section class="panel">
        <div class="row">
          <div>
            <div class="title">${escapeHtml(PAGE_TITLE)}</div>
            <div class="sub" data-project>Project: (unknown)</div>
          </div>
          <div class="row">
            <button type="button" data-refresh>Refresh</button>
          </div>
        </div>
        <div data-status></div>
      </section>

      <section class="panel">
        <div class="row">
          <div class="sub">Initialize Backlog.md in this workspace</div>
        </div>
        <form data-init-form>
          <div class="form-grid">
            <label>
              Project Name
              <input type="text" data-init-project-name placeholder="OpenClaw" />
            </label>
            <label>
              Task Prefix
              <input type="text" data-init-prefix placeholder="TASK" />
            </label>
            <label>
              Zero-Padded IDs
              <input type="number" min="1" step="1" data-init-zero placeholder="3" />
            </label>
          </div>
          <div class="row" style="margin-top:10px">
            <button type="submit" data-init>Initialize Backlog.md</button>
            <div class="danger sub" data-init-error></div>
          </div>
        </form>
      </section>

      <section class="panel">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody data-tasks-body>
            <tr><td colspan="5" class="status">Loading...</td></tr>
          </tbody>
        </table>
      </section>

      <section class="panel">
        <div class="sub" style="margin-bottom:8px">Task Details</div>
        <div data-detail class="detail-grid"></div>
      </section>
    </main>
    <script>${renderPageScript()}</script>
  </body>
</html>`;
}
