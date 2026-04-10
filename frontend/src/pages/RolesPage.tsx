import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Edit2, Eye, Plus, RefreshCw, Trash2, Users, X } from "lucide-react";
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
          <div className="mx-auto h-2 w-32 animate-pulse rounded-full bg-white/[0.05]" />
          <p className="text-sm text-white/40">Loading roles...</p>
        </div>
      </div>
    );
  }

  return (
    <PageScaffold>
      {isPanelOpen ? (
        <div className="h-full min-h-0 overflow-y-auto pr-2 scrollbar-none">
          <div className="mx-auto max-w-3xl pb-10">
            <div className="mb-8 flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.01] px-5 py-4">
              <div className="flex items-center gap-3">
                <h2 className="text-[15px] font-medium text-white/90">
                  {panelTitle}
                </h2>
                <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-white/50">
                  {panelEyebrow}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="flex size-7 items-center justify-center rounded-full bg-white/[0.04] text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <section className="mb-10">
              <SectionHeader
                title="Identity"
                description="Define the role name and baseline prompt used by agents created with this role."
              />

              <div className="space-y-4">
                <SettingsRow label="Role Name" description="Unique identifier">
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                    readOnly={isReadOnly || lockBuiltinFields}
                    placeholder="e.g., Code Reviewer"
                    className={cn(
                      "w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-[13px] text-white transition-colors placeholder:text-white/30",
                      isReadOnly || lockBuiltinFields
                        ? "cursor-default opacity-60 focus:outline-none"
                        : "focus:border-white/20 focus:bg-white/[0.04] focus:outline-none",
                    )}
                  />
                </SettingsRow>

                <SettingsRow
                  label="System Prompt"
                  description="Appended after the built-in collaboration prompt"
                >
                  <div className="space-y-2">
                    <textarea
                      value={draft.system_prompt}
                      onChange={(e) =>
                        setDraft({ ...draft, system_prompt: e.target.value })
                      }
                      readOnly={isReadOnly || lockBuiltinFields}
                      placeholder="You are a helpful assistant that..."
                      rows={12}
                      className={cn(
                        "w-full resize-y rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 font-mono text-[13px] text-white transition-colors placeholder:text-white/30",
                        isReadOnly || lockBuiltinFields
                          ? "cursor-default opacity-60 focus:outline-none"
                          : "focus:border-white/20 focus:bg-white/[0.04] focus:outline-none",
                      )}
                    />
                    <p className="text-[11px] text-white/40">
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

            <section className="mb-10 border-t border-white/[0.04] pt-8">
              <SectionHeader
                title="Model Configuration"
                description="Choose whether this role follows Settings or uses its own provider and model override."
              />

              <div className="space-y-6">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => handleModelModeChange(false)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-[13px] font-medium transition-colors",
                      draft.model === null
                        ? "border-white/[0.08] bg-white/[0.04] text-white/90"
                        : "border-transparent bg-white/[0.01] text-white/50 hover:bg-white/[0.03]",
                      isReadOnly && "cursor-default",
                    )}
                  >
                    Use Settings Default
                  </button>
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => handleModelModeChange(true)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-[13px] font-medium transition-colors",
                      draft.model !== null
                        ? "border-white/[0.08] bg-white/[0.04] text-white/90"
                        : "border-transparent bg-white/[0.01] text-white/50 hover:bg-white/[0.03]",
                      isReadOnly && "cursor-default",
                    )}
                  >
                    Set Role Override
                  </button>
                </div>

                {draft.model ? (
                  <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-5">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-[13px] font-medium text-white/80">
                          Provider
                        </label>
                        <Select
                          value={draft.model.provider_id || undefined}
                          onValueChange={handleProviderChange}
                          disabled={isReadOnly}
                        >
                          <SelectTrigger className="w-full rounded-lg border-white/[0.06] bg-white/[0.02] text-[13px]">
                            <SelectValue placeholder="Select a provider" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-white/[0.08] bg-black/80 backdrop-blur-xl">
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
                        <label className="text-[13px] font-medium text-white/80">
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
                                ? { ...current.model, model: value }
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
                          <SelectTrigger className="w-full rounded-lg border-white/[0.06] bg-white/[0.02] text-[13px]">
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
                          <SelectContent className="max-h-[300px] rounded-xl border-white/[0.08] bg-black/80 backdrop-blur-xl">
                            {activeProviderModelOptions.map((option) => (
                              <SelectItem
                                key={option.id}
                                value={option.id}
                                className="text-[13px]"
                              >
                                {option.id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <label className="text-[13px] font-medium text-white/80">
                          Model ID
                        </label>
                        <input
                          type="text"
                          value={draft.model.model}
                          onChange={(e) =>
                            setDraft((current) => ({
                              ...current,
                              model: current.model
                                ? { ...current.model, model: e.target.value }
                                : null,
                            }))
                          }
                          readOnly={isReadOnly}
                          placeholder="e.g., gpt-4o-mini"
                          className={cn(
                            "w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 font-mono text-[13px] text-white transition-colors placeholder:text-white/30",
                            isReadOnly
                              ? "cursor-default opacity-60 focus:outline-none"
                              : "focus:border-white/20 focus:bg-white/[0.04] focus:outline-none",
                          )}
                        />
                        <p className="text-[11px] text-white/40">
                          Catalog or manual ID
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-white/40">
                    This role follows the default provider and model from
                    Settings.
                  </p>
                )}
              </div>
            </section>

            <section className="mb-10 border-t border-white/[0.04] pt-8">
              <SectionHeader
                title="Model Parameters"
                description="Optionally override the canonical model parameters for this role."
              />

              <div className="space-y-6">
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => handleModelParamsModeChange(false)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-[13px] font-medium transition-colors",
                      isEmptyModelParams(draft.model_params)
                        ? "border-white/[0.08] bg-white/[0.04] text-white/90"
                        : "border-transparent bg-white/[0.01] text-white/50 hover:bg-white/[0.03]",
                      isReadOnly && "cursor-default",
                    )}
                  >
                    Use Settings Default
                  </button>
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => handleModelParamsModeChange(true)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-[13px] font-medium transition-colors",
                      !isEmptyModelParams(draft.model_params)
                        ? "border-white/[0.08] bg-white/[0.04] text-white/90"
                        : "border-transparent bg-white/[0.01] text-white/50 hover:bg-white/[0.03]",
                      isReadOnly && "cursor-default",
                    )}
                  >
                    Set Parameter Overrides
                  </button>
                </div>

                {!isEmptyModelParams(draft.model_params) ? (
                  <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-5">
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
                  <p className="text-[13px] text-white/40">
                    This role inherits the default model parameters from
                    Settings.
                  </p>
                )}
              </div>
            </section>

            <section className="mb-10 border-t border-white/[0.04] pt-8">
              <SectionHeader
                title="Tool Configuration"
                description="Minimum tools are injected by the framework. Configure the remaining tools as Allowed, Included, or Excluded."
              />

              <div className="overflow-hidden rounded-xl border border-white/[0.04] bg-white/[0.01]">
                {configurableTools.map((tool) => {
                  const state = getToolState(tool.name);
                  return (
                    <div
                      key={tool.name}
                      className="flex items-center justify-between gap-4 border-b border-white/[0.04] px-5 py-4 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1" title={tool.description}>
                        <p className="font-mono text-[13px] text-white/80">
                          {tool.name}
                        </p>
                        <p className="mt-1 truncate text-[12px] text-white/40">
                          {tool.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => cycleToolState(tool.name)}
                        disabled={isReadOnly || lockBuiltinFields}
                        className={cn(
                          "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                          state === "included" && "bg-white/[0.08] text-white",
                          state === "excluded" &&
                            "bg-transparent text-white/30 line-through",
                          state === "allowed" &&
                            "bg-white/[0.02] text-white/50 hover:bg-white/[0.04]",
                          (isReadOnly || lockBuiltinFields) &&
                            "cursor-default hover:bg-inherit opacity-60",
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
            </section>

            <div className="flex items-center justify-end gap-3 border-t border-white/[0.04] pt-6">
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving}
                className="rounded-full px-5 py-2 text-[13px] font-medium text-white/60 transition-colors hover:text-white"
              >
                Cancel
              </button>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="rounded-full bg-white px-6 py-2 text-[13px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : panelMode === "create"
                      ? "Create Role"
                      : "Save Changes"}
                </button>
              )}
              {isReadOnly && activeRole && !activeRole.is_builtin && (
                <button
                  type="button"
                  onClick={() => handleEdit(activeRole)}
                  className="rounded-full bg-white/[0.08] px-6 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/[0.12]"
                >
                  Edit Role
                </button>
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
          <div className="flex size-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.02] shadow-sm">
            <Users className="size-5 text-white/40" />
          </div>
          <h3 className="mt-5 text-[15px] font-medium text-white/90">
            No Roles Created
          </h3>
          <p className="mt-1.5 max-w-sm text-[13px] text-white/40">
            Roles define agent behavior. Create your first role to get started.
          </p>
        </motion.div>
      ) : (
        <div className="h-full min-h-0 overflow-y-auto pr-2 scrollbar-none pt-8">
          <div className="mx-auto w-full max-w-5xl">
            <div className="mb-6 flex justify-end px-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void refreshRoles()}
                  disabled={loading}
                  className="flex size-9 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-white/60 transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                  <RefreshCw
                    className={cn("size-4", loading && "animate-spin")}
                  />
                </button>
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isPanelOpen}
                  className="flex h-9 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Plus className="size-4" />
                  New Role
                </button>
              </div>
            </div>
            <div className="mb-2 grid grid-cols-[200px_1fr_120px_100px] gap-4 px-4 pb-3">
              <span className="text-[11px] font-medium text-white/40">
                Name
              </span>
              <span className="text-[11px] font-medium text-white/40">
                Model
              </span>
              <span className="text-[11px] font-medium text-white/40">
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
                      "group grid grid-cols-[160px_1fr_100px_80px] items-center gap-4 rounded-xl px-4 py-3.5 transition-colors",
                      activeRoleName === role.name
                        ? "bg-white/[0.04]"
                        : "hover:bg-white/[0.02]",
                    )}
                  >
                    <div className="flex items-center gap-2 pr-2">
                      <span className="truncate text-[13px] font-medium text-white/90">
                        {role.name}
                      </span>
                      {role.is_builtin && (
                        <span className="shrink-0 rounded-full border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/40">
                          Built-in
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 pr-2">
                      <span className="block truncate text-[13px] text-white/50">
                        {role.model
                          ? `${providerName} / ${role.model.model}`
                          : "Settings default"}
                      </span>
                    </div>

                    <div className="pr-2">
                      <span className="text-[13px] font-mono text-white/50">
                        {toolSummary}
                      </span>
                    </div>

                    <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => handleView(role)}
                        aria-label={`View ${role.name}`}
                        title={`View ${role.name}`}
                        className="flex size-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
                      >
                        <Eye className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(role)}
                        aria-label={`Edit ${role.name}`}
                        title={`Edit ${role.name}`}
                        className="flex size-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
                      >
                        <Edit2 className="size-3.5" />
                      </button>
                      {!role.is_builtin && (
                        <button
                          type="button"
                          onClick={() => setRoleToDelete(role)}
                          aria-label={`Delete ${role.name}`}
                          title={`Delete ${role.name}`}
                          className="flex size-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-red-500/10 hover:text-red-400"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
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
