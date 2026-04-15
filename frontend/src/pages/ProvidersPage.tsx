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
import {
  formatProviderHeaders,
  parseProviderHeadersInput,
} from "@/lib/providerHeaders";
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

type TriStateCapability = "auto" | "enabled" | "disabled";

type ProviderDraft = Omit<Provider, "id" | "headers"> & {
  headers_text: string;
};

type ProviderModelEditorDraft = {
  model: string;
  context_window_tokens: string;
  input_image: TriStateCapability;
  output_image: TriStateCapability;
  source: "discovered" | "manual";
};

type ProviderModelEditorState = {
  mode: "create" | "edit";
  originalModel: string | null;
} | null;

type ProviderModelTestState =
  | {
      state: "running";
    }
  | {
      state: "success";
      duration_ms: number;
    }
  | {
      state: "error";
      error_summary: string;
    };

function triStateFromNullableBool(value: boolean | null): TriStateCapability {
  if (value === true) {
    return "enabled";
  }
  if (value === false) {
    return "disabled";
  }
  return "auto";
}

function nullableBoolFromTriState(value: TriStateCapability): boolean | null {
  if (value === "enabled") {
    return true;
  }
  if (value === "disabled") {
    return false;
  }
  return null;
}

function createProviderDraft(provider?: Provider | null): ProviderDraft {
  if (!provider) {
    return {
      name: "",
      type: "openai_compatible",
      base_url: "",
      api_key: "",
      headers_text: "",
      retry_429_delay_seconds: 0,
      models: [],
    };
  }
  return {
    name: provider.name,
    type: provider.type,
    base_url: provider.base_url,
    api_key: provider.api_key,
    headers_text: formatProviderHeaders(provider.headers),
    retry_429_delay_seconds: provider.retry_429_delay_seconds,
    models: provider.models.map((entry) => ({ ...entry })),
  };
}

function createProviderModelEditorDraft(
  entry?: ProviderModelCatalogEntry | null,
): ProviderModelEditorDraft {
  return {
    model: entry?.model ?? "",
    context_window_tokens:
      entry?.context_window_tokens === null ||
      entry?.context_window_tokens === undefined
        ? ""
        : String(entry.context_window_tokens),
    input_image: triStateFromNullableBool(entry?.input_image ?? null),
    output_image: triStateFromNullableBool(entry?.output_image ?? null),
    source: entry?.source ?? "manual",
  };
}

function serializeProviderDraft(draft: ProviderDraft): string {
  return JSON.stringify({
    name: draft.name,
    type: draft.type,
    base_url: draft.base_url,
    api_key: draft.api_key,
    headers_text: draft.headers_text,
    retry_429_delay_seconds: draft.retry_429_delay_seconds,
    models: draft.models,
  });
}

function buildProviderPayload(
  draft: ProviderDraft,
  headers: Record<string, string>,
): Omit<Provider, "id"> {
  return {
    name: draft.name,
    type: draft.type,
    base_url: draft.base_url,
    api_key: draft.api_key,
    headers,
    retry_429_delay_seconds: draft.retry_429_delay_seconds,
    models: draft.models,
  };
}

function mergeFetchedModelsIntoDraft(
  existing: ProviderModelCatalogEntry[],
  fetched: ProviderModelCatalogEntry[],
): ProviderModelCatalogEntry[] {
  const existingByModel = new Map(
    existing.map((entry) => [entry.model, entry]),
  );
  const fetchedByModel = new Map(fetched.map((entry) => [entry.model, entry]));
  const merged: ProviderModelCatalogEntry[] = [];

  for (const entry of existing) {
    const discoveredEntry = fetchedByModel.get(entry.model);
    if (!discoveredEntry) {
      merged.push(entry);
      continue;
    }
    if (entry.source === "manual") {
      merged.push({
        ...entry,
        context_window_tokens:
          entry.context_window_tokens ?? discoveredEntry.context_window_tokens,
        input_image: entry.input_image ?? discoveredEntry.input_image,
        output_image: entry.output_image ?? discoveredEntry.output_image,
      });
      fetchedByModel.delete(entry.model);
      continue;
    }
    merged.push(discoveredEntry);
    fetchedByModel.delete(entry.model);
  }

  for (const entry of fetched) {
    if (existingByModel.has(entry.model)) {
      continue;
    }
    merged.push(entry);
  }

  return merged;
}

