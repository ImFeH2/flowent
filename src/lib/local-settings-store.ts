import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import type {
  BlueprintAsset,
  ModelConnection,
  ModelPreset,
  Role,
  WorkflowRun,
} from "@/components/flowent/model";

const localDataDirectoryName = ".flowent";
const localSettingsFileName = "settings.json";
const localSettingsVersion = 1;

const connectionTypes = new Set([
  "openai",
  "openai-responses",
  "anthropic",
  "gemini",
]);
const legacyConnectionTypes = new Set(["openai", "anthropic", "custom"]);
const legacyConnectionTypeMap: Record<string, ModelConnection["type"]> = {
  openai: "openai",
  anthropic: "anthropic",
  custom: "openai",
};
const modelPresetTestStatuses = new Set(["idle", "success", "error"]);
const blueprintLastRunStatuses = new Set([
  "not-run",
  "running",
  "success",
  "error",
]);
const workflowRunStatuses = new Set([
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
]);
const legacyWorkflowRunStatusMap: Record<string, WorkflowRun["status"]> = {
  success: "succeeded",
  error: "failed",
};

export type LocalSettingsSnapshot = {
  version: typeof localSettingsVersion;
  modelConnections: ModelConnection[];
  modelPresets: ModelPreset[];
  blueprints: BlueprintAsset[];
  roles: Role[];
};

export type LocalSettingsReadResult =
  | { status: "missing"; settings: null }
  | { status: "found"; settings: LocalSettingsSnapshot };

type LocalSettingsStoreOptions = {
  homeDirectory?: string;
};

type ValidationResult =
  | { ok: true; settings: LocalSettingsSnapshot }
  | { ok: false; message: string };

type LocalSettingsStoreErrorKind = "invalid-settings" | "read" | "storage";

export class LocalSettingsStoreError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
    public readonly kind: LocalSettingsStoreErrorKind,
  ) {
    super(message);
    this.name = "LocalSettingsStoreError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isModelConnection(value: unknown): value is ModelConnection {
  return (
    isRecord(value) &&
    isString(value.id) &&
    connectionTypes.has(value.type as string) &&
    isString(value.name) &&
    isString(value.accessKey) &&
    isString(value.endpointUrl)
  );
}

function modelConnectionIdFromLegacyId(id: string) {
  return id.startsWith("provider-")
    ? `connection-${id.slice("provider-".length)}`
    : id;
}

function parseModelConnection(value: unknown): ModelConnection | null {
  if (isModelConnection(value)) {
    return value;
  }

  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !legacyConnectionTypes.has(value.type as string) ||
    !isString(value.name) ||
    !isString(value.apiKey) ||
    !isString(value.baseUrl)
  ) {
    return null;
  }

  return {
    id: modelConnectionIdFromLegacyId(value.id),
    type: legacyConnectionTypeMap[value.type as string] ?? "openai",
    name: value.name,
    accessKey: value.apiKey,
    endpointUrl: value.baseUrl,
  };
}

function isModelPreset(value: unknown): value is ModelPreset {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.modelConnectionId) &&
    isString(value.modelName) &&
    isFiniteNumber(value.temperature) &&
    isFiniteNumber(value.outputLimit) &&
    (value.topP === undefined || isFiniteNumber(value.topP)) &&
    (value.frequencyPenalty === undefined ||
      isFiniteNumber(value.frequencyPenalty)) &&
    (value.testStatus === undefined ||
      modelPresetTestStatuses.has(value.testStatus as string)) &&
    isOptionalString(value.testMessage)
  );
}

function parseModelPreset(value: unknown): ModelPreset | null {
  if (isModelPreset(value)) {
    return value;
  }

  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.name) ||
    !isString(value.providerId) ||
    !isString(value.modelId) ||
    !isFiniteNumber(value.temperature) ||
    !isFiniteNumber(value.maxTokens)
  ) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    modelConnectionId: modelConnectionIdFromLegacyId(value.providerId),
    modelName: value.modelId,
    temperature: value.temperature,
    outputLimit: value.maxTokens,
    testStatus:
      value.testStatus === undefined ||
      modelPresetTestStatuses.has(value.testStatus as string)
        ? (value.testStatus as ModelPreset["testStatus"])
        : undefined,
    testMessage: isOptionalString(value.testMessage)
      ? value.testMessage
      : undefined,
  };
}

function isRole(value: unknown): value is Role {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.avatar) &&
    isString(value.systemPrompt) &&
    isString(value.modelPresetId)
  );
}

function isPlainJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    isFiniteNumber(value)
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isPlainJsonValue);
  }

  if (isRecord(value)) {
    return Object.values(value).every(isPlainJsonValue);
  }

  return false;
}

function normalizeSavedJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeSavedJson);
  }

  if (!isRecord(value)) {
    return value;
  }

  const normalized = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeSavedJson(item)]),
  );

  if (
    normalized.errorMessage === "The provider returned an empty completion."
  ) {
    normalized.errorMessage =
      "The selected service returned an empty response.";
  }

  if (
    normalized.kind === "agent" &&
    isString(normalized.modelId) &&
    normalized.modelName === undefined
  ) {
    normalized.modelName = normalized.modelId;
    delete normalized.modelId;
  }

  return normalized;
}

function normalizeWorkflowRunStatus(
  value: unknown,
): WorkflowRun["status"] | null {
  if (!isString(value)) {
    return null;
  }

  if (workflowRunStatuses.has(value)) {
    return value as WorkflowRun["status"];
  }

  return legacyWorkflowRunStatusMap[value] ?? null;
}

function parseWorkflowRun(value: unknown): WorkflowRun | null {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.startedAt) ||
    !isString(value.updatedAt) ||
    !isString(value.summary) ||
    !Array.isArray(value.nodes) ||
    !value.nodes.every(isPlainJsonValue) ||
    !Array.isArray(value.edges) ||
    !value.edges.every(isPlainJsonValue)
  ) {
    return null;
  }

  const status = normalizeWorkflowRunStatus(value.status);

  if (!status) {
    return null;
  }

  return {
    id: value.id,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    status,
    summary: value.summary,
    nodes: value.nodes.map(normalizeSavedJson) as WorkflowRun["nodes"],
    edges: value.edges.map(normalizeSavedJson) as WorkflowRun["edges"],
  };
}

function parseBlueprintAsset(value: unknown): BlueprintAsset | null {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.name) ||
    !isString(value.updatedAt) ||
    !blueprintLastRunStatuses.has(value.lastRunStatus as string) ||
    !isString(value.summary) ||
    !Array.isArray(value.nodes) ||
    !value.nodes.every(isPlainJsonValue) ||
    !Array.isArray(value.edges) ||
    !value.edges.every(isPlainJsonValue)
  ) {
    return null;
  }

  if (value.runHistory !== undefined && !Array.isArray(value.runHistory)) {
    return null;
  }

  const parsedRunHistory = (value.runHistory ?? []).map(parseWorkflowRun);

  if (parsedRunHistory.some((run) => !run)) {
    return null;
  }

  const runHistory = parsedRunHistory as WorkflowRun[];

  if (
    value.selectedRunId !== undefined &&
    value.selectedRunId !== null &&
    !isString(value.selectedRunId)
  ) {
    return null;
  }

  const selectedRunId =
    value.selectedRunId &&
    runHistory.some((run) => run.id === value.selectedRunId)
      ? value.selectedRunId
      : null;

  return {
    id: value.id,
    name: value.name,
    updatedAt: value.updatedAt,
    lastRunStatus: value.lastRunStatus as BlueprintAsset["lastRunStatus"],
    summary: value.summary,
    nodes: value.nodes.map(normalizeSavedJson) as BlueprintAsset["nodes"],
    edges: value.edges.map(normalizeSavedJson) as BlueprintAsset["edges"],
    runHistory,
    selectedRunId,
  };
}

function validateArray<T>(
  value: unknown,
  name: string,
  predicate: (item: unknown) => item is T,
) {
  if (!Array.isArray(value)) {
    return { ok: false as const, message: `${name} must be a list.` };
  }

  if (!value.every(predicate)) {
    return {
      ok: false as const,
      message: `${name} contains an item with an invalid format.`,
    };
  }

  return { ok: true as const, value };
}

function parseArray<T>(
  value: unknown,
  name: string,
  parser: (item: unknown) => T | null,
) {
  if (!Array.isArray(value)) {
    return { ok: false as const, message: `${name} must be a list.` };
  }

  const items = value.map(parser);

  if (items.some((item) => !item)) {
    return {
      ok: false as const,
      message: `${name} contains an item with an invalid format.`,
    };
  }

  return { ok: true as const, value: items as T[] };
}

function validateBlueprints(value: unknown) {
  if (!Array.isArray(value)) {
    return { ok: false as const, message: "blueprints must be a list." };
  }

  const blueprints = value.map(parseBlueprintAsset);

  if (blueprints.some((blueprint) => !blueprint)) {
    return {
      ok: false as const,
      message: "blueprints contains an item with an invalid format.",
    };
  }

  return { ok: true as const, value: blueprints as BlueprintAsset[] };
}

