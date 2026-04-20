import type { AgentBlueprint, Role } from "@/types";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
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
import {
  WorkspaceCommandDialog,
  WorkspaceDialogField,
  WorkspaceDialogMeta,
} from "@/components/WorkspaceCommandDialog";
import { FormSwitch } from "@/components/form/FormControls";

const workspaceDialogInputClass =
  "bg-background/40 text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50";
const workspaceChoiceCardClass =
  "rounded-xl border border-border bg-card/40 px-4 py-3";
const workspaceChoiceListClass =
  "max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border bg-background/40 p-2 scrollbar-none";
const workspaceChoiceButtonBaseClass =
  "w-full rounded-md border px-3 py-2.5 text-left transition-colors";

export interface WorkspaceAgentOption {
  id: string;
  label: string;
}

interface CreateTabDialogProps {
  allowNetwork: boolean;
  blueprintId: string;
  blueprintQuery: string;
  filteredBlueprints: AgentBlueprint[];
  goal: string;
  loadingBlueprints: boolean;
  onAllowNetworkChange: (nextValue: boolean) => void;
  onBlueprintIdChange: (nextValue: string) => void;
  onBlueprintQueryChange: (nextValue: string) => void;
  onGoalChange: (nextValue: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  onTitleChange: (nextValue: string) => void;
  onWriteDirsChange: (nextValue: string) => void;
  open: boolean;
  pending: boolean;
  selectedBlueprint: AgentBlueprint | null;
  title: string;
  writeDirs: string;
}

export function CreateTabDialog({
  allowNetwork,
  blueprintId,
  blueprintQuery,
  filteredBlueprints,
  goal,
  loadingBlueprints,
  onAllowNetworkChange,
  onBlueprintIdChange,
  onBlueprintQueryChange,
  onGoalChange,
  onOpenChange,
  onSubmit,
  onTitleChange,
  onWriteDirsChange,
  open,
  pending,
  selectedBlueprint,
  title,
  writeDirs,
}: CreateTabDialogProps) {
  return (
    <WorkspaceCommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create Task Tab"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!title.trim() || pending}>
            {pending ? "Creating..." : "Create Task Tab"}
          </Button>
        </>
      }
    >
      <WorkspaceDialogField label="Title" hint="Shown in the tab strip">
        <Input
          autoFocus
          aria-label="Tab title"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Release checklist"
          className={cn("h-10 rounded-md", workspaceDialogInputClass)}
        />
      </WorkspaceDialogField>
      <WorkspaceDialogField label="Goal" hint="Optional">
        <Textarea
          value={goal}
          aria-label="Tab goal"
          onChange={(event) => onGoalChange(event.target.value)}
          placeholder="Summarize the task or outcome this workspace should drive."
          className={cn("min-h-[116px] rounded-md", workspaceDialogInputClass)}
        />
      </WorkspaceDialogField>
      <WorkspaceDialogField label="Blueprint" hint="Optional">
        <div className="space-y-3">
          <Input
            aria-label="Search blueprints"
            value={blueprintQuery}
            onChange={(event) => onBlueprintQueryChange(event.target.value)}
            placeholder="Search blueprints"
            className={cn("h-10 rounded-md", workspaceDialogInputClass)}
          />
          {selectedBlueprint ? (
            <div className={workspaceChoiceCardClass}>
              <div className="text-[13px] font-medium text-foreground">
                {selectedBlueprint.name}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                {selectedBlueprint.description || "No description"}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground/80">
                {selectedBlueprint.node_count} nodes ·{" "}
                {selectedBlueprint.edge_count} edges
              </p>
            </div>
          ) : null}
          <div className={workspaceChoiceListClass}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onBlueprintIdChange("")}
              className={cn(
                workspaceChoiceButtonBaseClass,
                !blueprintId
                  ? "border-border bg-accent/70"
                  : "border-transparent bg-transparent hover:border-border hover:bg-accent/45",
              )}
            >
              <div className="text-[13px] font-medium text-foreground">
                Start blank
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Create a tab with only its bound Leader. Permissions do not
                inherit from a blueprint.
              </p>
            </Button>
            {loadingBlueprints ? (
              <p className="px-2 py-3 text-[12px] text-muted-foreground">
                Loading blueprints...
              </p>
            ) : filteredBlueprints.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-muted-foreground">
                No blueprints match your search.
              </p>
            ) : (
              filteredBlueprints.map((blueprint) => (
                <Button
                  key={blueprint.id}
                  type="button"
                  variant="ghost"
                  onClick={() => onBlueprintIdChange(blueprint.id)}
                  className={cn(
                    workspaceChoiceButtonBaseClass,
                    blueprintId === blueprint.id
                      ? "border-border bg-accent/70"
                      : "border-transparent bg-transparent hover:border-border hover:bg-accent/45",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[13px] font-medium text-foreground">
                      {blueprint.name}
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80">
                      v{blueprint.version}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    {blueprint.description || "No description"}
                  </p>
                  <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground/80">
                    {blueprint.node_count} nodes · {blueprint.edge_count} edges
                  </p>
                </Button>
              ))
            )}
          </div>
        </div>
      </WorkspaceDialogField>
      <WorkspaceDialogMeta>
        The selected Network Access and Write Dirs initialize the bound Leader
        for this tab. MCP servers are provided globally after they connect, and
        they do not inherit from a blueprint.
      </WorkspaceDialogMeta>
      <WorkspaceDialogField
        label="Network Access"
        hint="Allow the leader to connect to the internet"
      >
        <FormSwitch
          checked={allowNetwork}
          label="Network Access"
          onCheckedChange={onAllowNetworkChange}
        />
      </WorkspaceDialogField>
      <WorkspaceDialogField
        label="Write Dirs"
        hint="One absolute path per line"
      >
        <Textarea
          value={writeDirs}
          aria-label="Write directories"
          onChange={(event) => onWriteDirsChange(event.target.value)}
          placeholder="/workspace/output&#10;/workspace/cache"
          className={cn(
            "min-h-[80px] rounded-md font-mono text-[13px]",
            workspaceDialogInputClass,
          )}
        />
      </WorkspaceDialogField>
    </WorkspaceCommandDialog>
  );
}

