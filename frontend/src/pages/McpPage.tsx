import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import useSWR from "swr";
import { Plus, RefreshCw, Search, Unplug, X } from "lucide-react";
import { toast } from "sonner";
import {
  createMcpServer,
  deleteMcpServer,
  fetchMcpState,
  loginMcpServer,
  logoutMcpServer,
  previewMcpPrompt,
  refreshAllMcpServers,
  refreshMcpServer,
  updateMcpServer,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageScaffold, SoftPanel } from "@/components/layout/PageScaffold";
import {
  WorkspaceCommandDialog,
  WorkspaceDialogField,
} from "@/components/WorkspaceCommandDialog";
import { cn } from "@/lib/utils";
import type {
  MCPActivityRecord,
  MCPServerConfig,
  MCPServerRecord,
} from "@/types";

type DetailTab = "overview" | "capabilities" | "activity";
type CapabilityTab = "tools" | "resources" | "resource_templates" | "prompts";
type ServerStatusFilter =
  | "all"
  | "connected"
  | "auth_required"
  | "error"
  | "disabled"
  | "connecting";
type ActivityFilter =
  | "all"
  | "refresh"
  | "auth"
  | "tool"
  | "resource"
  | "prompt";

const EMPTY_SERVER_DRAFT: MCPServerConfig = {
  name: "",
  transport: "stdio",
  enabled: true,
  required: false,
  startup_timeout_sec: 10,
  tool_timeout_sec: 30,
  enabled_tools: [],
  disabled_tools: [],
  scopes: [],
  oauth_resource: "",
  launcher: "",
  command: "",
  args: [],
  env: {},
  env_vars: [],
  cwd: "",
  url: "",
  bearer_token_env_var: "",
  http_headers: {},
  env_http_headers: [],
};

const SERVER_FILTER_OPTIONS: Array<{
  value: ServerStatusFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "connected", label: "Connected" },
  { value: "auth_required", label: "Auth Required" },
  { value: "error", label: "Error" },
  { value: "disabled", label: "Disabled" },
  { value: "connecting", label: "Connecting" },
];

const ACTIVITY_FILTER_OPTIONS: Array<{
  value: ActivityFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "refresh", label: "Refresh" },
  { value: "auth", label: "Auth" },
  { value: "tool", label: "Tool" },
  { value: "resource", label: "Resource" },
  { value: "prompt", label: "Prompt" },
];

function formatTimestamp(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Never";
  }
  const normalized = value > 1e12 ? value : value * 1000;
  return new Date(normalized).toLocaleString();
}

function formatSentenceCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAuthStatus(value: string) {
  switch (value) {
    case "unsupported":
      return "Unsupported";
    case "not_logged_in":
      return "Not logged in";
    case "logging_in":
      return "Logging in";
    case "connected":
      return "Connected";
    case "error":
      return "Error";
    default:
      return formatSentenceCase(value);
  }
}

function formatTimestampShort(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Never";
  }
  const normalized = value > 1e12 ? value : value * 1000;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(normalized));
}

function parseStringList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatStringList(values: string[]) {
  return values.join("\n");
}

function parseKeyValueMap(value: string) {
  const next: Record<string, string> = {};
  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const [key, ...rest] = trimmed.split(":");
    const normalizedKey = key.trim();
    const normalizedValue = rest.join(":").trim();
    if (!normalizedKey) {
      continue;
    }
    next[normalizedKey] = normalizedValue;
  }
  return next;
}

function formatKeyValueMap(values: Record<string, string>) {
  return Object.entries(values)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function statusLabel(status: string) {
  switch (status) {
    case "disabled":
      return "Disabled";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "auth_required":
      return "Auth required";
    case "error":
      return "Error";
    default:
      return status;
  }
}

function statusClassName(status: string) {
  switch (status) {
    case "connected":
      return "border-graph-status-running/18 bg-graph-status-running/[0.12] text-graph-status-running";
    case "auth_required":
      return "border-graph-status-idle/18 bg-graph-status-idle/[0.12] text-graph-status-idle";
    case "error":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "disabled":
      return "border-border bg-accent/20 text-muted-foreground";
    default:
      return "border-primary/20 bg-primary/[0.1] text-primary";
  }
}

function resultClassName(result: string) {
  switch (result) {
    case "success":
      return "border-graph-status-running/18 bg-graph-status-running/[0.12] text-graph-status-running";
    case "rejected":
      return "border-graph-status-idle/18 bg-graph-status-idle/[0.12] text-graph-status-idle";
    default:
      return "border-destructive/30 bg-destructive/10 text-destructive";
  }
}

const mcpEyebrowClass =
  "text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80";
const mcpMetricEyebrowClass =
  "text-[11px] uppercase tracking-[0.16em] text-muted-foreground/80";
const mcpPanelClass = "bg-card/20";
const mcpPanelTextClass = "text-[13px] text-muted-foreground";
const mcpMetricCardClass =
  "rounded-xl border border-border bg-card/20 px-4 py-4";
const mcpCardSurfaceClass =
  "rounded-xl border border-border bg-card/20 px-4 py-3";
const mcpReadonlyBlockClass =
  "min-h-[44px] whitespace-pre-wrap break-all rounded-xl border border-border bg-background/40 px-4 py-3 text-[12px] leading-6 text-foreground/80";
const mcpCodeBlockClass =
  "mt-4 max-h-48 overflow-auto rounded-xl border border-border bg-background/55 p-3 text-[11px] text-foreground/70";
const mcpOutlineButtonClass =
  "border-border bg-accent/20 text-foreground hover:bg-accent/35";
const mcpDestructiveButtonClass =
  "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/18";
const mcpTagClass =
  "rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]";
const mcpInfoIconClass =
  "flex size-14 items-center justify-center rounded-xl border border-border bg-accent/20 text-muted-foreground";
const mcpFilterPillBaseClass =
  "inline-flex h-8 items-center rounded-full border px-3 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
const mcpLineTabBaseClass =
  "inline-flex h-8 -mb-px items-center border-b-2 px-1 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function capabilitySummary(record: MCPServerRecord) {
  const counts = record.snapshot.capability_counts;
  return `${counts.tools} tools · ${counts.resources} resources · ${counts.prompts} prompts`;
}

function globalAvailabilityLabel(record: MCPServerRecord) {
  if (!record.visibility.active) {
    return null;
  }
  return "Global";
}