function buildModelSummary(entry: ProviderModelCatalogEntry): string {
  const parts: string[] = [];
  if (entry.context_window_tokens !== null) {
    parts.push(`${entry.context_window_tokens.toLocaleString()} tokens`);
  }
  if (entry.input_image !== null) {
    parts.push(`input_image=${entry.input_image ? "true" : "false"}`);
  }
  if (entry.output_image !== null) {
    parts.push(`output_image=${entry.output_image ? "true" : "false"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "No capability metadata";
}

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

    const duplicateModels = new Set<string>();
    for (const entry of draft.models) {
      if (duplicateModels.has(entry.model.trim())) {
        toast.error(`Model ID '${entry.model}' is duplicated`);
        return;
      }
      duplicateModels.add(entry.model.trim());
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
    const modelId = modelEditorDraft.model.trim();
    if (!modelId) {
      toast.error("Model ID is required");
      return;
    }
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
    if (
      modelEditorDraft.context_window_tokens &&
      !/^\d+$/.test(modelEditorDraft.context_window_tokens)
    ) {
      toast.error("Context Window must be a positive integer");
      return;
    }

    const nextEntry: ProviderModelCatalogEntry = {
      model: modelId,
      source: modelEditorDraft.source,
      context_window_tokens: modelEditorDraft.context_window_tokens
        ? Number.parseInt(modelEditorDraft.context_window_tokens, 10)
        : null,
      input_image: nullableBoolFromTriState(modelEditorDraft.input_image),
      output_image: nullableBoolFromTriState(modelEditorDraft.output_image),
    };

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
      const fetchedModels = await fetchProviderCatalogPreview({
        provider_id: selectedId ?? undefined,
        name: draft.name,
        type: draft.type,
        base_url: draft.base_url,
        api_key: draft.api_key,
        headers: parsedHeaders.headers,
        retry_429_delay_seconds: draft.retry_429_delay_seconds,
      });
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
        provider_id: selectedId ?? undefined,
        name: draft.name,
        type: draft.type,
        base_url: draft.base_url,
        api_key: draft.api_key,
        headers: parsedHeaders.headers,
        retry_429_delay_seconds: draft.retry_429_delay_seconds,
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
          className="relative flex shrink-0 flex-col border-r border-white/[0.04] bg-white/[0.01] pt-8 pl-8"
        >
          <div className="flex shrink-0 items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-white/40" />
              <span className="text-[13px] font-medium text-white/80">
                Providers
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void refreshProviders()}
                disabled={loading}
                className="flex size-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                <RefreshCw
                  className={cn("size-3.5", loading && "animate-spin")}
                />
              </button>
              <button
                type="button"
                onClick={handleCreateNew}
                className="flex size-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.04] hover:text-white"
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
                    className="h-10 w-full animate-pulse rounded-lg bg-white/[0.02]"
                  />
                ))}
              </div>
            ) : providers.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-10 text-center"
              >
                <p className="text-[13px] text-white/40">No providers</p>
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/[0.06]"
                >
                  <Plus className="size-3" />
                  Add your first provider
                </button>
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
                        ? "bg-white/[0.06] text-white"
                        : "text-white/60 hover:bg-white/[0.03] hover:text-white/90",
                    )}
                  >
                    <div
                      className={cn(
                        "absolute inset-y-1 left-0 w-px rounded-full bg-white/40 transition-opacity",
                        selectedId === provider.id
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <div className="min-w-0 flex-1 pl-2">
                      <p className="truncate text-[13px] font-medium">
                        {provider.name}
                      </p>
                      <p className="truncate text-[11px] text-white/40">
                        {providerTypeLabel(provider.type)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setProviderToDelete(provider);
                      }}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-white/[0.08] hover:text-red-400 group-hover:opacity-100"
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
                  <h2 className="text-xl font-medium text-white/90">
                    {isCreating ? "New Provider" : selectedProvider?.name}
                  </h2>
                  <p className="mt-1 text-[13px] text-white/40">
                    {isCreating
                      ? "Configure a new provider and its model catalog"
                      : `ID: ${selectedProvider?.id}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {hasChanges ? (
                    <>
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={saving}
                        className="rounded-full px-4 py-1.5 text-[13px] font-medium text-white/60 transition-colors hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        <Check className="size-3.5" />
                        {saving ? "Saving..." : "Save"}
                      </button>
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
                      className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/30 transition-colors focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                    />
                  </SettingsRow>
                  <SettingsRow label="Type">
                    <Select
                      value={draft.type}
                      onValueChange={(value) =>
                        setDraft({ ...draft, type: value })
                      }
                    >
                      <SelectTrigger className="w-full rounded-lg border-white/[0.06] bg-white/[0.02] text-[13px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-white/[0.08] bg-black/80 backdrop-blur-xl">
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

                <div className="border-t border-white/[0.04] pt-8">
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
                        className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/30 transition-colors focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                      />
                    </SettingsRow>
                    <SettingsRow
                      label="Request Preview"
                      description="Resolved endpoint based on the current draft"
                    >
                      <div
                        className={cn(
                          "w-full rounded-lg border px-3.5 py-2.5 text-[12px]",
                          endpointPreview.error
                            ? "border-red-500/20 bg-red-500/5 text-red-400"
                            : "border-white/[0.04] bg-white/[0.01] text-white/70",
                        )}
                      >
                        {endpointPreview.error ? (
                          endpointPreview.error
                        ) : endpointPreview.previewUrl ? (
                          <code className="font-mono">
                            {endpointPreview.previewUrl}
                          </code>
                        ) : (
                          <span className="text-white/30">
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
                          className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 pr-10 text-[13px] text-white placeholder:text-white/30 transition-colors focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey((current) => !current)}
                          className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
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
                            "min-h-[140px] w-full rounded-lg border bg-white/[0.02] px-3.5 py-3 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:outline-none",
                            parsedHeaders.error
                              ? "border-red-500/30 focus:border-red-500/50 text-red-300"
                              : "border-white/[0.06] focus:border-white/20 focus:bg-white/[0.04]",
                          )}
                        />
                        {parsedHeaders.error ? (
                          <p className="text-[11px] text-red-400">
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
                            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                          />
                          <span className="text-[13px] font-medium text-white/40">
                            s
                          </span>
                        </div>
                        <p className="text-[11px] text-white/40 leading-relaxed">
                          Adds extra wait only when this provider returns HTTP
                          429 and the system continues retrying.
                        </p>
                      </div>
                    </SettingsRow>
                  </div>
                </div>

                <div className="border-t border-white/[0.04] pt-8">
                  <SectionHeader
                    title="Models"
                    description="Manage this provider-scoped model catalog, fetch discovered entries, and run model-level tests against the current draft."
                  />

                  <div className="space-y-4 rounded-2xl border border-white/[0.04] bg-white/[0.01] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-medium text-white/80">
                          {draft.models.length} model
                          {draft.models.length === 1 ? "" : "s"}
                        </p>
                        <p className="mt-1 text-[11px] text-white/40">
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
                      <div className="rounded-xl border border-dashed border-white/[0.08] bg-black/10 px-4 py-5 text-center">
                        <p className="text-[13px] font-medium text-white/70">
                          No models in this provider draft
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-white/40">
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
                              className="rounded-xl border border-white/[0.05] bg-black/12 px-4 py-3"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate font-mono text-[13px] text-white/85">
                                      {entry.model}
                                    </p>
                                    <span
                                      className={cn(
                                        "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]",
                                        entry.source === "manual"
                                          ? "border-amber-300/20 bg-amber-300/[0.08] text-amber-100/80"
                                          : "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100/80",
                                      )}
                                    >
                                      {entry.source === "manual"
                                        ? "Manual"
                                        : "Discovered"}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[11px] leading-relaxed text-white/40">
                                    {buildModelSummary(entry)}
                                  </p>
                                  {testState?.state === "running" ? (
                                    <p className="mt-2 text-[11px] text-white/55">
                                      Testing this model against the current
                                      draft provider...
                                    </p>
                                  ) : null}
                                  {testState?.state === "success" ? (
                                    <p className="mt-2 text-[11px] text-emerald-200/80">
                                      Test succeeded in {testState.duration_ms}
                                      ms
                                    </p>
                                  ) : null}
                                  {testState?.state === "error" ? (
                                    <p className="mt-2 text-[11px] text-red-300/85">
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
                  <div className="border-t border-white/[0.04] pt-8">
                    <SettingsRow label="Provider ID" description="Read-only">
                      <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] px-3.5 py-2.5 font-mono text-[12px] text-white/70">
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
              <div className="flex size-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.02] shadow-sm">
                <Server className="size-5 text-white/40" />
              </div>
              <h3 className="mt-5 text-[15px] font-medium text-white/90">
                No Provider Selected
              </h3>
              <p className="mt-1.5 max-w-sm text-[13px] text-white/40">
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
              <label className="text-[13px] font-medium text-white/80">
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
                className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[13px] font-medium text-white/80">
                Source
              </label>
              <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] px-3.5 py-2.5 text-[13px] text-white/70">
                {modelEditorDraft.source === "manual" ? "Manual" : "Discovered"}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[13px] font-medium text-white/80">
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
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                />
                <span className="text-[13px] font-medium text-white/40">
                  tokens
                </span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-white/80">
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
                  <SelectTrigger className="w-full rounded-lg border-white/[0.06] bg-white/[0.02] text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-white/[0.08] bg-black/80 backdrop-blur-xl">
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-medium text-white/80">
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
                  <SelectTrigger className="w-full rounded-lg border-white/[0.06] bg-white/[0.02] text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-white/[0.08] bg-black/80 backdrop-blur-xl">
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
