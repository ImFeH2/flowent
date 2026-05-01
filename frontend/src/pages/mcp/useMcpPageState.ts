import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
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
import type { MCPServerConfig, MCPServerRecord } from "@/types";
import {
  activityFilterForRecord,
  buildPendingServerRecord,
  buildPromptPreviewArguments,
  buildQuickAddDraft,
  EMPTY_SERVER_DRAFT,
  matchesServerFilter,
  suggestServerName,
  tokenizeLauncher,
  type ActivityFilter,
  type CapabilityTab,
  type DetailTab,
  type ServerStatusFilter,
} from "@/pages/mcp/lib";

export function useMcpPageState() {
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
  const [serverStatusFilter, setServerStatusFilter] =
    useState<ServerStatusFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [quickAddInput, setQuickAddInput] = useState("");
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddNameDirty, setQuickAddNameDirty] = useState(false);
  const [quickAddPending, setQuickAddPending] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

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
        matchesServerFilter(record, serverStatusFilter),
      ),
    [serverStatusFilter, servers],
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

  const openEditDialog = (record: MCPServerRecord) => {
    setEditingServerName(record.config.name);
    setDraft(record.config);
    setDialogOpen(true);
  };

  const updateQuickAddInput = (value: string) => {
    setQuickAddInput(value);
    setQuickAddError(null);
  };

  const updateQuickAddName = (value: string) => {
    setQuickAddNameDirty(true);
    setQuickAddName(value);
    setQuickAddError(null);
  };

  const focusQuickAdd = () => {
    document.getElementById("mcp-quick-add-input")?.focus();
  };

  const clearServerFilters = () => {
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
    const initialArguments = buildPromptPreviewArguments(promptDefinition);
    setPromptPreviewArgumentsText(JSON.stringify(initialArguments, null, 2));
    void handlePreviewPrompt(serverName, promptName, initialArguments);
  };

  const handlePromptPreviewArgumentsChange = (value: string) => {
    setPromptPreviewArgumentsText(value);
  };

  const handlePreviewCurrentPrompt = () => {
    if (!selectedServer || !selectedPromptName) {
      return;
    }
    try {
      const parsed = JSON.parse(promptPreviewArgumentsText) as Record<
        string,
        unknown
      >;
      void handlePreviewPrompt(
        selectedServer.config.name,
        selectedPromptName,
        parsed,
      );
    } catch {
      setPromptPreview({
        error: "Arguments must be valid JSON",
      });
    }
  };

  return {
    error,
    isLoading,
    servers,
    filteredServers,
    selectedServer,
    summaryCounts,
    filteredActivity,
    detailTab,
    setDetailTab,
    capabilityTab,
    setCapabilityTab,
    serverStatusFilter,
    setServerStatusFilter,
    activityFilter,
    setActivityFilter,
    selectedServerName,
    setSelectedServerName,
    clearServerFilters,
    focusQuickAdd,
    dialog: {
      draft,
      editingServerName,
      open: dialogOpen,
      pending,
      setDraft,
      setOpen: setDialogOpen,
      openCreateDialog,
      openEditDialog,
      saveServer: handleSaveServer,
    },
    quickAdd: {
      error: quickAddError,
      input: quickAddInput,
      nameValue: quickAddNameValue,
      parse: quickAddParse,
      pending: quickAddPending,
      setInput: updateQuickAddInput,
      setName: updateQuickAddName,
      submit: handleQuickAdd,
    },
    promptPreviewState: {
      argumentsText: promptPreviewArgumentsText,
      loading: promptPreviewLoading,
      preview: promptPreview,
      selectedPrompt,
      selectedPromptName,
      setArgumentsText: handlePromptPreviewArgumentsChange,
      previewCurrent: handlePreviewCurrentPrompt,
      selectPrompt: handleSelectPrompt,
    },
    actions: {
      deleteServer: handleDeleteServer,
      login: handleLogin,
      logout: handleLogout,
      refreshAll: handleRefreshAll,
      refreshServer: handleRefreshServer,
      toggleEnabled: handleToggleEnabled,
    },
  };
}