export function parseLocalSettingsSnapshot(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return {
      ok: false,
      message: "Settings must be saved as a single object.",
    };
  }

  const rawModelConnections =
    value.modelConnections ??
    (value.providers !== undefined ? value.providers : undefined);
  const modelConnectionResult = parseArray(
    rawModelConnections,
    "modelConnections",
    parseModelConnection,
  );
  if (!modelConnectionResult.ok) {
    return modelConnectionResult;
  }

  const modelPresetResult = parseArray(
    value.modelPresets,
    "modelPresets",
    parseModelPreset,
  );
  if (!modelPresetResult.ok) {
    return modelPresetResult;
  }

  const modelConnectionIds = new Set(
    modelConnectionResult.value.map((connection) => connection.id),
  );

  if (
    modelPresetResult.value.some(
      (preset) => !modelConnectionIds.has(preset.modelConnectionId),
    )
  ) {
    return {
      ok: false,
      message:
        "modelPresets contains an item with an unavailable model connection.",
    };
  }

  const blueprintResult = validateBlueprints(value.blueprints ?? []);
  if (!blueprintResult.ok) {
    return blueprintResult;
  }

  const roleResult = validateArray(value.roles ?? [], "roles", isRole);
  if (!roleResult.ok) {
    return roleResult;
  }

  return {
    ok: true,
    settings: {
      version: localSettingsVersion,
      modelConnections: modelConnectionResult.value,
      modelPresets: modelPresetResult.value,
      blueprints: blueprintResult.value,
      roles: roleResult.value,
    },
  };
}

function getHomeDirectory(options: LocalSettingsStoreOptions) {
  const homeDirectory =
    options.homeDirectory ??
    (process.env.NODE_ENV === "test"
      ? process.env.FLOWENT_TEST_HOME_DIRECTORY
      : undefined) ??
    homedir();

  if (!homeDirectory || !path.isAbsolute(homeDirectory)) {
    throw new LocalSettingsStoreError(
      "Home directory is unavailable.",
      "We could not find your home folder.",
      "storage",
    );
  }

  return homeDirectory;
}

export function getLocalSettingsPaths(options: LocalSettingsStoreOptions = {}) {
  const homeDirectory = getHomeDirectory(options);
  const separator = homeDirectory.endsWith(path.sep) ? "" : path.sep;
  const dataDirectory = `${homeDirectory}${separator}${localDataDirectoryName}`;
  const settingsFile = `${dataDirectory}${path.sep}${localSettingsFileName}`;

  return { dataDirectory, settingsFile };
}

export async function readLocalSettingsSnapshot(
  options: LocalSettingsStoreOptions = {},
): Promise<LocalSettingsReadResult> {
  const { settingsFile } = getLocalSettingsPaths(options);

  let fileContents: string;

  try {
    fileContents = await readFile(settingsFile, "utf8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return { status: "missing", settings: null };
    }

    throw new LocalSettingsStoreError(
      "Unable to read local settings.",
      "Saved settings could not be loaded.",
      "read",
    );
  }

  let parsedContents: unknown;

  try {
    parsedContents = JSON.parse(fileContents);
  } catch {
    throw new LocalSettingsStoreError(
      "Local settings file is not valid JSON.",
      "Saved settings could not be loaded. Save again to replace them.",
      "read",
    );
  }

  const validationResult = parseLocalSettingsSnapshot(parsedContents);

  if (!validationResult.ok) {
    throw new LocalSettingsStoreError(
      validationResult.message,
      "Saved settings could not be loaded. Save again to replace them.",
      "read",
    );
  }

  return { status: "found", settings: validationResult.settings };
}

export async function saveLocalSettingsSnapshot(
  value: unknown,
  options: LocalSettingsStoreOptions = {},
) {
  const validationResult = parseLocalSettingsSnapshot(value);

  if (!validationResult.ok) {
    throw new LocalSettingsStoreError(
      validationResult.message,
      "Settings could not be saved because the data format is not valid.",
      "invalid-settings",
    );
  }

  const { dataDirectory, settingsFile } = getLocalSettingsPaths(options);
  const temporaryFile = `${settingsFile}.tmp`;
  const fileContents = `${JSON.stringify(validationResult.settings, null, 2)}\n`;

  try {
    await mkdir(dataDirectory, { recursive: true });
    await writeFile(temporaryFile, fileContents, "utf8");
    await rename(temporaryFile, settingsFile);
  } catch (error) {
    await unlink(temporaryFile).catch(() => undefined);
    throw new LocalSettingsStoreError(
      error instanceof Error ? error.message : "Unable to save local settings.",
      "Settings could not be saved. Check that Flowent can write to your home folder.",
      "storage",
    );
  }

  return validationResult.settings;
}
