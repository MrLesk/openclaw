import { Type } from "@sinclair/typebox";
import {
  jsonResult,
  optionalStringEnum,
  type OpenClawPluginToolContext,
  type PluginRuntime,
} from "openclaw/plugin-sdk";
import {
  executeBacklogTaskOperation,
  type BacklogCommandFailure,
  type BacklogTaskOperation,
  type ExecuteBacklogTaskOperationParams,
} from "./command-adapter.js";

const PRIORITY_VALUES = ["high", "medium", "low"] as const;
const LIST_SORT_VALUES = ["priority", "id"] as const;
const READ_OUTPUT_VALUES = ["json", "text"] as const;
const TASKS_SCHEMA_VERSION = 1 as const;
const READ_OPERATIONS = new Set<BacklogTaskOperation>(["list", "search", "view", "config"]);

const BACKLOG_TOOL_PREFIX = "backlog_task";

export const BACKLOG_TASK_TOOL_NAMES = [
  `${BACKLOG_TOOL_PREFIX}_create`,
  `${BACKLOG_TOOL_PREFIX}_list`,
  `${BACKLOG_TOOL_PREFIX}_search`,
  `${BACKLOG_TOOL_PREFIX}_view`,
  `${BACKLOG_TOOL_PREFIX}_edit`,
  `${BACKLOG_TOOL_PREFIX}_archive`,
  `${BACKLOG_TOOL_PREFIX}_config`,
] as const;

const NonEmptyString = Type.String({ minLength: 1 });
const NonEmptyStringList = Type.Array(NonEmptyString, { minItems: 1 });
const PositiveNumberList = Type.Array(Type.Number({ minimum: 1 }), { minItems: 1 });
const ReadOutputSchema = Type.Optional(optionalStringEnum(READ_OUTPUT_VALUES));

type BacklogReadOperation = "list" | "search" | "view" | "config";
type BacklogReadOutput = (typeof READ_OUTPUT_VALUES)[number];

type BacklogTaskSummary = {
  id: string;
  title: string;
  status: string | null;
  priority: (typeof PRIORITY_VALUES)[number] | null;
  createdDate: string | null;
  lastModified: string | null;
};

type BacklogTaskSearchSummary = BacklogTaskSummary & {
  score: number | null;
};

type BacklogTaskReference = {
  id: string;
  title: string;
};

type BacklogChecklistItem = {
  text: string;
  checked: boolean;
};

type BacklogTaskDetails = BacklogTaskSummary & {
  filePath: string | null;
  assignees: string[];
  labels: string[];
  parent: BacklogTaskReference | null;
  subtasks: BacklogTaskReference[];
  dependencies: BacklogTaskReference[];
  references: string[];
  documentation: string[];
  description: string | null;
  acceptanceCriteria: BacklogChecklistItem[];
  definitionOfDone: BacklogChecklistItem[];
  implementationPlan: string | null;
  implementationNotes: string | null;
  finalSummary: string | null;
};

type ParseResult<T> = { ok: true; data: T } | { ok: false; message: string };

type ReadAvailability = {
  status: "available" | "unavailable";
  reason: "plugin_disabled" | "not_initialized" | "missing_binary" | null;
  guidance: string[];
};

type BacklogReadFailureCode =
  | "invalid_params"
  | "plugin_disabled"
  | "not_initialized"
  | "missing_binary"
  | "command_failed"
  | "execution_error"
  | "parse_error";

type BacklogTaskToolDeps = {
  runCommandWithTimeout: PluginRuntime["system"]["runCommandWithTimeout"];
  context: OpenClawPluginToolContext;
  timeoutMs?: number;
  rootResolver?: ExecuteBacklogTaskOperationParams["rootResolver"];
};

function readTrimmedString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readBacklogReadOutput(params: Record<string, unknown>): BacklogReadOutput {
  const output = readTrimmedString(params, "output");
  return output === "text" ? "text" : "json";
}

function requireTrimmedString(params: Record<string, unknown>, key: string): string {
  const value = readTrimmedString(params, key);
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
}

