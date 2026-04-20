import { AgentGraph, type AgentGraphHandle } from "@/components/AgentGraph";
import { PanelResizer } from "@/components/PanelResizer";
import { Button } from "@/components/ui/button";
import type { WorkspaceAgentOption } from "@/components/workspace/WorkspaceDialogs";
import {
  AgentDetailPanel,
  AssistantChatPanel,
  BadgeChip,
  PanelToggleButton,
  ToolbarButton,
  ToolbarDivider,
} from "@/components/workspace/WorkspacePanels";
import { cn } from "@/lib/utils";
import type { Node, Role, TaskTab } from "@/types";
import { AnimatePresence, motion } from "motion/react";
import { Link2, Plus, Radio, Redo2, Save, Undo2, X } from "lucide-react";
import type { MouseEvent, RefObject } from "react";

interface WorkspaceGraphHistory {
  canRedo: (tabId: string | null) => boolean;
  canUndo: (tabId: string | null) => boolean;
  createConnection: (
    tabId: string,
    sourceNodeId: string,
    targetNodeId: string,
  ) => Promise<void>;
  createLinkedAgent: (input: {
    tabId: string;
    anchorNodeId: string;
    roleName: string;
    name?: string;
  }) => Promise<unknown>;
  createStandaloneAgent: (input: {
    tabId: string;
    roleName: string;
    name?: string;
  }) => Promise<unknown>;
  deleteAgent: (input: {
    tabId: string;
    node: Node;
    tabAgents: Node[];
  }) => Promise<void>;
  deleteConnection: (
    tabId: string,
    sourceNodeId: string,
    targetNodeId: string,
  ) => Promise<void>;
  insertAgentBetween: (input: {
    tabId: string;
    sourceNodeId: string;
    targetNodeId: string;
    roleName: string;
    name?: string;
  }) => Promise<unknown>;
  redo: (tabId: string | null) => Promise<boolean>;
  undo: (tabId: string | null) => Promise<boolean>;
}

interface WorkspaceShellProps {
  activeTabId: string | null;
  assistantDetailVisible: boolean;
  assistantNode: Node | null;
  assistantPanelRunning: boolean;
  connected: boolean;
  graphConnectMode: boolean;
  graphHistory: WorkspaceGraphHistory;
  graphRef: RefObject<AgentGraphHandle | null>;
  interruptingAssistant: boolean;
  isCompactWorkspace: boolean;
  isDragging: boolean;
  loadingRoles: boolean;
  onCloseAssistantDetails: () => void;
  onConnectModeChange: (active: boolean) => void;
  onCreateAgent: () => void;
  onCreateTab: () => void;
  onDeleteTab: (tabId: string, title: string, nodeCount?: number) => void;
  onInterruptAssistant: () => void;
  onOpenAssistantDetails: () => void;
  onOpenConnectDialog: () => void;
  onSaveBlueprint: () => void;
  panelVisible: boolean;
  regularTabAgents: Node[];
  resolvedPanelWidth: number;
  roles: Role[];
  selectAgent: (id: string | null) => void;
  selectedAgent: Node | null;
  setActiveTabId: (id: string | null) => void;
  startDrag: (event: MouseEvent) => void;
  tabAgentOptions: WorkspaceAgentOption[];
  tabs: Map<string, TaskTab>;
  togglePanel: () => void;
  workspaceRef: RefObject<HTMLDivElement | null>;
}

