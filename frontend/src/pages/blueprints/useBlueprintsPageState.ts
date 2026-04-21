import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactFlowInstance } from "@xyflow/react";
import { toast } from "sonner";
import {
  createBlueprintRequest,
  deleteBlueprintRequest,
  fetchBlueprints,
  fetchRoles,
  updateBlueprintRequest,
} from "@/lib/api";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePanelDrag, usePanelWidth } from "@/hooks/usePanelDrag";
import type { AgentBlueprint, Role } from "@/types";
import {
  BLUEPRINT_FIT_VIEW_OPTIONS,
  buildBlueprintPayload,
  buildDisplayBlueprint,
  buildFlowGraph,
  buildVisibleVersionHistory,
  createBlueprintCreateDraft,
  createBlueprintEdgeDraft,
  createBlueprintEditDraft,
  createBlueprintSlotDraft,
  type BlueprintDraft,
  validateBlueprintDraft,
} from "@/pages/blueprints/lib";

const LIBRARY_PANEL_ID = "blueprints-library-width";
const INSPECTOR_PANEL_ID = "blueprints-inspector-width";

export function useBlueprintsPageState() {
  const isCompactLayout = useMediaQuery("(max-width: 1320px)");
  const [blueprints, setBlueprints] = useState<AgentBlueprint[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingBlueprints, setLoadingBlueprints] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(
    null,
  );
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [draft, setDraft] = useState<BlueprintDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingBlueprintId, setDeletingBlueprintId] = useState<string | null>(
    null,
  );
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [libraryWidth, setLibraryWidth] = usePanelWidth(
    LIBRARY_PANEL_ID,
    300,
    220,
    420,
  );
  const [inspectorWidth, setInspectorWidth] = usePanelWidth(
    INSPECTOR_PANEL_ID,
    360,
    300,
    520,
  );
  const { isDragging: isLibraryDragging, startDrag: startLibraryDrag } =
    usePanelDrag(libraryWidth, setLibraryWidth, "right");
  const { isDragging: isInspectorDragging, startDrag: startInspectorDrag } =
    usePanelDrag(inspectorWidth, setInspectorWidth, "left");
  const flowRef = useRef<ReactFlowInstance | null>(null);

  const refreshBlueprints = useCallback(async () => {
    setLoadingBlueprints(true);
    try {
      const items = await fetchBlueprints();
      setBlueprints(items);
      return items;
    } catch {
      toast.error("Failed to load blueprints");
      return null;
    } finally {
      setLoadingBlueprints(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchBlueprints()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setBlueprints(items);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to load blueprints");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingBlueprints(false);
        }
      });

    fetchRoles()
      .then((items) => {
        if (!cancelled) {
          setRoles(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to load roles");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingRoles(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isCompactLayout) {
      return;
    }
    setLibraryOpen(false);
    setInspectorOpen(false);
  }, [isCompactLayout]);

  useEffect(() => {
    if (blueprints.length === 0) {
      if (!draft) {
        setSelectedBlueprintId(null);
      }
      return;
    }
    if (
      selectedBlueprintId &&
      blueprints.some((blueprint) => blueprint.id === selectedBlueprintId)
    ) {
      return;
    }
    setSelectedBlueprintId(blueprints[0].id);
  }, [blueprints, draft, selectedBlueprintId]);

  const selectedBlueprint = useMemo(
    () =>
      blueprints.find((blueprint) => blueprint.id === selectedBlueprintId) ??
      null,
    [blueprints, selectedBlueprintId],
  );

  const displayBlueprint = useMemo(
    () => buildDisplayBlueprint(draft, selectedBlueprint),
    [draft, selectedBlueprint],
  );

  const flowGraph = useMemo(
    () => buildFlowGraph(displayBlueprint, selectedSlotId),
    [displayBlueprint, selectedSlotId],
  );

  const fitView = useCallback(() => {
    void flowRef.current?.fitView(BLUEPRINT_FIT_VIEW_OPTIONS);
  }, []);

  useEffect(() => {
    if (!flowRef.current || flowGraph.nodes.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      fitView();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [fitView, flowGraph]);

  const selectedSlot = useMemo(
    () =>
      displayBlueprint?.slots.find((slot) => slot.id === selectedSlotId) ??
      null,
    [displayBlueprint, selectedSlotId],
  );

  useEffect(() => {
    if (!selectedSlotId) {
      return;
    }
    if (displayBlueprint?.slots.some((slot) => slot.id === selectedSlotId)) {
      return;
    }
    setSelectedSlotId(null);
  }, [displayBlueprint, selectedSlotId]);

  const versionHistory = useMemo(
    () => buildVisibleVersionHistory(displayBlueprint),
    [displayBlueprint],
  );

  const beginCreateDraft = useCallback(() => {
    setDraft(createBlueprintCreateDraft());
    setSelectedSlotId(null);
    if (isCompactLayout) {
      setInspectorOpen(true);
    }
  }, [isCompactLayout]);

  const beginEditDraft = useCallback(
    (blueprint: AgentBlueprint) => {
      setDraft(createBlueprintEditDraft(blueprint));
      setSelectedBlueprintId(blueprint.id);
      setSelectedSlotId(null);
      if (isCompactLayout) {
        setInspectorOpen(true);
      }
    },
    [isCompactLayout],
  );

  const cancelDraft = useCallback(() => {
    setDraft(null);
    setSelectedSlotId(null);
  }, []);

  const updateDraft = useCallback(
    (updater: (current: BlueprintDraft) => BlueprintDraft) => {
      setDraft((current) => (current ? updater(current) : current));
    },
    [],
  );

  const updateDraftName = useCallback(
    (value: string) => {
      updateDraft((current) => ({
        ...current,
        name: value,
      }));
    },
    [updateDraft],
  );

  const updateDraftDescription = useCallback(
    (value: string) => {
      updateDraft((current) => ({
        ...current,
        description: value,
      }));
    },
    [updateDraft],
  );

  const addDraftSlot = useCallback(() => {
    updateDraft((current) => ({
      ...current,
      slots: [...current.slots, createBlueprintSlotDraft()],
    }));
  }, [updateDraft]);

  const updateDraftSlot = useCallback(
    (slotId: string, field: "role_name" | "display_name", value: string) => {
      updateDraft((current) => ({
        ...current,
        slots: current.slots.map((slot) =>
          slot.id === slotId
            ? {
                ...slot,
                [field]: field === "display_name" ? value || null : value,
              }
            : slot,
        ),
      }));
    },
    [updateDraft],
  );

  const removeDraftSlot = useCallback(
    (slotId: string) => {
      updateDraft((current) => ({
        ...current,
        slots: current.slots.filter((slot) => slot.id !== slotId),
        edges: current.edges.filter(
          (edge) => edge.from_slot_id !== slotId && edge.to_slot_id !== slotId,
        ),
      }));
      setSelectedSlotId((current) => (current === slotId ? null : current));
    },
    [updateDraft],
  );

  const addDraftEdge = useCallback(() => {
    updateDraft((current) => ({
      ...current,
      edges: [
        ...current.edges,
        createBlueprintEdgeDraft(current.slots, selectedSlotId),
      ],
    }));
  }, [selectedSlotId, updateDraft]);

  const updateDraftEdge = useCallback(
    (index: number, field: "from_slot_id" | "to_slot_id", value: string) => {
      updateDraft((current) => ({
        ...current,
        edges: current.edges.map((edge, edgeIndex) =>
          edgeIndex === index ? { ...edge, [field]: value } : edge,
        ),
      }));
    },
    [updateDraft],
  );

  const removeDraftEdge = useCallback(
    (index: number) => {
      updateDraft((current) => ({
        ...current,
        edges: current.edges.filter((_, edgeIndex) => edgeIndex !== index),
      }));
    },
    [updateDraft],
  );

  const saveDraft = useCallback(async () => {
    if (!draft) {
      return;
    }

    const validationError = validateBlueprintDraft(draft);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const payload = buildBlueprintPayload(draft);

    setSaving(true);
    try {
      const saved =
        draft.mode === "edit" && draft.sourceId
          ? await updateBlueprintRequest(draft.sourceId, payload)
          : await createBlueprintRequest(payload);
      await refreshBlueprints();
      setDraft(null);
      setSelectedBlueprintId(saved.id);
      setSelectedSlotId(null);
      toast.success(
        draft.mode === "edit" ? "Blueprint updated" : "Blueprint created",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save blueprint",
      );
    } finally {
      setSaving(false);
    }
  }, [draft, refreshBlueprints]);

  const requestDeleteBlueprint = useCallback((blueprintId: string) => {
    setDeletingBlueprintId(blueprintId);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeletingBlueprintId(null);
  }, []);

  const confirmDeleteBlueprint = useCallback(async () => {
    if (!deletingBlueprintId) {
      return;
    }
    try {
      await deleteBlueprintRequest(deletingBlueprintId);
      const items = await refreshBlueprints();
      if (draft?.sourceId === deletingBlueprintId) {
        setDraft(null);
      }
      setSelectedSlotId(null);
      if (items) {
        const nextId =
          items.find((blueprint) => blueprint.id !== deletingBlueprintId)?.id ??
          null;
        setSelectedBlueprintId(nextId);
      }
      toast.success("Blueprint deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete blueprint",
      );
    } finally {
      setDeletingBlueprintId(null);
    }
  }, [deletingBlueprintId, draft?.sourceId, refreshBlueprints]);

  const selectBlueprint = useCallback(
    (blueprintId: string) => {
      setDraft(null);
      setSelectedSlotId(null);
      setSelectedBlueprintId(blueprintId);
      if (isCompactLayout) {
        setLibraryOpen(false);
      }
    },
    [isCompactLayout],
  );

  const selectNode = useCallback(
    (nodeId: string) => {
      setSelectedSlotId(nodeId);
      if (isCompactLayout) {
        setInspectorOpen(true);
      }
    },
    [isCompactLayout],
  );

  const handleFlowInit = useCallback((instance: ReactFlowInstance) => {
    flowRef.current = instance;
  }, []);

  const openLibrary = useCallback(() => {
    setLibraryOpen(true);
  }, []);

  const closeLibrary = useCallback(() => {
    setLibraryOpen(false);
  }, []);

  const openInspector = useCallback(() => {
    setInspectorOpen(true);
  }, []);

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
  }, []);

  return {
    blueprints,
    deletingBlueprintId,
    displayBlueprint,
    draft,
    flowGraph,
    handleFlowInit,
    inspectorOpen,
    inspectorWidth,
    isCompactLayout,
    isInspectorDragging,
    isLibraryDragging,
    libraryOpen,
    libraryWidth,
    loadingBlueprints,
    loadingRoles,
    roles,
    saving,
    selectedBlueprint,
    selectedBlueprintId,
    selectedSlot,
    startInspectorDrag,
    startLibraryDrag,
    versionHistory,
    actions: {
      addDraftEdge,
      addDraftSlot,
      beginCreateDraft,
      beginEditDraft,
      cancelDraft,
      closeDeleteDialog,
      closeInspector,
      closeLibrary,
      confirmDeleteBlueprint,
      fitView,
      openInspector,
      openLibrary,
      removeDraftEdge,
      removeDraftSlot,
      requestDeleteBlueprint,
      saveDraft,
      selectBlueprint,
      selectNode,
      updateDraftDescription,
      updateDraftEdge,
      updateDraftName,
      updateDraftSlot,
    },
  };
}