interface SaveBlueprintDialogProps {
  description: string;
  name: string;
  onDescriptionChange: (nextValue: string) => void;
  onNameChange: (nextValue: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  open: boolean;
  pending: boolean;
}

export function SaveBlueprintDialog({
  description,
  name,
  onDescriptionChange,
  onNameChange,
  onOpenChange,
  onSubmit,
  open,
  pending,
}: SaveBlueprintDialogProps) {
  return (
    <WorkspaceCommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Save as Blueprint"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!name.trim() || pending}>
            {pending ? "Saving..." : "Save as Blueprint"}
          </Button>
        </>
      }
    >
      <WorkspaceDialogMeta>
        This only saves the current Agent Network structure. History, runtime
        state, todos, and permissions are not copied into the Agent Blueprint.
      </WorkspaceDialogMeta>
      <WorkspaceDialogField label="Name" hint="Required">
        <Input
          autoFocus
          aria-label="Blueprint name"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Review Pipeline"
          className={cn("h-10 rounded-md", workspaceDialogInputClass)}
        />
      </WorkspaceDialogField>
      <WorkspaceDialogField label="Description" hint="Optional">
        <Textarea
          aria-label="Blueprint description"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Describe the reusable collaboration architecture."
          className={cn("min-h-[116px] rounded-md", workspaceDialogInputClass)}
        />
      </WorkspaceDialogField>
    </WorkspaceCommandDialog>
  );
}

interface CreateAgentDialogProps {
  activeTabTitle: string | null;
  agentName: string;
  filteredRoles: Role[];
  loadingRoles: boolean;
  onAgentNameChange: (nextValue: string) => void;
  onOpenChange: (open: boolean) => void;
  onRoleNameChange: (nextValue: string) => void;
  onRoleQueryChange: (nextValue: string) => void;
  onSubmit: () => void;
  open: boolean;
  pending: boolean;
  roleQuery: string;
  selectedRole: Role | null;
  selectedRoleName: string;
  submitDisabled: boolean;
}

