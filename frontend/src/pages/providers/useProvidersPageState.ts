import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  createProvider,
  deleteProvider,
  fetchProviderCatalogPreview,
  fetchProviders,
  testProviderModelRequest,
  updateProvider,
} from "@/lib/api";
import { usePanelDrag, usePanelWidth } from "@/hooks/usePanelDrag";
import { parseProviderHeadersInput } from "@/lib/providerHeaders";
import { buildProviderRequestPreview } from "@/lib/providerUrls";
import type { Provider, ProviderModelCatalogEntry } from "@/types";
import {
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
} from "@/pages/providers/lib";

export function useProvidersPageState() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<ProviderDraft>(createProviderDraft());
  const [saving, setSaving] = useState(false);
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
      if (!selectedId || items.find((provider) => provider.id === selectedId)) {
        return;
      }
      setSelectedId(null);
      setIsCreating(false);
      setDraft(createProviderDraft());
      setModelTestStates({});
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

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedId),
    [providers, selectedId],
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

  const handleSelect = useCallback((provider: Provider) => {
    setSelectedId(provider.id);
    setIsCreating(false);
    setDraft(createProviderDraft(provider));
    setModelTestStates({});
    setModelEditorState(null);
  }, []);

  const handleCreateNew = useCallback(() => {
    setIsCreating(true);
    setSelectedId(null);
    setDraft(createProviderDraft());
    setModelTestStates({});
    setModelEditorState(null);
  }, []);

  const handleCancel = useCallback(() => {
    if (isCreating) {
      setIsCreating(false);
      setDraft(createProviderDraft());
    } else {
      setDraft(createProviderDraft(selectedProvider));
    }
    setModelTestStates({});
    setModelEditorState(null);
  }, [isCreating, selectedProvider]);

  const handleSave = useCallback(async () => {
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
  }, [
    draft,
    endpointPreview.error,
    isCreating,
    mutateProviders,
    parsedHeaders.error,
    parsedHeaders.headers,
    providers,
    selectedId,
  ]);

  const handleDelete = useCallback(async () => {
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
  }, [mutateProviders, providerToDelete, providers, selectedId]);

  const openCreateModelDialog = useCallback(() => {
    setModelEditorState({ mode: "create", originalModel: null });
    setModelEditorDraft(createProviderModelEditorDraft());
  }, []);

  const openEditModelDialog = useCallback(
    (entry: ProviderModelCatalogEntry) => {
      setModelEditorState({ mode: "edit", originalModel: entry.model });
      setModelEditorDraft(createProviderModelEditorDraft(entry));
    },
    [],
  );

  const closeModelDialog = useCallback(() => {
    setModelEditorState(null);
    setModelEditorDraft(createProviderModelEditorDraft());
  }, []);

  const handleSaveModel = useCallback(() => {
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
  }, [closeModelDialog, draft.models, modelEditorDraft, modelEditorState]);

  const handleDeleteModel = useCallback((modelId: string) => {
    setDraft((current) => ({
      ...current,
      models: current.models.filter((entry) => entry.model !== modelId),
    }));
    setModelTestStates((current) => {
      const next = { ...current };
      delete next[modelId];
      return next;
    });
  }, []);

  const handleFetchModels = useCallback(async () => {
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
  }, [
    draft,
    endpointPreview.error,
    parsedHeaders.error,
    parsedHeaders.headers,
    selectedId,
  ]);

  const handleTestModel = useCallback(
    async (entry: ProviderModelCatalogEntry) => {
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
    },
    [
      draft,
      endpointPreview.error,
      parsedHeaders.error,
      parsedHeaders.headers,
      selectedId,
    ],
  );

  return {
    draft,
    endpointPreview,
    fetchingModels,
    handleCancel,
    handleCreateNew,
    handleDelete,
    handleDeleteModel,
    handleFetchModels,
    handleSave,
    handleSaveModel,
    handleSelect,
    handleTestModel,
    hasChanges,
    isCreating,
    isDragging,
    loading,
    modelEditorDraft,
    modelEditorState,
    modelTestStates,
    openCreateModelDialog,
    openEditModelDialog,
    panelWidth,
    parsedHeaders,
    providerToDelete,
    providers,
    refreshProviders,
    saving,
    selectedId,
    selectedProvider,
    setDraft,
    setModelEditorDraft,
    setProviderToDelete,
    startDrag,
    closeModelDialog,
  };
}