function stripShellQuotes(token: string) {
  if (token.length < 2) {
    return token;
  }
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

function tokenizeLauncher(value: string) {
  const matches = value.match(/'[^']*'|"[^"]*"|\S+/g);
  return (matches ?? []).map((token) => stripShellQuotes(token));
}

function normalizeSuggestedName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function deriveNameFromPackageToken(token: string) {
  const withoutVersion = token.startsWith("@")
    ? token.replace(/@[^/@]+$/u, "")
    : token.replace(/@[^/]+$/u, "");
  const segments = withoutVersion.split("/").filter(Boolean);
  return normalizeSuggestedName(segments.join("-"));
}

function deriveNameFromUrl(value: string) {
  try {
    const url = new URL(value);
    const candidates = url.hostname
      .replace(/^www\./u, "")
      .split(".")
      .filter((segment) => segment && !["mcp", "api"].includes(segment));
    return normalizeSuggestedName(candidates[0] ?? url.hostname);
  } catch {
    return "";
  }
}

function suggestServerName(input: string, tokens: string[]) {
  if (/^https?:\/\//u.test(input)) {
    return deriveNameFromUrl(input);
  }
  const runner = tokens[0] ?? "";
  const packageTokenStart =
    runner === "pnpm" || runner === "yarn" ? 2 : runner === "npm" ? 3 : 1;
  const packageToken = tokens
    .slice(packageTokenStart)
    .find((token) => token && !token.startsWith("-"));
  if (packageToken) {
    const derived = deriveNameFromPackageToken(packageToken);
    if (derived) {
      return derived;
    }
  }
  if (!runner) {
    return "";
  }
  return normalizeSuggestedName(runner.split("/").pop() ?? runner);
}

function buildQuickAddDraft(
  input: string,
  name: string,
): { draft: MCPServerConfig | null; error: string | null } {
  const trimmedInput = input.trim();
  const trimmedName = normalizeSuggestedName(name);
  if (!trimmedInput) {
    return { draft: null, error: "Enter a launcher command or URL." };
  }
  if (!trimmedName) {
    return { draft: null, error: "Quick Add needs a valid server name." };
  }
  if (/^https?:\/\//u.test(trimmedInput)) {
    try {
      const normalizedUrl = new URL(trimmedInput).toString();
      return {
        draft: {
          ...EMPTY_SERVER_DRAFT,
          name: trimmedName,
          transport: "streamable_http",
          launcher: trimmedInput,
          url: normalizedUrl,
        },
        error: null,
      };
    } catch {
      return { draft: null, error: "Quick Add URL is not valid." };
    }
  }
  const tokens = tokenizeLauncher(trimmedInput);
  if (tokens.length === 0) {
    return {
      draft: null,
      error: "Quick Add needs a single-line launcher command.",
    };
  }
  return {
    draft: {
      ...EMPTY_SERVER_DRAFT,
      name: trimmedName,
      transport: "stdio",
      launcher: trimmedInput,
      command: tokens[0],
      args: tokens.slice(1),
    },
    error: null,
  };
}

function parsedLauncherSummary(record: MCPServerRecord) {
  if (record.config.transport === "streamable_http") {
    return record.config.url.trim() || "No URL configured";
  }
  return [record.config.command, ...record.config.args]
    .filter(Boolean)
    .join(" ");
}

function buildPendingServerRecord(config: MCPServerConfig): MCPServerRecord {
  return {
    config,
    snapshot: {
      server_name: config.name,
      transport: config.transport,
      status: "connecting",
      auth_status:
        config.transport === "stdio" ? "unsupported" : "not_logged_in",
      last_auth_result: null,
      last_refresh_at: null,
      last_refresh_result: "never",
      last_error: null,
      tools: [],
      resources: [],
      resource_templates: [],
      prompts: [],
      capability_counts: {
        tools: 0,
        resources: 0,
        resource_templates: 0,
        prompts: 0,
      },
    },
    visibility: {
      scope: "global",
      active: false,
    },
    activity: [],
  };
}

function toolFilterSummary(record: MCPServerRecord) {
  if (record.config.enabled_tools.length > 0) {
    return `Enabled tools limited to ${record.config.enabled_tools.length} entries`;
  }
  if (record.config.disabled_tools.length > 0) {
    return `${record.config.disabled_tools.length} tools excluded`;
  }
  return "All discovered tools remain available";
}

function authActionLabel(record: MCPServerRecord) {
  if (record.config.transport === "stdio") {
    return "Auth N/A";
  }
  return record.snapshot.auth_status === "connected" ? "Logout" : "Login";
}

function authActionDisabled(record: MCPServerRecord) {
  return record.config.transport === "stdio";
}

function readonlyText(value: string | null | undefined, fallback = "Not set") {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed || fallback;
}

function readonlyList(values: string[], fallback = "None") {
  if (values.length === 0) {
    return fallback;
  }
  return values.join("\n");
}

function readonlyMapKeys(values: Record<string, string>, fallback = "None") {
  const keys = Object.keys(values);
  if (keys.length === 0) {
    return fallback;
  }
  return keys.join("\n");
}

function isAuthRelatedActivity(record: MCPActivityRecord) {
  if (record.action === "login" || record.action === "logout") {
    return true;
  }
  if (record.action !== "refresh") {
    return false;
  }
  const haystack = `${record.summary} ${record.target ?? ""}`.toLowerCase();
  return [
    "auth",
    "authentication",
    "oauth",
    "token",
    "bearer",
    "login",
    "logged out",
    "env var",
  ].some((keyword) => haystack.includes(keyword));
}

function activityFilterForRecord(record: MCPActivityRecord): ActivityFilter {
  if (isAuthRelatedActivity(record)) {
    return "auth";
  }
  switch (record.action) {
    case "refresh":
      return "refresh";
    case "login":
    case "logout":
      return "auth";
    case "tool_call":
      return "tool";
    case "resource_read":
      return "resource";
    case "prompt_get":
      return "prompt";
    default:
      return "all";
  }
}

function activityCategoryLabel(record: MCPActivityRecord) {
  switch (activityFilterForRecord(record)) {
    case "refresh":
      return "Refresh";
    case "auth":
      return "Auth";
    case "tool":
      return "Tool";
    case "resource":
      return "Resource";
    case "prompt":
      return "Prompt";
    default:
      return formatSentenceCase(record.action);
  }
}

function matchesServerFilter(
  record: MCPServerRecord,
  query: string,
  statusFilter: ServerStatusFilter,
) {
  if (statusFilter !== "all" && record.snapshot.status !== statusFilter) {
    return false;
  }
  if (!query) {
    return true;
  }
  const visibility = globalAvailabilityLabel(record);
  const haystack = [
    record.config.name,
    record.config.transport,
    statusLabel(record.snapshot.status),
    formatAuthStatus(record.snapshot.auth_status),
    capabilitySummary(record),
    visibility ?? "",
    record.snapshot.last_error ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function renderValueOrFallback(value: string, fallback = "Not set") {
  return value.trim() ? value : fallback;
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={mcpMetricCardClass}>
      <p className={mcpMetricEyebrowClass}>{label}</p>
      <p className="mt-2 text-[26px] font-medium text-foreground">{value}</p>
    </div>
  );
}

function FilterPill({
  active,
  label,
  onClick,
  variant = "pill",
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  variant?: "pill" | "tab";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        variant === "pill" ? mcpFilterPillBaseClass : mcpLineTabBaseClass,
        variant === "pill"
          ? active
            ? "border-border bg-card/30 text-foreground"
            : "border-transparent bg-card/20 text-muted-foreground hover:bg-accent/25 hover:text-foreground"
          : active
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function ReadonlyBlock({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className={mcpEyebrowClass}>{label}</p>
      <pre
        className={cn(mcpReadonlyBlockClass, mono && "font-mono text-[11px]")}
      >
        {value}
      </pre>
    </div>
  );
}

function MountToggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (nextValue: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border border-border bg-card/20 px-4 py-3 text-sm",
        disabled && "opacity-50",
      )}
    >
      <span className="text-foreground/85">{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={checked}
        className={cn(
          "relative h-6 w-11 rounded-full border transition-colors",
          checked
            ? "border-graph-status-running/28 bg-graph-status-running/15"
            : "border-border bg-accent/30",
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4.5 rounded-full transition-transform",
            checked
              ? "translate-x-[22px] bg-graph-status-running text-background"
              : "translate-x-0.5 bg-foreground/85",
          )}
        />
      </button>
    </label>
  );
}

function ServerDialog({
  draft,
  onChange,
  open,
  pending,
  title,
  onOpenChange,
  onSubmit,
}: {
  draft: MCPServerConfig;
  onChange: (draft: MCPServerConfig) => void;
  open: boolean;
  pending: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <WorkspaceCommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            className={mcpOutlineButtonClass}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={onSubmit}>
            {pending ? "Saving..." : "Save Server"}
          </Button>
        </div>
      }
      className="max-w-3xl"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <WorkspaceDialogField label="Name">
          <Input
            value={draft.name}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
            placeholder="filesystem"
          />
        </WorkspaceDialogField>
        <WorkspaceDialogField label="Transport">
          <Select
            value={draft.transport}
            onValueChange={(value) =>
              onChange({
                ...draft,
                transport: value as MCPServerConfig["transport"],
              })
            }
          >
            <SelectTrigger className="h-8 w-full rounded-md bg-background/50 text-sm text-foreground">
              <SelectValue placeholder="Select transport" />
            </SelectTrigger>
            <SelectContent className="rounded-xl bg-popover text-popover-foreground">
              <SelectItem value="stdio">stdio</SelectItem>
              <SelectItem value="streamable_http">streamable_http</SelectItem>
            </SelectContent>
          </Select>
        </WorkspaceDialogField>
      </div>

      <WorkspaceDialogField label="Launcher Command" hint="optional">
        <Input
          value={draft.launcher}
          onChange={(event) =>
            onChange({ ...draft, launcher: event.target.value })
          }
          placeholder={
            draft.transport === "streamable_http"
              ? "https://mcp.example.com"
              : "npx @playwright/mcp@latest"
          }
        />
      </WorkspaceDialogField>

      <div className="grid gap-4 md:grid-cols-2">
        <MountToggle
          checked={draft.enabled}
          label="Enabled"
          onChange={(enabled) => onChange({ ...draft, enabled })}
        />
        <MountToggle
          checked={draft.required}
          label="Required"
          onChange={(required) => onChange({ ...draft, required })}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <WorkspaceDialogField label="Startup Timeout" hint="seconds">
          <Input
            type="number"
            value={String(draft.startup_timeout_sec)}
            onChange={(event) =>
              onChange({
                ...draft,
                startup_timeout_sec: Number(event.target.value) || 10,
              })
            }
          />
        </WorkspaceDialogField>
        <WorkspaceDialogField label="Tool Timeout" hint="seconds">
          <Input
            type="number"
            value={String(draft.tool_timeout_sec)}
            onChange={(event) =>
              onChange({
                ...draft,
                tool_timeout_sec: Number(event.target.value) || 30,
              })
            }
          />
        </WorkspaceDialogField>
      </div>

      {draft.transport === "stdio" ? (
        <>
          <WorkspaceDialogField label="Command">
            <Input
              value={draft.command}
              onChange={(event) =>
                onChange({ ...draft, command: event.target.value })
              }
              placeholder="npx"
            />
          </WorkspaceDialogField>
          <div className="grid gap-4 md:grid-cols-2">
            <WorkspaceDialogField label="Args" hint="one per line">
              <Textarea
                rows={5}
                value={formatStringList(draft.args)}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    args: parseStringList(event.target.value),
                  })
                }
              />
            </WorkspaceDialogField>
            <WorkspaceDialogField
              label="Env Vars"
              hint="one env var name per line"
            >
              <Textarea
                rows={5}
                value={formatStringList(draft.env_vars)}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    env_vars: parseStringList(event.target.value),
                  })
                }
              />
            </WorkspaceDialogField>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <WorkspaceDialogField label="Env" hint="KEY: value">
              <Textarea
                rows={5}
                value={formatKeyValueMap(draft.env)}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    env: parseKeyValueMap(event.target.value),
                  })
                }
              />
            </WorkspaceDialogField>
            <WorkspaceDialogField label="Cwd">
              <Input
                value={draft.cwd}
                onChange={(event) =>
                  onChange({ ...draft, cwd: event.target.value })
                }
                placeholder="/workspace/tools"
              />
            </WorkspaceDialogField>
          </div>
        </>
      ) : (
        <>
          <WorkspaceDialogField label="URL">
            <Input
              value={draft.url}
              onChange={(event) =>
                onChange({ ...draft, url: event.target.value })
              }
              placeholder="https://mcp.example.com"
            />
          </WorkspaceDialogField>
          <div className="grid gap-4 md:grid-cols-2">
            <WorkspaceDialogField label="Bearer Token Env Var">
              <Input
                value={draft.bearer_token_env_var}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    bearer_token_env_var: event.target.value,
                  })
                }
                placeholder="MCP_TOKEN"
              />
            </WorkspaceDialogField>
            <WorkspaceDialogField label="OAuth Resource">
              <Input
                value={draft.oauth_resource}
                onChange={(event) =>
                  onChange({ ...draft, oauth_resource: event.target.value })
                }
                placeholder="https://mcp.example.com"
              />
            </WorkspaceDialogField>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <WorkspaceDialogField label="HTTP Headers" hint="Header: value">
              <Textarea
                rows={5}
                value={formatKeyValueMap(draft.http_headers)}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    http_headers: parseKeyValueMap(event.target.value),
                  })
                }
              />
            </WorkspaceDialogField>
            <WorkspaceDialogField
              label="Env HTTP Headers"
              hint="one env var name per line"
            >
              <Textarea
                rows={5}
                value={formatStringList(draft.env_http_headers)}
                onChange={(event) =>
                  onChange({
                    ...draft,
                    env_http_headers: parseStringList(event.target.value),
                  })
                }
              />
            </WorkspaceDialogField>
          </div>
          <WorkspaceDialogField label="Scopes" hint="one scope per line">
            <Textarea
              rows={4}
              value={formatStringList(draft.scopes)}
              onChange={(event) =>
                onChange({
                  ...draft,
                  scopes: parseStringList(event.target.value),
                })
              }
            />
          </WorkspaceDialogField>
        </>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <WorkspaceDialogField
          label="Enabled Tools"
          hint="one raw tool name per line"
        >
          <Textarea
            rows={4}
            value={formatStringList(draft.enabled_tools)}
            onChange={(event) =>
              onChange({
                ...draft,
                enabled_tools: parseStringList(event.target.value),
              })
            }
          />
        </WorkspaceDialogField>
        <WorkspaceDialogField
          label="Disabled Tools"
          hint="one raw tool name per line"
        >
          <Textarea
            rows={4}
            value={formatStringList(draft.disabled_tools)}
            onChange={(event) =>
              onChange({
                ...draft,
                disabled_tools: parseStringList(event.target.value),
              })
            }
          />
        </WorkspaceDialogField>
      </div>
    </WorkspaceCommandDialog>
  );
}