function readStringList(params: Record<string, unknown>, key: string): string[] | undefined {
  const value = params[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function readPositiveIntegerList(
  params: Record<string, unknown>,
  key: string,
): number[] | undefined {
  const value = params[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value.map((entry) => {
    if (
      typeof entry !== "number" ||
      !Number.isFinite(entry) ||
      entry < 1 ||
      !Number.isInteger(entry)
    ) {
      throw new Error(`${key} entries must be positive integers.`);
    }
    return entry;
  });
  return normalized.length > 0 ? normalized : undefined;
}

function readPositiveInteger(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return value;
}

function readNonNegativeInteger(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer.`);
  }
  return value;
}

function pushFlag(args: string[], flag: string, value: string | undefined) {
  if (!value) {
    return;
  }
  args.push(flag, value);
}

function pushJoinedList(args: string[], flag: string, values: string[] | undefined) {
  if (!values || values.length === 0) {
    return;
  }
  args.push(flag, values.join(","));
}

function pushRepeat(args: string[], flag: string, values: string[] | number[] | undefined) {
  if (!values || values.length === 0) {
    return;
  }
  for (const value of values) {
    args.push(flag, String(value));
  }
}

function buildCreateArgs(params: Record<string, unknown>): string[] {
  const title = requireTrimmedString(params, "title");
  const args = [title, "--plain"];

  pushFlag(args, "--description", readTrimmedString(params, "description"));
  pushFlag(args, "--assignee", readTrimmedString(params, "assignee"));
  pushFlag(args, "--status", readTrimmedString(params, "status"));
  pushJoinedList(args, "--labels", readStringList(params, "labels"));
  pushFlag(args, "--priority", readTrimmedString(params, "priority"));
  pushFlag(args, "--parent", readTrimmedString(params, "parentTaskId"));
  pushJoinedList(args, "--depends-on", readStringList(params, "dependsOn"));
  pushRepeat(args, "--ac", readStringList(params, "acceptanceCriteria"));
  pushRepeat(args, "--dod", readStringList(params, "definitionOfDoneAdd"));
  pushFlag(args, "--plan", readTrimmedString(params, "plan"));
  pushFlag(args, "--notes", readTrimmedString(params, "notes"));
  pushFlag(args, "--final-summary", readTrimmedString(params, "finalSummary"));
  pushRepeat(args, "--ref", readStringList(params, "references"));
  pushRepeat(args, "--doc", readStringList(params, "documentation"));

  if (params.disableDefinitionOfDoneDefaults === true) {
    args.push("--no-dod-defaults");
  }
  if (params.draft === true) {
    args.push("--draft");
  }

  return args;
}

function buildListArgs(params: Record<string, unknown>): string[] {
  const args = ["--plain"];
  pushFlag(args, "--status", readTrimmedString(params, "status"));
  pushFlag(args, "--assignee", readTrimmedString(params, "assignee"));
  pushFlag(args, "--parent", readTrimmedString(params, "parentTaskId"));
  pushFlag(args, "--priority", readTrimmedString(params, "priority"));
  pushFlag(args, "--sort", readTrimmedString(params, "sort"));
  return args;
}

function buildSearchArgs(params: Record<string, unknown>): string[] {
  const query = requireTrimmedString(params, "query");
  const args = [query, "--type", "task", "--plain"];
  pushFlag(args, "--status", readTrimmedString(params, "status"));
  pushFlag(args, "--priority", readTrimmedString(params, "priority"));
  const limit = readPositiveInteger(params, "limit");
  if (limit !== undefined) {
    args.push("--limit", String(limit));
  }
  return args;
}

function buildViewArgs(params: Record<string, unknown>): string[] {
  const id = requireTrimmedString(params, "id");
  return [id, "--plain"];
}

function buildEditArgs(params: Record<string, unknown>): string[] {
  const id = requireTrimmedString(params, "id");
  const args = [id, "--plain"];

  pushFlag(args, "--title", readTrimmedString(params, "title"));
  pushFlag(args, "--description", readTrimmedString(params, "description"));
  pushFlag(args, "--status", readTrimmedString(params, "status"));
  pushFlag(args, "--priority", readTrimmedString(params, "priority"));
  pushJoinedList(args, "--label", readStringList(params, "labels"));
  pushJoinedList(args, "--assignee", readStringList(params, "assignee"));
  pushJoinedList(args, "--depends-on", readStringList(params, "dependsOn"));
  pushRepeat(args, "--add-label", readStringList(params, "addLabels"));
  pushRepeat(args, "--remove-label", readStringList(params, "removeLabels"));
  pushRepeat(args, "--ac", readStringList(params, "acceptanceCriteriaAdd"));
  pushRepeat(args, "--remove-ac", readPositiveIntegerList(params, "acceptanceCriteriaRemove"));
  pushRepeat(args, "--check-ac", readPositiveIntegerList(params, "acceptanceCriteriaCheck"));
  pushRepeat(args, "--uncheck-ac", readPositiveIntegerList(params, "acceptanceCriteriaUncheck"));
  pushRepeat(args, "--dod", readStringList(params, "definitionOfDoneAdd"));
  pushRepeat(args, "--remove-dod", readPositiveIntegerList(params, "definitionOfDoneRemove"));
  pushRepeat(args, "--check-dod", readPositiveIntegerList(params, "definitionOfDoneCheck"));
  pushRepeat(args, "--uncheck-dod", readPositiveIntegerList(params, "definitionOfDoneUncheck"));
  pushFlag(args, "--plan", readTrimmedString(params, "planSet"));
  pushFlag(args, "--notes", readTrimmedString(params, "notesSet"));
  pushRepeat(args, "--append-notes", readStringList(params, "notesAppend"));
  pushFlag(args, "--final-summary", readTrimmedString(params, "finalSummary"));
  pushRepeat(args, "--append-final-summary", readStringList(params, "finalSummaryAppend"));
  pushRepeat(args, "--ref", readStringList(params, "references"));
  pushRepeat(args, "--doc", readStringList(params, "documentation"));

  const ordinal = readNonNegativeInteger(params, "ordinal");
  if (ordinal !== undefined) {
    args.push("--ordinal", String(ordinal));
  }

  if (params.finalSummaryClear === true) {
    args.push("--clear-final-summary");
  }

  if (args.length === 2) {
    throw new Error("At least one editable field must be provided.");
  }

  return args;
}

function buildArchiveArgs(params: Record<string, unknown>): string[] {
  const id = requireTrimmedString(params, "id");
  return [id];
}

function buildConfigArgs(_params: Record<string, unknown>): string[] {
  return [];
}

function isReadOperation(operation: BacklogTaskOperation): operation is BacklogReadOperation {
  return READ_OPERATIONS.has(operation);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizePriority(value: string): (typeof PRIORITY_VALUES)[number] | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return null;
}

function normalizeStatus(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/^[^A-Za-z0-9]+/, "").trim() || trimmed;
}

function parseTaskReference(value: string): BacklogTaskReference | null {
  const match = value.trim().match(/^([A-Za-z]+-\d+(?:\.\d+)*)\s+-\s+(.+)$/);
  if (!match) {
    return null;
  }
  return {
    id: match[1],
    title: match[2].trim(),
  };
}

function cleanSectionLines(lines: string[]): string[] {
  const cleaned = [...lines];
  while (cleaned.length > 0 && cleaned[0].trim() === "") {
    cleaned.shift();
  }
  if (cleaned[0] && /^-+$/.test(cleaned[0].trim())) {
    cleaned.shift();
  }
  while (cleaned.length > 0 && cleaned[0].trim() === "") {
    cleaned.shift();
  }
  while (cleaned.length > 0 && cleaned[cleaned.length - 1]?.trim() === "") {
    cleaned.pop();
  }
  return cleaned;
}

function parseChecklistItems(
  lines: string[],
  sectionName: string,
): ParseResult<BacklogChecklistItem[]> {
  if (lines.length === 0) {
    return { ok: true, data: [] };
  }
  if (lines.length === 1 && /^no\s+/i.test(lines[0]?.trim() ?? "")) {
    return { ok: true, data: [] };
  }

  const items: BacklogChecklistItem[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const match = trimmed.match(/^- \[([ xX])\]\s*(?:#\d+\s*)?(.+)$/);
    if (!match) {
      return {
        ok: false,
        message: `${sectionName} contains an unrecognized checklist line: "${trimmed}"`,
      };
    }
    items.push({
      checked: match[1].toLowerCase() === "x",
      text: match[2].trim(),
    });
  }
  return { ok: true, data: items };
}

function parseListStdout(stdout: string): ParseResult<{ tasks: BacklogTaskSummary[] }> {
  const tasks: BacklogTaskSummary[] = [];
  const lines = stdout.replaceAll("\r\n", "\n").split("\n");
  let currentStatus: string | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed === "No tasks found.") {
      return { ok: true, data: { tasks: [] } };
    }
    if (!rawLine.startsWith(" ") && trimmed.endsWith(":")) {
      currentStatus = trimmed.slice(0, -1).trim();
      continue;
    }

    const rowMatch = trimmed.match(/^\[(HIGH|MEDIUM|LOW)\]\s+(\S+)\s+-\s+(.+)$/);
    if (!rowMatch) {
      return {
        ok: false,
        message: `Unrecognized list row format: "${trimmed}"`,
      };
    }
    tasks.push({
      id: rowMatch[2],
      title: rowMatch[3].trim(),
      status: currentStatus,
      priority: normalizePriority(rowMatch[1]),
      createdDate: null,
      lastModified: null,
    });
  }

  return { ok: true, data: { tasks } };
}

function parseSearchStdout(stdout: string): ParseResult<{ tasks: BacklogTaskSearchSummary[] }> {
  const tasks: BacklogTaskSearchSummary[] = [];
  const lines = stdout.replaceAll("\r\n", "\n").split("\n");

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed === "Tasks:") {
      continue;
    }
    if (trimmed === "No results found.") {
      return { ok: true, data: { tasks: [] } };
    }

    const rowMatch = trimmed.match(
      /^(\S+)\s+-\s+(.+)\s+\(([^)]+)\)\s+\[(HIGH|MEDIUM|LOW)\]\s+\[score\s+([0-9]+(?:\.[0-9]+)?)\]$/,
    );
    if (!rowMatch) {
      return {
        ok: false,
        message: `Unrecognized search row format: "${trimmed}"`,
      };
    }
    tasks.push({
      id: rowMatch[1],
      title: rowMatch[2].trim(),
      status: rowMatch[3].trim() || null,
      priority: normalizePriority(rowMatch[4]),
      score: Number.parseFloat(rowMatch[5]),
      createdDate: null,
      lastModified: null,
    });
  }

  return { ok: true, data: { tasks } };
}

function parseConfigStdout(stdout: string): ParseResult<{ config: Record<string, string> }> {
  const lines = stdout.replaceAll("\r\n", "\n").split("\n");
  const config: Record<string, string> = {};

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }
    if (/^configuration:?$/i.test(trimmed)) {
      continue;
    }
    const withoutBullet = trimmed.replace(/^[-*]\s+/, "");
    const pairMatch = withoutBullet.match(/^([^:=]+?)\s*[:=]\s*(.*)$/);
    if (!pairMatch) {
      continue;
    }
    const key = pairMatch[1].trim();
    if (!key) {
      continue;
    }
    config[key] = pairMatch[2].trim();
  }

  if (Object.keys(config).length === 0) {
    return {
      ok: false,
      message: "Unable to parse Backlog.md config entries from `backlog config list` output.",
    };
  }

  return {
    ok: true,
    data: {
      config,
    },
  };
}

function parseViewStdout(stdout: string): ParseResult<{ task: BacklogTaskDetails }> {
  const lines = stdout.replaceAll("\r\n", "\n").split("\n");
  const sectionNames = [
    "Description",
    "Acceptance Criteria",
    "Definition of Done",
    "Implementation Plan",
    "Implementation Notes",
    "Final Summary",
  ] as const;

  const sectionStart = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    for (const sectionName of sectionNames) {
      if (trimmed === `${sectionName}:`) {
        sectionStart.set(sectionName, index);
      }
    }
  }

  const headerEnd =
    Math.min(...Array.from(sectionStart.values()).filter((value) => Number.isFinite(value))) ||
    lines.length;
  const headerLines = lines.slice(0, headerEnd);

  let filePath: string | null = null;
  let id: string | null = null;
  let title: string | null = null;
  let status: string | null = null;
  let priority: (typeof PRIORITY_VALUES)[number] | null = null;
  let createdDate: string | null = null;
  let lastModified: string | null = null;
  const assignees: string[] = [];
  const labels: string[] = [];
  let parent: BacklogTaskReference | null = null;
  const subtasks: BacklogTaskReference[] = [];
  const dependencies: BacklogTaskReference[] = [];
  const references: string[] = [];
  const documentation: string[] = [];

  for (let index = 0; index < headerLines.length; index += 1) {
    const trimmed = headerLines[index]?.trim() ?? "";
    if (!trimmed) {
      continue;
    }

    let match = trimmed.match(/^File:\s*(.+)$/);
    if (match) {
      filePath = match[1].trim() || null;
      continue;
    }

    match = trimmed.match(/^Task\s+(\S+)\s+-\s+(.+)$/);
    if (match) {
      id = match[1];
      title = match[2].trim();
      continue;
    }

    match = trimmed.match(/^Status:\s*(.+)$/);
    if (match) {
      status = normalizeStatus(match[1]);
      continue;
    }

    match = trimmed.match(/^Priority:\s*(.+)$/);
    if (match) {
      priority = normalizePriority(match[1]);
      continue;
    }

    match = trimmed.match(/^Created:\s*(.*)$/);
    if (match) {
      createdDate = match[1].trim() || null;
      continue;
    }

    match = trimmed.match(/^Updated:\s*(.*)$/);
    if (match) {
      lastModified = match[1].trim() || null;
      continue;
    }

    match = trimmed.match(/^Assignee:\s*(.*)$/);
    if (match) {
      assignees.push(...splitCommaList(match[1]));
      continue;
    }

    match = trimmed.match(/^Labels:\s*(.*)$/);
    if (match) {
      labels.push(...splitCommaList(match[1]));
      continue;
    }

    match = trimmed.match(/^Parent:\s*(.+)$/);
    if (match) {
      parent = parseTaskReference(match[1]);
      continue;
    }

    match = trimmed.match(/^Subtasks \(\d+\):$/);
    if (match) {
      let cursor = index + 1;
      while (cursor < headerLines.length) {
        const row = headerLines[cursor]?.trim() ?? "";
        if (!row.startsWith("- ")) {
          break;
        }
        const reference = parseTaskReference(row.slice(2));
        if (reference) {
          subtasks.push(reference);
        }
        cursor += 1;
      }
      index = cursor - 1;
      continue;
    }

    match = trimmed.match(/^(?:Dependencies|Depends on) \(\d+\):$/);
    if (match) {
      let cursor = index + 1;
      while (cursor < headerLines.length) {
        const row = headerLines[cursor]?.trim() ?? "";
        if (!row.startsWith("- ")) {
          break;
        }
        const reference = parseTaskReference(row.slice(2));
        if (reference) {
          dependencies.push(reference);
        }
        cursor += 1;
      }
      index = cursor - 1;
      continue;
    }

    match = trimmed.match(/^References:\s*(.*)$/);
    if (match) {
      references.push(...splitCommaList(match[1]));
      continue;
    }

    match = trimmed.match(/^Documentation:\s*(.*)$/);
    if (match) {
      documentation.push(...splitCommaList(match[1]));
      continue;
    }
  }

  if (!id || !title) {
    return {
      ok: false,
      message: "Unable to parse task identity from `backlog task view --plain` output.",
    };
  }

  function readSectionText(sectionName: (typeof sectionNames)[number]): string | null {
    const start = sectionStart.get(sectionName);
    if (start === undefined) {
      return null;
    }
    const end = sectionNames
      .map((name) => sectionStart.get(name))
      .filter((value): value is number => value !== undefined && value > start)
      .toSorted((a, b) => a - b)[0];
    const sectionLines = cleanSectionLines(lines.slice(start + 1, end ?? lines.length));
    if (sectionLines.length === 0) {
      return null;
    }
    return sectionLines.join("\n");
  }

  const description = readSectionText("Description");
  const implementationPlan = readSectionText("Implementation Plan");
  const implementationNotes = readSectionText("Implementation Notes");
  const finalSummary = readSectionText("Final Summary");
  const acceptanceCriteriaText = readSectionText("Acceptance Criteria");
  const definitionOfDoneText = readSectionText("Definition of Done");
  const acceptanceCriteriaLines = acceptanceCriteriaText ? acceptanceCriteriaText.split("\n") : [];
  const definitionOfDoneLines = definitionOfDoneText ? definitionOfDoneText.split("\n") : [];
  const parsedAcceptanceCriteria = parseChecklistItems(
    acceptanceCriteriaLines,
    "Acceptance Criteria",
  );
  if (!parsedAcceptanceCriteria.ok) {
    return parsedAcceptanceCriteria;
  }
  const parsedDefinitionOfDone = parseChecklistItems(definitionOfDoneLines, "Definition of Done");
  if (!parsedDefinitionOfDone.ok) {
    return parsedDefinitionOfDone;
  }

  return {
    ok: true,
    data: {
      task: {
        id,
        title,
        status,
        priority,
        createdDate,
        lastModified,
        filePath,
        assignees,
        labels,
        parent,
        subtasks,
        dependencies,
        references,
        documentation,
        description,
        acceptanceCriteria: parsedAcceptanceCriteria.data,
        definitionOfDone: parsedDefinitionOfDone.data,
        implementationPlan,
        implementationNotes,
        finalSummary,
      },
    },
  };
}

function parseReadOperationData(
  operation: BacklogReadOperation,
  params: Record<string, unknown>,
  stdout: string,
): ParseResult<
  | { tasks: BacklogTaskSummary[]; total: number }
  | { query: string | null; tasks: BacklogTaskSearchSummary[]; total: number }
  | { task: BacklogTaskDetails }
  | { config: Record<string, string>; total: number }
> {
  if (operation === "list") {
    const parsed = parseListStdout(stdout);
    if (!parsed.ok) {
      return parsed;
    }
    return {
      ok: true,
      data: {
        tasks: parsed.data.tasks,
        total: parsed.data.tasks.length,
      },
    };
  }
  if (operation === "search") {
    const parsed = parseSearchStdout(stdout);
    if (!parsed.ok) {
      return parsed;
    }
    return {
      ok: true,
      data: {
        query: readTrimmedString(params, "query") ?? null,
        tasks: parsed.data.tasks,
        total: parsed.data.tasks.length,
      },
    };
  }

  if (operation === "config") {
    const parsed = parseConfigStdout(stdout);
    if (!parsed.ok) {
      return parsed;
    }
    return {
      ok: true,
      data: {
        config: parsed.data.config,
        total: Object.keys(parsed.data.config).length,
      },
    };
  }

  const parsed = parseViewStdout(stdout);
  if (!parsed.ok) {
    return parsed;
  }
  return {
    ok: true,
    data: parsed.data,
  };
}

function resolveReadAvailability(
  code: BacklogReadFailureCode,
  guidance: string[],
): ReadAvailability {
  if (code === "plugin_disabled" || code === "not_initialized" || code === "missing_binary") {
    return {
      status: "unavailable",
      reason: code,
      guidance,
    };
  }
  return {
    status: "available",
    reason: null,
    guidance: [],
  };
}

function resolvePluginDisabledFailure(
  context: OpenClawPluginToolContext,
): { message: string; guidance: string[] } | null {
  const config = asRecord(context.config);
  const plugins = asRecord(config?.plugins);
  if (!plugins) {
    return null;
  }

  if (plugins.enabled === false) {
    return {
      message: "Backlog.md plugin is disabled.",
      guidance: ["Enable Backlog.md plugin: openclaw plugins enable backlog"],
    };
  }

  const entries = asRecord(plugins.entries);
  const backlogEntry = asRecord(entries?.backlog);
  if (backlogEntry?.enabled === false) {
    return {
      message: "Backlog.md plugin is disabled.",
      guidance: ["Enable Backlog.md plugin: openclaw plugins enable backlog"],
    };
  }

  const deny = Array.isArray(plugins.deny)
    ? plugins.deny.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (deny.includes("*") || deny.includes("backlog")) {
    return {
      message: "Backlog.md plugin is disabled.",
      guidance: ["Enable Backlog.md plugin: openclaw plugins enable backlog"],
    };
  }

  const allow = Array.isArray(plugins.allow)
    ? plugins.allow.filter((entry): entry is string => typeof entry === "string")
    : [];
  if (allow.length > 0 && !allow.includes("backlog") && backlogEntry?.enabled !== true) {
    return {
      message: "Backlog.md plugin is disabled.",
      guidance: ["Enable Backlog.md plugin: openclaw plugins enable backlog"],
    };
  }

  return null;
}

function normalizeValidationFailure(operation: BacklogTaskOperation, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    ok: false as const,
    operation,
    error: {
      code: "invalid_params",
      message,
      guidance: [
        "Provide the required semantic fields for this Backlog.md operation.",
        "Use non-empty strings and positive integer indices where required.",
      ],
    },
  };
}

function normalizeReadValidationFailure(operation: BacklogReadOperation, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const errorCode: BacklogReadFailureCode = "invalid_params";
  const guidance = [
    "Provide the required semantic fields for this Backlog.md operation.",
    "Use non-empty strings and positive integer indices where required.",
  ];
  return {
    ok: false as const,
    schemaVersion: TASKS_SCHEMA_VERSION,
    output: "json" as const,
    operation,
    availability: resolveReadAvailability(errorCode, guidance),
    data: null,
    error: {
      code: errorCode,
      message,
      guidance,
      cause: null,
      exitCode: null,
    },
    diagnostics: {
      stdout: "",
      stderr: "",
      context: null,
    },
  };
}

function normalizeSuccess(
  operation: BacklogTaskOperation,
  result: Awaited<ReturnType<typeof executeBacklogTaskOperation>>,
) {
  if (!result.ok) {
    return null;
  }
  return {
    ok: true as const,
    operation,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    context: result.context,
  };
}

function normalizeFailure(
  operation: BacklogTaskOperation,
  result: Awaited<ReturnType<typeof executeBacklogTaskOperation>>,
) {
  if (result.ok) {
    return null;
  }
  return {
    ok: false as const,
    operation,
    error: {
      code: result.code,
      message: result.message,
      guidance: result.guidance,
      cause: result.cause,
      exitCode: result.exitCode ?? null,
    },
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    context: result.context ?? null,
  };
}

function normalizeReadFailure(params: {
  operation: BacklogReadOperation;
  code: BacklogReadFailureCode;
  message: string;
  guidance: string[];
  stdout?: string | null;
  stderr?: string | null;
  context?: Awaited<ReturnType<typeof executeBacklogTaskOperation>>["context"] | null;
  cause?: string | null;
  exitCode?: number | null;
}) {
  return {
    ok: false as const,
    schemaVersion: TASKS_SCHEMA_VERSION,
    output: "json" as const,
    operation: params.operation,
    availability: resolveReadAvailability(params.code, params.guidance),
    data: null,
    error: {
      code: params.code,
      message: params.message,
      guidance: params.guidance,
      cause: params.cause ?? null,
      exitCode: params.exitCode ?? null,
    },
    diagnostics: {
      stdout: params.stdout ?? "",
      stderr: params.stderr ?? "",
      context: params.context ?? null,
    },
  };
}

function normalizeReadFailureFromAdapter(
  operation: BacklogReadOperation,
  result: BacklogCommandFailure,
) {
  return normalizeReadFailure({
    operation,
    code: result.code,
    message: result.message,
    guidance: result.guidance,
    cause: result.cause ?? null,
    exitCode: result.exitCode ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    context: result.context ?? null,
  });
}

function normalizeReadSuccess(
  operation: BacklogReadOperation,
  result: Extract<Awaited<ReturnType<typeof executeBacklogTaskOperation>>, { ok: true }>,
  data: ReturnType<typeof parseReadOperationData> extends ParseResult<infer T> ? T : never,
) {
  return {
    ok: true as const,
    schemaVersion: TASKS_SCHEMA_VERSION,
    output: "json" as const,
    operation,
    availability: {
      status: "available" as const,
      reason: null,
      guidance: [],
    },
    data,
    error: null,
    diagnostics: {
      exitCode: result.exitCode,
      stderr: result.stderr,
      context: result.context,
    },
  };
}

type ToolBuilder = {
  name: string;
  description: string;
  operation: BacklogTaskOperation;
  parameters: Record<string, unknown>;
  buildArgs: (params: Record<string, unknown>) => string[];
};

function createBacklogTaskTool(def: ToolBuilder, deps: BacklogTaskToolDeps) {
  return {
    name: def.name,
    description: def.description,
    parameters: def.parameters,
    async execute(_toolCallId: string, rawParams: unknown) {
      const params =
        rawParams && typeof rawParams === "object" ? (rawParams as Record<string, unknown>) : {};
      const output = isReadOperation(def.operation) ? readBacklogReadOutput(params) : "text";

      if (isReadOperation(def.operation) && output === "json") {
        const pluginDisabled = resolvePluginDisabledFailure(deps.context);
        if (pluginDisabled) {
          return jsonResult(
            normalizeReadFailure({
              operation: def.operation,
              code: "plugin_disabled",
              message: pluginDisabled.message,
              guidance: pluginDisabled.guidance,
            }),
          );
        }
      }

      let args: string[];
      try {
        args = def.buildArgs(params);
      } catch (err) {
        if (isReadOperation(def.operation) && output === "json") {
          return jsonResult(normalizeReadValidationFailure(def.operation, err));
        }
        return jsonResult(normalizeValidationFailure(def.operation, err));
      }

      const result = await executeBacklogTaskOperation({
        operation: def.operation,
        args,
        workspaceDir: deps.context.workspaceDir,
        cwd: deps.context.agentDir,
        timeoutMs: deps.timeoutMs,
        runCommandWithTimeout: deps.runCommandWithTimeout,
        rootResolver: deps.rootResolver,
      });

      if (result.ok) {
        if (isReadOperation(def.operation) && output === "json") {
          const parsed = parseReadOperationData(def.operation, params, result.stdout);
          if (!parsed.ok) {
            return jsonResult(
              normalizeReadFailure({
                operation: def.operation,
                code: "parse_error",
                message: parsed.message,
                guidance: [
                  'Call the same tool with `output: "text"` to inspect raw `--plain` output.',
                  "Verify Backlog.md CLI output format still matches expected plain text contracts.",
                ],
                stdout: result.stdout,
                stderr: result.stderr,
                context: result.context,
                exitCode: result.exitCode,
              }),
            );
          }
          return jsonResult(normalizeReadSuccess(def.operation, result, parsed.data));
        }
        return jsonResult(normalizeSuccess(def.operation, result));
      }
      if (isReadOperation(def.operation) && output === "json") {
        return jsonResult(normalizeReadFailureFromAdapter(def.operation, result));
      }
      return jsonResult(normalizeFailure(def.operation, result));
    },
  };
}

const CreateTaskSchema = Type.Object(
  {
    title: NonEmptyString,
    description: Type.Optional(NonEmptyString),
    assignee: Type.Optional(NonEmptyString),
    status: Type.Optional(NonEmptyString),
    labels: Type.Optional(NonEmptyStringList),
    priority: Type.Optional(optionalStringEnum(PRIORITY_VALUES)),
    parentTaskId: Type.Optional(NonEmptyString),
    dependsOn: Type.Optional(NonEmptyStringList),
    acceptanceCriteria: Type.Optional(NonEmptyStringList),
    definitionOfDoneAdd: Type.Optional(NonEmptyStringList),
    disableDefinitionOfDoneDefaults: Type.Optional(Type.Boolean()),
    plan: Type.Optional(NonEmptyString),
    notes: Type.Optional(NonEmptyString),
    finalSummary: Type.Optional(NonEmptyString),
    draft: Type.Optional(Type.Boolean()),
    references: Type.Optional(NonEmptyStringList),
    documentation: Type.Optional(NonEmptyStringList),
  },
  { additionalProperties: false },
);

const ListTaskSchema = Type.Object(
  {
    status: Type.Optional(NonEmptyString),
    assignee: Type.Optional(NonEmptyString),
    parentTaskId: Type.Optional(NonEmptyString),
    priority: Type.Optional(optionalStringEnum(PRIORITY_VALUES)),
    sort: Type.Optional(optionalStringEnum(LIST_SORT_VALUES)),
    output: ReadOutputSchema,
  },
  { additionalProperties: false },
);

const SearchTaskSchema = Type.Object(
  {
    query: NonEmptyString,
    status: Type.Optional(NonEmptyString),
    priority: Type.Optional(optionalStringEnum(PRIORITY_VALUES)),
    limit: Type.Optional(Type.Number({ minimum: 1 })),
    output: ReadOutputSchema,
  },
  { additionalProperties: false },
);

const ViewTaskSchema = Type.Object(
  {
    id: NonEmptyString,
    output: ReadOutputSchema,
  },
  { additionalProperties: false },
);

const EditTaskSchema = Type.Object(
  {
    id: NonEmptyString,
    title: Type.Optional(NonEmptyString),
    description: Type.Optional(NonEmptyString),
    status: Type.Optional(NonEmptyString),
    assignee: Type.Optional(NonEmptyStringList),
    labels: Type.Optional(NonEmptyStringList),
    addLabels: Type.Optional(NonEmptyStringList),
    removeLabels: Type.Optional(NonEmptyStringList),
    priority: Type.Optional(optionalStringEnum(PRIORITY_VALUES)),
    ordinal: Type.Optional(Type.Number({ minimum: 0 })),
    acceptanceCriteriaAdd: Type.Optional(NonEmptyStringList),
    acceptanceCriteriaRemove: Type.Optional(PositiveNumberList),
    acceptanceCriteriaCheck: Type.Optional(PositiveNumberList),
    acceptanceCriteriaUncheck: Type.Optional(PositiveNumberList),
    definitionOfDoneAdd: Type.Optional(NonEmptyStringList),
    definitionOfDoneRemove: Type.Optional(PositiveNumberList),
    definitionOfDoneCheck: Type.Optional(PositiveNumberList),
    definitionOfDoneUncheck: Type.Optional(PositiveNumberList),
    planSet: Type.Optional(NonEmptyString),
    notesSet: Type.Optional(NonEmptyString),
    notesAppend: Type.Optional(NonEmptyStringList),
    finalSummary: Type.Optional(NonEmptyString),
    finalSummaryAppend: Type.Optional(NonEmptyStringList),
    finalSummaryClear: Type.Optional(Type.Boolean()),
    dependsOn: Type.Optional(NonEmptyStringList),
    references: Type.Optional(NonEmptyStringList),
    documentation: Type.Optional(NonEmptyStringList),
  },
  { additionalProperties: false },
);

const ArchiveTaskSchema = Type.Object(
  {
    id: NonEmptyString,
  },
  { additionalProperties: false },
);

const ConfigTaskSchema = Type.Object(
  {
    output: ReadOutputSchema,
  },
  { additionalProperties: false },
);

export function createBacklogTaskTools(deps: BacklogTaskToolDeps) {
  return [
    createBacklogTaskTool(
      {
        name: BACKLOG_TASK_TOOL_NAMES[0],
        description: "Create a Backlog.md task using structured fields.",
        operation: "create",
        parameters: CreateTaskSchema,
        buildArgs: buildCreateArgs,
      },
      deps,
    ),
    createBacklogTaskTool(
      {
        name: BACKLOG_TASK_TOOL_NAMES[1],
        description: "List Backlog.md tasks with optional semantic filters.",
        operation: "list",
        parameters: ListTaskSchema,
        buildArgs: buildListArgs,
      },
      deps,
    ),
    createBacklogTaskTool(
      {
        name: BACKLOG_TASK_TOOL_NAMES[2],
        description: "Search Backlog.md tasks by query with optional filters.",
        operation: "search",
        parameters: SearchTaskSchema,
        buildArgs: buildSearchArgs,
      },
      deps,
    ),
    createBacklogTaskTool(
      {
        name: BACKLOG_TASK_TOOL_NAMES[3],
        description: "View a Backlog.md task by id.",
        operation: "view",
        parameters: ViewTaskSchema,
        buildArgs: buildViewArgs,
      },
      deps,
    ),
    createBacklogTaskTool(
      {
        name: BACKLOG_TASK_TOOL_NAMES[4],
        description: "Edit a Backlog.md task using structured update fields.",
        operation: "edit",
        parameters: EditTaskSchema,
        buildArgs: buildEditArgs,
      },
      deps,
    ),
    createBacklogTaskTool(
      {
        name: BACKLOG_TASK_TOOL_NAMES[5],
        description: "Archive a Backlog.md task by id.",
        operation: "archive",
        parameters: ArchiveTaskSchema,
        buildArgs: buildArchiveArgs,
      },
      deps,
    ),
    createBacklogTaskTool(
      {
        name: BACKLOG_TASK_TOOL_NAMES[6],
        description: "Read Backlog.md project config entries.",
        operation: "config",
        parameters: ConfigTaskSchema,
        buildArgs: buildConfigArgs,
      },
      deps,
    ),
  ];
}
