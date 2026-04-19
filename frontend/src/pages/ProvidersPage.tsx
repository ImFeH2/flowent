import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { motion } from "motion/react";
import {
  Check,
  Eye,
  EyeOff,
  PencilLine,
  Play,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createProvider,
  deleteProvider,
  fetchProviderCatalogPreview,
  fetchProviders,
  testProviderModelRequest,
  updateProvider,
} from "@/lib/api";
import {
  PageScaffold,
  SectionHeader,
  SettingsRow,
} from "@/components/layout/PageScaffold";
import { parseProviderHeadersInput } from "@/lib/providerHeaders";
import { providerTypeLabel, providerTypeOptions } from "@/lib/providerTypes";
import { buildProviderRequestPreview } from "@/lib/providerUrls";
import type { Provider, ProviderModelCatalogEntry } from "@/types";
import { cn } from "@/lib/utils";
import { usePanelDrag, usePanelWidth } from "@/hooks/usePanelDrag";
import { PanelResizer } from "@/components/PanelResizer";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildModelSummary,
  buildProviderDraftRequestPayload,
  buildProviderModelEntry,
  buildProviderPayload,
  createProviderDraft,
  createProviderModelEditorDraft,
  findDuplicateModelId,
  mergeFetchedModelsIntoDraft,
  serializeProviderDraft,
  validateProviderModelEditorDraft,
  type ProviderDraft,
  type ProviderModelEditorDraft,
  type ProviderModelEditorState,
  type ProviderModelTestState,
  type TriStateCapability,
} from "@/pages/providers/lib";

const providerInputClass =
  "h-8 w-full rounded-md border border-input bg-background/50 px-3 text-[13px] text-foreground shadow-xs transition-[border-color,background-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:bg-background/65 focus:outline-none focus:ring-[3px] focus:ring-ring/50";
const providerMonoInputClass = `${providerInputClass} font-mono`;
const providerSelectTriggerClass =
  "h-8 w-full rounded-md bg-background/50 text-[13px]";
const providerIconButtonClass =
  "flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/45 hover:text-foreground";
const providerHelpTextClass =
  "text-[11px] leading-relaxed text-muted-foreground";

