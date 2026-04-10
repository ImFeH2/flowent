import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Edit2, Eye, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  createRole,
  deleteRole,
  fetchProviderModels,
  fetchRolesBootstrap,
  updateRole,
  type ModelOption,
  type ToolInfo,
} from "@/lib/api";
import { ModelParamsFields } from "@/components/ModelParamsFields";
import {
  PageScaffold,
  SectionHeader,
  SettingsRow,
} from "@/components/layout/PageScaffold";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  cloneModelParams,
  isEmptyModelParams,
  modelParamsToPayload,
} from "@/lib/modelParams";
import { cn } from "@/lib/utils";
import type { Provider, Role, RoleModelConfig } from "@/types";

type RoleDraft = Omit<Role, "is_builtin">;
type ToolState = "allowed" | "included" | "excluded";
type PanelMode = "create" | "edit" | "view";

const MINIMUM_TOOLS = new Set(["idle", "sleep", "todo", "contacts"]);

const emptyDraft = (): RoleDraft => ({
  name: "",
  system_prompt: "",
  model: null,
  model_params: null,
  included_tools: [],
  excluded_tools: [],
});

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelMode, setPanelMode] = useState<PanelMode | null>(null);
  const [activeRoleName, setActiveRoleName] = useState<string | null>(null);
  const [draft, setDraft] = useState<RoleDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);
  const [modelOptionsByProvider, setModelOptionsByProvider] = useState<
    Record<string, ModelOption[]>
  >({});
  const [loadingModelProviderId, setLoadingModelProviderId] = useState<
    string | null
  >(null);

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
  const activeProviderModelOptions = activeProviderId
    ? (modelOptionsByProvider[activeProviderId] ?? [])
    : [];

  const refreshRoles = async () => {
    setLoading(true);
    try {
      const {
        roles: roleItems,
        tools: toolItems,
        providers: providerItems,
      } = await fetchRolesBootstrap();
      setRoles(roleItems);
      setTools(toolItems);
      setProviders(providerItems);
    } catch {
      toast.error("Failed to load roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshRoles();
  }, []);

  useEffect(() => {
    const providerId = draft.model?.provider_id;
    if (!providerId || modelOptionsByProvider[providerId]) {
      return;
    }

    let cancelled = false;
    setLoadingModelProviderId(providerId);

    void fetchProviderModels(providerId)
      .then((items) => {
        if (cancelled) {
          return;
        }
        setModelOptionsByProvider((current) => ({
          ...current,
          [providerId]: items,
        }));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        toast.error("Failed to load provider models");
        setModelOptionsByProvider((current) => ({
          ...current,
          [providerId]: [],
        }));
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingModelProviderId((current) =>
            current === providerId ? null : current,
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [draft.model?.provider_id, modelOptionsByProvider]);

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
        setRoles((prev) =>
          prev.map((role) => (role.name === activeRoleName ? updated : role)),
        );
        toast.success("Role updated");
      } else {
        const created = await createRole(nextDraft);
        setRoles((prev) => [created, ...prev]);
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
      setRoles((prev) => prev.filter((role) => role.name !== name));
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
      : panelMode === "edit"
        ? "Edit Role"
        : "Role Details";

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
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-2 w-32 rounded-full skeleton-shimmer" />
          <p className="text-sm text-muted-foreground">Loading roles...</p>
        </div>
      </div>
    );
  }

  return (
    <PageScaffold
      title="Roles"
      description="Define reusable agent behaviors, model overrides, parameter overrides, and tool boundaries."
      actions={
        <div className="flex items-center gap-2">
          <Button
            onClick={() => void refreshRoles()}
            disabled={loading}
            variant="ghost"
            size="icon"
            className="border border-white/8 bg-white/[0.024] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </Button>
          <Button onClick={handleCreate} disabled={isPanelOpen}>
            <Plus className="size-4" />
            New Role
          </Button>
        </div>
      }
    >
      {isPanelOpen ? (
        <div className="h-full min-h-0 overflow-y-auto pr-2">
          <div className="mx-auto max-w-3xl pb-6">
            <div className="mb-6 flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{panelTitle}</h2>
                <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-muted-foreground/78">
                  {panelEyebrow}
                </span>
              </div>
              <Button
                onClick={handleCancel}
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              >
                <X className="size-4" />
              </Button>
            </div>

            <section>
              <SectionHeader
                title="Role Identity"
                description="Define the role name and baseline prompt used by agents created with this role."
              />

              <SettingsRow label="Role Name" description="Unique ID">
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  readOnly={isReadOnly || lockBuiltinFields}
                  placeholder="e.g., Code Reviewer"
                  className={cn(
                    "w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 text-sm transition-all duration-200 placeholder:text-muted-foreground",
                    isReadOnly || lockBuiltinFields
                      ? "cursor-default text-muted-foreground focus:outline-none"
                      : "focus:border-white/16 focus:outline-none",
                  )}
                />
              </SettingsRow>

              <div className="mt-5 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm font-medium">System Prompt</label>
                  <span className="text-[11px] text-muted-foreground/72">
                    Appended after the built-in collaboration prompt
                  </span>
                </div>
                <textarea
                  value={draft.system_prompt}
                  onChange={(e) =>
                    setDraft({ ...draft, system_prompt: e.target.value })
                  }
                  readOnly={isReadOnly || lockBuiltinFields}
                  placeholder="You are a helpful assistant that..."
                  rows={12}
                  className={cn(
                    "w-full resize-y rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 font-mono text-sm transition-all duration-200 placeholder:text-muted-foreground",
                    isReadOnly || lockBuiltinFields
                      ? "cursor-default text-muted-foreground focus:outline-none"
                      : "focus:border-white/16 focus:outline-none",
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  {isReadOnly
                    ? activeRole?.is_builtin
                      ? "This built-in role can be inspected. Use Edit to adjust only its model configuration."
                      : "This role is in read-only view. Use Edit to modify it."
                    : lockBuiltinFields
                      ? "Built-in role prompt and tool configuration are fixed. Only model configuration can be changed."
                      : "This prompt defines how agents with this role will behave."}
                </p>
              </div>
            </section>

            <section className="mt-6 border-t border-white/6 pt-6">
              <SectionHeader
                title="Model Configuration"
                description="Choose whether this role follows Settings or uses its own provider and model override."
              />

              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => handleModelModeChange(false)}
                    variant="outline"
                    className={cn(
                      "h-auto justify-start px-3 py-2 text-left text-sm transition-colors",
                      draft.model === null
                        ? "border-white/10 bg-white/[0.075] text-foreground"
                        : "border-white/8 bg-black/[0.18] text-muted-foreground hover:bg-white/[0.04]",
                      isReadOnly && "cursor-default hover:bg-black/[0.18]",
                    )}
                  >
                    Use Settings Default
                  </Button>
                  <Button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => handleModelModeChange(true)}
                    variant="outline"
                    className={cn(
                      "h-auto justify-start px-3 py-2 text-left text-sm transition-colors",
                      draft.model !== null
                        ? "border-white/10 bg-white/[0.075] text-foreground"
                        : "border-white/8 bg-black/[0.18] text-muted-foreground hover:bg-white/[0.04]",
                      isReadOnly && "cursor-default hover:bg-black/[0.18]",
                    )}
                  >
                    Set Role Override
                  </Button>
                </div>

                {draft.model ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Provider</label>
                      <Select
                        value={draft.model.provider_id || undefined}
                        onValueChange={handleProviderChange}
                        disabled={isReadOnly}
                      >
                        <SelectTrigger className="rounded-md border-white/8 bg-black/[0.22]">
                          <SelectValue placeholder="Select a provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {providers.map((provider) => (
                            <SelectItem key={provider.id} value={provider.id}>
                              {provider.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Provider Models
                      </label>
                      <Select
                        value={
                          activeProviderModelOptions.some(
                            (option) => option.id === draft.model?.model,
                          )
                            ? draft.model?.model
                            : undefined
                        }
                        onValueChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            model: current.model
                              ? {
                                  ...current.model,
                                  model: value,
                                }
                              : null,
                          }))
                        }
                        disabled={
                          isReadOnly ||
                          !draft.model.provider_id ||
                          loadingModelProviderId === draft.model.provider_id ||
                          activeProviderModelOptions.length === 0
                        }
                      >
                        <SelectTrigger className="rounded-md border-white/8 bg-black/[0.22]">
                          <SelectValue
                            placeholder={
                              loadingModelProviderId === draft.model.provider_id
                                ? "Loading models..."
                                : activeProviderModelOptions.length > 0
                                  ? "Pick a discovered model"
                                  : "No discovered models"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {activeProviderModelOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="text-sm font-medium">Model</label>
                      <input
                        type="text"
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
                        placeholder="e.g., gpt-4.1-mini"
                        className={cn(
                          "w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 font-mono text-sm transition-all duration-200 placeholder:text-muted-foreground",
                          isReadOnly
                            ? "cursor-default text-muted-foreground focus:outline-none"
                            : "focus:border-white/16 focus:outline-none",
                        )}
                      />
                      <p className="text-[11px] text-muted-foreground/72">
                        Catalog or manual ID
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This role follows the default provider and model from
                    Settings.
                  </p>
                )}
              </div>
            </section>

            <section className="mt-6 border-t border-white/6 pt-6">
              <SectionHeader
                title="Model Parameters"
                description="Optionally override the canonical model parameters for this role."
              />

              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => handleModelParamsModeChange(false)}
                    variant="outline"
                    className={cn(
                      "h-auto justify-start px-3 py-2 text-left text-sm transition-colors",
                      isEmptyModelParams(draft.model_params)
                        ? "border-white/10 bg-white/[0.075] text-foreground"
                        : "border-white/8 bg-black/[0.18] text-muted-foreground hover:bg-white/[0.04]",
                      isReadOnly && "cursor-default hover:bg-black/[0.18]",
                    )}
                  >
                    Use Settings Default
                  </Button>
                  <Button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => handleModelParamsModeChange(true)}
                    variant="outline"
                    className={cn(
                      "h-auto justify-start px-3 py-2 text-left text-sm transition-colors",
                      !isEmptyModelParams(draft.model_params)
                        ? "border-white/10 bg-white/[0.075] text-foreground"
                        : "border-white/8 bg-black/[0.18] text-muted-foreground hover:bg-white/[0.04]",
                      isReadOnly && "cursor-default hover:bg-black/[0.18]",
                    )}
                  >
                    Set Parameter Overrides
                  </Button>
                </div>

                {!isEmptyModelParams(draft.model_params) ? (
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
                ) : (
                  <p className="text-xs text-muted-foreground">
                    This role inherits the default model parameters from
                    Settings.
                  </p>
                )}
              </div>
            </section>

            <section className="mt-6 border-t border-white/6 pt-6">
              <SectionHeader
                title="Tool Configuration"
                description="Minimum tools are injected by the framework. Configure the remaining tools as Allowed, Included, or Excluded."
              />

              <div className="overflow-hidden rounded-md border border-white/6 bg-black/[0.18]">
                {configurableTools.map((tool) => {
                  const state = getToolState(tool.name);
                  return (
                    <div
                      key={tool.name}
                      className="flex items-center justify-between gap-4 border-b border-white/6 px-4 py-3 last:border-b-0"
                    >
                      <div
                        className="min-w-0 flex flex-1 items-center gap-2"
                        title={tool.description}
                      >
                        <p className="shrink-0 font-mono text-sm">
                          {tool.name}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground/72">
                          {tool.description}
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => cycleToolState(tool.name)}
                        disabled={isReadOnly || lockBuiltinFields}
                        variant="outline"
                        size="xs"
                        className={cn(
                          "shrink-0 rounded-full transition-colors",
                          state === "included" &&
                            "border-white/14 bg-white/[0.07] text-white/88",
                          state === "excluded" &&
                            "border-white/10 bg-white/[0.03] text-white/52 line-through",
                          state === "allowed" &&
                            "border-white/8 bg-black/[0.24] text-muted-foreground",
                          (isReadOnly || lockBuiltinFields) &&
                            "cursor-default opacity-90 hover:bg-inherit",
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

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/6 pt-5">
              <Button
                onClick={handleCancel}
                disabled={saving}
                variant="ghost"
                className="border border-white/8 bg-white/[0.024] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
              >
                Cancel
              </Button>
              {!isReadOnly && (
                <Button onClick={() => void handleSave()} disabled={saving}>
                  {saving
                    ? "Saving..."
                    : panelMode === "create"
                      ? "Create Role"
                      : "Save Changes"}
                </Button>
              )}
              {isReadOnly && activeRole && !activeRole.is_builtin && (
                <Button onClick={() => handleEdit(activeRole)}>Edit</Button>
              )}
            </div>
          </div>
        </div>
      ) : roles.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex h-full flex-col items-center justify-center text-center"
        >
          <p className="text-sm text-muted-foreground">
            No roles yet. Create one to get started.
          </p>
        </motion.div>
      ) : (
        <div className="h-full min-h-0 overflow-y-auto pr-2">
          <div className="mx-auto max-w-5xl">
            <div className="mb-1 flex items-center gap-4 border-b border-white/6 px-3 pb-2">
              <span className="w-40 shrink-0 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
                Name
              </span>
              <span className="flex-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
                Model
              </span>
              <span className="w-24 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
                Tools
              </span>
              <span className="w-20" />
            </div>

            <div>
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
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className={cn(
                      "group flex items-center gap-4 border-b border-white/[0.04] px-3 py-3 transition-colors hover:bg-white/[0.02]",
                      activeRoleName === role.name && "bg-white/[0.03]",
                    )}
                  >
                    <div className="w-40 shrink-0">
                      <span className="text-sm font-medium">{role.name}</span>
                      {role.is_builtin && (
                        <span className="ml-2 rounded-full bg-white/[0.065] px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-muted-foreground">
                          Built-in
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-muted-foreground">
                        {role.model
                          ? `${providerName} / ${role.model.model}`
                          : "Settings default"}
                      </span>
                    </div>

                    <div className="w-24">
                      <span className="text-sm text-muted-foreground">
                        {toolSummary}
                      </span>
                    </div>

                    <div className="flex w-20 items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <Button
                        onClick={() => handleView(role)}
                        aria-label={`View ${role.name}`}
                        title={`View ${role.name}`}
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                      >
                        <Eye className="size-3.5" />
                      </Button>
                      <Button
                        onClick={() => handleEdit(role)}
                        aria-label={`Edit ${role.name}`}
                        title={`Edit ${role.name}`}
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                      >
                        <Edit2 className="size-3.5" />
                      </Button>
                      {!role.is_builtin && (
                        <Button
                          onClick={() => setRoleToDelete(role)}
                          aria-label={`Delete ${role.name}`}
                          title={`Delete ${role.name}`}
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:bg-white/[0.06] hover:text-white"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      )}
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
