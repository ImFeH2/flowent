import {
  ConnectAgentsDialog,
  CreateAgentDialog,
  CreateTabDialog,
  DeleteTabDialog,
  SaveBlueprintDialog,
} from "@/components/workspace/WorkspaceDialogs";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { useHomePageState } from "@/pages/home/useHomePageState";

export function HomePage() {
  const {
    activeDialog,
    activeTab,
    activeTabId,
    connected,
    connectSourceId,
    connectTargetId,
    createAgentName,
    createAgentRoleName,
    createAgentRoleQuery,
    createTabAllowNetwork,
    createTabBlueprintId,
    createTabBlueprintQuery,
    createTabGoal,
    createTabTitle,
    createTabWriteDirs,
    deleteTabTarget,
    filteredCreateAgentRoles,
    filteredCreateTabBlueprints,
    graphConnectMode,
    graphHistory,
    graphRef,
    handleCloseLeaderDetails,
    handleConnectAgents,
    handleCreateAgent,
    handleCreateTab,
    handleDeleteTab,
    handleOpenLeaderDetails,
    handleSaveCurrentNetworkAsBlueprint,
    isCompactWorkspace,
    isDragging,
    leaderDetailVisible,
    leaderNode,
    leaderPanelRunning,
    loadingBlueprints,
    loadingRoles,
    openConnectDialog,
    openCreateAgentDialog,
    openCreateTabDialog,
    openSaveBlueprintDialog,
    panelVisible,
    pendingAction,
    regularTabAgents,
    requestDeleteTab,
    resolvedPanelWidth,
    roles,
    saveBlueprintDescription,
    saveBlueprintName,
    selectAgent,
    selectedAgent,
    selectedCreateAgentRole,
    selectedCreateTabBlueprint,
    setActiveDialog,
    setActiveTabId,
    setConnectSourceId,
    setConnectTargetId,
    setCreateAgentName,
    setCreateAgentRoleName,
    setCreateAgentRoleQuery,
    setCreateTabAllowNetwork,
    setCreateTabBlueprintId,
    setCreateTabBlueprintQuery,
    setCreateTabGoal,
    setCreateTabTitle,
    setCreateTabWriteDirs,
    setDeleteTabTarget,
    setGraphConnectMode,
    setSaveBlueprintDescription,
    setSaveBlueprintName,
    startDrag,
    tabAgentOptions,
    tabs,
    togglePanel,
    workspaceRef,
  } = useHomePageState();

  return (
    <>
      <WorkspaceShell
        activeTabId={activeTabId}
        connected={connected}
        graphConnectMode={graphConnectMode}
        graphHistory={graphHistory}
        graphRef={graphRef}
        isCompactWorkspace={isCompactWorkspace}
        isDragging={isDragging}
        leaderDetailVisible={leaderDetailVisible}
        leaderNode={leaderNode}
        leaderPanelRunning={leaderPanelRunning}
        loadingRoles={loadingRoles}
        onCloseLeaderDetails={handleCloseLeaderDetails}
        onConnectModeChange={setGraphConnectMode}
        onCreateAgent={openCreateAgentDialog}
        onCreateTab={openCreateTabDialog}
        onDeleteTab={requestDeleteTab}
        onOpenLeaderDetails={handleOpenLeaderDetails}
        onOpenConnectDialog={openConnectDialog}
        onSaveBlueprint={openSaveBlueprintDialog}
        panelVisible={panelVisible}
        regularTabAgents={regularTabAgents}
        resolvedPanelWidth={resolvedPanelWidth}
        roles={roles}
        selectAgent={selectAgent}
        selectedAgent={selectedAgent}
        setActiveTabId={setActiveTabId}
        startDrag={startDrag}
        tabAgentOptions={tabAgentOptions}
        tabs={tabs}
        togglePanel={togglePanel}
        workspaceRef={workspaceRef}
      />

      <CreateTabDialog
        open={activeDialog === "create-tab"}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
          }
        }}
        pending={pendingAction === "create-tab"}
        title={createTabTitle}
        onTitleChange={setCreateTabTitle}
        goal={createTabGoal}
        onGoalChange={setCreateTabGoal}
        blueprintQuery={createTabBlueprintQuery}
        onBlueprintQueryChange={setCreateTabBlueprintQuery}
        blueprintId={createTabBlueprintId}
        onBlueprintIdChange={setCreateTabBlueprintId}
        selectedBlueprint={selectedCreateTabBlueprint}
        filteredBlueprints={filteredCreateTabBlueprints}
        loadingBlueprints={loadingBlueprints}
        allowNetwork={createTabAllowNetwork}
        onAllowNetworkChange={setCreateTabAllowNetwork}
        writeDirs={createTabWriteDirs}
        onWriteDirsChange={setCreateTabWriteDirs}
        onSubmit={() => void handleCreateTab()}
      />

      <SaveBlueprintDialog
        open={activeDialog === "save-blueprint"}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
          }
        }}
        pending={pendingAction === "save-blueprint"}
        name={saveBlueprintName}
        onNameChange={setSaveBlueprintName}
        description={saveBlueprintDescription}
        onDescriptionChange={setSaveBlueprintDescription}
        onSubmit={() => void handleSaveCurrentNetworkAsBlueprint()}
      />

      <CreateAgentDialog
        open={activeDialog === "create-agent"}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
          }
        }}
        pending={pendingAction === "create-agent"}
        activeTabTitle={activeTab?.title ?? null}
        roleQuery={createAgentRoleQuery}
        onRoleQueryChange={setCreateAgentRoleQuery}
        selectedRole={selectedCreateAgentRole}
        selectedRoleName={createAgentRoleName}
        onRoleNameChange={setCreateAgentRoleName}
        filteredRoles={filteredCreateAgentRoles}
        loadingRoles={loadingRoles}
        agentName={createAgentName}
        onAgentNameChange={setCreateAgentName}
        onSubmit={() => void handleCreateAgent()}
        submitDisabled={
          !activeTabId ||
          !selectedCreateAgentRole ||
          pendingAction === "create-agent"
        }
      />

      <ConnectAgentsDialog
        open={activeDialog === "connect-agents"}
        onOpenChange={(open) => {
          if (!open) {
            setActiveDialog(null);
          }
        }}
        pending={pendingAction === "connect-agents"}
        activeTabTitle={activeTab?.title ?? null}
        agentOptions={tabAgentOptions}
        sourceId={connectSourceId}
        targetId={connectTargetId}
        onSourceChange={(value) => {
          setConnectSourceId(value);
          if (value === connectTargetId) {
            const nextTarget =
              tabAgentOptions.find((agent) => agent.id !== value)?.id ?? "";
            setConnectTargetId(nextTarget);
          }
        }}
        onTargetChange={setConnectTargetId}
        onSubmit={() => void handleConnectAgents()}
      />

      <DeleteTabDialog
        open={Boolean(deleteTabTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTabTarget(null);
          }
        }}
        pending={pendingAction === "delete-tab"}
        target={deleteTabTarget}
        onDelete={() => void handleDeleteTab()}
      />
    </>
  );
}