export function McpPage() {
  const { data, error, isLoading, mutate } = useSWR("mcp-state", fetchMcpState);
  const [selectedServerName, setSelectedServerName] = useState<string | null>(
    null,
  );
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [capabilityTab, setCapabilityTab] = useState<CapabilityTab>("tools");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServerName, setEditingServerName] = useState<string | null>(
    null,
  );
  const [draft, setDraft] = useState<MCPServerConfig>(EMPTY_SERVER_DRAFT);
  const [pending, setPending] = useState(false);
  const [selectedPromptName, setSelectedPromptName] = useState<string | null>(
    null,
  );
  const [promptPreview, setPromptPreview] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [promptPreviewLoading, setPromptPreviewLoading] = useState(false);
  const [promptPreviewArgumentsText, setPromptPreviewArgumentsText] =
    useState("{}");
  const [serverSearch, setServerSearch] = useState("");
  const [serverStatusFilter, setServerStatusFilter] =
    useState<ServerStatusFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [quickAddInput, setQuickAddInput] = useState("");
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddNameDirty, setQuickAddNameDirty] = useState(false);
  const [quickAddPending, setQuickAddPending] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  const deferredServerSearch = useDeferredValue(
    serverSearch.trim().toLowerCase(),
  );
  const quickAddTokens = useMemo(
    () => tokenizeLauncher(quickAddInput.trim()),
    [quickAddInput],
  );
  const quickAddSuggestedName = useMemo(
    () => suggestServerName(quickAddInput.trim(), quickAddTokens),
    [quickAddInput, quickAddTokens],
  );
  const quickAddNameValue = quickAddNameDirty
    ? quickAddName
    : quickAddSuggestedName;
  const quickAddParse = useMemo(
    () => buildQuickAddDraft(quickAddInput, quickAddNameValue),
    [quickAddInput, quickAddNameValue],
  );
  const servers = useMemo(() => {
    const base = data?.servers ?? [];
    if (!quickAddPending || quickAddParse.draft === null) {
      return base;
    }
    if (
      base.some((record) => record.config.name === quickAddParse.draft?.name)
    ) {
      return base;
    }
    return [buildPendingServerRecord(quickAddParse.draft), ...base];
  }, [data, quickAddParse.draft, quickAddPending]);

  const filteredServers = useMemo(
    () =>
      servers.filter((record) =>
        matchesServerFilter(record, deferredServerSearch, serverStatusFilter),
      ),
    [deferredServerSearch, serverStatusFilter, servers],
  );

  const selectedServer = useMemo(
    () =>
      filteredServers.find(
        (record) => record.config.name === selectedServerName,
      ) ??
      filteredServers[0] ??
      null,
    [filteredServers, selectedServerName],
  );

  useEffect(() => {
    if (
      filteredServers.length > 0 &&
      !filteredServers.some(
        (record) => record.config.name === selectedServerName,
      )
    ) {
      setSelectedServerName(filteredServers[0]?.config.name ?? null);
    }
  }, [filteredServers, selectedServerName]);

  useEffect(() => {
    setSelectedPromptName(null);
    setPromptPreview(null);
    setPromptPreviewLoading(false);
    setPromptPreviewArgumentsText("{}");
    setActivityFilter("all");
  }, [selectedServer?.config.name]);

  useEffect(() => {
    if (quickAddNameDirty) {
      return;
    }
    setQuickAddName(quickAddSuggestedName);
  }, [quickAddNameDirty, quickAddSuggestedName]);

  const summaryCounts = useMemo(
    () => ({
      configured: servers.length,
      connected: servers.filter(
        (record) => record.snapshot.status === "connected",
      ).length,
      authRequired: servers.filter(
        (record) => record.snapshot.status === "auth_required",
      ).length,
      error: servers.filter((record) => record.snapshot.status === "error")
        .length,
    }),
    [servers],
  );

  const selectedPrompt = useMemo(
    () =>
      selectedServer?.snapshot.prompts.find(
        (prompt) => prompt.name === selectedPromptName,
      ) ?? null,
    [selectedPromptName, selectedServer],
  );

  const filteredActivity = useMemo(() => {
    if (!selectedServer) {
      return [];
    }
    return selectedServer.activity.filter((entry) => {
      if (activityFilter === "all") {
        return true;
      }
      return activityFilterForRecord(entry) === activityFilter;
    });
  }, [activityFilter, selectedServer]);

  const openCreateDialog = () => {
    setEditingServerName(null);
    setDraft(EMPTY_SERVER_DRAFT);
    setDialogOpen(true);
  };

  const focusQuickAdd = () => {
    document.getElementById("mcp-quick-add-input")?.focus();
  };

  const openEditDialog = (record: MCPServerRecord) => {
    setEditingServerName(record.config.name);
    setDraft(record.config);
    setDialogOpen(true);
  };

  const clearServerFilters = () => {
    setServerSearch("");
    setServerStatusFilter("all");
  };

  const handleRefreshAll = async () => {
    try {
      await refreshAllMcpServers();
      await mutate();
      toast.success("MCP servers refreshed");
    } catch (refreshError) {
      toast.error(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to refresh MCP servers",
      );
    }
  };

  const handleSaveServer = async () => {
    setPending(true);
    try {
      if (editingServerName) {
        await updateMcpServer(editingServerName, draft);
      } else {
        await createMcpServer(draft);
      }
      await mutate();
      setSelectedServerName(draft.name.trim());
      setDialogOpen(false);
      toast.success("MCP server saved");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save MCP server",
      );
    } finally {
      setPending(false);
    }
  };

  const handleQuickAdd = async () => {
    if (quickAddParse.error || quickAddParse.draft === null) {
      setQuickAddError(quickAddParse.error ?? "Quick Add is not ready yet.");
      return;
    }
    setQuickAddPending(true);
    setQuickAddError(null);
    setSelectedServerName(quickAddParse.draft.name);
    try {
      await createMcpServer(quickAddParse.draft);
      await mutate();
      setSelectedServerName(quickAddParse.draft.name);
      setQuickAddInput("");
      setQuickAddName("");
      setQuickAddNameDirty(false);
      toast.success("MCP server added");
    } catch (quickAddFailure) {
      await mutate();
      setSelectedServerName(quickAddParse.draft.name);
      setQuickAddError(
        quickAddFailure instanceof Error
          ? quickAddFailure.message
          : "Failed to add MCP server",
      );
      toast.error(
        quickAddFailure instanceof Error
          ? quickAddFailure.message
          : "Failed to add MCP server",
      );
    } finally {
      setQuickAddPending(false);
    }
  };

  const handleDeleteServer = async (serverName: string) => {
    try {
      await deleteMcpServer(serverName);
      await mutate();
      toast.success("MCP server removed");
    } catch (deleteError) {
      toast.error(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to remove MCP server",
      );
    }
  };

  const handleToggleEnabled = async (record: MCPServerRecord) => {
    try {
      await updateMcpServer(record.config.name, {
        ...record.config,
        enabled: !record.config.enabled,
      });
      await mutate();
    } catch (toggleError) {
      toast.error(
        toggleError instanceof Error
          ? toggleError.message
          : "Failed to update MCP server",
      );
    }
  };

  const handleRefreshServer = async (serverName: string) => {
    try {
      await refreshMcpServer(serverName);
      await mutate();
      toast.success("Server refreshed");
    } catch (refreshError) {
      toast.error(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to refresh server",
      );
    }
  };

  const handleLogin = async (serverName: string) => {
    try {
      await loginMcpServer(serverName);
      await mutate();
      toast.success("Server refreshed after login");
    } catch (loginError) {
      toast.error(
        loginError instanceof Error
          ? loginError.message
          : "Failed to login MCP server",
      );
    }
  };

  const handleLogout = async (serverName: string) => {
    try {
      await logoutMcpServer(serverName);
      await mutate();
      toast.success("Logout request sent");
    } catch (logoutError) {
      toast.error(
        logoutError instanceof Error
          ? logoutError.message
          : "Failed to logout MCP server",
      );
    }
  };

  const handlePreviewPrompt = async (
    serverName: string,
    promptName: string,
    argumentsPayload: Record<string, unknown> = {},
  ) => {
    setPromptPreviewLoading(true);
    try {
      const preview = await previewMcpPrompt(
        serverName,
        promptName,
        argumentsPayload,
      );
      setPromptPreview(preview);
    } catch (previewError) {
      setPromptPreview({
        error:
          previewError instanceof Error
            ? previewError.message
            : "Failed to preview prompt",
      });
    } finally {
      setPromptPreviewLoading(false);
    }
  };

  const handleSelectPrompt = (serverName: string, promptName: string) => {
    setSelectedPromptName(promptName);
    const promptDefinition =
      selectedServer?.snapshot.prompts.find(
        (prompt) => prompt.name === promptName,
      ) ?? null;
    const initialArguments = Object.fromEntries(
      (promptDefinition?.arguments ?? [])
        .map((argument) => argument.name)
        .filter(
          (name): name is string => typeof name === "string" && name.length > 0,
        )
        .map((name) => [name, ""]),
    );
    setPromptPreviewArgumentsText(JSON.stringify(initialArguments, null, 2));
    void handlePreviewPrompt(serverName, promptName, initialArguments);
  };

  const quickAddPanel = (
    <SoftPanel className={cn("mt-4", mcpPanelClass)}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={mcpEyebrowClass}>Quick Add</p>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-muted-foreground">
              Paste a single-line launcher such as{" "}
              <span className="font-mono text-foreground/80">
                npx @playwright/mcp@latest
              </span>{" "}
              or a single{" "}
              <span className="font-mono text-foreground/80">
                streamable_http
              </span>{" "}
              URL. Connected servers become visible to every agent
              automatically.
            </p>
          </div>
          {quickAddParse.draft ? (
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]",
                statusClassName(
                  quickAddParse.draft.transport === "streamable_http"
                    ? "connected"
                    : "connecting",
                ),
              )}
            >
              {quickAddParse.draft.transport === "streamable_http"
                ? "URL"
                : "Launcher"}
            </span>
          ) : null}
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
          <WorkspaceDialogField label="Launcher or URL">
            <Input
              id="mcp-quick-add-input"
              value={quickAddInput}
              onChange={(event) => {
                setQuickAddInput(event.target.value);
                setQuickAddError(null);
              }}
              placeholder="npx @playwright/mcp@latest"
            />
          </WorkspaceDialogField>
          <WorkspaceDialogField label="Name">
            <Input
              value={quickAddNameValue}
              onChange={(event) => {
                setQuickAddNameDirty(true);
                setQuickAddName(event.target.value);
                setQuickAddError(null);
              }}
              placeholder="playwright-mcp"
            />
          </WorkspaceDialogField>
        </div>
        {quickAddParse.draft ? (
          <div className="grid gap-3 xl:grid-cols-3">
            <SoftPanel className={mcpPanelClass}>
              <p className={mcpEyebrowClass}>Transport</p>
              <p className="mt-2 text-[14px] font-medium text-foreground">
                {quickAddParse.draft.transport}
              </p>
            </SoftPanel>
            <SoftPanel className={mcpPanelClass}>
              <p className={mcpEyebrowClass}>Parsed Name</p>
              <p className="mt-2 text-[14px] font-medium text-foreground">
                {quickAddParse.draft.name}
              </p>
            </SoftPanel>
            <SoftPanel className={cn("xl:col-span-1", mcpPanelClass)}>
              <p className={mcpEyebrowClass}>Parsed Result</p>
              <p className="mt-2 break-all font-mono text-[12px] text-foreground/80">
                {quickAddParse.draft.transport === "streamable_http"
                  ? quickAddParse.draft.url
                  : [
                      quickAddParse.draft.command,
                      ...quickAddParse.draft.args,
                    ].join(" ")}
              </p>
            </SoftPanel>
          </div>
        ) : null}
        {quickAddError || (quickAddInput.trim() && quickAddParse.error) ? (
          <p className="text-[13px] text-destructive">
            {quickAddError ?? quickAddParse.error}
          </p>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            Package-runner launchers download and start in one path. If first
            startup is slow, the server will stay visible as Connecting until
            refresh finishes.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={quickAddPending || quickAddParse.draft === null}
            onClick={() => void handleQuickAdd()}
          >
            {quickAddPending ? "Adding..." : "Quick Add"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className={mcpOutlineButtonClass}
            onClick={openCreateDialog}
          >
            Advanced Add
          </Button>
        </div>
      </div>
    </SoftPanel>
  );

  return (
    <PageScaffold>
      <div className="flex h-full min-h-0 flex-col px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-medium tracking-[-0.04em] text-foreground">
              MCP
            </h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-muted-foreground">
              Quickly connect external MCP servers, inspect capabilities, and
              review recent MCP activity from one global control plane.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className={mcpOutlineButtonClass}
              onClick={handleRefreshAll}
            >
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              className={mcpOutlineButtonClass}
              onClick={focusQuickAdd}
            >
              <Plus className="mr-2 size-4" />
              Quick Add
            </Button>
            <Button type="button" onClick={openCreateDialog}>
              <Plus className="mr-2 size-4" />
              Advanced Add
            </Button>
          </div>
        </div>

        <div className="mt-6 min-h-0 flex-1 overflow-hidden">
          {isLoading ? (
            <div className="grid h-full gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 rounded-xl border border-border bg-card/20 skeleton-shimmer"
                  />
                ))}
                <p className="px-2 text-[13px] text-muted-foreground">
                  Loading MCP servers...
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card/20 skeleton-shimmer" />
            </div>
          ) : error ? (
            <SoftPanel className="flex h-full items-center justify-center text-center text-muted-foreground">
              Failed to load MCP state.
            </SoftPanel>
          ) : servers.length === 0 ? (
            <div className="flex h-full min-h-0 flex-col">
              {quickAddPanel}
              <SoftPanel className="mt-4 flex h-full flex-col items-center justify-center text-center">
                <div className={mcpInfoIconClass}>
                  <Unplug className="size-6" />
                </div>
                <h2 className="mt-5 text-[16px] font-medium text-foreground">
                  No MCP servers
                </h2>
                <p className="mt-2 max-w-lg text-[13px] leading-6 text-muted-foreground">
                  Start with Quick Add to connect one server that every agent
                  can use after the first successful refresh.
                </p>
              </SoftPanel>
            </div>
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <SoftPanel>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard
                    label="Configured"
                    value={summaryCounts.configured}
                  />
                  <SummaryCard
                    label="Connected"
                    value={summaryCounts.connected}
                  />
                  <SummaryCard
                    label="Auth Required"
                    value={summaryCounts.authRequired}
                  />
                  <SummaryCard label="Error" value={summaryCounts.error} />
                </div>
              </SoftPanel>

              {quickAddPanel}

              <SoftPanel className="mt-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative w-full max-w-xl">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
                    <Input
                      value={serverSearch}
                      onChange={(event) =>
                        startTransition(() =>
                          setServerSearch(event.target.value),
                        )
                      }
                      placeholder="Search MCP servers"
                      className="pl-10"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SERVER_FILTER_OPTIONS.map((option) => (
                      <FilterPill
                        key={option.value}
                        active={serverStatusFilter === option.value}
                        label={option.label}
                        onClick={() => setServerStatusFilter(option.value)}
                      />
                    ))}
                  </div>
                </div>
              </SoftPanel>

              <div className="mt-4 min-h-0 flex-1 overflow-hidden">
                {filteredServers.length === 0 ? (
                  <SoftPanel className="flex h-full flex-col items-center justify-center text-center">
                    <div className={mcpInfoIconClass}>
                      <Search className="size-6" />
                    </div>
                    <h2 className="mt-5 text-[16px] font-medium text-foreground">
                      No matching MCP servers
                    </h2>
                    <p className="mt-2 max-w-lg text-[13px] leading-6 text-muted-foreground">
                      Adjust the search term or status filter to see matching
                      servers again.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn("mt-5", mcpOutlineButtonClass)}
                      onClick={clearServerFilters}
                    >
                      <X className="mr-2 size-4" />
                      Clear Filters
                    </Button>
                  </SoftPanel>
                ) : (
                  <div className="grid h-full gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                    <div className="min-h-0 overflow-y-auto pr-1 scrollbar-none">
                      <div className="space-y-3">
                        {filteredServers.map((record) => {
                          const isSelected =
                            selectedServer?.config.name === record.config.name;
                          const visibility = globalAvailabilityLabel(record);
                          return (
                            <div
                              key={record.config.name}
                              className={cn(
                                "rounded-xl border p-4 transition-colors",
                                isSelected
                                  ? "border-border bg-accent/20"
                                  : "border-border bg-card/20 hover:bg-accent/20",
                              )}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    startTransition(() =>
                                      setSelectedServerName(record.config.name),
                                    )
                                  }
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-[14px] font-medium text-foreground">
                                      {record.config.name}
                                    </p>
                                    {record.config.required ? (
                                      <span className="rounded-full border border-graph-status-idle/18 bg-graph-status-idle/[0.12] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-graph-status-idle">
                                        required
                                      </span>
                                    ) : null}
                                    {visibility ? (
                                      <span className="rounded-full border border-primary/20 bg-primary/[0.1] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-primary">
                                        {visibility}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-3 grid gap-1.5 text-[12px] text-muted-foreground">
                                    <p>Transport {record.config.transport}</p>
                                    <p>
                                      Status{" "}
                                      {statusLabel(record.snapshot.status)}
                                    </p>
                                    <p>
                                      Auth{" "}
                                      {formatAuthStatus(
                                        record.snapshot.auth_status,
                                      )}
                                    </p>
                                    <p>{capabilitySummary(record)}</p>
                                    {visibility ? <p>{visibility}</p> : null}
                                  </div>
                                  {record.snapshot.last_error ? (
                                    <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-destructive">
                                      {record.snapshot.last_error}
                                    </p>
                                  ) : null}
                                </button>
                                <div className="flex shrink-0 flex-col items-end gap-1.5">
                                  <span
                                    className={cn(
                                      "rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em]",
                                      statusClassName(record.snapshot.status),
                                    )}
                                  >
                                    {statusLabel(record.snapshot.status)}
                                  </span>
                                  <div className="flex flex-wrap justify-end gap-1.5">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className={cn(
                                        "h-7 px-2 text-[11px]",
                                        mcpOutlineButtonClass,
                                      )}
                                      onClick={() =>
                                        handleToggleEnabled(record)
                                      }
                                    >
                                      {record.config.enabled
                                        ? "Disable"
                                        : "Enable"}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      disabled={authActionDisabled(record)}
                                      className={cn(
                                        "h-7 px-2 text-[11px]",
                                        mcpOutlineButtonClass,
                                      )}
                                      onClick={() =>
                                        record.snapshot.auth_status ===
                                        "connected"
                                          ? handleLogout(record.config.name)
                                          : handleLogin(record.config.name)
                                      }
                                    >
                                      {authActionLabel(record)}
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className={cn(
                                        "h-7 px-2 text-[11px]",
                                        mcpOutlineButtonClass,
                                      )}
                                      onClick={() => openEditDialog(record)}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className={cn(
                                        "h-7 px-2 text-[11px]",
                                        mcpOutlineButtonClass,
                                      )}
                                      onClick={() =>
                                        handleRefreshServer(record.config.name)
                                      }
                                    >
                                      Refresh
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className={cn(
                                        "h-7 px-2 text-[11px]",
                                        mcpDestructiveButtonClass,
                                      )}
                                      onClick={() =>
                                        handleDeleteServer(record.config.name)
                                      }
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="min-h-0 overflow-hidden">
                      {selectedServer ? (
                        <SoftPanel className="flex h-full min-h-0 flex-col">
                          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-3">
                                <h2 className="text-[18px] font-medium text-foreground">
                                  {selectedServer.config.name}
                                </h2>
                                <span
                                  className={cn(
                                    mcpTagClass,
                                    statusClassName(
                                      selectedServer.snapshot.status,
                                    ),
                                  )}
                                >
                                  {statusLabel(selectedServer.snapshot.status)}
                                </span>
                                {globalAvailabilityLabel(selectedServer) ? (
                                  <span className="rounded-full border border-primary/20 bg-primary/[0.1] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-primary">
                                    {globalAvailabilityLabel(selectedServer)}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-2 text-[13px] text-muted-foreground">
                                {selectedServer.config.transport} · Auth{" "}
                                {formatAuthStatus(
                                  selectedServer.snapshot.auth_status,
                                )}
                              </p>
                              {selectedServer.snapshot.last_error ? (
                                <p className="mt-2 max-w-3xl text-[13px] leading-6 text-destructive">
                                  {selectedServer.snapshot.last_error}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className={mcpOutlineButtonClass}
                                onClick={() =>
                                  handleToggleEnabled(selectedServer)
                                }
                              >
                                {selectedServer.config.enabled
                                  ? "Disable"
                                  : "Enable"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={authActionDisabled(selectedServer)}
                                className={mcpOutlineButtonClass}
                                onClick={() =>
                                  selectedServer.snapshot.auth_status ===
                                  "connected"
                                    ? handleLogout(selectedServer.config.name)
                                    : handleLogin(selectedServer.config.name)
                                }
                              >
                                {authActionLabel(selectedServer)}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className={mcpOutlineButtonClass}
                                onClick={() => openEditDialog(selectedServer)}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className={mcpOutlineButtonClass}
                                onClick={() =>
                                  handleRefreshServer(
                                    selectedServer.config.name,
                                  )
                                }
                              >
                                Refresh
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className={mcpDestructiveButtonClass}
                                onClick={() =>
                                  handleDeleteServer(selectedServer.config.name)
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-4 border-b border-border">
                            {(
                              [
                                "overview",
                                "capabilities",
                                "activity",
                              ] as DetailTab[]
                            ).map((tab) => (
                              <FilterPill
                                key={tab}
                                active={detailTab === tab}
                                label={formatSentenceCase(tab)}
                                onClick={() => setDetailTab(tab)}
                                variant="tab"
                              />
                            ))}
                          </div>

                          <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-none">
                            {detailTab === "overview" ? (
                              <div className="grid gap-4 xl:grid-cols-2">
                                <SoftPanel className={mcpPanelClass}>
                                  <p className={mcpEyebrowClass}>Status</p>
                                  <p className="mt-3 text-[22px] font-medium text-foreground">
                                    {statusLabel(
                                      selectedServer.snapshot.status,
                                    )}
                                  </p>
                                  <p className="mt-2 text-[13px] text-muted-foreground">
                                    Auth{" "}
                                    {formatAuthStatus(
                                      selectedServer.snapshot.auth_status,
                                    )}
                                  </p>
                                </SoftPanel>

                                <SoftPanel className={mcpPanelClass}>
                                  <p className={mcpEyebrowClass}>Visibility</p>
                                  <p className="mt-3 text-[22px] font-medium text-foreground">
                                    {globalAvailabilityLabel(selectedServer) ??
                                      "Pending"}
                                  </p>
                                  <p className="mt-2 text-[13px] text-muted-foreground">
                                    Connected servers become available to all
                                    agents without per-tab setup.
                                  </p>
                                </SoftPanel>

                                <SoftPanel className={mcpPanelClass}>
                                  <p className={mcpEyebrowClass}>
                                    Last Refresh
                                  </p>
                                  <p className="mt-3 text-[15px] font-medium text-foreground">
                                    {formatTimestamp(
                                      selectedServer.snapshot.last_refresh_at,
                                    )}
                                  </p>
                                  <p className="mt-2 text-[13px] text-muted-foreground">
                                    Result{" "}
                                    {formatSentenceCase(
                                      selectedServer.snapshot
                                        .last_refresh_result,
                                    )}
                                  </p>
                                </SoftPanel>

                                <SoftPanel className={mcpPanelClass}>
                                  <p className={mcpEyebrowClass}>Timeouts</p>
                                  <p className="mt-3 text-[15px] font-medium text-foreground">
                                    Startup{" "}
                                    {selectedServer.config.startup_timeout_sec}s
                                  </p>
                                  <p className="mt-2 text-[13px] text-muted-foreground">
                                    Tool{" "}
                                    {selectedServer.config.tool_timeout_sec}s
                                  </p>
                                </SoftPanel>

                                <SoftPanel className={mcpPanelClass}>
                                  <p className={mcpEyebrowClass}>
                                    Tool Filters
                                  </p>
                                  <p className="mt-3 text-[15px] font-medium text-foreground">
                                    {toolFilterSummary(selectedServer)}
                                  </p>
                                  <p className="mt-2 text-[13px] text-muted-foreground">
                                    Enabled{" "}
                                    {selectedServer.config.enabled_tools.length}
                                    {" · "}Disabled{" "}
                                    {
                                      selectedServer.config.disabled_tools
                                        .length
                                    }
                                  </p>
                                </SoftPanel>

                                <SoftPanel
                                  className={cn("xl:col-span-2", mcpPanelClass)}
                                >
                                  <p className={mcpEyebrowClass}>
                                    Capability Summary
                                  </p>
                                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                    {Object.entries(
                                      selectedServer.snapshot.capability_counts,
                                    ).map(([key, value]) => (
                                      <div
                                        key={key}
                                        className={mcpCardSurfaceClass}
                                      >
                                        <p className={mcpEyebrowClass}>
                                          {key.replaceAll("_", " ")}
                                        </p>
                                        <p className="mt-2 text-xl font-medium text-foreground">
                                          {value}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </SoftPanel>

                                {selectedServer.config.launcher ? (
                                  <SoftPanel
                                    className={cn(
                                      "xl:col-span-2",
                                      mcpPanelClass,
                                    )}
                                  >
                                    <div className="grid gap-4 xl:grid-cols-2">
                                      <ReadonlyBlock
                                        label="Original Launcher"
                                        value={readonlyText(
                                          selectedServer.config.launcher,
                                        )}
                                        mono
                                      />
                                      <ReadonlyBlock
                                        label="Parsed Result"
                                        value={parsedLauncherSummary(
                                          selectedServer,
                                        )}
                                        mono
                                      />
                                    </div>
                                  </SoftPanel>
                                ) : null}

                                {selectedServer.config.transport === "stdio" ? (
                                  <SoftPanel
                                    className={cn(
                                      "xl:col-span-2",
                                      mcpPanelClass,
                                    )}
                                  >
                                    <div className="grid gap-4 xl:grid-cols-2">
                                      <ReadonlyBlock
                                        label="Command"
                                        value={readonlyText(
                                          selectedServer.config.command,
                                        )}
                                        mono
                                      />
                                      <ReadonlyBlock
                                        label="Cwd"
                                        value={readonlyText(
                                          selectedServer.config.cwd,
                                        )}
                                        mono
                                      />
                                      <ReadonlyBlock
                                        label="Args"
                                        value={readonlyList(
                                          selectedServer.config.args,
                                        )}
                                        mono
                                      />
                                      <ReadonlyBlock
                                        label="Env Vars"
                                        value={readonlyList(
                                          selectedServer.config.env_vars,
                                        )}
                                        mono
                                      />
                                    </div>
                                  </SoftPanel>
                                ) : (
                                  <SoftPanel
                                    className={cn(
                                      "xl:col-span-2",
                                      mcpPanelClass,
                                    )}
                                  >
                                    <div className="grid gap-4 xl:grid-cols-2">
                                      <ReadonlyBlock
                                        label="URL"
                                        value={readonlyText(
                                          selectedServer.config.url,
                                        )}
                                        mono
                                      />
                                      <ReadonlyBlock
                                        label="OAuth Resource"
                                        value={readonlyText(
                                          selectedServer.config.oauth_resource,
                                        )}
                                        mono
                                      />
                                      <ReadonlyBlock
                                        label="Bearer Token Env Var"
                                        value={readonlyText(
                                          selectedServer.config
                                            .bearer_token_env_var,
                                        )}
                                        mono
                                      />
                                      <ReadonlyBlock
                                        label="Scopes"
                                        value={readonlyList(
                                          selectedServer.config.scopes,
                                        )}
                                        mono
                                      />
                                      <ReadonlyBlock
                                        label="HTTP Headers"
                                        value={readonlyMapKeys(
                                          selectedServer.config.http_headers,
                                        )}
                                        mono
                                      />
                                      <ReadonlyBlock
                                        label="Env HTTP Headers"
                                        value={readonlyList(
                                          selectedServer.config
                                            .env_http_headers,
                                        )}
                                        mono
                                      />
                                    </div>
                                    <div
                                      className={cn(
                                        "mt-4",
                                        mcpCardSurfaceClass,
                                      )}
                                    >
                                      <p className={mcpEyebrowClass}>
                                        Recent Auth Result
                                      </p>
                                      <p className="mt-2 text-[14px] font-medium text-foreground">
                                        {renderValueOrFallback(
                                          selectedServer.snapshot
                                            .last_auth_result ?? "",
                                          "No login action yet",
                                        )}
                                      </p>
                                      <p className="mt-2 text-[13px] text-muted-foreground">
                                        Current auth status{" "}
                                        {formatAuthStatus(
                                          selectedServer.snapshot.auth_status,
                                        )}
                                      </p>
                                    </div>
                                  </SoftPanel>
                                )}
                              </div>
                            ) : null}

                            {detailTab === "capabilities" ? (
                              <div className="space-y-4">
                                <div className="flex flex-wrap gap-4 border-b border-border">
                                  {(
                                    [
                                      "tools",
                                      "resources",
                                      "resource_templates",
                                      "prompts",
                                    ] as CapabilityTab[]
                                  ).map((tab) => (
                                    <FilterPill
                                      key={tab}
                                      active={capabilityTab === tab}
                                      label={
                                        tab === "resource_templates"
                                          ? "Resource Templates"
                                          : formatSentenceCase(tab)
                                      }
                                      onClick={() => setCapabilityTab(tab)}
                                      variant="tab"
                                    />
                                  ))}
                                </div>

                                {capabilityTab === "tools" ? (
                                  <div className="space-y-3">
                                    {selectedServer.snapshot.tools.length ===
                                    0 ? (
                                      <SoftPanel
                                        className={cn(
                                          mcpPanelClass,
                                          mcpPanelTextClass,
                                        )}
                                      >
                                        No tools discovered.
                                      </SoftPanel>
                                    ) : (
                                      selectedServer.snapshot.tools.map(
                                        (tool) => (
                                          <SoftPanel
                                            key={tool.fully_qualified_id}
                                            className={mcpPanelClass}
                                          >
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                              <div>
                                                <p className="font-mono text-[13px] text-foreground">
                                                  {tool.tool_name}
                                                </p>
                                                {tool.title ? (
                                                  <p className="mt-2 text-[13px] text-foreground/70">
                                                    {tool.title}
                                                  </p>
                                                ) : null}
                                                <p className="mt-1 text-[12px] text-muted-foreground">
                                                  {tool.fully_qualified_id}
                                                </p>
                                              </div>
                                              <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em]">
                                                {tool.read_only_hint ? (
                                                  <span className="rounded-full border border-primary/20 bg-primary/[0.1] px-2 py-1 text-primary">
                                                    readOnly
                                                  </span>
                                                ) : null}
                                                {tool.destructive_hint ? (
                                                  <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-destructive">
                                                    destructive
                                                  </span>
                                                ) : null}
                                                {tool.open_world_hint ? (
                                                  <span className="rounded-full border border-graph-status-idle/18 bg-graph-status-idle/[0.12] px-2 py-1 text-graph-status-idle">
                                                    openWorld
                                                  </span>
                                                ) : null}
                                              </div>
                                            </div>
                                            {tool.description ? (
                                              <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
                                                {tool.description}
                                              </p>
                                            ) : null}
                                            <pre className={mcpCodeBlockClass}>
                                              {JSON.stringify(
                                                tool.parameters ?? {},
                                                null,
                                                2,
                                              )}
                                            </pre>
                                          </SoftPanel>
                                        ),
                                      )
                                    )}
                                  </div>
                                ) : null}

                                {capabilityTab === "resources" ? (
                                  <div className="space-y-3">
                                    {selectedServer.snapshot.resources
                                      .length === 0 ? (
                                      <SoftPanel
                                        className={cn(
                                          mcpPanelClass,
                                          mcpPanelTextClass,
                                        )}
                                      >
                                        No resources discovered.
                                      </SoftPanel>
                                    ) : (
                                      selectedServer.snapshot.resources.map(
                                        (resource) => (
                                          <SoftPanel
                                            key={resource.uri}
                                            className={mcpPanelClass}
                                          >
                                            <p className="text-[14px] font-medium text-foreground">
                                              {resource.name}
                                            </p>
                                            <p className="mt-1 font-mono text-[12px] text-muted-foreground">
                                              {resource.uri}
                                            </p>
                                            <p className="mt-3 text-[13px] text-foreground/70">
                                              {resource.mime_type ??
                                                "Unknown MIME"}
                                            </p>
                                            {resource.description ? (
                                              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                                                {resource.description}
                                              </p>
                                            ) : null}
                                          </SoftPanel>
                                        ),
                                      )
                                    )}
                                  </div>
                                ) : null}

                                {capabilityTab === "resource_templates" ? (
                                  <div className="space-y-3">
                                    {selectedServer.snapshot.resource_templates
                                      .length === 0 ? (
                                      <SoftPanel
                                        className={cn(
                                          mcpPanelClass,
                                          mcpPanelTextClass,
                                        )}
                                      >
                                        No resource templates discovered.
                                      </SoftPanel>
                                    ) : (
                                      selectedServer.snapshot.resource_templates.map(
                                        (template) => (
                                          <SoftPanel
                                            key={template.uri_template}
                                            className={mcpPanelClass}
                                          >
                                            <p className="text-[14px] font-medium text-foreground">
                                              {template.name}
                                            </p>
                                            <p className="mt-1 font-mono text-[12px] text-muted-foreground">
                                              {template.uri_template}
                                            </p>
                                            {template.description ? (
                                              <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
                                                {template.description}
                                              </p>
                                            ) : null}
                                          </SoftPanel>
                                        ),
                                      )
                                    )}
                                  </div>
                                ) : null}

                                {capabilityTab === "prompts" ? (
                                  <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                                    <div className="space-y-3">
                                      {selectedServer.snapshot.prompts
                                        .length === 0 ? (
                                        <SoftPanel
                                          className={cn(
                                            mcpPanelClass,
                                            mcpPanelTextClass,
                                          )}
                                        >
                                          No prompts discovered.
                                        </SoftPanel>
                                      ) : (
                                        selectedServer.snapshot.prompts.map(
                                          (prompt) => (
                                            <button
                                              key={prompt.name}
                                              type="button"
                                              onClick={() =>
                                                handleSelectPrompt(
                                                  selectedServer.config.name,
                                                  prompt.name,
                                                )
                                              }
                                              className={cn(
                                                "block w-full rounded-xl border border-border bg-card/20 p-5 text-left transition-colors",
                                                selectedPromptName ===
                                                  prompt.name
                                                  ? "border-border bg-accent/20"
                                                  : "hover:bg-accent/20",
                                              )}
                                            >
                                              <p className="text-[14px] font-medium text-foreground">
                                                {prompt.name}
                                              </p>
                                              {prompt.description ? (
                                                <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                                                  {prompt.description}
                                                </p>
                                              ) : null}
                                              <pre
                                                className={mcpCodeBlockClass}
                                              >
                                                {JSON.stringify(
                                                  prompt.arguments ?? [],
                                                  null,
                                                  2,
                                                )}
                                              </pre>
                                            </button>
                                          ),
                                        )
                                      )}
                                    </div>
                                    <SoftPanel className={mcpPanelClass}>
                                      <p className={mcpEyebrowClass}>
                                        Prompt Preview
                                      </p>
                                      {selectedPromptName ? (
                                        <>
                                          <p className="mt-3 text-[15px] font-medium text-foreground">
                                            {selectedPromptName}
                                          </p>
                                          <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80">
                                            Arguments
                                          </p>
                                          <Textarea
                                            value={promptPreviewArgumentsText}
                                            onChange={(event) =>
                                              setPromptPreviewArgumentsText(
                                                event.target.value,
                                              )
                                            }
                                            className="mt-2 min-h-[120px] bg-background/50 font-mono text-[11px] text-foreground/80"
                                          />
                                          <div className="mt-3 flex items-center justify-between gap-3">
                                            <p className="text-[12px] text-muted-foreground">
                                              Edit argument JSON, then refresh
                                              the preview.
                                            </p>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              className={mcpOutlineButtonClass}
                                              onClick={() => {
                                                try {
                                                  const parsed = JSON.parse(
                                                    promptPreviewArgumentsText,
                                                  ) as Record<string, unknown>;
                                                  void handlePreviewPrompt(
                                                    selectedServer.config.name,
                                                    selectedPromptName,
                                                    parsed,
                                                  );
                                                } catch {
                                                  setPromptPreview({
                                                    error:
                                                      "Arguments must be valid JSON",
                                                  });
                                                }
                                              }}
                                            >
                                              Preview
                                            </Button>
                                          </div>
                                          {selectedPrompt?.arguments?.length ? (
                                            <pre
                                              className={cn(
                                                mcpCodeBlockClass,
                                                "max-h-40",
                                              )}
                                            >
                                              {JSON.stringify(
                                                selectedPrompt.arguments,
                                                null,
                                                2,
                                              )}
                                            </pre>
                                          ) : null}
                                          <pre
                                            className={cn(
                                              mcpCodeBlockClass,
                                              "max-h-[420px]",
                                            )}
                                          >
                                            {promptPreviewLoading
                                              ? "Loading preview..."
                                              : JSON.stringify(
                                                  promptPreview ?? {},
                                                  null,
                                                  2,
                                                )}
                                          </pre>
                                        </>
                                      ) : (
                                        <p className="mt-4 text-[13px] leading-6 text-muted-foreground">
                                          Select a prompt to preview its
                                          parameter structure and template
                                          result.
                                        </p>
                                      )}
                                    </SoftPanel>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {detailTab === "activity" ? (
                              <div className="space-y-4">
                                <div className="flex flex-wrap gap-2">
                                  {ACTIVITY_FILTER_OPTIONS.map((option) => (
                                    <FilterPill
                                      key={option.value}
                                      active={activityFilter === option.value}
                                      label={option.label}
                                      onClick={() =>
                                        setActivityFilter(option.value)
                                      }
                                    />
                                  ))}
                                </div>

                                {filteredActivity.length === 0 ? (
                                  <SoftPanel
                                    className={cn(
                                      mcpPanelClass,
                                      mcpPanelTextClass,
                                    )}
                                  >
                                    {selectedServer.activity.length === 0
                                      ? "No recent MCP activity."
                                      : "No activity matches the current filter."}
                                  </SoftPanel>
                                ) : (
                                  filteredActivity.map((entry) => (
                                    <SoftPanel
                                      key={entry.id}
                                      className={mcpPanelClass}
                                    >
                                      <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="rounded-full border border-border bg-accent/20 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                                              {activityCategoryLabel(entry)}
                                            </span>
                                            <p className="text-[14px] font-medium text-foreground">
                                              {formatSentenceCase(entry.action)}
                                            </p>
                                          </div>
                                          <p className="mt-2 text-[12px] text-muted-foreground">
                                            {formatTimestamp(entry.started_at)}
                                          </p>
                                        </div>
                                        <span
                                          className={cn(
                                            mcpTagClass,
                                            resultClassName(entry.result),
                                          )}
                                        >
                                          {entry.result}
                                        </span>
                                      </div>
                                      <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
                                        {entry.summary}
                                      </p>
                                      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
                                        {entry.actor_node_id ? (
                                          <span>
                                            Node{" "}
                                            {entry.actor_node_id.slice(0, 8)}
                                          </span>
                                        ) : null}
                                        {entry.tab_id ? (
                                          <span>
                                            Tab {entry.tab_id.slice(0, 8)}
                                          </span>
                                        ) : null}
                                        {entry.tool_name ? (
                                          <span>Tool {entry.tool_name}</span>
                                        ) : null}
                                        {entry.target ? (
                                          <span>Target {entry.target}</span>
                                        ) : null}
                                        <span>
                                          {Math.round(entry.duration_ms)} ms
                                        </span>
                                        <span>
                                          {formatTimestampShort(entry.ended_at)}
                                        </span>
                                      </div>
                                    </SoftPanel>
                                  ))
                                )}
                              </div>
                            ) : null}
                          </div>
                        </SoftPanel>
                      ) : (
                        <SoftPanel className="flex h-full items-center justify-center text-center text-muted-foreground">
                          Select an MCP server to inspect details.
                        </SoftPanel>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ServerDialog
        draft={draft}
        onChange={setDraft}
        open={dialogOpen}
        pending={pending}
        title={
          editingServerName ? "Edit MCP Server" : "Advanced Add MCP Server"
        }
        onOpenChange={setDialogOpen}
        onSubmit={handleSaveServer}
      />
    </PageScaffold>
  );
}
