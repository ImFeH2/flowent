import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { BookOpen, Edit2, Eye, Plus, RefreshCw, Trash2, X } from "lucide-react";
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
import { PageScaffold, SoftPanel } from "@/components/layout/PageScaffold";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cloneModelParams,
  describeModelParams,
  isEmptyModelParams,
  modelParamsToPayload,
} from "@/lib/modelParams";
import { cn } from "@/lib/utils";
import type { Provider, Role, RoleModelConfig } from "@/types";

type RoleDraft = Omit<Role, "is_builtin">;
type ToolState = "allowed" | "included" | "excluded";
type PanelMode = "create" | "edit" | "view";

const MINIMUM_TOOLS = new Set([
  "send",
  "idle",
  "todo",
  "list_connections",
  "exit",
]);

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

  const handleDelete = async (name: string) => {
    if (!confirm("Are you sure you want to delete this role?")) {
      return;
    }
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
      description="Define reusable agent behaviors"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refreshRoles()}
            disabled={loading}
            className="flex size-9 items-center justify-center rounded-md border border-white/8 bg-white/[0.024] text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>
          <button
            onClick={handleCreate}
            disabled={isPanelOpen}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98] hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="size-4" />
            New Role
          </button>
        </div>
      }
    >
      {isPanelOpen ? (
        <div className="h-full min-h-0 overflow-y-auto pr-2">
          <div className="mx-auto max-w-3xl pb-6">
            <SoftPanel className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
                <h2 className="text-xl font-semibold">
                  {panelMode === "create"
                    ? "Create Role"
                    : panelMode === "edit"
                      ? "Edit Role"
                      : "Role Details"}
                </h2>
                <div className="flex items-center gap-2">
                  {activeRole?.is_builtin && (
                    <span className="rounded-full bg-white/[0.065] px-2.5 py-1 text-[11px] font-medium tracking-[0.08em] text-muted-foreground">
                      Built-in
                    </span>
                  )}
                  <button
                    onClick={handleCancel}
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-5 px-5 py-5">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role Name</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                    readOnly={isReadOnly || lockBuiltinFields}
                    placeholder="e.g., Code Reviewer"
                    className={cn(
                      "w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 text-sm transition-all duration-200 placeholder:text-muted-foreground",
                      isReadOnly || lockBuiltinFields
                        ? "cursor-default text-muted-foreground focus:outline-none"
                        : "focus:border-white/16 focus:outline-none",
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">System Prompt</label>
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

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Model Configuration
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleModelModeChange(false)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                          draft.model === null
                            ? "border-white/10 bg-white/[0.075] text-foreground"
                            : "border-white/8 bg-black/[0.18] text-muted-foreground hover:bg-white/[0.04]",
                          isReadOnly && "cursor-default hover:bg-black/[0.18]",
                        )}
                      >
                        Use Settings Default
                      </button>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleModelModeChange(true)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                          draft.model !== null
                            ? "border-white/10 bg-white/[0.075] text-foreground"
                            : "border-white/8 bg-black/[0.18] text-muted-foreground hover:bg-white/[0.04]",
                          isReadOnly && "cursor-default hover:bg-black/[0.18]",
                        )}
                      >
                        Set Role Override
                      </button>
                    </div>
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
                            loadingModelProviderId ===
                              draft.model.provider_id ||
                            activeProviderModelOptions.length === 0
                          }
                        >
                          <SelectTrigger className="rounded-md border-white/8 bg-black/[0.22]">
                            <SelectValue
                              placeholder={
                                loadingModelProviderId ===
                                draft.model.provider_id
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
                        <p className="text-xs text-muted-foreground">
                          Select a discovered model or enter a model ID
                          manually.
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

                <div className="space-y-4 border-t border-white/6 pt-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Model Parameters
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleModelParamsModeChange(false)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                          isEmptyModelParams(draft.model_params)
                            ? "border-white/10 bg-white/[0.075] text-foreground"
                            : "border-white/8 bg-black/[0.18] text-muted-foreground hover:bg-white/[0.04]",
                          isReadOnly && "cursor-default hover:bg-black/[0.18]",
                        )}
                      >
                        Inherit Settings Defaults
                      </button>
                      <button
                        type="button"
                        disabled={isReadOnly}
                        onClick={() => handleModelParamsModeChange(true)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-left text-sm transition-colors",
                          !isEmptyModelParams(draft.model_params)
                            ? "border-white/10 bg-white/[0.075] text-foreground"
                            : "border-white/8 bg-black/[0.18] text-muted-foreground hover:bg-white/[0.04]",
                          isReadOnly && "cursor-default hover:bg-black/[0.18]",
                        )}
                      >
                        Set Role Parameter Override
                      </button>
                    </div>
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

                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">Tool Configuration</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Minimum tools are injected by the framework. Configure the
                      remaining tools as Allowed, Included, or Excluded.
                    </p>
                  </div>

                  <div className="overflow-hidden rounded-md border border-white/6 bg-black/[0.18]">
                    {configurableTools.map((tool) => {
                      const state = getToolState(tool.name);
                      return (
                        <div
                          key={tool.name}
                          className="flex items-center justify-between gap-4 border-b border-white/6 px-4 py-3 last:border-b-0"
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-sm">{tool.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {tool.description}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => cycleToolState(tool.name)}
                            disabled={isReadOnly || lockBuiltinFields}
                            className={cn(
                              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                              state === "included" &&
                                "border-emerald-500/30 bg-emerald-500/8 text-emerald-300",
                              state === "excluded" &&
                                "border-red-500/30 bg-red-500/8 text-red-300",
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
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4">
                  <button
                    onClick={handleCancel}
                    disabled={saving}
                    className="rounded-md border border-white/8 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/[0.05]"
                  >
                    {isReadOnly ? "Close" : "Cancel"}
                  </button>
                  {!isReadOnly && (
                    <button
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98] hover:bg-primary/90 disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Role"}
                    </button>
                  )}
                </div>
              </div>
            </SoftPanel>
          </div>
        </div>
      ) : roles.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex h-full flex-col items-center justify-center text-center"
        >
          <BookOpen className="size-8 text-muted-foreground/60" />
          <h3 className="mt-4 text-lg font-semibold">No Roles Yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Create your first role to define how agents should behave.
          </p>
          <button
            onClick={handleCreate}
            className="mt-4 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98] hover:bg-primary/90"
          >
            <Plus className="size-4" />
            Create Role
          </button>
        </motion.div>
      ) : (
        <div className="mx-auto max-w-5xl">
          <SoftPanel className="overflow-hidden p-0">
            <div className="divide-y divide-white/6">
              {roles.map((role, index) => {
                const providerName = role.model
                  ? (providersById[role.model.provider_id]?.name ??
                    role.model.provider_id)
                  : null;

                return (
                  <motion.div
                    key={role.name}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group relative px-5 py-4 transition-colors hover:bg-white/[0.028]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white/[0.05]">
                            <BookOpen className="size-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="truncate font-semibold">
                                {role.name}
                              </h3>
                              {role.is_builtin && (
                                <span className="shrink-0 text-[11px] font-medium tracking-[0.08em] text-muted-foreground/75">
                                  Built-in
                                </span>
                              )}
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                              {role.system_prompt}
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                              {role.model ? (
                                <>
                                  <span>Provider: {providerName}</span>
                                  <span>Model: {role.model.model}</span>
                                </>
                              ) : (
                                <span>Model: Settings default</span>
                              )}
                              <span>
                                Params: {describeModelParams(role.model_params)}
                              </span>
                            </div>
                            {(role.included_tools.length > 0 ||
                              role.excluded_tools.length > 0) && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {role.included_tools.map((toolName) => (
                                  <span
                                    key={`included-${role.name}-${toolName}`}
                                    className="rounded-full bg-emerald-500/8 px-2.5 py-1 text-xs font-medium text-emerald-300"
                                  >
                                    {toolName}
                                  </span>
                                ))}
                                {role.excluded_tools.map((toolName) => (
                                  <span
                                    key={`excluded-${role.name}-${toolName}`}
                                    className="rounded-full bg-red-500/8 px-2.5 py-1 text-xs font-medium text-red-300"
                                  >
                                    {toolName}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => handleView(role)}
                          aria-label={`View ${role.name}`}
                          title={`View ${role.name}`}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
                        >
                          <Eye className="size-3.5" />
                        </button>
                        <button
                          onClick={() => handleEdit(role)}
                          aria-label={`Edit ${role.name}`}
                          title={`Edit ${role.name}`}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
                        >
                          <Edit2 className="size-3.5" />
                        </button>
                        {!role.is_builtin && (
                          <button
                            onClick={() => handleDelete(role.name)}
                            aria-label={`Delete ${role.name}`}
                            title={`Delete ${role.name}`}
                            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </SoftPanel>
        </div>
      )}
    </PageScaffold>
  );
}
