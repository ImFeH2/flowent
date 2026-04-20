import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Background,
  Handle,
  Position,
  ReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
  type NodeTypes,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnimatePresence, motion } from "motion/react";
import {
  BookCopy,
  Bot,
  LayoutPanelLeft,
  PanelRightClose,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createBlueprintRequest,
  deleteBlueprintRequest,
  fetchBlueprints,
  fetchRoles,
  updateBlueprintRequest,
} from "@/lib/api";
import type {
  AgentBlueprint,
  BlueprintEdge,
  BlueprintSlot,
  BlueprintVersionSummary,
  Role,
} from "@/types";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePanelDrag, usePanelWidth } from "@/hooks/usePanelDrag";
import { getLayoutedElements, getAgentNodeWidth } from "@/lib/layout";
import { formatLocalTimestamp } from "@/lib/datetime";
import { PanelResizer } from "@/components/PanelResizer";
import {
  formInputClass,
  formTextareaClass,
} from "@/components/form/FormControls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { PageScaffold, PageTitleBar } from "@/components/layout/PageScaffold";

const LIBRARY_PANEL_ID = "blueprints-library-width";
const INSPECTOR_PANEL_ID = "blueprints-inspector-width";
const blueprintFormInputClass = `${formInputClass} text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50`;
const blueprintFormTextareaClass = `min-h-[108px] ${formTextareaClass} text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50`;
const blueprintChoiceListClass =
  "max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border bg-background/35 p-2 scrollbar-none";

type DraftMode = "create" | "edit";

interface BlueprintDraft {
  sourceId: string | null;
  mode: DraftMode;
  name: string;
  description: string;
  slots: BlueprintSlot[];
  edges: BlueprintEdge[];
  baseVersion: number | null;
  versionHistory: BlueprintVersionSummary[];
}

interface BlueprintViewModel {
  name: string;
  description: string;
  version: number | null;
  slots: BlueprintSlot[];
  edges: BlueprintEdge[];
  updated_at: number | null;
  version_history: BlueprintVersionSummary[];
  isDraft: boolean;
}

interface BlueprintFlowNodeData extends Record<string, unknown> {
  label: string;
  roleName: string | null;
  selected: boolean;
}

function getCanonicalEdgeId(leftId: string, rightId: string) {
  return leftId <= rightId
    ? `${leftId}<->${rightId}`
    : `${rightId}<->${leftId}`;
}

function getHorizontalHandleIds(
  sourcePosition: { x: number; y: number } | undefined,
  targetPosition: { x: number; y: number } | undefined,
) {
  if ((sourcePosition?.x ?? 0) <= (targetPosition?.x ?? 0)) {
    return {
      sourceHandle: "right-source",
      targetHandle: "left-target",
    };
  }
  return {
    sourceHandle: "left-source",
    targetHandle: "right-target",
  };
}

function createBlueprintSlotDraft(roleName = "Worker"): BlueprintSlot {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role_name: roleName,
    display_name: null,
  };
}

function createBlueprintEdgeDraft(
  slots: BlueprintSlot[],
  sourceSlotId?: string | null,
): BlueprintEdge {
  const validTargets = slots.map((slot) => slot.id);
  const nextSource =
    sourceSlotId && validTargets.includes(sourceSlotId)
      ? sourceSlotId
      : (validTargets[0] ?? "");
  const nextTarget =
    validTargets.find((candidate) => candidate !== nextSource) ?? "";

  return {
    from_slot_id: nextSource,
    to_slot_id: nextTarget,
  };
}

function resolveVersionHistory(
  blueprint: Pick<AgentBlueprint, "version" | "updated_at" | "version_history">,
): BlueprintVersionSummary[] {
  if (blueprint.version_history && blueprint.version_history.length > 0) {
    return blueprint.version_history;
  }
  return [
    {
      version: blueprint.version,
      updated_at: blueprint.updated_at,
    },
  ];
}