export function CreateAgentDialog({
  activeTabTitle,
  agentName,
  filteredRoles,
  loadingRoles,
  onAgentNameChange,
  onOpenChange,
  onRoleNameChange,
  onRoleQueryChange,
  onSubmit,
  open,
  pending,
  roleQuery,
  selectedRole,
  selectedRoleName,
  submitDisabled,
}: CreateAgentDialogProps) {
  return (
    <WorkspaceCommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add Agent"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitDisabled}>
            {pending ? "Adding..." : "Add Agent"}
          </Button>
        </>
      }
    >
      <WorkspaceDialogMeta>
        Adding a regular node to{" "}
        <span className="font-semibold text-foreground">
          {activeTabTitle ?? "No active tab"}
        </span>
      </WorkspaceDialogMeta>
      <WorkspaceDialogField
        label="Role"
        hint="Required · Leader is managed by the tab"
      >
        <div className="space-y-3">
          <Input
            autoFocus
            aria-label="Search roles"
            value={roleQuery}
            onChange={(event) => onRoleQueryChange(event.target.value)}
            placeholder="Search roles"
            className={cn("h-10 rounded-md", workspaceDialogInputClass)}
          />
          {selectedRole ? (
            <div className={workspaceChoiceCardClass}>
              <div className="text-[13px] font-medium text-foreground">
                {selectedRole.name}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                {selectedRole.description}
              </p>
            </div>
          ) : null}
          <div className={workspaceChoiceListClass}>
            {loadingRoles ? (
              <p className="px-2 py-3 text-[12px] text-muted-foreground">
                Loading roles...
              </p>
            ) : filteredRoles.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-muted-foreground">
                No roles match your search.
              </p>
            ) : (
              filteredRoles.map((role) => (
                <Button
                  key={role.name}
                  type="button"
                  variant="ghost"
                  onClick={() => onRoleNameChange(role.name)}
                  className={cn(
                    workspaceChoiceButtonBaseClass,
                    selectedRoleName === role.name
                      ? "border-border bg-accent/70"
                      : "border-transparent bg-transparent hover:border-border hover:bg-accent/45",
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
      </WorkspaceDialogField>
      <WorkspaceDialogField label="Display Name" hint="Optional">
        <Input
          value={agentName}
          aria-label="Agent display name"
          onChange={(event) => onAgentNameChange(event.target.value)}
          placeholder="Docs Worker"
          className={cn("h-10 rounded-md", workspaceDialogInputClass)}
        />
      </WorkspaceDialogField>
    </WorkspaceCommandDialog>
  );
}

interface ConnectAgentsDialogProps {
  activeTabTitle: string | null;
  agentOptions: WorkspaceAgentOption[];
  onOpenChange: (open: boolean) => void;
  onSourceChange: (nextValue: string) => void;
  onSubmit: () => void;
  onTargetChange: (nextValue: string) => void;
  open: boolean;
  pending: boolean;
  sourceId: string;
  targetId: string;
}

export function ConnectAgentsDialog({
  activeTabTitle,
  agentOptions,
  onOpenChange,
  onSourceChange,
  onSubmit,
  onTargetChange,
  open,
  pending,
  sourceId,
  targetId,
}: ConnectAgentsDialogProps) {
  return (
    <WorkspaceCommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Connect Agents"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              !sourceId || !targetId || sourceId === targetId || pending
            }
          >
            {pending ? "Connecting..." : "Create Connection"}
          </Button>
        </>
      }
    >
      <WorkspaceDialogMeta>
        {activeTabTitle ? (
          <>
            Tab{" "}
            <span className="font-semibold text-foreground">
              {activeTabTitle}
            </span>{" "}
            · {agentOptions.length} agents available
          </>
        ) : (
          "No active tab"
        )}
      </WorkspaceDialogMeta>
      <WorkspaceDialogField label="Agent A" hint="First endpoint">
        <Select value={sourceId} onValueChange={onSourceChange}>
          <SelectTrigger
            aria-label="Agent A"
            className={cn(
              "h-10 rounded-md data-[placeholder]:text-muted-foreground",
              workspaceDialogInputClass,
            )}
          >
            <SelectValue placeholder="Choose first agent" />
          </SelectTrigger>
          <SelectContent className="rounded-md border-border bg-popover text-popover-foreground">
            {agentOptions.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </WorkspaceDialogField>
      <WorkspaceDialogField label="Agent B" hint="Second endpoint">
        <Select value={targetId} onValueChange={onTargetChange}>
          <SelectTrigger
            aria-label="Agent B"
            className={cn(
              "h-10 rounded-md data-[placeholder]:text-muted-foreground",
              workspaceDialogInputClass,
            )}
          >
            <SelectValue placeholder="Choose second agent" />
          </SelectTrigger>
          <SelectContent className="rounded-md border-border bg-popover text-popover-foreground">
            {agentOptions
              .filter((agent) => agent.id !== sourceId)
              .map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </WorkspaceDialogField>
    </WorkspaceCommandDialog>
  );
}

interface DeleteTabDialogProps {
  onDelete: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  target: {
    id: string;
    title: string;
    nodeCount?: number;
  } | null;
}

export function DeleteTabDialog({
  onDelete,
  onOpenChange,
  open,
  pending,
  target,
}: DeleteTabDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[30rem]">
        <AlertDialogHeader className="gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-accent/45 text-foreground shadow-xs">
              <Trash2 className="size-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                Destructive Action
              </p>
              <AlertDialogTitle className="mt-1 text-foreground">
                Delete tab?
              </AlertDialogTitle>
            </div>
          </div>
          <AlertDialogDescription className="text-muted-foreground">
            {target ? (
              <>
                Remove{" "}
                <span className="font-semibold text-foreground">
                  {target.title}
                </span>{" "}
                and clean up its persisted agent network.
                {typeof target.nodeCount === "number"
                  ? ` ${target.nodeCount} node${target.nodeCount === 1 ? "" : "s"} will be removed with it.`
                  : ""}
              </>
            ) : (
              "This action cannot be undone."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending ? "Deleting..." : "Delete Tab"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
