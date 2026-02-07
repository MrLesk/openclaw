import { Type } from "@sinclair/typebox";
import {
  jsonResult,
  optionalStringEnum,
  type OpenClawPluginToolContext,
  type PluginRuntime,
} from "openclaw/plugin-sdk";
import {
  executeBacklogTaskOperation,
  type BacklogTaskOperation,
  type ExecuteBacklogTaskOperationParams,
} from "./command-adapter.js";

const PRIORITY_VALUES = ["high", "medium", "low"] as const;
const LIST_SORT_VALUES = ["priority", "id"] as const;

const BACKLOG_TOOL_PREFIX = "backlog_task";

export const BACKLOG_TASK_TOOL_NAMES = [
  `${BACKLOG_TOOL_PREFIX}_create`,
  `${BACKLOG_TOOL_PREFIX}_list`,
  `${BACKLOG_TOOL_PREFIX}_search`,
  `${BACKLOG_TOOL_PREFIX}_view`,
  `${BACKLOG_TOOL_PREFIX}_edit`,
  `${BACKLOG_TOOL_PREFIX}_archive`,
] as const;

const NonEmptyString = Type.String({ minLength: 1 });
const NonEmptyStringList = Type.Array(NonEmptyString, { minItems: 1 });
const PositiveNumberList = Type.Array(Type.Number({ minimum: 1 }), { minItems: 1 });

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

function readPositiveIntegerList(params: Record<string, unknown>, key: string): number[] | undefined {
  const value = params[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value.map((entry) => {
    if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 1 || !Number.isInteger(entry)) {
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

      let args: string[];
      try {
        args = def.buildArgs(params);
      } catch (err) {
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
        return jsonResult(normalizeSuccess(def.operation, result));
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
  },
  { additionalProperties: false },
);

const SearchTaskSchema = Type.Object(
  {
    query: NonEmptyString,
    status: Type.Optional(NonEmptyString),
    priority: Type.Optional(optionalStringEnum(PRIORITY_VALUES)),
    limit: Type.Optional(Type.Number({ minimum: 1 })),
  },
  { additionalProperties: false },
);

const ViewTaskSchema = Type.Object(
  {
    id: NonEmptyString,
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
  ];
}