function BlueprintFlowNode({ data }: NodeProps) {
  const { label, roleName, selected } = data as BlueprintFlowNodeData;

  return (
    <div
      className={cn(
        "group relative min-w-[140px] rounded-xl border border-border bg-card/85 px-4 py-3 shadow-[0_18px_36px_-26px_var(--shell-scrim)] transition-[border-color,background-color,box-shadow] duration-200",
        selected
          ? "shadow-lg shadow-ring/10 ring-1 ring-ring/35"
          : "hover:border-ring/25 hover:bg-accent/20",
      )}
    >
      <Handle
        id="left-source"
        type="source"
        position={Position.Left}
        className="!top-[36%] !size-2 !-translate-y-1/2 !border-graph-handle-border !bg-graph-handle-bg !opacity-0"
      />
      <Handle
        id="left-target"
        type="target"
        position={Position.Left}
        className="!top-[64%] !size-2 !-translate-y-1/2 !border-graph-handle-border !bg-graph-handle-bg !opacity-0"
      />
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-accent/35 text-foreground/80">
          <Bot className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-foreground">
            {label}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80">
            {roleName}
          </p>
        </div>
      </div>
      <Handle
        id="right-source"
        type="source"
        position={Position.Right}
        className="!top-[36%] !size-2 !-translate-y-1/2 !border-graph-handle-border !bg-graph-handle-bg !opacity-0"
      />
      <Handle
        id="right-target"
        type="target"
        position={Position.Right}
        className="!top-[64%] !size-2 !-translate-y-1/2 !border-graph-handle-border !bg-graph-handle-bg !opacity-0"
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  blueprint: BlueprintFlowNode,
};

function buildFlowGraph(
  blueprint: BlueprintViewModel | null,
  selectedSlotId: string | null,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  if (!blueprint) {
    return { nodes: [], edges: [] };
  }

  const baseNodes: FlowNode[] = blueprint.slots.map((slot) => {
    const label = slot.display_name || slot.role_name;
    return {
      id: slot.id,
      type: "blueprint",
      position: { x: 0, y: 0 },
      width: getAgentNodeWidth(label),
      data: {
        label,
        roleName: slot.role_name,
        selected: selectedSlotId === slot.id,
      },
      selectable: true,
      draggable: false,
    } satisfies FlowNode;
  });

  const nodeIds = new Set(baseNodes.map((node) => node.id));
  const seenEdgeIds = new Set<string>();
  const baseEdges: FlowEdge[] = [];
  for (const edge of blueprint.edges) {
    if (!nodeIds.has(edge.from_slot_id) || !nodeIds.has(edge.to_slot_id)) {
      continue;
    }
    const edgeId = getCanonicalEdgeId(edge.from_slot_id, edge.to_slot_id);
    if (seenEdgeIds.has(edgeId)) {
      continue;
    }
    seenEdgeIds.add(edgeId);
    const [source, target] =
      edge.from_slot_id <= edge.to_slot_id
        ? [edge.from_slot_id, edge.to_slot_id]
        : [edge.to_slot_id, edge.from_slot_id];
    baseEdges.push({
      id: edgeId,
      source,
      target,
      type: "smoothstep",
      animated: false,
      style: {
        stroke: "var(--graph-edge)",
        strokeWidth: 1.5,
      },
      selectable: false,
    });
  }

  const layouted = getLayoutedElements(baseNodes, baseEdges);
  const nodePositions = new Map(
    layouted.nodes.map((node) => [node.id, node.position] as const),
  );

  return {
    nodes: layouted.nodes,
    edges: layouted.edges.map((edge) => ({
      ...edge,
      ...getHorizontalHandleIds(
        nodePositions.get(edge.source),
        nodePositions.get(edge.target),
      ),
    })),
  };
}

function DrawerShell({
  align,
  children,
  onClose,
}: {
  align: "left" | "right";
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <>
      <motion.button
        type="button"
        aria-label="Close drawer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        className="absolute inset-0 z-20 bg-background/44 backdrop-blur-[2px]"
      />
      <motion.aside
        initial={{ opacity: 0, x: align === "left" ? -20 : 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: align === "left" ? -20 : 20 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "absolute inset-y-0 z-30 w-[min(24rem,calc(100%-1.5rem))] overflow-hidden rounded-xl border border-border bg-popover shadow-md",
          align === "left" ? "left-0" : "right-0",
        )}
      >
        {children}
      </motion.aside>
    </>
  );
}

export function BlueprintsPage() {
  const isCompactLayout = useMediaQuery("(max-width: 1320px)");
  const [blueprints, setBlueprints] = useState<AgentBlueprint[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loadingBlueprints, setLoadingBlueprints] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(
    null,
  );
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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

  const filteredBlueprints = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return blueprints;
    }
    return blueprints.filter((blueprint) =>
      `${blueprint.name} ${blueprint.description}`
        .toLowerCase()
        .includes(query),
    );
  }, [blueprints, searchQuery]);

  const displayBlueprint = useMemo<BlueprintViewModel | null>(() => {
    if (draft) {
      return {
        name: draft.name,
        description: draft.description,
        version: draft.mode === "edit" ? draft.baseVersion : null,
        slots: draft.slots,
        edges: draft.edges,
        updated_at:
          draft.mode === "edit"
            ? (draft.versionHistory[draft.versionHistory.length - 1]
                ?.updated_at ?? null)
            : null,
        version_history: draft.versionHistory,
        isDraft: true,
      };
    }
    if (!selectedBlueprint) {
      return null;
    }
    return {
      name: selectedBlueprint.name,
      description: selectedBlueprint.description,
      version: selectedBlueprint.version,
      slots: selectedBlueprint.slots,
      edges: selectedBlueprint.edges,
      updated_at: selectedBlueprint.updated_at,
      version_history: resolveVersionHistory(selectedBlueprint),
      isDraft: false,
    };
  }, [draft, selectedBlueprint]);

  const flowGraph = useMemo(
    () => buildFlowGraph(displayBlueprint, selectedSlotId),
    [displayBlueprint, selectedSlotId],
  );

  useEffect(() => {
    if (!flowRef.current || flowGraph.nodes.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      void flowRef.current?.fitView({
        duration: 180,
        padding: 0.2,
        maxZoom: 1.05,
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [flowGraph]);

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

  const visibleVersionHistory = useMemo(
    () =>
      displayBlueprint?.version_history.length
        ? displayBlueprint.version_history
        : displayBlueprint?.version != null &&
            displayBlueprint.updated_at != null
          ? [
              {
                version: displayBlueprint.version,
                updated_at: displayBlueprint.updated_at,
              },
            ]
          : [],
    [displayBlueprint],
  );

  const filteredRoles = useCallback(
    (query: string) => {
      const normalized = query.trim().toLowerCase();
      if (!normalized) {
        return roles;
      }
      return roles.filter((role) =>
        `${role.name} ${role.description}`.toLowerCase().includes(normalized),
      );
    },
    [roles],
  );

  const beginCreateDraft = useCallback(() => {
    setDraft({
      sourceId: null,
      mode: "create",
      name: "",
      description: "",
      slots: [],
      edges: [],
      baseVersion: null,
      versionHistory: [],
    });
    setSelectedSlotId(null);
    if (isCompactLayout) {
      setInspectorOpen(true);
    }
  }, [isCompactLayout]);

  const beginEditDraft = useCallback(
    (blueprint: AgentBlueprint) => {
      setDraft({
        sourceId: blueprint.id,
        mode: "edit",
        name: blueprint.name,
        description: blueprint.description,
        slots: blueprint.slots.map((slot) => ({
          id: slot.id,
          role_name: slot.role_name,
          display_name: slot.display_name,
        })),
        edges: blueprint.edges.map((edge) => ({
          from_slot_id: edge.from_slot_id,
          to_slot_id: edge.to_slot_id,
        })),
        baseVersion: blueprint.version,
        versionHistory: resolveVersionHistory(blueprint),
      });
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

  const handleSaveDraft = useCallback(async () => {
    if (!draft) {
      return;
    }

    const name = draft.name.trim();
    if (!name) {
      toast.error("Blueprint name is required");
      return;
    }
    if (draft.slots.length === 0) {
      toast.error("Blueprint needs at least one slot");
      return;
    }

    const validNodeIds = new Set(draft.slots.map((slot) => slot.id));
    const hasInvalidEdge = draft.edges.some(
      (edge) =>
        !validNodeIds.has(edge.from_slot_id) ||
        !validNodeIds.has(edge.to_slot_id) ||
        edge.from_slot_id === edge.to_slot_id,
    );
    if (hasInvalidEdge) {
      toast.error(
        "All blueprint connections must link two different valid slots",
      );
      return;
    }
    const seenConnectionIds = new Set<string>();
    for (const edge of draft.edges) {
      const edgeId = getCanonicalEdgeId(edge.from_slot_id, edge.to_slot_id);
      if (seenConnectionIds.has(edgeId)) {
        toast.error("Duplicate blueprint connections are not allowed");
        return;
      }
      seenConnectionIds.add(edgeId);
    }

    const payload = {
      name,
      description: draft.description.trim(),
      slots: draft.slots.map((slot) => ({
        id: slot.id,
        role_name: slot.role_name.trim(),
        display_name: slot.display_name?.trim() || null,
      })),
      edges: draft.edges.map((edge) => ({
        from_slot_id: edge.from_slot_id,
        to_slot_id: edge.to_slot_id,
      })),
    };

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

  const handleDeleteBlueprint = useCallback(async () => {
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

  const libraryPanel = (
    <BlueprintLibraryColumn
      blueprints={filteredBlueprints}
      loading={loadingBlueprints}
      searchQuery={searchQuery}
      selectedBlueprintId={selectedBlueprintId}
      totalCount={blueprints.length}
      onCreateBlueprint={beginCreateDraft}
      onSearchChange={setSearchQuery}
      onSelectBlueprint={(blueprintId) => {
        setDraft(null);
        setSelectedSlotId(null);
        setSelectedBlueprintId(blueprintId);
        if (isCompactLayout) {
          setLibraryOpen(false);
        }
      }}
    />
  );

  const inspectorPanel = (
    <BlueprintInspectorColumn
      blueprint={displayBlueprint}
      deletingDisabled={!selectedBlueprint}
      draft={draft}
      filteredRoles={filteredRoles}
      loadingRoles={loadingRoles}
      saving={saving}
      selectedSlot={selectedSlot}
      versionHistory={visibleVersionHistory}
      onAddEdge={addDraftEdge}
      onDeleteBlueprint={() => {
        if (!selectedBlueprint) {
          return;
        }
        setDeletingBlueprintId(selectedBlueprint.id);
      }}
      onEditBlueprint={() => {
        if (!selectedBlueprint) {
          return;
        }
        beginEditDraft(selectedBlueprint);
      }}
      onRemoveEdge={removeDraftEdge}
      onRemoveSlot={removeDraftSlot}
      onSave={handleSaveDraft}
      onSlotDescriptionChange={(value) => {
        updateDraft((current) => ({
          ...current,
          description: value,
        }));
      }}
      onSlotNameChange={(value) => {
        updateDraft((current) => ({
          ...current,
          name: value,
        }));
      }}
      onUpdateEdge={updateDraftEdge}
      onUpdateSlot={updateDraftSlot}
    />
  );

  return (
    <PageScaffold className="px-4 pb-4 pt-6 sm:px-5">
      <div className="flex h-full min-h-0 flex-col">
        <PageTitleBar
          title="Blueprints"
          actions={
            draft ? (
              <>
                <Button variant="outline" onClick={cancelDraft}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleSaveDraft()}
                  disabled={saving}
                >
                  <Save className="mr-1 size-4" />
                  {saving ? "Saving..." : "Save"}
                </Button>
              </>
            ) : (
              <Button onClick={beginCreateDraft}>
                <Plus className="mr-1 size-4" />
                New Blueprint
              </Button>
            )
          }
        />

        <div className="relative mt-6 min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-card/[0.14]">
          {isCompactLayout ? (
            <div className="relative h-full">
              <BlueprintStageColumn
                blueprint={displayBlueprint}
                compact
                nodes={flowGraph.nodes}
                edges={flowGraph.edges}
                onAddEdge={addDraftEdge}
                onAddSlot={addDraftSlot}
                onAutoLayout={() => {
                  void flowRef.current?.fitView({
                    duration: 180,
                    padding: 0.2,
                    maxZoom: 1.05,
                  });
                }}
                onInit={(instance) => {
                  flowRef.current = instance;
                }}
                onLibraryToggle={() => setLibraryOpen(true)}
                onFitView={() => {
                  void flowRef.current?.fitView({
                    duration: 180,
                    padding: 0.2,
                    maxZoom: 1.05,
                  });
                }}
                onInspectorToggle={() => setInspectorOpen(true)}
                onSelectNode={(nodeId) => {
                  setSelectedSlotId(nodeId);
                  setInspectorOpen(true);
                }}
              />
              <AnimatePresence>
                {libraryOpen ? (
                  <DrawerShell
                    align="left"
                    onClose={() => setLibraryOpen(false)}
                  >
                    {libraryPanel}
                  </DrawerShell>
                ) : null}
              </AnimatePresence>
              <AnimatePresence>
                {inspectorOpen ? (
                  <DrawerShell
                    align="right"
                    onClose={() => setInspectorOpen(false)}
                  >
                    {inspectorPanel}
                  </DrawerShell>
                ) : null}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex h-full min-h-0">
              <aside
                className="relative shrink-0 border-r border-border"
                style={{ width: `${libraryWidth}px` }}
              >
                {libraryPanel}
                <PanelResizer
                  position="right"
                  isDragging={isLibraryDragging}
                  onMouseDown={startLibraryDrag}
                />
              </aside>

              <BlueprintStageColumn
                blueprint={displayBlueprint}
                edges={flowGraph.edges}
                nodes={flowGraph.nodes}
                onAddEdge={addDraftEdge}
                onAddSlot={addDraftSlot}
                onAutoLayout={() => {
                  void flowRef.current?.fitView({
                    duration: 180,
                    padding: 0.2,
                    maxZoom: 1.05,
                  });
                }}
                onFitView={() => {
                  void flowRef.current?.fitView({
                    duration: 180,
                    padding: 0.2,
                    maxZoom: 1.05,
                  });
                }}
                onInit={(instance) => {
                  flowRef.current = instance;
                }}
                onSelectNode={(nodeId) => {
                  setSelectedSlotId(nodeId);
                }}
              />

              <aside
                className="relative shrink-0 border-l border-border"
                style={{ width: `${inspectorWidth}px` }}
              >
                {inspectorPanel}
                <PanelResizer
                  position="left"
                  isDragging={isInspectorDragging}
                  onMouseDown={startInspectorDrag}
                />
              </aside>
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={Boolean(deletingBlueprintId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingBlueprintId(null);
          }
        }}
      >
        <AlertDialogContent className="max-w-[30rem]">
          <AlertDialogHeader className="gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-accent/45 text-foreground">
                <Trash2 className="size-5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                  Destructive Action
                </p>
                <AlertDialogTitle className="mt-1 text-foreground">
                  Delete blueprint?
                </AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="text-muted-foreground">
              {selectedBlueprint?.id === deletingBlueprintId ? (
                <>
                  Remove{" "}
                  <span className="font-semibold text-foreground">
                    {selectedBlueprint.name}
                  </span>{" "}
                  from the global library.
                </>
              ) : (
                "This blueprint will be removed from the library."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={() => void handleDeleteBlueprint()}
              >
                Delete Blueprint
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageScaffold>
  );
}

function BlueprintLibraryColumn({
  blueprints,
  loading,
  searchQuery,
  selectedBlueprintId,
  totalCount,
  onCreateBlueprint,
  onSearchChange,
  onSelectBlueprint,
}: {
  blueprints: AgentBlueprint[];
  loading: boolean;
  searchQuery: string;
  selectedBlueprintId: string | null;
  totalCount: number;
  onCreateBlueprint: () => void;
  onSearchChange: (value: string) => void;
  onSelectBlueprint: (blueprintId: string) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
                Library
              </p>
              <span className="rounded-full border border-border bg-accent/25 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {totalCount}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              Browse, search, and pick the latest blueprint revision.
            </p>
          </div>
          <Button size="sm" onClick={onCreateBlueprint}>
            <Plus className="mr-1 size-3.5" />
            New
          </Button>
        </div>
        <Input
          aria-label="Search blueprints"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name or description"
          className={`mt-4 ${blueprintFormInputClass}`}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-none">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="rounded-xl border border-border bg-card/30 p-3"
              >
                <div className="h-3 w-28 rounded-full skeleton-shimmer" />
                <div className="mt-3 h-2.5 w-full rounded-full skeleton-shimmer" />
                <div className="mt-2 h-2.5 w-2/3 rounded-full skeleton-shimmer" />
              </div>
            ))}
          </div>
        ) : blueprints.length === 0 ? (
          <div className="flex h-full min-h-[15rem] items-center justify-center">
            <div className="max-w-[15rem] text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-border bg-accent/20 text-muted-foreground">
                <BookCopy className="size-5" />
              </div>
              <p className="mt-4 text-[15px] font-medium text-foreground">
                No blueprints
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
                Start a reusable collaboration architecture from scratch.
              </p>
              <Button className="mt-4" onClick={onCreateBlueprint}>
                Create your first blueprint
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {blueprints.map((blueprint) => {
              const isSelected = blueprint.id === selectedBlueprintId;
              return (
                <Button
                  key={blueprint.id}
                  type="button"
                  variant="ghost"
                  onClick={() => onSelectBlueprint(blueprint.id)}
                  className={cn(
                    "group relative h-auto w-full flex-col items-stretch overflow-hidden rounded-xl border px-4 py-3 text-left transition-[background-color,border-color,transform] duration-180 hover:text-inherit",
                    isSelected
                      ? "border-border bg-accent/35"
                      : "border-transparent bg-transparent hover:border-border hover:bg-accent/20",
                  )}
                >
                  <div
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-y-3 left-0 w-[3px] rounded-full transition-opacity",
                      isSelected
                        ? "bg-ring opacity-100"
                        : "bg-ring/60 opacity-0",
                    )}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {blueprint.name}
                    </p>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80">
                      v{blueprint.version}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    {blueprint.description || "No description"}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-muted-foreground/75">
                    <span>{blueprint.node_count} slots</span>
                    <span>{blueprint.edge_count} connections</span>
                  </div>
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function BlueprintStageColumn({
  blueprint,
  compact = false,
  nodes,
  edges,
  onAddEdge,
  onAddSlot,
  onAutoLayout,
  onFitView,
  onInit,
  onInspectorToggle,
  onLibraryToggle,
  onSelectNode,
}: {
  blueprint: BlueprintViewModel | null;
  compact?: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
  onAddEdge: () => void;
  onAddSlot: () => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  onInit: (instance: ReactFlowInstance) => void;
  onInspectorToggle?: () => void;
  onLibraryToggle?: () => void;
  onSelectNode: (nodeId: string) => void;
}) {
  const hasDraft = Boolean(blueprint?.isDraft);

  return (
    <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold text-foreground">
                {blueprint
                  ? blueprint.name.trim() || "Untitled Blueprint"
                  : "Blueprint Stage"}
              </h2>
              {blueprint?.isDraft ? (
                <span className="rounded-full border border-border bg-accent/25 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {blueprint.version == null
                    ? "New Draft"
                    : `Draft from v${blueprint.version}`}
                </span>
              ) : blueprint?.version != null ? (
                <span className="rounded-full border border-border bg-accent/25 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  v{blueprint.version}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              {blueprint
                ? `${blueprint.slots.length} slots · ${blueprint.edges.length} connections`
                : "Select a blueprint from the library or start a new draft."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {compact ? (
              <>
                <Button variant="outline" size="sm" onClick={onLibraryToggle}>
                  <LayoutPanelLeft className="mr-1 size-3.5" />
                  Library
                </Button>
                <Button variant="outline" size="sm" onClick={onInspectorToggle}>
                  <PanelRightClose className="mr-1 size-3.5" />
                  Inspector
                </Button>
              </>
            ) : null}
            {hasDraft ? (
              <>
                <Button size="sm" variant="outline" onClick={onAddSlot}>
                  <Plus className="mr-1 size-3.5" />
                  Add Slot
                </Button>
                <Button size="sm" variant="outline" onClick={onAddEdge}>
                  <Plus className="mr-1 size-3.5" />
                  Add Connection
                </Button>
                <Button size="sm" variant="outline" onClick={onFitView}>
                  Fit View
                </Button>
                <Button size="sm" variant="outline" onClick={onAutoLayout}>
                  Auto Layout
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {blueprint ? (
        <div
          className="min-h-0 flex-1"
          style={{
            background:
              "radial-gradient(circle at 14% 10%, var(--shell-spotlight-primary), transparent 24%), linear-gradient(180deg, color-mix(in srgb, var(--foreground) 1.4%, transparent), transparent 28%)",
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onInit={onInit}
            onNodeClick={(_, node) => onSelectNode(node.id)}
            nodeTypes={nodeTypes}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            panOnScroll
            minZoom={0.3}
            maxZoom={1.4}
            className="h-full bg-transparent"
          >
            <Background color="var(--graph-grid)" gap={28} size={0.72} />
          </ReactFlow>
        </div>
      ) : (
        <div className="flex h-full min-h-[24rem] items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-xl border border-border bg-accent/20 text-muted-foreground">
              <BookCopy className="size-5" />
            </div>
            <p className="mt-4 text-[15px] font-medium text-foreground">
              Pick a blueprint or start a new draft
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              The stage previews slot topology here so the collaboration
              structure stays readable before you create a task tab.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function BlueprintInspectorColumn({
  blueprint,
  deletingDisabled,
  draft,
  filteredRoles,
  loadingRoles,
  saving,
  selectedSlot,
  versionHistory,
  onAddEdge,
  onDeleteBlueprint,
  onEditBlueprint,
  onRemoveEdge,
  onRemoveSlot,
  onSave,
  onSlotDescriptionChange,
  onSlotNameChange,
  onUpdateEdge,
  onUpdateSlot,
}: {
  blueprint: BlueprintViewModel | null;
  deletingDisabled: boolean;
  draft: BlueprintDraft | null;
  filteredRoles: (query: string) => Role[];
  loadingRoles: boolean;
  saving: boolean;
  selectedSlot: BlueprintSlot | null;
  versionHistory: BlueprintVersionSummary[];
  onAddEdge: () => void;
  onDeleteBlueprint: () => void;
  onEditBlueprint: () => void;
  onRemoveEdge: (index: number) => void;
  onRemoveSlot: (slotId: string) => void;
  onSave: () => void;
  onSlotDescriptionChange: (value: string) => void;
  onSlotNameChange: (value: string) => void;
  onUpdateEdge: (
    index: number,
    field: "from_slot_id" | "to_slot_id",
    value: string,
  ) => void;
  onUpdateSlot: (
    slotId: string,
    field: "role_name" | "display_name",
    value: string,
  ) => void;
}) {
  const [roleSearch, setRoleSearch] = useState("");
  const visibleRoles = useMemo(
    () => filteredRoles(roleSearch),
    [filteredRoles, roleSearch],
  );

  if (!blueprint) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[12px] leading-relaxed text-muted-foreground">
        Inspector shows blueprint details here once you select a blueprint or a
        slot.
      </div>
    );
  }

  const edgeTargets = blueprint.slots.map((slot) => ({
    id: slot.id,
    label: slot.display_name || slot.role_name || slot.id,
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
              {selectedSlot ? "Slot Inspector" : "Inspector"}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              {selectedSlot
                ? "Inspect or edit the selected slot."
                : "Review blueprint metadata, connections, and version summary."}
            </p>
          </div>
          {draft ? (
            <Button size="sm" onClick={onSave} disabled={saving}>
              <Save className="mr-1 size-3.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onEditBlueprint}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deletingDisabled}
                onClick={onDeleteBlueprint}
              >
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-none">
        {selectedSlot ? (
          <div className="space-y-4">
            <InspectorSection title="Slot Key">
              <div className="rounded-md border border-border bg-background/40 px-3 py-2 font-mono text-[12px] text-foreground/80">
                {selectedSlot.id}
              </div>
            </InspectorSection>
            {draft ? (
              <>
                <InspectorSection
                  title="Role"
                  description="Search and choose a role for this slot."
                >
                  <div className="space-y-3">
                    <Input
                      aria-label="Search roles"
                      value={roleSearch}
                      onChange={(event) => setRoleSearch(event.target.value)}
                      placeholder="Search roles"
                      className={blueprintFormInputClass}
                    />
                    <div className={blueprintChoiceListClass}>
                      {loadingRoles ? (
                        <p className="px-2 py-3 text-[12px] text-muted-foreground">
                          Loading roles...
                        </p>
                      ) : visibleRoles.length === 0 ? (
                        <p className="px-2 py-3 text-[12px] text-muted-foreground">
                          No roles match your search.
                        </p>
                      ) : (
                        visibleRoles.map((role) => (
                          <Button
                            key={role.name}
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              onUpdateSlot(
                                selectedSlot.id,
                                "role_name",
                                role.name,
                              )
                            }
                            className={cn(
                              "h-auto w-full flex-col items-stretch rounded-md border px-3 py-2.5 text-left transition-colors hover:text-inherit",
                              selectedSlot.role_name === role.name
                                ? "border-border bg-accent/35"
                                : "border-transparent bg-transparent hover:border-border hover:bg-accent/20",
                            )}
                          >
                            <div className="text-[13px] font-medium text-foreground">
                              {role.name}
                            </div>
                            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                              {role.description}
                            </p>
                          </Button>
                        ))
                      )}
                    </div>
                  </div>
                </InspectorSection>
                <InspectorSection title="Display Name" description="Optional">
                  <Input
                    aria-label="Slot display name"
                    value={selectedSlot.display_name ?? ""}
                    onChange={(event) =>
                      onUpdateSlot(
                        selectedSlot.id,
                        "display_name",
                        event.target.value,
                      )
                    }
                    placeholder={selectedSlot.role_name}
                    className={blueprintFormInputClass}
                  />
                </InspectorSection>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => onRemoveSlot(selectedSlot.id)}
                >
                  <Trash2 className="mr-1 size-4" />
                  Remove Slot
                </Button>
              </>
            ) : (
              <>
                <InspectorSection title="Role">
                  <div className="rounded-md border border-border bg-background/40 px-3 py-2 text-[13px] text-foreground">
                    {selectedSlot.role_name}
                  </div>
                </InspectorSection>
                <InspectorSection title="Display Name">
                  <div className="rounded-md border border-border bg-background/40 px-3 py-2 text-[13px] text-foreground">
                    {selectedSlot.display_name || selectedSlot.role_name}
                  </div>
                </InspectorSection>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <InspectorSection
              title="Name"
              description={draft ? "Required" : undefined}
            >
              {draft ? (
                <Input
                  aria-label="Blueprint name"
                  value={blueprint.name}
                  onChange={(event) => onSlotNameChange(event.target.value)}
                  placeholder="Review Pipeline"
                  className={blueprintFormInputClass}
                />
              ) : (
                <div className="rounded-md border border-border bg-background/40 px-3 py-2 text-[13px] text-foreground">
                  {blueprint.name}
                </div>
              )}
            </InspectorSection>

            <InspectorSection
              title="Description"
              description={draft ? "Optional" : undefined}
            >
              {draft ? (
                <Textarea
                  aria-label="Blueprint description"
                  value={blueprint.description}
                  onChange={(event) =>
                    onSlotDescriptionChange(event.target.value)
                  }
                  placeholder="Describe the reusable collaboration structure."
                  className={blueprintFormTextareaClass}
                />
              ) : (
                <div className="rounded-md border border-border bg-background/40 px-3 py-3 text-[13px] leading-relaxed text-foreground/80">
                  {blueprint.description || "No description"}
                </div>
              )}
            </InspectorSection>

            <InspectorSection title="Summary">
              <div className="grid gap-2">
                <SummaryRow label="Version">
                  {blueprint.version == null
                    ? "New draft"
                    : `v${blueprint.version}`}
                </SummaryRow>
                <SummaryRow label="Slots">{blueprint.slots.length}</SummaryRow>
                <SummaryRow label="Connections">
                  {blueprint.edges.length}
                </SummaryRow>
                <SummaryRow label="Structure">
                  {blueprint.slots.length} slot
                  {blueprint.slots.length === 1 ? "" : "s"}
                </SummaryRow>
              </div>
            </InspectorSection>

            <InspectorSection
              title="Version Summary"
              description="Latest version and update history summary."
            >
              <div className="space-y-2">
                {versionHistory.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-3 text-[12px] text-muted-foreground">
                    Version history starts after the first save.
                  </div>
                ) : (
                  [...versionHistory]
                    .slice()
                    .reverse()
                    .map((item) => (
                      <div
                        key={`${item.version}-${item.updated_at}`}
                        className="rounded-xl border border-border bg-background/35 px-3 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[13px] font-medium text-foreground">
                            v{item.version}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatLocalTimestamp(item.updated_at, {
                              fallback: "Unknown",
                            })}
                          </span>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </InspectorSection>

            <InspectorSection
              title="Connections"
              description={
                draft
                  ? "Edit the formal slot-to-slot connections preserved by this blueprint."
                  : "Formal slot-to-slot connections preserved by this blueprint."
              }
            >
              <div className="space-y-3">
                {draft ? (
                  <Button size="sm" variant="outline" onClick={onAddEdge}>
                    <Plus className="mr-1 size-3.5" />
                    Add Connection
                  </Button>
                ) : null}
                {blueprint.edges.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-3 text-[12px] text-muted-foreground">
                    No connections in this blueprint.
                  </div>
                ) : (
                  blueprint.edges.map((edge, index) => (
                    <div
                      key={`${edge.from_slot_id}-${edge.to_slot_id}-${index}`}
                      className="rounded-xl border border-border bg-background/35 p-3"
                    >
                      {draft ? (
                        <div className="space-y-3">
                          <div className="grid gap-3">
                            <Select
                              value={edge.from_slot_id}
                              onValueChange={(value) =>
                                onUpdateEdge(index, "from_slot_id", value)
                              }
                            >
                              <SelectTrigger
                                aria-label={`Connection endpoint A ${index + 1}`}
                                className={blueprintFormInputClass}
                              >
                                <SelectValue placeholder="Endpoint A" />
                              </SelectTrigger>
                              <SelectContent className="rounded-md border-border bg-popover text-popover-foreground">
                                {edgeTargets.map((target) => (
                                  <SelectItem key={target.id} value={target.id}>
                                    {target.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={edge.to_slot_id}
                              onValueChange={(value) =>
                                onUpdateEdge(index, "to_slot_id", value)
                              }
                            >
                              <SelectTrigger
                                aria-label={`Connection endpoint B ${index + 1}`}
                                className={blueprintFormInputClass}
                              >
                                <SelectValue placeholder="Endpoint B" />
                              </SelectTrigger>
                              <SelectContent className="rounded-md border-border bg-popover text-popover-foreground">
                                {edgeTargets.map((target) => (
                                  <SelectItem key={target.id} value={target.id}>
                                    {target.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onRemoveEdge(index)}
                          >
                            <Trash2 className="mr-1 size-3.5" />
                            Remove Connection
                          </Button>
                        </div>
                      ) : (
                        <div className="text-[13px] text-foreground/82">
                          {edgeTargets.find(
                            (item) => item.id === edge.from_slot_id,
                          )?.label ?? edge.from_slot_id}{" "}
                          •{" "}
                          {edgeTargets.find(
                            (item) => item.id === edge.to_slot_id,
                          )?.label ?? edge.to_slot_id}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </InspectorSection>
          </div>
        )}
      </div>
    </div>
  );
}

function InspectorSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/30 p-4">
      <div className="mb-3">
        <h3 className="text-[13px] font-medium text-foreground">{title}</h3>
        {description ? (
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background/40 px-3 py-2.5 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground/80">{children}</span>
    </div>
  );
}