export function WorkspaceShell({
  activeTabId,
  assistantDetailVisible,
  assistantNode,
  assistantPanelRunning,
  connected,
  graphConnectMode,
  graphHistory,
  graphRef,
  interruptingAssistant,
  isCompactWorkspace,
  isDragging,
  loadingRoles,
  onCloseAssistantDetails,
  onConnectModeChange,
  onCreateAgent,
  onCreateTab,
  onDeleteTab,
  onInterruptAssistant,
  onOpenAssistantDetails,
  onOpenConnectDialog,
  onSaveBlueprint,
  panelVisible,
  regularTabAgents,
  resolvedPanelWidth,
  roles,
  selectAgent,
  selectedAgent,
  setActiveTabId,
  startDrag,
  tabAgentOptions,
  tabs,
  togglePanel,
  workspaceRef,
}: WorkspaceShellProps) {
  const renderPrimaryPanel = () => {
    if (assistantDetailVisible && assistantNode) {
      return (
        <AgentDetailPanel
          agent={assistantNode}
          onClose={onCloseAssistantDetails}
        />
      );
    }

    return (
      <AssistantChatPanel
        interrupting={interruptingAssistant}
        onInterrupt={onInterruptAssistant}
        onOpenDetails={onOpenAssistantDetails}
      />
    );
  };

  return (
    <div
      ref={workspaceRef}
      className="relative isolate flex h-full overflow-hidden rounded-xl border border-border bg-surface-overlay shadow-md [contain:paint]"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "var(--shell-surface-sweep)" }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--shell-hairline)" }}
      />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="relative z-30 border-b border-border bg-background/45 backdrop-blur-md">
          <div className="pointer-events-auto relative z-10 flex items-center gap-1.5 overflow-x-auto px-3 py-2.5 pr-14 scrollbar-none">
            {Array.from(tabs.values()).map((tab) => (
              <div
                key={tab.id}
                className="group relative min-w-[120px] max-w-[200px] shrink-0"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTabId(tab.id)}
                  onAuxClick={(event) => {
                    if (event.button !== 1) {
                      return;
                    }
                    event.preventDefault();
                    onDeleteTab(tab.id, tab.title, tab.node_count);
                  }}
                  className={cn(
                    "relative h-8 w-full justify-start rounded-md border-b-2 px-3 pr-8 text-left text-[13px] font-medium transition-[color,border-color,background-color] duration-200",
                    activeTabId === tab.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-accent/25 hover:text-foreground",
                  )}
                >
                  <div className="truncate leading-tight">{tab.title}</div>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title="Delete tab"
                  aria-label={`Delete ${tab.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteTab(tab.id, tab.title, tab.node_count);
                  }}
                  className={cn(
                    "absolute right-1.5 top-1/2 z-20 size-5 -translate-y-1/2 rounded-sm p-1 transition-all duration-200 hover:bg-accent/45 hover:text-foreground",
                    activeTabId === tab.id
                      ? "text-foreground/70 opacity-100"
                      : "text-muted-foreground/60 opacity-0 group-hover:opacity-100",
                  )}
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Create tab"
              onClick={onCreateTab}
              className="shrink-0 rounded-md text-muted-foreground transition-all duration-200 hover:bg-accent/45 hover:text-foreground"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(circle at 14% 10%, var(--shell-spotlight-primary), transparent 24%), linear-gradient(180deg, color-mix(in srgb, var(--foreground) 1%, transparent), transparent 22%)",
          }}
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-background/28 to-transparent" />

        <div className="relative flex-1">
          <AgentGraph
            ref={graphRef}
            loadingRoles={loadingRoles}
            onConnectModeChange={onConnectModeChange}
            onCreateConnection={graphHistory.createConnection}
            onCreateLinkedAgent={graphHistory.createLinkedAgent}
            onCreateStandaloneAgent={graphHistory.createStandaloneAgent}
            onDeleteAgent={graphHistory.deleteAgent}
            onDeleteConnection={graphHistory.deleteConnection}
            onInsertAgentBetween={graphHistory.insertAgentBetween}
            onOpenConnectDialog={onOpenConnectDialog}
            roles={roles}
          />
          <div
            className={cn(
              "absolute top-4 z-40 flex max-w-[calc(100%-2.5rem)] flex-wrap items-center gap-1.5",
              isCompactWorkspace ? "left-14" : "left-4",
            )}
          >
            <BadgeChip tone="primary">
              <Radio
                className={cn(
                  "size-3.5 shrink-0",
                  connected
                    ? "text-graph-status-idle/88"
                    : "text-graph-status-initializing/38",
                )}
              />
              <span className="whitespace-nowrap">
                {connected ? "Live" : "Reconnecting"}
              </span>
            </BadgeChip>
          </div>

          <div className="pointer-events-none absolute inset-x-3 bottom-4 z-40 flex justify-center">
            <div
              data-testid="workspace-toolbar"
              className="pointer-events-auto inline-flex max-w-full items-center overflow-x-auto rounded-xl border border-border bg-surface-overlay/92 p-0.5 shadow-sm scrollbar-none"
            >
              <ToolbarButton
                disabled={!activeTabId || !graphHistory.canUndo(activeTabId)}
                onClick={() => {
                  void graphHistory.undo(activeTabId);
                }}
              >
                <Undo2 className="size-4 opacity-70" />
                Undo
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                disabled={!activeTabId || !graphHistory.canRedo(activeTabId)}
                onClick={() => {
                  void graphHistory.redo(activeTabId);
                }}
              >
                <Redo2 className="size-4 opacity-70" />
                Redo
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                disabled={!activeTabId || regularTabAgents.length === 0}
                onClick={onSaveBlueprint}
              >
                <Save className="size-4 opacity-70" />
                Save as Blueprint
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton disabled={!activeTabId} onClick={onCreateAgent}>
                <Plus className="size-4 opacity-70" />
                Add Agent
              </ToolbarButton>
              <ToolbarDivider />
              <ToolbarButton
                disabled={!activeTabId || tabAgentOptions.length < 2}
                active={graphConnectMode}
                onClick={() => graphRef.current?.enterConnectMode()}
              >
                <Link2 className="size-4 opacity-70" />
                Connect
              </ToolbarButton>
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 right-4 z-30 sm:bottom-5 sm:right-5">
          <PanelToggleButton expanded={panelVisible} onClick={togglePanel} />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {panelVisible ? (
          isCompactWorkspace ? (
            [
              <motion.button
                key="workspace-panel-backdrop"
                type="button"
                aria-label="Close workspace panel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 z-10 bg-background/40 backdrop-blur-[1px]"
                onClick={togglePanel}
              />,
              <motion.aside
                key="workspace-panel-sheet"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 18 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-y-2.5 right-2.5 z-20 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-overlay shadow-md"
                style={{ width: `${resolvedPanelWidth}px` }}
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute inset-0 z-20 border transition-[opacity,border-color,box-shadow] duration-300",
                    !selectedAgent && assistantPanelRunning
                      ? "animate-pulse border-ring/25 opacity-100 shadow-lg shadow-ring/10"
                      : "border-transparent opacity-0",
                  )}
                />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{ background: "var(--shell-surface-sweep)" }}
                />
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-px"
                  style={{ background: "var(--shell-hairline)" }}
                />
                <div className="flex h-full flex-col overflow-hidden">
                  <div className="relative flex-1 overflow-hidden">
                    <motion.div
                      animate={{
                        opacity: selectedAgent ? 0 : 1,
                        x: selectedAgent ? -8 : 0,
                      }}
                      transition={{ duration: 0.15 }}
                      className={cn(
                        "absolute inset-0 flex h-full flex-col",
                        selectedAgent && "pointer-events-none",
                      )}
                      aria-hidden={selectedAgent ? true : undefined}
                    >
                      {renderPrimaryPanel()}
                    </motion.div>

                    <AnimatePresence>
                      {selectedAgent ? (
                        <motion.div
                          key={selectedAgent.id}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ duration: 0.15 }}
                          className="absolute inset-0 flex h-full flex-col bg-background/42"
                        >
                          <AgentDetailPanel
                            agent={selectedAgent}
                            onClose={() => selectAgent(null)}
                          />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.aside>,
            ]
          ) : (
            <motion.aside
              key="workspace-panel-docked"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: resolvedPanelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="relative z-20 shrink-0 border-l border-border bg-surface-overlay shadow-md"
            >
              <div
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-0 z-20 border transition-[opacity,border-color,box-shadow] duration-300",
                  !selectedAgent && assistantPanelRunning
                    ? "animate-pulse border-ring/25 opacity-100 shadow-lg shadow-ring/10"
                    : "border-transparent opacity-0",
                )}
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: "var(--shell-surface-sweep)" }}
              />
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: "var(--shell-hairline)" }}
              />
              <PanelResizer
                position="left"
                isDragging={isDragging}
                onMouseDown={startDrag}
              />
              <div
                className="flex h-full flex-col overflow-hidden"
                style={{ width: `${resolvedPanelWidth}px` }}
              >
                <div className="relative flex-1 overflow-hidden">
                  <motion.div
                    animate={{
                      opacity: selectedAgent ? 0 : 1,
                      x: selectedAgent ? -8 : 0,
                    }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      "absolute inset-0 flex h-full flex-col",
                      selectedAgent && "pointer-events-none",
                    )}
                    aria-hidden={selectedAgent ? true : undefined}
                  >
                    {renderPrimaryPanel()}
                  </motion.div>

                  <AnimatePresence>
                    {selectedAgent ? (
                      <motion.div
                        key={selectedAgent.id}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute inset-0 flex h-full flex-col bg-background/42"
                      >
                        <AgentDetailPanel
                          agent={selectedAgent}
                          onClose={() => selectAgent(null)}
                        />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
            </motion.aside>
          )
        ) : null}
      </AnimatePresence>
    </div>
  );
}