export function ProvidersPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<ProviderDraft>(createProviderDraft());
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<Provider | null>(
    null,
  );
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelEditorState, setModelEditorState] =
    useState<ProviderModelEditorState>(null);
  const [modelEditorDraft, setModelEditorDraft] =
    useState<ProviderModelEditorDraft>(createProviderModelEditorDraft());
  const [modelTestStates, setModelTestStates] = useState<
    Record<string, ProviderModelTestState>
  >({});

  const {
    data: providers = [],
    isLoading: loading,
    mutate: mutateProviders,
  } = useSWR("providers", fetchProviders, {
    onSuccess: (items) => {
      if (selectedId && !items.find((provider) => provider.id === selectedId)) {
        setSelectedId(null);
        setIsCreating(false);
        setDraft(createProviderDraft());
        setModelTestStates({});
      }
    },
  });

  const [panelWidth, setPanelWidth] = usePanelWidth(
    "providers-panel-width",
    300,
    200,
    500,
  );
  const { isDragging, startDrag } = usePanelDrag(
    panelWidth,
    setPanelWidth,
    "right",
  );

  const selectedProvider = providers.find(
    (provider) => provider.id === selectedId,
  );
  const endpointPreview = useMemo(
    () => buildProviderRequestPreview(draft.type, draft.base_url),
    [draft.base_url, draft.type],
  );
  const parsedHeaders = useMemo(
    () => parseProviderHeadersInput(draft.headers_text),
    [draft.headers_text],
  );
  const hasChanges = useMemo(() => {
    const baseline = isCreating
      ? createProviderDraft()
      : createProviderDraft(selectedProvider);
    return serializeProviderDraft(draft) !== serializeProviderDraft(baseline);
  }, [draft, isCreating, selectedProvider]);

  const refreshProviders = useCallback(async () => {
    await mutateProviders();
  }, [mutateProviders]);

  const handleSelect = (provider: Provider) => {
    setSelectedId(provider.id);
    setIsCreating(false);
    setDraft(createProviderDraft(provider));
    setShowKey(false);
    setModelTestStates({});
    setModelEditorState(null);
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setSelectedId(null);
    setDraft(createProviderDraft());
    setShowKey(false);
    setModelTestStates({});
    setModelEditorState(null);
  };

  const handleCancel = () => {
    if (isCreating) {
      setIsCreating(false);
      setDraft(createProviderDraft());
    } else {
      setDraft(createProviderDraft(selectedProvider));
    }
    setModelTestStates({});
    setModelEditorState(null);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast.error("Provider name is required");
      return;
    }
    if (!draft.base_url.trim()) {
      toast.error("Provider base URL is required");
      return;
    }
    if (endpointPreview.error) {
      toast.error(endpointPreview.error);
      return;
    }
    if (parsedHeaders.error) {
      toast.error(parsedHeaders.error);
      return;
    }

    const duplicateModelId = findDuplicateModelId(draft.models);
    if (duplicateModelId) {
      toast.error(`Model ID '${duplicateModelId}' is duplicated`);
      return;
    }

    const payload = buildProviderPayload(draft, parsedHeaders.headers);

    setSaving(true);
    try {
      if (isCreating) {
        const created = await createProvider(payload);
        void mutateProviders([...providers, created], false);
        setIsCreating(false);
        setSelectedId(created.id);
        setDraft(createProviderDraft(created));
        toast.success("Provider created");
      } else if (selectedId) {
        const updated = await updateProvider(selectedId, payload);
        void mutateProviders(
          providers.map((provider) =>
            provider.id === selectedId ? updated : provider,
          ),
          false,
        );
        setDraft(createProviderDraft(updated));
        toast.success("Provider updated");
      }
      setModelTestStates({});
    } catch {
      toast.error(
        isCreating ? "Failed to create provider" : "Failed to update provider",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!providerToDelete) {
      return;
    }
    const providerId = providerToDelete.id;
    setProviderToDelete(null);
    try {
      await deleteProvider(providerId);
      void mutateProviders(
        providers.filter((provider) => provider.id !== providerId),
        false,
      );
      if (selectedId === providerId) {
        setSelectedId(null);
        setDraft(createProviderDraft());
      }
      setModelTestStates({});
      toast.success("Provider deleted");
    } catch {
      toast.error("Failed to delete provider");
    }
  };

  const openCreateModelDialog = () => {
    setModelEditorState({ mode: "create", originalModel: null });
    setModelEditorDraft(createProviderModelEditorDraft());
  };

  const openEditModelDialog = (entry: ProviderModelCatalogEntry) => {
    setModelEditorState({ mode: "edit", originalModel: entry.model });
    setModelEditorDraft(createProviderModelEditorDraft(entry));
  };

  const closeModelDialog = () => {
    setModelEditorState(null);
    setModelEditorDraft(createProviderModelEditorDraft());
  };

  const handleSaveModel = () => {
    const validationError = validateProviderModelEditorDraft(modelEditorDraft);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const modelId = modelEditorDraft.model.trim();
    if (
      draft.models.some(
        (entry) =>
          entry.model === modelId &&
          entry.model !== modelEditorState?.originalModel,
      )
    ) {
      toast.error(`Model ID '${modelId}' already exists in this provider`);
      return;
    }
    const nextEntry = buildProviderModelEntry(modelEditorDraft);

    setDraft((current) => {
      if (modelEditorState?.mode === "edit" && modelEditorState.originalModel) {
        return {
          ...current,
          models: current.models.map((entry) =>
            entry.model === modelEditorState.originalModel ? nextEntry : entry,
          ),
        };
      }
      return {
        ...current,
        models: [...current.models, nextEntry],
      };
    });
    setModelTestStates((current) => {
      const next = { ...current };
      if (
        modelEditorState?.originalModel &&
        modelEditorState.originalModel !== modelId
      ) {
        delete next[modelEditorState.originalModel];
      }
      return next;
    });
    closeModelDialog();
  };

  const handleDeleteModel = (modelId: string) => {
    setDraft((current) => ({
      ...current,
      models: current.models.filter((entry) => entry.model !== modelId),
    }));
    setModelTestStates((current) => {
      const next = { ...current };
      delete next[modelId];
      return next;
    });
  };

  const handleFetchModels = async () => {
    if (!draft.type.trim() || !draft.base_url.trim()) {
      toast.error(
        "Provider type and base URL are required before fetching models",
      );
      return;
    }
    if (endpointPreview.error) {
      toast.error(endpointPreview.error);
      return;
    }
    if (parsedHeaders.error) {
      toast.error(parsedHeaders.error);
      return;
    }

    setFetchingModels(true);
    try {
      const fetchedModels = await fetchProviderCatalogPreview(
        buildProviderDraftRequestPayload(
          draft,
          parsedHeaders.headers,
          selectedId ?? undefined,
        ),
      );
      setDraft((current) => ({
        ...current,
        models: mergeFetchedModelsIntoDraft(current.models, fetchedModels),
      }));
      toast.success("Provider models fetched");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to fetch provider models",
      );
    } finally {
      setFetchingModels(false);
    }
  };

  const handleTestModel = async (entry: ProviderModelCatalogEntry) => {
    if (endpointPreview.error) {
      toast.error(endpointPreview.error);
      return;
    }
    if (parsedHeaders.error) {
      toast.error(parsedHeaders.error);
      return;
    }

    setModelTestStates((current) => ({
      ...current,
      [entry.model]: { state: "running" },
    }));

    try {
      const result = await testProviderModelRequest({
        ...buildProviderDraftRequestPayload(
          draft,
          parsedHeaders.headers,
          selectedId ?? undefined,
        ),
        model: entry.model,
      });
      setModelTestStates((current) => ({
        ...current,
        [entry.model]: result.ok
          ? {
              state: "success",
              duration_ms: result.duration_ms ?? 0,
            }
          : {
              state: "error",
              error_summary: result.error_summary ?? "Provider test failed",
            },
      }));
    } catch (error) {
      setModelTestStates((current) => ({
        ...current,
        [entry.model]: {
          state: "error",
          error_summary:
            error instanceof Error ? error.message : "Provider test failed",
        },
      }));
    }
  };

  return (
    <PageScaffold className="overflow-hidden p-0 md:p-0">
      <div className="flex h-full w-full">
        <div
          style={{ width: `${panelWidth}px` }}
          className="relative flex shrink-0 flex-col border-r border-border bg-card/20 pt-8 pl-8"
        >
          <div className="flex shrink-0 items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-muted-foreground" />
              <span className="text-[13px] font-medium text-foreground/80">
                Providers
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void refreshProviders()}
                disabled={loading}
                className={cn("size-7", providerIconButtonClass)}
              >
                <RefreshCw
                  className={cn("size-3.5", loading && "animate-spin")}
                />
              </button>
              <button
                type="button"
                onClick={handleCreateNew}
                className={cn("size-7", providerIconButtonClass)}
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            {loading ? (
              <div className="space-y-1">
                {[...Array(3)].map((_, index) => (
                  <div
                    key={index}
                    className="h-10 w-full animate-pulse rounded-lg bg-accent/20"
                  />
                ))}
              </div>
            ) : providers.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-10 text-center"
              >
                <p className="text-[13px] text-muted-foreground">
                  No providers
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleCreateNew}
                  className="mt-4"
                >
                  <Plus className="size-3" />
                  Add your first provider
                </Button>
              </motion.div>
            ) : (
              <div className="space-y-0.5">
                {providers.map((provider, index) => (
                  <motion.div
                    key={provider.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.03 }}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelect(provider)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleSelect(provider);
                      }
                    }}
                    className={cn(
                      "group relative flex w-full items-center justify-between rounded-lg px-3 py-2.5 transition-all",
                      selectedId === provider.id
                        ? "bg-accent/55 text-foreground"
                        : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute inset-y-1 left-0 w-px rounded-full bg-ring/60 transition-opacity",
                        selectedId === provider.id
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <div className="min-w-0 flex-1 pl-2">
                      <p className="truncate text-[13px] font-medium">
                        {provider.name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {providerTypeLabel(provider.type)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setProviderToDelete(provider);
                      }}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <PanelResizer
            position="right"
            isDragging={isDragging}
            onMouseDown={startDrag}
          />
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto bg-transparent">
          {isCreating || selectedProvider ? (
            <div className="flex min-h-full flex-col px-8 py-8 md:px-12 md:py-10">
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-medium text-foreground">
                    {isCreating ? "New Provider" : selectedProvider?.name}
                  </h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {isCreating
                      ? "Configure a new provider and its model catalog"
                      : `ID: ${selectedProvider?.id}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {hasChanges ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleCancel}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleSave()}
                        disabled={saving}
                      >
                        <Check className="size-3.5" />
                        {saving ? "Saving..." : "Save"}
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="mx-auto w-full max-w-[720px] flex-1">
                <SectionHeader
                  title="Identity"
                  description="Set the provider name and runtime type."
                />
                <div className="mb-10 space-y-2">
                  <SettingsRow label="Name">
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.target.value })
                      }
                      placeholder="e.g., OpenAI Production"
                      className={providerInputClass}
                    />
                  </SettingsRow>
                  <SettingsRow label="Type">
                    <Select
                      value={draft.type}
                      onValueChange={(value) =>
                        setDraft({ ...draft, type: value })
                      }
                    >
                      <SelectTrigger className={providerSelectTriggerClass}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-border bg-popover">
                        {providerTypeOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className="text-[13px]"
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingsRow>
                </div>

                <div className="border-t border-border pt-8">
                  <SectionHeader
                    title="Endpoint & Auth"
                    description="Configure connection details, request preview, credentials, and retry behavior."
                  />
                  <div className="space-y-2">
                    <SettingsRow label="Base URL">
                      <input
                        type="text"
                        value={draft.base_url}
                        onChange={(event) =>
                          setDraft({ ...draft, base_url: event.target.value })
                        }
                        placeholder="https://api.openai.com/v1"
                        className={providerInputClass}
                      />
                    </SettingsRow>
                    <SettingsRow
                      label="Request Preview"
                      description="Resolved endpoint based on the current draft"
                    >
                      <div
                        className={cn(
                          "w-full select-text rounded-md border px-3 py-2 text-[12px]",
                          endpointPreview.error
                            ? "border-destructive/20 bg-destructive/8 text-destructive"
                            : "border-border bg-card/30 text-foreground/80",
                        )}
                      >
                        {endpointPreview.error ? (
                          endpointPreview.error
                        ) : endpointPreview.previewUrl ? (
                          <code className="select-text font-mono">
                            {endpointPreview.previewUrl}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">
                            Enter a base URL to preview
                          </span>
                        )}
                      </div>
                    </SettingsRow>
                    <SettingsRow label="API Key" description="Optional">
                      <div className="relative">
                        <input
                          type={showKey ? "text" : "password"}
                          value={draft.api_key}
                          onChange={(event) =>
                            setDraft({ ...draft, api_key: event.target.value })
                          }
                          placeholder="sk-..."
                          className={`${providerInputClass} pr-10`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey((current) => !current)}
                          className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/45 hover:text-foreground"
                        >
                          {showKey ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </button>
                      </div>
                    </SettingsRow>
                    <SettingsRow
                      label="Headers"
                      description="Optional JSON object"
                    >
                      <div className="space-y-2">
                        <textarea
                          value={draft.headers_text}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              headers_text: event.target.value,
                            })
                          }
                          placeholder={'{\n  "Authorization": "Bearer ..."\n}'}
                          spellCheck={false}
                          className={cn(
                            "min-h-[140px] w-full rounded-md border px-3 py-2.5 font-mono text-[13px] transition-[border-color,background-color,box-shadow] placeholder:text-muted-foreground focus:outline-none",
                            parsedHeaders.error
                              ? "border-destructive/30 bg-background/50 text-destructive shadow-xs focus:border-destructive/50"
                              : "border-input bg-background/50 text-foreground shadow-xs focus:border-ring focus:bg-background/65 focus:ring-[3px] focus:ring-ring/50",
                          )}
                        />
                        {parsedHeaders.error ? (
                          <p className="text-[11px] text-destructive">
                            {parsedHeaders.error}
                          </p>
                        ) : null}
                      </div>
                    </SettingsRow>
                    <SettingsRow
                      label="429 Retry Delay"
                      description="Extra wait after HTTP 429"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            aria-label="429 Retry Delay"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={String(draft.retry_429_delay_seconds)}
                            onChange={(event) => {
                              const nextValue = event.target.value.trim();
                              if (!/^\d+$/.test(nextValue)) {
                                return;
                              }
                              const parsed = Number.parseInt(nextValue, 10);
                              if (!Number.isSafeInteger(parsed) || parsed < 0) {
                                return;
                              }
                              setDraft({
                                ...draft,
                                retry_429_delay_seconds: parsed,
                              });
                            }}
                            className={providerMonoInputClass}
                          />
                          <span className="text-[13px] font-medium text-muted-foreground">
                            s
                          </span>
                        </div>
                        <p className={providerHelpTextClass}>
                          Adds extra wait only when this provider returns HTTP
                          429 and the system continues retrying.
                        </p>
                      </div>
                    </SettingsRow>
                  </div>
                </div>

                <div className="border-t border-border pt-8">
                  <SectionHeader
                    title="Models"
                    description="Manage this provider-scoped model catalog, fetch discovered entries, and run model-level tests against the current draft."
                  />

                  <div className="space-y-4 rounded-xl border border-border bg-card/30 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-medium text-foreground/80">
                          {draft.models.length} model
                          {draft.models.length === 1 ? "" : "s"}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Fetch discovered models or maintain manual entries in
                          this draft before saving.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={fetchingModels}
                          onClick={() => void handleFetchModels()}
                        >
                          <RefreshCw
                            className={cn(
                              "size-3.5",
                              fetchingModels && "animate-spin",
                            )}
                          />
                          Fetch Models
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={openCreateModelDialog}
                        >
                          <Plus className="size-3.5" />
                          Add Model
                        </Button>
                      </div>
                    </div>

                    {draft.models.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border bg-background/35 px-4 py-5 text-center">
                        <p className="text-[13px] font-medium text-foreground/80">
                          No models in this provider draft
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                          Fetch models from the current draft connection, or add
                          a manual entry.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {draft.models.map((entry) => {
                          const testState = modelTestStates[entry.model];
                          return (
                            <div
                              key={entry.model}
                              className="rounded-xl border border-border bg-background/35 px-4 py-3"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate select-text font-mono text-[13px] text-foreground/85">
                                      {entry.model}
                                    </p>
                                    <span
                                      className={cn(
                                        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]",
                                        entry.source === "manual"
                                          ? "border-graph-status-idle/20 bg-graph-status-idle/[0.12] text-graph-status-idle"
                                          : "border-graph-status-running/20 bg-graph-status-running/[0.12] text-graph-status-running",
                                      )}
                                    >
                                      {entry.source === "manual"
                                        ? "Manual"
                                        : "Discovered"}
                                    </span>
                                  </div>
                                  <p className="mt-1 select-text text-[11px] leading-relaxed text-muted-foreground">
                                    {buildModelSummary(entry)}
                                  </p>
                                  {testState?.state === "running" ? (
                                    <p className="mt-2 select-text text-[11px] text-muted-foreground">
                                      Testing this model against the current
                                      draft provider...
                                    </p>
                                  ) : null}
                                  {testState?.state === "success" ? (
                                    <p className="mt-2 select-text text-[11px] text-graph-status-running">
                                      Test succeeded in {testState.duration_ms}
                                      ms
                                    </p>
                                  ) : null}
                                  {testState?.state === "error" ? (
                                    <p className="mt-2 select-text text-[11px] text-destructive">
                                      {testState.error_summary}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    disabled={testState?.state === "running"}
                                    onClick={() => void handleTestModel(entry)}
                                  >
                                    <Play className="size-3.5" />
                                    Test
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditModelDialog(entry)}
                                  >
                                    <PencilLine className="size-3.5" />
                                    Edit
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleDeleteModel(entry.model)
                                    }
                                  >
                                    <Trash2 className="size-3.5" />
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {!isCreating && selectedProvider ? (
                  <div className="border-t border-border pt-8">
                    <SettingsRow label="Provider ID" description="Read-only">
                      <div className="select-text rounded-md border border-border bg-card/30 px-3 py-2 font-mono text-[12px] text-foreground/80">
                        {selectedProvider.id}
                      </div>
                    </SettingsRow>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center px-6 text-center"
            >
              <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-accent/20 shadow-sm">
                <Server className="size-5 text-muted-foreground" />
              </div>
              <h3 className="mt-5 text-[15px] font-medium text-foreground">
                No Provider Selected
              </h3>
              <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">
                Select a provider from the sidebar to edit its connection
                fields, model catalog, and model tests.
              </p>
            </motion.div>
          )}
        </div>
      </div>

      <Dialog
        open={modelEditorState !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeModelDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modelEditorState?.mode === "edit" ? "Edit Model" : "Add Model"}
            </DialogTitle>
            <DialogDescription>
              Maintain one provider-scoped catalog entry at a time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground/80">
                Model ID
              </label>
              <input
                aria-label="Model ID"
                type="text"
                value={modelEditorDraft.model}
                onChange={(event) =>
                  setModelEditorDraft({
                    ...modelEditorDraft,
                    model: event.target.value,
                  })
                }
                placeholder="gpt-5"
                className={providerMonoInputClass}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground/80">
                Source
              </label>
              <div className="rounded-md border border-border bg-card/30 px-3 py-2 text-[13px] text-foreground/80">
                {modelEditorDraft.source === "manual" ? "Manual" : "Discovered"}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[13px] font-medium text-foreground/80">
                Context Window
              </label>
              <div className="flex items-center gap-2">
                <input
                  aria-label="Context Window"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={modelEditorDraft.context_window_tokens}
                  onChange={(event) => {
                    const nextValue = event.target.value.trim();
                    if (!/^\d*$/.test(nextValue)) {
                      return;
                    }
                    setModelEditorDraft({
                      ...modelEditorDraft,
                      context_window_tokens: nextValue,
                    });
                  }}
                  placeholder="Optional"
                  className={providerMonoInputClass}
                />
                <span className="text-[13px] font-medium text-muted-foreground">
                  tokens
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-foreground/80">
                  Input Image
                </label>
                <Select
                  value={modelEditorDraft.input_image}
                  onValueChange={(value: TriStateCapability) =>
                    setModelEditorDraft({
                      ...modelEditorDraft,
                      input_image: value,
                    })
                  }
                >
                  <SelectTrigger className={providerSelectTriggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border bg-popover">
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-foreground/80">
                  Output Image
                </label>
                <Select
                  value={modelEditorDraft.output_image}
                  onValueChange={(value: TriStateCapability) =>
                    setModelEditorDraft({
                      ...modelEditorDraft,
                      output_image: value,
                    })
                  }
                >
                  <SelectTrigger className={providerSelectTriggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border bg-popover">
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="px-5 pb-5">
            <Button variant="ghost" onClick={closeModelDialog}>
              Cancel
            </Button>
            <Button onClick={handleSaveModel}>
              {modelEditorState?.mode === "edit" ? "Save Model" : "Add Model"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={providerToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setProviderToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete provider?</AlertDialogTitle>
            <AlertDialogDescription>
              {providerToDelete
                ? `This will permanently remove ${providerToDelete.name}.`
                : "This will permanently remove the selected provider."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={() => void handleDelete()}>
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageScaffold>
  );
}
