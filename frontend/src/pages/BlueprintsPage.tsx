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
  MarkerType,
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
  Sparkles,
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
import { PanelResizer } from "@/components/PanelResizer";
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
import { PageScaffold } from "@/components/layout/PageScaffold";

const LIBRARY_PANEL_ID = "blueprints-library-width";
const INSPECTOR_PANEL_ID = "blueprints-inspector-width";
const LEADER_NODE_ID = "leader";

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
  kind: "leader" | "slot";
  label: string;
  roleName: string | null;
  selected: boolean;
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
  const validTargets = [LEADER_NODE_ID, ...slots.map((slot) => slot.id)];
  const nextSource =
    sourceSlotId && validTargets.includes(sourceSlotId)
      ? sourceSlotId
      : LEADER_NODE_ID;
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

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) {
    return "Unknown";
  }
  const normalized = timestamp > 1e12 ? timestamp : timestamp * 1000;
  return new Date(normalized).toLocaleString();
}

function BlueprintFlowNode({ data }: NodeProps) {
  const { kind, label, roleName, selected } = data as BlueprintFlowNodeData;
  const isLeader = kind === "leader";

  return (
    <div
      className={cn(
        "group relative min-w-[140px] rounded-[18px] border px-4 py-3 shadow-[0_18px_36px_-26px_rgba(0,0,0,0.78)] transition-[border-color,background-color,box-shadow] duration-200",
        isLeader
          ? "border-white/18 bg-[linear-gradient(180deg,rgba(255,255,255,0.1),rgba(255,255,255,0.04))]"
          : "border-white/10 bg-[linear-gradient(180deg,rgba(17,17,18,0.94),rgba(12,12,13,0.9))]",
        selected
          ? "shadow-[0_22px_46px_-24px_rgba(255,255,255,0.2)] ring-1 ring-white/18"
          : "hover:border-white/18 hover:bg-white/[0.06]",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-white/12 !bg-white/12 !opacity-0"
      />
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-2xl border",
            isLeader
              ? "border-white/20 bg-white/[0.08] text-white"
              : "border-white/12 bg-black/28 text-white/80",
          )}
        >
          {isLeader ? (
            <Sparkles className="size-4" />
          ) : (
            <Bot className="size-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-semibold text-white">
              {label}
            </p>
            {isLeader ? (
              <span className="rounded-full border border-white/16 bg-white/[0.08] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/72">
                Owner
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-white/36">
            {isLeader ? "Task Tab Leader" : roleName}
          </p>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2 !border-white/12 !bg-white/12 !opacity-0"
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

  const baseNodes: FlowNode[] = [
    {
      id: LEADER_NODE_ID,
      type: "blueprint",
      position: { x: 0, y: 0 },
      width: getAgentNodeWidth("Leader"),
      data: {
        kind: "leader",
        label: "Leader",
        roleName: null,
        selected: selectedSlotId === null,
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      selectable: true,
      draggable: false,
    },
    ...blueprint.slots.map((slot) => {
      const label = slot.display_name || slot.role_name;
      return {
        id: slot.id,
        type: "blueprint",
        position: { x: 0, y: 0 },
        width: getAgentNodeWidth(label),
        data: {
          kind: "slot",
          label,
          roleName: slot.role_name,
          selected: selectedSlotId === slot.id,
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        selectable: true,
        draggable: false,
      } satisfies FlowNode;
    }),
  ];

  const nodeIds = new Set(baseNodes.map((node) => node.id));
  const baseEdges: FlowEdge[] = blueprint.edges
    .filter(
      (edge) => nodeIds.has(edge.from_slot_id) && nodeIds.has(edge.to_slot_id),
    )
    .map((edge, index) => ({
      id: `${edge.from_slot_id}-${edge.to_slot_id}-${index}`,
      source: edge.from_slot_id,
      target: edge.to_slot_id,
      type: "smoothstep",
      animated: false,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: "rgba(255,255,255,0.42)",
      },
      style: {
        stroke: "rgba(255,255,255,0.22)",
        strokeWidth: 1.5,
      },
      selectable: false,
    }));

  return getLayoutedElements(baseNodes, baseEdges);
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
        className="absolute inset-0 z-20 bg-black/44 backdrop-blur-[2px]"
      />
      <motion.aside
        initial={{ opacity: 0, x: align === "left" ? -20 : 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: align === "left" ? -20 : 20 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "absolute inset-y-0 z-30 w-[min(24rem,calc(100%-1.5rem))] overflow-hidden rounded-[1.15rem] border border-white/10 bg-[linear-gradient(180deg,rgba(16,16,17,0.98),rgba(11,11,12,0.96))] shadow-[0_30px_90px_-42px_rgba(0,0,0,0.95)]",
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

    const validNodeIds = new Set([
      LEADER_NODE_ID,
      ...draft.slots.map((slot) => slot.id),
    ]);
    const hasInvalidEdge = draft.edges.some(
      (edge) =>
        !validNodeIds.has(edge.from_slot_id) ||
        !validNodeIds.has(edge.to_slot_id) ||
        edge.from_slot_id === edge.to_slot_id,
    );
    if (hasInvalidEdge) {
      toast.error("All blueprint edges must connect valid nodes");
      return;
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
    <PageScaffold className="px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(13,13,14,0.94),rgba(10,10,11,0.92))] shadow-[0_24px_72px_-42px_rgba(0,0,0,0.9)]">
        <div className="border-b border-white/8 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[1.05rem] font-semibold text-white">
                Blueprints
              </h1>
              <p className="mt-1 text-[13px] leading-relaxed text-white/45">
                Manage reusable collaboration architecture blueprints for future
                task tabs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {draft ? (
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
              )}
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
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
                  setSelectedSlotId(nodeId === LEADER_NODE_ID ? null : nodeId);
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
                className="relative shrink-0 border-r border-white/8"
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
                  setSelectedSlotId(nodeId === LEADER_NODE_ID ? null : nodeId);
                }}
              />

              <aside
                className="relative shrink-0 border-l border-white/8"
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
        <AlertDialogContent className="max-w-[30rem] rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(20,20,21,0.98),rgba(13,13,14,0.96))] shadow-[0_30px_90px_-42px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
          <AlertDialogHeader className="gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl border border-white/14 bg-white/[0.05] text-white">
                <Trash2 className="size-5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/38">
                  Destructive Action
                </p>
                <AlertDialogTitle className="mt-1 text-white">
                  Delete blueprint?
                </AlertDialogTitle>
              </div>
            </div>
            <AlertDialogDescription className="text-white/62">
              {selectedBlueprint?.id === deletingBlueprintId ? (
                <>
                  Remove{" "}
                  <span className="font-semibold text-white">
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
      <div className="border-b border-white/8 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/42">
                Library
              </p>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/46">
                {totalCount}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-white/45">
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
          className="mt-4 h-10 rounded-[0.95rem] border-white/10 bg-black/18 text-white placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-none">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="rounded-[1rem] border border-white/8 bg-white/[0.03] p-3"
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
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-white/70">
                <BookCopy className="size-5" />
              </div>
              <p className="mt-4 text-[15px] font-medium text-white">
                No blueprints
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-white/45">
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
                <button
                  key={blueprint.id}
                  type="button"
                  onClick={() => onSelectBlueprint(blueprint.id)}
                  className={cn(
                    "group relative w-full overflow-hidden rounded-[1rem] border px-4 py-3 text-left transition-[background-color,border-color,transform] duration-180 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                    isSelected
                      ? "border-white/16 bg-white/[0.07]"
                      : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.04]",
                  )}
                >
                  <div
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-y-3 left-0 w-[3px] rounded-full transition-opacity",
                      isSelected
                        ? "bg-white opacity-100"
                        : "bg-white/60 opacity-0",
                    )}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[13px] font-medium text-white">
                      {blueprint.name}
                    </p>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-white/36">
                      v{blueprint.version}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/46">
                    {blueprint.description || "No description"}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] uppercase tracking-[0.12em] text-white/34">
                    <span>{blueprint.node_count} nodes</span>
                    <span>{blueprint.edge_count} edges</span>
                  </div>
                </button>
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
      <div className="border-b border-white/8 px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold text-white">
                {blueprint
                  ? blueprint.name.trim() || "Untitled Blueprint"
                  : "Blueprint Stage"}
              </h2>
              {blueprint?.isDraft ? (
                <span className="rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/56">
                  {blueprint.version == null
                    ? "New Draft"
                    : `Draft from v${blueprint.version}`}
                </span>
              ) : blueprint?.version != null ? (
                <span className="rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/56">
                  v{blueprint.version}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-white/45">
              {blueprint
                ? `${blueprint.slots.length} slots · ${blueprint.edges.length} edges`
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
                  Connect
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
        <div className="min-h-0 flex-1 bg-[radial-gradient(circle_at_14%_10%,rgba(255,255,255,0.03),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.014),transparent_28%)]">
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
            <Background color="rgba(255,255,255,0.08)" gap={28} size={0.72} />
          </ReactFlow>
        </div>
      ) : (
        <div className="flex h-full min-h-[24rem] items-center justify-center px-6">
          <div className="max-w-sm text-center">
            <div className="mx-auto flex size-14 items-center justify-center rounded-[1.35rem] border border-white/10 bg-white/[0.04] text-white/72">
              <BookCopy className="size-5" />
            </div>
            <p className="mt-4 text-[15px] font-medium text-white">
              Pick a blueprint or start a new draft
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-white/45">
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
      <div className="flex h-full items-center justify-center px-6 text-center text-[12px] leading-relaxed text-white/45">
        Inspector shows blueprint details here once you select a blueprint or a
        slot.
      </div>
    );
  }

  const edgeTargets = [
    { id: LEADER_NODE_ID, label: "Leader" },
    ...blueprint.slots.map((slot) => ({
      id: slot.id,
      label: slot.display_name || slot.role_name || slot.id,
    })),
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/8 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-white/42">
              {selectedSlot ? "Slot Inspector" : "Inspector"}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-white/45">
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
              <div className="rounded-[1rem] border border-white/10 bg-black/18 px-3 py-2 font-mono text-[12px] text-white/80">
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
                      className="h-10 rounded-[0.95rem] border-white/10 bg-black/18 text-white placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
                    />
                    <div className="max-h-56 space-y-2 overflow-y-auto rounded-[1rem] border border-white/10 bg-black/16 p-2 scrollbar-none">
                      {loadingRoles ? (
                        <p className="px-2 py-3 text-[12px] text-white/40">
                          Loading roles...
                        </p>
                      ) : visibleRoles.length === 0 ? (
                        <p className="px-2 py-3 text-[12px] text-white/40">
                          No roles match your search.
                        </p>
                      ) : (
                        visibleRoles.map((role) => (
                          <button
                            key={role.name}
                            type="button"
                            onClick={() =>
                              onUpdateSlot(
                                selectedSlot.id,
                                "role_name",
                                role.name,
                              )
                            }
                            className={cn(
                              "w-full rounded-[0.9rem] border px-3 py-2.5 text-left transition-colors",
                              selectedSlot.role_name === role.name
                                ? "border-white/18 bg-white/[0.06]"
                                : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.03]",
                            )}
                          >
                            <div className="text-[13px] font-medium text-white">
                              {role.name}
                            </div>
                            <p className="mt-1 text-[12px] leading-relaxed text-white/48">
                              {role.description}
                            </p>
                          </button>
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
                    className="h-10 rounded-[0.95rem] border-white/10 bg-black/18 text-white placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
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
                  <div className="rounded-[1rem] border border-white/10 bg-black/18 px-3 py-2 text-[13px] text-white">
                    {selectedSlot.role_name}
                  </div>
                </InspectorSection>
                <InspectorSection title="Display Name">
                  <div className="rounded-[1rem] border border-white/10 bg-black/18 px-3 py-2 text-[13px] text-white">
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
                  className="h-10 rounded-[0.95rem] border-white/10 bg-black/18 text-white placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
                />
              ) : (
                <div className="rounded-[1rem] border border-white/10 bg-black/18 px-3 py-2 text-[13px] text-white">
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
                  className="min-h-[108px] rounded-[1rem] border-white/10 bg-black/18 text-white placeholder:text-white/28 focus-visible:border-white/24 focus-visible:ring-white/8"
                />
              ) : (
                <div className="rounded-[1rem] border border-white/10 bg-black/18 px-3 py-3 text-[13px] leading-relaxed text-white/70">
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
                <SummaryRow label="Nodes">{blueprint.slots.length}</SummaryRow>
                <SummaryRow label="Edges">{blueprint.edges.length}</SummaryRow>
                <SummaryRow label="Structure">
                  Leader + {blueprint.slots.length} slot
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
                  <div className="rounded-[1rem] border border-dashed border-white/10 px-3 py-3 text-[12px] text-white/45">
                    Version history starts after the first save.
                  </div>
                ) : (
                  [...versionHistory]
                    .slice()
                    .reverse()
                    .map((item) => (
                      <div
                        key={`${item.version}-${item.updated_at}`}
                        className="rounded-[1rem] border border-white/10 bg-black/18 px-3 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[13px] font-medium text-white">
                            v{item.version}
                          </span>
                          <span className="text-[11px] text-white/42">
                            {formatTimestamp(item.updated_at)}
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
                  ? "Edit formal directed edges preserved by this blueprint."
                  : "Formal directed edges preserved by this blueprint."
              }
            >
              <div className="space-y-3">
                {draft ? (
                  <Button size="sm" variant="outline" onClick={onAddEdge}>
                    <Plus className="mr-1 size-3.5" />
                    Add Edge
                  </Button>
                ) : null}
                {blueprint.edges.length === 0 ? (
                  <div className="rounded-[1rem] border border-dashed border-white/10 px-3 py-3 text-[12px] text-white/45">
                    No edges in this blueprint.
                  </div>
                ) : (
                  blueprint.edges.map((edge, index) => (
                    <div
                      key={`${edge.from_slot_id}-${edge.to_slot_id}-${index}`}
                      className="rounded-[1rem] border border-white/10 bg-black/18 p-3"
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
                                aria-label={`Edge source ${index + 1}`}
                                className="h-10 rounded-[0.95rem] border-white/10 bg-black/18 text-white focus-visible:border-white/24 focus-visible:ring-white/8"
                              >
                                <SelectValue placeholder="Source" />
                              </SelectTrigger>
                              <SelectContent className="rounded-[1rem] border-white/10 bg-[linear-gradient(180deg,rgba(18,18,19,0.98),rgba(11,11,12,0.96))] text-white backdrop-blur-2xl">
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
                                aria-label={`Edge target ${index + 1}`}
                                className="h-10 rounded-[0.95rem] border-white/10 bg-black/18 text-white focus-visible:border-white/24 focus-visible:ring-white/8"
                              >
                                <SelectValue placeholder="Target" />
                              </SelectTrigger>
                              <SelectContent className="rounded-[1rem] border-white/10 bg-[linear-gradient(180deg,rgba(18,18,19,0.98),rgba(11,11,12,0.96))] text-white backdrop-blur-2xl">
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
                            Remove Edge
                          </Button>
                        </div>
                      ) : (
                        <div className="text-[13px] text-white/72">
                          {edgeTargets.find(
                            (item) => item.id === edge.from_slot_id,
                          )?.label ?? edge.from_slot_id}{" "}
                          →{" "}
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
    <section className="rounded-[1rem] border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3">
        <h3 className="text-[13px] font-medium text-white">{title}</h3>
        {description ? (
          <p className="mt-1 text-[12px] leading-relaxed text-white/45">
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
    <div className="flex items-center justify-between gap-4 rounded-[0.9rem] border border-white/8 bg-black/18 px-3 py-2.5 text-[12px]">
      <span className="text-white/42">{label}</span>
      <span className="text-right text-white/78">{children}</span>
    </div>
  );
}
