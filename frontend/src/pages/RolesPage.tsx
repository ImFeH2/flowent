import { useMemo, useState } from "react";
import useSWR from "swr";
import { motion } from "motion/react";
import { Edit2, Eye, Plus, RefreshCw, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  createRole,
  deleteRole,
  fetchRolesBootstrap,
  updateRole,
} from "@/lib/api";
import { ModelParamsFields } from "@/components/ModelParamsFields";
import {
  PageScaffold,
  PageTitleBar,
  SectionHeader,
  SettingsRow,
} from "@/components/layout/PageScaffold";
import { PageLoadingState } from "@/components/layout/PageLoadingState";
import {
  FormIconButton,
  FormInput,
  FormTextarea,
  formReadOnlyClass,
  formSelectTriggerClass,
} from "@/components/form/FormControls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  cloneModelParams,
  isEmptyModelParams,
  modelParamsToPayload,
} from "@/lib/modelParams";
import { cn } from "@/lib/utils";
import type { Role, RoleModelConfig } from "@/types";

type RoleDraft = Omit<Role, "is_builtin">;
type ToolState = "allowed" | "included" | "excluded";
type PanelMode = "create" | "edit" | "view";

const MINIMUM_TOOLS = new Set(["idle", "sleep", "todo", "contacts"]);

const emptyDraft = (): RoleDraft => ({
  name: "",
  description: "",
  system_prompt: "",
  model: null,
  model_params: null,
  included_tools: [],
  excluded_tools: [],
});

