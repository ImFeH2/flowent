import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Copy,
  Plus,
  RefreshCw,
  Server,
  ShieldAlert,
  Unplug,
} from "lucide-react";
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
  setAssistantMcpMount,
  setTabMcpMount,
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
import type { MCPServerConfig, MCPServerRecord } from "@/types";

type DetailTab = "overview" | "capabilities" | "mounts" | "activity";
type CapabilityTab = "tools" | "resources" | "resource_templates" | "prompts";

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

function formatTimestamp(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Never";
  }
  const normalized = value > 1e12 ? value : value * 1000;
  return new Date(normalized).toLocaleString();
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
      return "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200";
    case "auth_required":
      return "border-amber-400/20 bg-amber-400/[0.08] text-amber-200";
    case "error":
      return "border-red-400/20 bg-red-400/[0.08] text-red-200";
    case "disabled":
      return "border-white/[0.06] bg-white/[0.02] text-white/55";
    default:
      return "border-sky-400/20 bg-sky-400/[0.08] text-sky-200";
  }
}

function capabilitySummary(record: MCPServerRecord) {
  const counts = record.snapshot.capability_counts;
  return `${counts.tools} tools · ${counts.resources} resources · ${counts.prompts} prompts`;
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
        "flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3 text-sm",
        disabled && "opacity-50",
      )}
    >
      <span className="text-white/80">{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={checked}
        className={cn(
          "relative h-6 w-11 rounded-full border transition-colors",
          checked
            ? "border-emerald-400/30 bg-emerald-400/20"
            : "border-white/[0.08] bg-white/[0.04]",
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4.5 rounded-full bg-white transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
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
            className="border-white/10 bg-white/[0.02] text-white/78 hover:bg-white/[0.06]"
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
            <SelectTrigger className="h-10 w-full rounded-md border-white/[0.08] bg-black/30 text-sm text-white">
              <SelectValue placeholder="Select transport" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-white/[0.08] bg-black/80 text-white backdrop-blur-xl">
              <SelectItem value="stdio">stdio</SelectItem>
              <SelectItem value="streamable_http">streamable_http</SelectItem>
            </SelectContent>
          </Select>
        </WorkspaceDialogField>
      </div>

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

  const servers = useMemo(() => data?.servers ?? [], [data]);
  const selectedServer = useMemo(
    () =>
      servers.find((record) => record.config.name === selectedServerName) ??
      servers[0] ??
      null,
    [selectedServerName, servers],
  );

  useEffect(() => {
    if (!selectedServer && servers.length > 0) {
      setSelectedServerName(servers[0].config.name);
      return;
    }
    if (
      selectedServer &&
      !servers.some(
        (record) => record.config.name === selectedServer.config.name,
      )
    ) {
      setSelectedServerName(servers[0]?.config.name ?? null);
    }
  }, [selectedServer, servers]);

  useEffect(() => {
    setSelectedPromptName(null);
    setPromptPreview(null);
    setPromptPreviewLoading(false);
    setPromptPreviewArgumentsText("{}");
  }, [selectedServer?.config.name]);

  const selectedPrompt = useMemo(
    () =>
      selectedServer?.snapshot.prompts.find(
        (prompt) => prompt.name === selectedPromptName,
      ) ?? null,
    [selectedPromptName, selectedServer],
  );

  const openCreateDialog = () => {
    setEditingServerName(null);
    setDraft(EMPTY_SERVER_DRAFT);
    setDialogOpen(true);
  };

  const openEditDialog = (record: MCPServerRecord) => {
    setEditingServerName(record.config.name);
    setDraft(record.config);
    setDialogOpen(true);
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

  const handleAssistantMount = async (serverName: string, mounted: boolean) => {
    try {
      await setAssistantMcpMount(serverName, mounted);
      await mutate();
      toast.success("Assistant mounts updated");
    } catch (mountError) {
      toast.error(
        mountError instanceof Error
          ? mountError.message
          : "Failed to update Assistant mount",
      );
    }
  };

  const handleTabMount = async (
    serverName: string,
    tabId: string,
    mounted: boolean,
  ) => {
    try {
      await setTabMcpMount(serverName, tabId, mounted);
      await mutate();
      toast.success("Tab mounts updated");
    } catch (mountError) {
      toast.error(
        mountError instanceof Error
          ? mountError.message
          : "Failed to update tab mount",
      );
    }
  };

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(data?.autopoe_server.command ?? "");
      toast.success("Command copied");
    } catch {
      toast.error("Failed to copy command");
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

  return (
    <PageScaffold>
      <div className="flex h-full min-h-0 flex-col px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-medium tracking-[-0.04em] text-white">
              MCP
            </h1>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-white/42">
              Manage external MCP servers, Assistant and Tab mounts, connection
              status, capability discovery, and recent MCP activity.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-white/[0.02] text-white/82 hover:bg-white/[0.06]"
              onClick={handleRefreshAll}
            >
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
            <Button type="button" onClick={openCreateDialog}>
              <Plus className="mr-2 size-4" />
              Add MCP Server
            </Button>
          </div>
        </div>

        <SoftPanel className="mt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-white/72">
                  <Server className="size-4.5" />
                </div>
                <div>
                  <h2 className="text-[15px] font-medium text-white/88">
                    Autopoe MCP Server
                  </h2>
                  <p className="mt-1 text-[12px] text-white/42">
                    Stable transport {data?.autopoe_server.transport ?? "stdio"}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-[12px] leading-6 text-white/46">
                Startup command
              </p>
              <code className="mt-2 block rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3 text-[12px] text-white/80">
                {data?.autopoe_server.command ?? "uv run autopoe mcp serve"}
              </code>
              {data?.autopoe_server.last_error ? (
                <p className="mt-3 text-[12px] text-red-200">
                  {data.autopoe_server.last_error}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em]",
                  data?.autopoe_server.status === "available"
                    ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200"
                    : "border-red-400/20 bg-red-400/[0.08] text-red-200",
                )}
              >
                {data?.autopoe_server.status ?? "available"}
              </span>
              <Button
                type="button"
                variant="outline"
                className="border-white/10 bg-white/[0.02] text-white/82 hover:bg-white/[0.06]"
                onClick={handleCopyCommand}
              >
                <Copy className="mr-2 size-4" />
                Copy Command
              </Button>
            </div>
          </div>
        </SoftPanel>

        <div className="mt-6 min-h-0 flex-1 overflow-hidden">
          {isLoading ? (
            <div className="grid h-full gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-24 rounded-2xl border border-white/[0.04] bg-white/[0.02] skeleton-shimmer"
                  />
                ))}
                <p className="px-2 text-[13px] text-white/42">
                  Loading MCP servers...
                </p>
              </div>
              <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] skeleton-shimmer" />
            </div>
          ) : error ? (
            <SoftPanel className="flex h-full items-center justify-center text-center text-white/46">
              Failed to load MCP state.
            </SoftPanel>
          ) : servers.length === 0 ? (
            <SoftPanel className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex size-14 items-center justify-center rounded-3xl border border-white/[0.06] bg-white/[0.02] text-white/52">
                <Unplug className="size-6" />
              </div>
              <h2 className="mt-5 text-[16px] font-medium text-white/88">
                No MCP servers
              </h2>
              <p className="mt-2 max-w-lg text-[13px] leading-6 text-white/42">
                Add your first external MCP server to start mounting tools,
                resources, and prompts into Assistant or task tabs.
              </p>
              <Button className="mt-5" onClick={openCreateDialog}>
                <Plus className="mr-2 size-4" />
                Add MCP Server
              </Button>
            </SoftPanel>
          ) : (
            <div className="grid h-full gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="min-h-0 overflow-y-auto pr-1 scrollbar-none">
                <div className="space-y-3">
                  {servers.map((record) => {
                    const isSelected =
                      selectedServer?.config.name === record.config.name;
                    return (
                      <div
                        key={record.config.name}
                        className={cn(
                          "rounded-2xl border p-4 transition-colors",
                          isSelected
                            ? "border-white/[0.12] bg-white/[0.04]"
                            : "border-white/[0.05] bg-white/[0.015] hover:bg-white/[0.03]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedServerName(record.config.name)
                            }
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <p className="text-[14px] font-medium text-white/88">
                                {record.config.name}
                              </p>
                              {record.config.required ? (
                                <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-200">
                                  required
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-[12px] text-white/42">
                              {record.config.transport}
                            </p>
                            <p className="mt-3 text-[12px] text-white/42">
                              Auth {record.snapshot.auth_status}
                            </p>
                            <p className="mt-2 text-[12px] text-white/46">
                              {capabilitySummary(record)}
                            </p>
                            {record.snapshot.last_error ? (
                              <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-red-200">
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
                                className="h-7 border-white/10 bg-white/[0.02] px-2 text-[11px] text-white/82 hover:bg-white/[0.06]"
                                onClick={() => handleToggleEnabled(record)}
                              >
                                {record.config.enabled ? "Disable" : "Enable"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                disabled={authActionDisabled(record)}
                                className="h-7 border-white/10 bg-white/[0.02] px-2 text-[11px] text-white/82 hover:bg-white/[0.06]"
                                onClick={() =>
                                  record.snapshot.auth_status === "connected"
                                    ? handleLogout(record.config.name)
                                    : handleLogin(record.config.name)
                                }
                              >
                                {authActionLabel(record)}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-7 border-white/10 bg-white/[0.02] px-2 text-[11px] text-white/82 hover:bg-white/[0.06]"
                                onClick={() => openEditDialog(record)}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-7 border-white/10 bg-white/[0.02] px-2 text-[11px] text-white/82 hover:bg-white/[0.06]"
                                onClick={() =>
                                  handleRefreshServer(record.config.name)
                                }
                              >
                                Refresh
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="h-7 border-red-400/20 bg-red-400/[0.06] px-2 text-[11px] text-red-100 hover:bg-red-400/[0.12]"
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
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.06] pb-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-[18px] font-medium text-white/90">
                            {selectedServer.config.name}
                          </h2>
                          <span
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]",
                              statusClassName(selectedServer.snapshot.status),
                            )}
                          >
                            {statusLabel(selectedServer.snapshot.status)}
                          </span>
                        </div>
                        <p className="mt-2 text-[13px] text-white/42">
                          {selectedServer.config.transport}
                          {selectedServer.snapshot.last_error
                            ? ` · ${selectedServer.snapshot.last_error}`
                            : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="border-white/10 bg-white/[0.02] text-white/82 hover:bg-white/[0.06]"
                          onClick={() => handleToggleEnabled(selectedServer)}
                        >
                          {selectedServer.config.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={authActionDisabled(selectedServer)}
                          className="border-white/10 bg-white/[0.02] text-white/82 hover:bg-white/[0.06]"
                          onClick={() =>
                            selectedServer.snapshot.auth_status === "connected"
                              ? handleLogout(selectedServer.config.name)
                              : handleLogin(selectedServer.config.name)
                          }
                        >
                          {authActionLabel(selectedServer)}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-white/10 bg-white/[0.02] text-white/82 hover:bg-white/[0.06]"
                          onClick={() => openEditDialog(selectedServer)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-white/10 bg-white/[0.02] text-white/82 hover:bg-white/[0.06]"
                          onClick={() =>
                            handleRefreshServer(selectedServer.config.name)
                          }
                        >
                          Refresh
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="border-red-400/20 bg-red-400/[0.06] text-red-100 hover:bg-red-400/[0.12]"
                          onClick={() =>
                            handleDeleteServer(selectedServer.config.name)
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {(
                        [
                          "overview",
                          "capabilities",
                          "mounts",
                          "activity",
                        ] as DetailTab[]
                      ).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setDetailTab(tab)}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-[12px] font-medium capitalize transition-colors",
                            detailTab === tab
                              ? "bg-white/[0.08] text-white"
                              : "bg-white/[0.03] text-white/52 hover:text-white/84",
                          )}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-none">
                      {detailTab === "overview" ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          <SoftPanel className="bg-black/20">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">
                              Status
                            </p>
                            <p className="mt-3 text-[22px] font-medium text-white">
                              {statusLabel(selectedServer.snapshot.status)}
                            </p>
                            <p className="mt-2 text-[13px] text-white/42">
                              Auth {selectedServer.snapshot.auth_status}
                            </p>
                          </SoftPanel>
                          <SoftPanel className="bg-black/20">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">
                              Last Refresh
                            </p>
                            <p className="mt-3 text-[15px] font-medium text-white">
                              {formatTimestamp(
                                selectedServer.snapshot.last_refresh_at,
                              )}
                            </p>
                            <p className="mt-2 text-[13px] text-white/42">
                              {selectedServer.snapshot.last_refresh_result}
                            </p>
                          </SoftPanel>
                          {selectedServer.config.transport ===
                          "streamable_http" ? (
                            <SoftPanel className="bg-black/20 md:col-span-2">
                              <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">
                                Recent Auth Result
                              </p>
                              <p className="mt-3 text-[15px] font-medium text-white">
                                {selectedServer.snapshot.last_auth_result ??
                                  "No login action yet"}
                              </p>
                              <p className="mt-2 text-[13px] text-white/42">
                                Current auth status{" "}
                                {selectedServer.snapshot.auth_status}
                              </p>
                            </SoftPanel>
                          ) : null}
                          <SoftPanel className="bg-black/20 md:col-span-2">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">
                              Capability Summary
                            </p>
                            <div className="mt-4 grid gap-3 sm:grid-cols-4">
                              {Object.entries(
                                selectedServer.snapshot.capability_counts,
                              ).map(([key, value]) => (
                                <div
                                  key={key}
                                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                                >
                                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">
                                    {key.replaceAll("_", " ")}
                                  </p>
                                  <p className="mt-2 text-xl font-medium text-white">
                                    {value}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </SoftPanel>
                        </div>
                      ) : null}

                      {detailTab === "capabilities" ? (
                        <div className="space-y-4">
                          <div className="flex flex-wrap gap-2">
                            {(
                              [
                                "tools",
                                "resources",
                                "resource_templates",
                                "prompts",
                              ] as CapabilityTab[]
                            ).map((tab) => (
                              <button
                                key={tab}
                                type="button"
                                onClick={() => setCapabilityTab(tab)}
                                className={cn(
                                  "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                                  capabilityTab === tab
                                    ? "bg-white/[0.08] text-white"
                                    : "bg-white/[0.03] text-white/52 hover:text-white/84",
                                )}
                              >
                                {tab === "resource_templates"
                                  ? "Resource Templates"
                                  : tab}
                              </button>
                            ))}
                          </div>

                          {capabilityTab === "tools" ? (
                            <div className="space-y-3">
                              {selectedServer.snapshot.tools.length === 0 ? (
                                <SoftPanel className="bg-black/20 text-[13px] text-white/42">
                                  No tools discovered.
                                </SoftPanel>
                              ) : (
                                selectedServer.snapshot.tools.map((tool) => (
                                  <SoftPanel
                                    key={tool.fully_qualified_id}
                                    className="bg-black/20"
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <p className="font-mono text-[13px] text-white/90">
                                          {tool.tool_name}
                                        </p>
                                        {tool.title ? (
                                          <p className="mt-2 text-[13px] text-white/62">
                                            {tool.title}
                                          </p>
                                        ) : null}
                                        <p className="mt-1 text-[12px] text-white/42">
                                          {tool.fully_qualified_id}
                                        </p>
                                      </div>
                                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em]">
                                        {tool.read_only_hint ? (
                                          <span className="rounded-full border border-sky-400/20 bg-sky-400/[0.08] px-2 py-1 text-sky-200">
                                            readOnly
                                          </span>
                                        ) : null}
                                        {tool.destructive_hint ? (
                                          <span className="rounded-full border border-red-400/20 bg-red-400/[0.08] px-2 py-1 text-red-200">
                                            destructive
                                          </span>
                                        ) : null}
                                        {tool.open_world_hint ? (
                                          <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-2 py-1 text-amber-200">
                                            openWorld
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                    {tool.description ? (
                                      <p className="mt-3 text-[13px] leading-6 text-white/48">
                                        {tool.description}
                                      </p>
                                    ) : null}
                                    <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-white/[0.06] bg-black/40 p-3 text-[11px] text-white/65">
                                      {JSON.stringify(
                                        tool.parameters ?? {},
                                        null,
                                        2,
                                      )}
                                    </pre>
                                  </SoftPanel>
                                ))
                              )}
                            </div>
                          ) : null}

                          {capabilityTab === "resources" ? (
                            <div className="space-y-3">
                              {selectedServer.snapshot.resources.length ===
                              0 ? (
                                <SoftPanel className="bg-black/20 text-[13px] text-white/42">
                                  No resources discovered.
                                </SoftPanel>
                              ) : (
                                selectedServer.snapshot.resources.map(
                                  (resource) => (
                                    <SoftPanel
                                      key={resource.uri}
                                      className="bg-black/20"
                                    >
                                      <p className="text-[14px] font-medium text-white/88">
                                        {resource.name}
                                      </p>
                                      <p className="mt-1 font-mono text-[12px] text-white/42">
                                        {resource.uri}
                                      </p>
                                      <p className="mt-3 text-[13px] text-white/48">
                                        {resource.mime_type ?? "Unknown MIME"}
                                      </p>
                                      {resource.description ? (
                                        <p className="mt-2 text-[13px] leading-6 text-white/42">
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
                                <SoftPanel className="bg-black/20 text-[13px] text-white/42">
                                  No resource templates discovered.
                                </SoftPanel>
                              ) : (
                                selectedServer.snapshot.resource_templates.map(
                                  (template) => (
                                    <SoftPanel
                                      key={template.uri_template}
                                      className="bg-black/20"
                                    >
                                      <p className="text-[14px] font-medium text-white/88">
                                        {template.name}
                                      </p>
                                      <p className="mt-1 font-mono text-[12px] text-white/42">
                                        {template.uri_template}
                                      </p>
                                      {template.description ? (
                                        <p className="mt-3 text-[13px] leading-6 text-white/42">
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
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                              <div className="space-y-3">
                                {selectedServer.snapshot.prompts.length ===
                                0 ? (
                                  <SoftPanel className="bg-black/20 text-[13px] text-white/42">
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
                                          "block w-full rounded-xl border border-white/[0.06] bg-black/20 p-5 text-left transition-colors",
                                          selectedPromptName === prompt.name
                                            ? "border-white/[0.16] bg-white/[0.04]"
                                            : "hover:bg-white/[0.03]",
                                        )}
                                      >
                                        <p className="text-[14px] font-medium text-white/88">
                                          {prompt.name}
                                        </p>
                                        {prompt.description ? (
                                          <p className="mt-2 text-[13px] leading-6 text-white/42">
                                            {prompt.description}
                                          </p>
                                        ) : null}
                                        <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-white/[0.06] bg-black/40 p-3 text-[11px] text-white/65">
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
                              <SoftPanel className="bg-black/20">
                                <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">
                                  Prompt Preview
                                </p>
                                {selectedPromptName ? (
                                  <>
                                    <p className="mt-3 text-[15px] font-medium text-white">
                                      {selectedPromptName}
                                    </p>
                                    <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-white/38">
                                      Arguments
                                    </p>
                                    <Textarea
                                      value={promptPreviewArgumentsText}
                                      onChange={(event) =>
                                        setPromptPreviewArgumentsText(
                                          event.target.value,
                                        )
                                      }
                                      className="mt-2 min-h-[120px] border-white/[0.06] bg-black/30 font-mono text-[11px] text-white/75"
                                    />
                                    <div className="mt-3 flex items-center justify-between gap-3">
                                      <p className="text-[12px] text-white/42">
                                        Edit argument JSON, then refresh the
                                        preview.
                                      </p>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        className="border-white/10 bg-white/[0.02] text-white/82 hover:bg-white/[0.06]"
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
                                      <pre className="mt-4 max-h-40 overflow-auto rounded-xl border border-white/[0.06] bg-black/40 p-3 text-[11px] text-white/65">
                                        {JSON.stringify(
                                          selectedPrompt.arguments,
                                          null,
                                          2,
                                        )}
                                      </pre>
                                    ) : null}
                                    <pre className="mt-4 max-h-[420px] overflow-auto rounded-xl border border-white/[0.06] bg-black/40 p-3 text-[11px] text-white/65">
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
                                  <p className="mt-4 text-[13px] leading-6 text-white/42">
                                    Select a prompt to preview its parameter
                                    structure and template result.
                                  </p>
                                )}
                              </SoftPanel>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {detailTab === "mounts" ? (
                        <div className="space-y-5">
                          {selectedServer.snapshot.status !== "connected" ? (
                            <SoftPanel className="flex items-start gap-3 bg-amber-400/[0.06] text-[13px] text-amber-100">
                              <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                              <p>
                                This server is not fully connected yet. Mounts
                                stay configurable, but the server will not
                                surface active capabilities until refresh
                                succeeds.
                              </p>
                            </SoftPanel>
                          ) : null}

                          <div className="space-y-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">
                              Assistant Mounts
                            </p>
                            <MountToggle
                              checked={selectedServer.mounts.assistant}
                              disabled={
                                selectedServer.snapshot.status !== "connected"
                              }
                              label="Mount on Assistant"
                              onChange={(nextValue) =>
                                handleAssistantMount(
                                  selectedServer.config.name,
                                  nextValue,
                                )
                              }
                            />
                          </div>

                          <div className="space-y-3">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">
                              Tab Mounts
                            </p>
                            {selectedServer.mounts.tabs.map((entry) => (
                              <MountToggle
                                key={entry.tab_id}
                                checked={entry.mounted}
                                disabled={
                                  selectedServer.snapshot.status !== "connected"
                                }
                                label={`${entry.tab_title} · ${entry.tab_id.slice(0, 8)}`}
                                onChange={(nextValue) =>
                                  handleTabMount(
                                    selectedServer.config.name,
                                    entry.tab_id,
                                    nextValue,
                                  )
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {detailTab === "activity" ? (
                        <div className="space-y-3">
                          {selectedServer.activity.length === 0 ? (
                            <SoftPanel className="bg-black/20 text-[13px] text-white/42">
                              No recent MCP activity.
                            </SoftPanel>
                          ) : (
                            selectedServer.activity.map((entry) => (
                              <SoftPanel key={entry.id} className="bg-black/20">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-[14px] font-medium text-white/88">
                                      {entry.action}
                                    </p>
                                    <p className="mt-1 text-[12px] text-white/42">
                                      {formatTimestamp(entry.started_at)}
                                    </p>
                                  </div>
                                  <span
                                    className={cn(
                                      "rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em]",
                                      entry.result === "success"
                                        ? "border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200"
                                        : entry.result === "rejected"
                                          ? "border-amber-400/20 bg-amber-400/[0.08] text-amber-200"
                                          : "border-red-400/20 bg-red-400/[0.08] text-red-200",
                                    )}
                                  >
                                    {entry.result}
                                  </span>
                                </div>
                                <p className="mt-3 text-[13px] leading-6 text-white/46">
                                  {entry.summary}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-white/42">
                                  {entry.actor_node_id ? (
                                    <span>
                                      Node {entry.actor_node_id.slice(0, 8)}
                                    </span>
                                  ) : null}
                                  {entry.tab_id ? (
                                    <span>Tab {entry.tab_id.slice(0, 8)}</span>
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
                                </div>
                              </SoftPanel>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  </SoftPanel>
                ) : (
                  <SoftPanel className="flex h-full items-center justify-center text-center text-white/46">
                    Select an MCP server to inspect details.
                  </SoftPanel>
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
        title={editingServerName ? "Edit MCP Server" : "Add MCP Server"}
        onOpenChange={setDialogOpen}
        onSubmit={handleSaveServer}
      />
    </PageScaffold>
  );
}