export function RolesPage() {
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [activeRoleName, setActiveRoleName] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoleDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);

  const {
    data: bootstrapData,
    isLoading: loading,
    mutate: mutateRolesBootstrap,
  } = useSWR("rolesBootstrap", fetchRolesBootstrap);

  const roles = useMemo(
    () => bootstrapData?.roles ?? [],
    [bootstrapData?.roles],
  );
  const tools = useMemo(
    () => bootstrapData?.tools ?? [],
    [bootstrapData?.tools],
  );
  const providers = useMemo(
    () => bootstrapData?.providers ?? [],
    [bootstrapData?.providers],
  );

  const configurableTools = useMemo(
    () => tools.filter((tool) => !MINIMUM_TOOLS.has(tool.name)),
    [tools],
  );
  const providersById = useMemo(
    () =>
      Object.fromEntries(providers.map((provider) => [provider.id, provider])),
    [providers],
  );
  const activeProviderId = draft.model?.provider_id ?? "";
  const activeProviderModelOptions = useMemo(
    () =>
      activeProviderId ? (providersById[activeProviderId]?.models ?? []) : [],
    [activeProviderId, providersById],
  );
  const availableActiveProviderModelOptions = activeProviderModelOptions;

  const refreshRoles = async () => {
    await mutateRolesBootstrap();
  };

  const handleCreate = () => {
    setPanelMode("create");
    setActiveRoleName(null);
    setDraft(emptyDraft());
  };

  const handleView = (role: Role) => {
    setPanelMode("view");
    setActiveRoleName(role.name);
    setDraft({
      name: role.name,
      description: role.description,
      system_prompt: role.system_prompt,
      model: role.model
        ? {
            provider_id: role.model.provider_id,
            model: role.model.model,
          }
        : null,
      model_params: role.model_params
        ? cloneModelParams(role.model_params)
        : null,
      included_tools: [...role.included_tools],
      excluded_tools: [...role.excluded_tools],
    });
  };

  const handleEdit = (role: Role) => {
    setPanelMode("edit");
    setActiveRoleName(role.name);
    setDraft({
      name: role.name,
      description: role.description,
      system_prompt: role.system_prompt,
      model: role.model
        ? {
            provider_id: role.model.provider_id,
            model: role.model.model,
          }
        : null,
      model_params: role.model_params
        ? cloneModelParams(role.model_params)
        : null,
      included_tools: [...role.included_tools],
      excluded_tools: [...role.excluded_tools],
    });
  };

  const handleCancel = () => {
    setPanelMode(null);
    setActiveRoleName(null);
    setDraft(emptyDraft());
  };

  const handleModelModeChange = (enabled: boolean) => {
    if (!enabled) {
      setDraft((current) => ({ ...current, model: null }));
      return;
    }
    if (providers.length === 0) {
      toast.error("Create a provider before setting a role model");
      return;
    }
    setDraft((current) => ({
      ...current,
      model:
        current.model ??
        ({
          provider_id: providers[0]?.id ?? "",
          model: "",
        } satisfies RoleModelConfig),
    }));
  };

  const handleProviderChange = (providerId: string) => {
    setDraft((current) => ({
      ...current,
      model: current.model
        ? {
            provider_id: providerId,
            model: "",
          }
        : null,
    }));
  };

  const handleModelParamsModeChange = (enabled: boolean) => {
    setDraft((current) => ({
      ...current,
      model_params: enabled ? cloneModelParams(current.model_params) : null,
    }));
  };

  const handleSave = async () => {
    const nextName = draft.name.trim();

    if (!nextName) {
      toast.error("Role name is required");
      return;
    }
    if (!draft.description.trim()) {
      toast.error("Role description is required");
      return;
    }
    if (!draft.system_prompt.trim()) {
      toast.error("System prompt is required");
      return;
    }
    if (draft.model) {
      if (!draft.model.provider_id.trim()) {
        toast.error("Provider is required for a role model override");
        return;
      }
      if (!draft.model.model.trim()) {
        toast.error("Model is required for a role model override");
        return;
      }
    }

    const nameExists = roles.some(
      (role) => role.name === nextName && role.name !== activeRoleName,
    );
    if (nameExists) {
      toast.error("Role name already exists");
      return;
    }

    setSaving(true);
    try {
      const nextDraft = {
        name: nextName,
        description: draft.description.trim(),
        system_prompt: draft.system_prompt,
        model: draft.model
          ? {
              provider_id: draft.model.provider_id.trim(),
              model: draft.model.model.trim(),
            }
          : null,
        model_params: modelParamsToPayload(draft.model_params),
        included_tools: draft.included_tools,
        excluded_tools: draft.excluded_tools,
      };

      if (panelMode === "edit" && activeRoleName) {
        const activeRole =
          roles.find((role) => role.name === activeRoleName) ?? null;
        const updates = activeRole?.is_builtin
          ? {
              model: nextDraft.model,
              model_params: nextDraft.model_params,
            }
          : nextDraft;
        const updated = await updateRole(activeRoleName, updates);
        void mutateRolesBootstrap(
          {
            roles: roles.map((role) =>
              role.name === activeRoleName ? updated : role,
            ),
            tools,
            providers,
          },
          false,
        );
        toast.success("Role updated");
      } else {
        const created = await createRole(nextDraft);
        void mutateRolesBootstrap(
          {
            roles: [created, ...roles],
            tools,
            providers,
          },
          false,
        );
        toast.success("Role created");
      }
      handleCancel();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save role",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!roleToDelete) return;
    const name = roleToDelete.name;
    setRoleToDelete(null);
    try {
      await deleteRole(name);
      void mutateRolesBootstrap(
        {
          roles: roles.filter((role) => role.name !== name),
          tools,
          providers,
        },
        false,
      );
      if (activeRoleName === name) {
        handleCancel();
      }
      toast.success("Role deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete role",
      );
    }
  };

  const isPanelOpen = panelMode !== null;
  const isReadOnly = panelMode === "view";
  const activeRole = activeRoleName
    ? (roles.find((role) => role.name === activeRoleName) ?? null)
    : null;
  const lockBuiltinFields =
    panelMode !== "create" &&
    panelMode !== null &&
    activeRole?.is_builtin === true;
  const panelEyebrow =
    panelMode === "create"
      ? "New Role"
      : activeRole?.is_builtin
        ? "Built-in"
        : "Custom";
  const panelTitle =
    panelMode === "create"
      ? "Create Role"
      : activeRole?.is_builtin
        ? "Role Details"
        : (activeRole?.name ?? "Role Details");

  const getToolState = (toolName: string): ToolState => {
    if (draft.included_tools.includes(toolName)) {
      return "included";
    }
    if (draft.excluded_tools.includes(toolName)) {
      return "excluded";
    }
    return "allowed";
  };

  const cycleToolState = (toolName: string) => {
    setDraft((current) => {
      const currentState = current.included_tools.includes(toolName)
        ? "included"
        : current.excluded_tools.includes(toolName)
          ? "excluded"
          : "allowed";

      if (currentState === "allowed") {
        return {
          ...current,
          included_tools: [...current.included_tools, toolName],
          excluded_tools: current.excluded_tools.filter(
            (name) => name !== toolName,
          ),
        };
      }

      if (currentState === "included") {
        return {
          ...current,
          included_tools: current.included_tools.filter(
            (name) => name !== toolName,
          ),
          excluded_tools: [...current.excluded_tools, toolName],
        };
      }

      return {
        ...current,
        included_tools: current.included_tools.filter(
          (name) => name !== toolName,
        ),
        excluded_tools: current.excluded_tools.filter(
          (name) => name !== toolName,
        ),
      };
    });
  };

  if (loading && !isPanelOpen) {
    return <PageLoadingState label="Loading roles..." />;
  }

  return (
    <PageScaffold className="px-4 pt-6 sm:px-5">
      <div className="flex h-full min-h-0 flex-col">
        <PageTitleBar
          title="Roles"
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => void refreshRoles()}
                disabled={loading}
                className="bg-accent/20 text-muted-foreground hover:bg-accent/45 hover:text-foreground"
              >
                <RefreshCw
                  className={cn("size-4", loading && "animate-spin")}
                />
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleCreate}
                disabled={isPanelOpen}
              >
                <Plus className="size-4" />
                New Role
              </Button>
            </>
          }
        />
        <div className="mt-6 min-h-0 flex-1">
          {isPanelOpen ? (
            <div className="h-full min-h-0 overflow-y-auto pr-2 scrollbar-none">
              <div className="mx-auto max-w-3xl pb-10">
                <div className="mb-8 flex items-center justify-between rounded-xl border border-border bg-card/30 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Badge
                      variant="secondary"
                      className="rounded-full border border-border/70 bg-accent/20 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                    >
                      {panelEyebrow}
                    </Badge>
                    <h2 className="text-[15px] font-medium text-foreground">
                      {panelTitle}
                    </h2>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleCancel}
                    className="text-muted-foreground hover:bg-accent/45 hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>

                <section className="mb-10">
                  <SectionHeader
                    title="Identity"
                    description="Define the role name, selection description, and baseline prompt used by agents created with this role."
                  />

                  <div className="space-y-4">
                    <SettingsRow
                      label="Role Name"
                      description="Unique identifier"
                    >
                      <FormInput
                        value={draft.name}
                        onChange={(e) =>
                          setDraft({ ...draft, name: e.target.value })
                        }
                        readOnly={isReadOnly || lockBuiltinFields}
                        placeholder="e.g., Code Reviewer"
                        className={cn(
                          isReadOnly || lockBuiltinFields
                            ? formReadOnlyClass
                            : "",
                        )}
                      />
                    </SettingsRow>

                    <SettingsRow
                      label="Description"
                      description="Short summary shown when humans or agents choose a role"
                    >
                      <FormTextarea
                        value={draft.description}
                        onChange={(e) =>
                          setDraft({ ...draft, description: e.target.value })
                        }
                        readOnly={isReadOnly || lockBuiltinFields}
                        placeholder="Briefly explain what this role is best suited for"
                        rows={3}
                        className={cn(
                          "resize-y",
                          isReadOnly || lockBuiltinFields
                            ? formReadOnlyClass
                            : "",
                        )}
                      />
                    </SettingsRow>

                    <SettingsRow
                      label="System Prompt"
                      description="Appended after the built-in collaboration prompt"
                    >
                      <div className="space-y-2">
                        <FormTextarea
                          value={draft.system_prompt}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              system_prompt: e.target.value,
                            })
                          }
                          readOnly={isReadOnly || lockBuiltinFields}
                          placeholder="You are a helpful assistant that..."
                          rows={12}
                          className={cn(
                            "resize-y",
                            isReadOnly || lockBuiltinFields
                              ? formReadOnlyClass
                              : "",
                          )}
                          mono
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {isReadOnly
                            ? activeRole?.is_builtin
                              ? "This built-in role can be inspected. Use Edit to adjust only its model configuration."
                              : "This role is in read-only view. Use Edit to modify it."
                            : lockBuiltinFields
                              ? "Built-in role prompt and tool configuration are fixed. Only model configuration can be changed."
                              : "This prompt defines how agents with this role will behave."}
                        </p>
                      </div>
                    </SettingsRow>
                  </div>
                </section>

                <section className="mb-10 border-t border-border pt-8">
                  <SectionHeader
                    title="Model Configuration"
                    description="Choose whether this role follows Settings or uses its own provider and model override."
                  />

                  <div className="space-y-6">
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isReadOnly}
                        onClick={() => handleModelModeChange(false)}
                        className={cn(
                          "h-8 rounded-md border px-3 text-[13px] font-medium transition-colors",
                          draft.model === null
                            ? "border-border bg-accent/45 text-foreground"
                            : "border-transparent bg-card/20 text-muted-foreground hover:bg-accent/25",
                          isReadOnly && "cursor-default",
                        )}
                      >
                        Use Settings Default
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isReadOnly}
                        onClick={() => handleModelModeChange(true)}
                        className={cn(
                          "h-8 rounded-md border px-3 text-[13px] font-medium transition-colors",
                          draft.model !== null
                            ? "border-border bg-accent/45 text-foreground"
                            : "border-transparent bg-card/20 text-muted-foreground hover:bg-accent/25",
                          isReadOnly && "cursor-default",
                        )}
                      >
                        Set Role Override
                      </Button>
                    </div>

                    {draft.model ? (
                      <div className="rounded-xl border border-border bg-card/30 p-5">
                        <div className="grid gap-6 md:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-[13px] font-medium text-foreground/80">
                              Provider
                            </label>
                            <Select
                              value={draft.model.provider_id || undefined}
                              onValueChange={handleProviderChange}
                              disabled={isReadOnly}
                            >
                              <SelectTrigger className={formSelectTriggerClass}>
                                <SelectValue placeholder="Select a provider" />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border-border bg-popover">
                                {providers.map((provider) => (
                                  <SelectItem
                                    key={provider.id}
                                    value={provider.id}
                                    className="text-[13px]"
                                  >
                                    {provider.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[13px] font-medium text-foreground/80">
                              Provider Models
                            </label>
                            <Select
                              value={
                                availableActiveProviderModelOptions.some(
                                  (option) =>
                                    option.model === draft.model?.model,
                                )
                                  ? draft.model?.model
                                  : undefined
                              }
                              onValueChange={(value) =>
                                setDraft((current) => ({
                                  ...current,
                                  model: current.model
                                    ? { ...current.model, model: value }
                                    : null,
                                }))
                              }
                              disabled={
                                isReadOnly ||
                                !draft.model.provider_id ||
                                availableActiveProviderModelOptions.length === 0
                              }
                            >
                              <SelectTrigger className={formSelectTriggerClass}>
                                <SelectValue
                                  placeholder={
                                    availableActiveProviderModelOptions.length >
                                    0
                                      ? "Pick a provider model"
                                      : "No saved provider models"
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent className="max-h-[300px] rounded-xl border-border bg-popover">
                                {availableActiveProviderModelOptions.map(
                                  (option) => (
                                    <SelectItem
                                      key={option.model}
                                      value={option.model}
                                      className="text-[13px]"
                                    >
                                      {option.model}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectContent>
                            </Select>
                            {availableActiveProviderModelOptions.length ===
                            0 ? (
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                No saved provider models. Manage this provider
                                catalog in Providers.
                              </p>
                            ) : null}
                          </div>

                          <div className="space-y-2 md:col-span-2">
                            <label className="text-[13px] font-medium text-foreground/80">
                              Model ID
                            </label>
                            <FormInput
                              value={draft.model.model}
                              onChange={(e) =>
                                setDraft((current) => ({
                                  ...current,
                                  model: current.model
                                    ? {
                                        ...current.model,
                                        model: e.target.value,
                                      }
                                    : null,
                                }))
                              }
                              readOnly={isReadOnly}
                              placeholder="e.g., gpt-4o-mini"
                              className={cn(
                                isReadOnly ? formReadOnlyClass : "",
                              )}
                              mono
                            />
                            <p className="text-[11px] text-muted-foreground">
                              Catalog or manual ID
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[13px] text-muted-foreground">
                        This role follows the default provider and model from
                        Settings.
                      </p>
                    )}
                  </div>
                </section>

                <section className="mb-10 border-t border-border pt-8">
                  <SectionHeader
                    title="Model Parameters"
                    description="Optionally override the canonical model parameters for this role."
                  />

                  <div className="space-y-6">
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isReadOnly}
                        onClick={() => handleModelParamsModeChange(false)}
                        className={cn(
                          "h-8 rounded-md border px-3 text-[13px] font-medium transition-colors",
                          isEmptyModelParams(draft.model_params)
                            ? "border-border bg-accent/45 text-foreground"
                            : "border-transparent bg-card/20 text-muted-foreground hover:bg-accent/25",
                          isReadOnly && "cursor-default",
                        )}
                      >
                        Use Settings Default
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isReadOnly}
                        onClick={() => handleModelParamsModeChange(true)}
                        className={cn(
                          "h-8 rounded-md border px-3 text-[13px] font-medium transition-colors",
                          !isEmptyModelParams(draft.model_params)
                            ? "border-border bg-accent/45 text-foreground"
                            : "border-transparent bg-card/20 text-muted-foreground hover:bg-accent/25",
                          isReadOnly && "cursor-default",
                        )}
                      >
                        Set Parameter Overrides
                      </Button>
                    </div>

                    {!isEmptyModelParams(draft.model_params) ? (
                      <div className="rounded-xl border border-border bg-card/30 p-5">
                        <ModelParamsFields
                          value={cloneModelParams(draft.model_params)}
                          onChange={(params) =>
                            setDraft((current) => ({
                              ...current,
                              model_params: params,
                            }))
                          }
                          disabled={isReadOnly}
                          emptyLabel="Inherit settings default"
                          numberPlaceholder="Inherit settings default"
                          reasoningDisableLabel="Disable"
                          helperText="These canonical parameters override Settings only for this role. Unsupported fields are ignored by the resolved provider."
                        />
                      </div>
                    ) : (
                      <p className="text-[13px] text-muted-foreground">
                        This role inherits the default model parameters from
                        Settings.
                      </p>
                    )}
                  </div>
                </section>

                <section className="mb-10 border-t border-border pt-8">
                  <SectionHeader
                    title="Tool Configuration"
                    description="Minimum tools are injected by the framework. Configure the remaining tools as Allowed, Included, or Excluded."
                  />

                  <div className="overflow-hidden rounded-xl border border-border bg-card/30">
                    {configurableTools.map((tool) => {
                      const state = getToolState(tool.name);
                      return (
                        <div
                          key={tool.name}
                          className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 last:border-b-0"
                        >
                          <div
                            className="min-w-0 flex-1"
                            title={tool.description}
                          >
                            <p className="font-mono text-[13px] text-foreground/80">
                              {tool.name}
                            </p>
                            <p className="mt-1 truncate text-[12px] text-muted-foreground">
                              {tool.description}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => cycleToolState(tool.name)}
                            disabled={isReadOnly || lockBuiltinFields}
                            className={cn(
                              "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                              state === "included" &&
                                "bg-accent/50 text-foreground",
                              state === "excluded" &&
                                "bg-transparent text-muted-foreground line-through",
                              state === "allowed" &&
                                "bg-accent/20 text-muted-foreground hover:bg-accent/35",
                              (isReadOnly || lockBuiltinFields) &&
                                "cursor-default hover:bg-inherit opacity-60",
                            )}
                          >
                            {state === "allowed"
                              ? "Allowed"
                              : state === "included"
                                ? "Included"
                                : "Excluded"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  {!isReadOnly && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleSave()}
                      disabled={
                        saving ||
                        !draft.name.trim() ||
                        !draft.description.trim() ||
                        !draft.system_prompt.trim()
                      }
                    >
                      {saving
                        ? "Saving..."
                        : panelMode === "create"
                          ? "Create Role"
                          : "Save Changes"}
                    </Button>
                  )}
                  {isReadOnly && activeRole && !activeRole.is_builtin && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleEdit(activeRole)}
                    >
                      Edit Role
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : roles.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center text-center"
            >
              <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-accent/20 shadow-sm">
                <Users className="size-5 text-muted-foreground" />
              </div>
              <h3 className="mt-5 text-[15px] font-medium text-foreground">
                No Roles Created
              </h3>
              <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">
                Roles define agent behavior. Create your first role to get
                started.
              </p>
            </motion.div>
          ) : (
            <div className="h-full min-h-0 overflow-y-auto pr-2 scrollbar-none">
              <div className="mx-auto w-full max-w-5xl">
                <div className="mb-2 grid grid-cols-[260px_1fr_120px_100px] gap-4 px-4 pb-3">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Name
                  </span>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Model
                  </span>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Tools
                  </span>
                  <span />
                </div>

                <div className="space-y-1">
                  {roles.map((role, index) => {
                    const providerName = role.model
                      ? (providersById[role.model.provider_id]?.name ??
                        role.model.provider_id)
                      : null;
                    const includedCount = role.included_tools.length;
                    const excludedCount = role.excluded_tools.length;
                    const toolSummary =
                      includedCount === 0 && excludedCount === 0
                        ? "Default"
                        : `${includedCount > 0 ? `+${includedCount}` : ""}${includedCount > 0 && excludedCount > 0 ? " " : ""}${excludedCount > 0 ? `-${excludedCount}` : ""}`;

                    return (
                      <motion.div
                        key={role.name}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className={cn(
                          "group grid grid-cols-[220px_1fr_100px_80px] items-center gap-4 rounded-xl px-4 py-3.5 transition-colors",
                          activeRoleName === role.name
                            ? "bg-accent/25"
                            : "hover:bg-accent/15",
                        )}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-foreground">
                              {role.name}
                            </span>
                            {role.is_builtin && (
                              <span className="shrink-0 rounded-full border border-border bg-accent/25 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                                Built-in
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                            {role.description}
                          </p>
                        </div>

                        <div className="min-w-0 pr-2">
                          <span className="block truncate text-[13px] text-muted-foreground">
                            {role.model
                              ? `${providerName} / ${role.model.model}`
                              : "Settings default"}
                          </span>
                        </div>

                        <div className="pr-2">
                          <span className="text-[13px] font-mono text-muted-foreground">
                            {toolSummary}
                          </span>
                        </div>

                        <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <FormIconButton
                            onClick={() => handleView(role)}
                            aria-label={`View ${role.name}`}
                            title={`View ${role.name}`}
                            className="size-7"
                          >
                            <Eye className="size-3.5" />
                          </FormIconButton>
                          <FormIconButton
                            onClick={() => handleEdit(role)}
                            aria-label={`Edit ${role.name}`}
                            title={`Edit ${role.name}`}
                            className="size-7"
                          >
                            <Edit2 className="size-3.5" />
                          </FormIconButton>
                          {!role.is_builtin && (
                            <FormIconButton
                              onClick={() => setRoleToDelete(role)}
                              aria-label={`Delete ${role.name}`}
                              title={`Delete ${role.name}`}
                              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </FormIconButton>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <AlertDialog
        open={roleToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRoleToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role?</AlertDialogTitle>
            <AlertDialogDescription>
              {roleToDelete
                ? `This will permanently remove ${roleToDelete.name}.`
                : "This will permanently remove the selected role."}
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
