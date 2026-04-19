import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Eye, EyeOff, Save } from "lucide-react";
import { toast } from "sonner";
import { fetchSettingsBootstrap, saveSettings } from "@/lib/api";
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
import { cloneModelParams } from "@/lib/modelParams";
import { providerTypeLabel } from "@/lib/providerTypes";
import { cn } from "@/lib/utils";
import {
  buildSettingsSavePayload,
  findProviderById,
  findRoleByName,
  getActiveProviderModels,
  getEffectiveContextWindowTokens,
  getEffectiveModelCapabilities,
  getKnownSafeInputTokens,
  getSelectedCatalogModel,
  nullableBoolFromTriState,
  triStateFromNullableBool,
  type TriStateCapability,
  type UserSettings,
  validateAutoCompactTokenLimit,
} from "@/pages/settings/lib";
import { useAccess } from "@/context/useAccess";
import type { RetryPolicy } from "@/types";

const retryPolicyOptions: Array<{ value: RetryPolicy; label: string }> = [
  { value: "no_retry", label: "No retry" },
  { value: "limited", label: "Limited" },
  { value: "unlimited", label: "Unlimited" },
];

const settingsInputClass =
  "w-full rounded-lg border border-input bg-background/50 px-3.5 py-2.5 text-[13px] text-foreground shadow-xs transition-[border-color,background-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:bg-background/65 focus:outline-none focus:ring-[3px] focus:ring-ring/50";
const settingsMonoInputClass = `${settingsInputClass} font-mono`;
const settingsIconButtonClass =
  "flex size-10 items-center justify-center rounded-lg border border-border bg-accent/20 text-muted-foreground transition-colors hover:bg-accent/45 hover:text-foreground";
const settingsFieldLabelClass =
  "text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground";
const settingsHelpTextClass =
  "text-[11px] leading-relaxed text-muted-foreground";
const settingsSelectTriggerClass = "w-full rounded-md bg-background/50";

export function SettingsPage() {
  const { requireReauth } = useAccess();
  const {
    data: bootstrapData,
    isLoading: loading,
    mutate: mutateSettings,
  } = useSWR("settingsBootstrap", () => fetchSettingsBootstrap<UserSettings>());

  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);
  const [providerModelQuery, setProviderModelQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [accessDraft, setAccessDraft] = useState({
    newCode: "",
    confirmCode: "",
  });
  const [showNewAccessCode, setShowNewAccessCode] = useState(false);
  const [showConfirmAccessCode, setShowConfirmAccessCode] = useState(false);

  const providers = useMemo(
    () => bootstrapData?.providers ?? [],
    [bootstrapData?.providers],
  );
  const roles = useMemo(
    () => bootstrapData?.roles ?? [],
    [bootstrapData?.roles],
  );
  const appVersion = bootstrapData?.version ?? null;

  useEffect(() => {
    if (bootstrapData?.settings && !localSettings) {
      setLocalSettings(bootstrapData.settings);
    }
  }, [bootstrapData?.settings, localSettings]);

  const settings = localSettings ?? bootstrapData?.settings ?? null;

  const activeProvider = useMemo(() => {
    if (!settings) return null;
    return findProviderById(providers, settings.model.active_provider_id);
  }, [providers, settings]);
  const assistantRole = useMemo(() => {
    if (!settings) return null;
    return findRoleByName(roles, settings.assistant.role_name);
  }, [roles, settings]);

  const activeProviderModels = useMemo(
    () => getActiveProviderModels(activeProvider),
    [activeProvider],
  );
  const filteredActiveProviderModels = useMemo(() => {
    const normalizedQuery = providerModelQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return activeProviderModels;
    }
    return activeProviderModels.filter((model) =>
      model.model.toLowerCase().includes(normalizedQuery),
    );
  }, [activeProviderModels, providerModelQuery]);
  const selectedCatalogModel = useMemo(() => {
    if (!settings) {
      return null;
    }
    return getSelectedCatalogModel(
      activeProviderModels,
      settings.model.active_model,
    );
  }, [activeProviderModels, settings]);
  const effectiveContextWindowTokens = useMemo(() => {
    if (!settings) {
      return null;
    }
    return getEffectiveContextWindowTokens(settings, selectedCatalogModel);
  }, [selectedCatalogModel, settings]);
  const effectiveModelCapabilities = useMemo(
    () =>
      settings
        ? getEffectiveModelCapabilities(settings, selectedCatalogModel)
        : { input_image: false, output_image: false },
    [selectedCatalogModel, settings],
  );
  const knownSafeInputTokens = useMemo(() => {
    if (!settings) {
      return null;
    }
    return getKnownSafeInputTokens(
      effectiveContextWindowTokens,
      settings.model.params,
    );
  }, [effectiveContextWindowTokens, settings]);
  const leaderRole = useMemo(() => {
    if (!settings) return null;
    return findRoleByName(roles, settings.leader.role_name);
  }, [roles, settings]);
  const accessDraftError = useMemo(() => {
    if (!accessDraft.newCode && !accessDraft.confirmCode) {
      return null;
    }
    if (!accessDraft.newCode.trim()) {
      return "New Access Code must not be empty.";
    }
    if (accessDraft.confirmCode !== accessDraft.newCode) {
      return "Confirm Access Code must exactly match New Access Code.";
    }
    return null;
  }, [accessDraft.confirmCode, accessDraft.newCode]);

  const handleSave = async () => {
    if (!settings) return;
    if (accessDraftError) {
      toast.error(accessDraftError);
      return;
    }
    if (
      settings.model.retry_max_delay_seconds <
      settings.model.retry_initial_delay_seconds
    ) {
      toast.error("Max Delay must be greater than or equal to Initial Delay");
      return;
    }
    const autoCompactTokenLimitError = validateAutoCompactTokenLimit(
      settings.model.auto_compact_token_limit,
      knownSafeInputTokens,
    );
    if (autoCompactTokenLimitError) {
      toast.error(autoCompactTokenLimitError);
      return;
    }
    setSaving(true);
    try {
      const payload = buildSettingsSavePayload(settings, accessDraft);
      const saveResult = await saveSettings<UserSettings>(payload);
      const savedSettings = saveResult.settings;

      setLocalSettings(savedSettings);
      setAccessDraft({ newCode: "", confirmCode: "" });
      setShowNewAccessCode(false);
      setShowConfirmAccessCode(false);
      void mutateSettings(
        (current) =>
          current ? { ...current, settings: savedSettings } : current,
        false,
      );

      if (saveResult.reauthRequired) {
        toast.success("Access code updated. Sign in again with the new code.");
        requireReauth();
        return;
      }

      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-2 w-32 animate-pulse rounded-full bg-accent/30" />
          <p className="text-[13px] text-muted-foreground">
            Loading settings...
          </p>
        </div>
      </div>
    );
  }

  return (
    <PageScaffold>
      <div className="h-full min-h-0 overflow-y-auto pr-2 scrollbar-none">
        <div className="mx-auto max-w-[680px] pb-10 pt-8">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[28px] font-medium tracking-[-0.04em] text-foreground">
                Settings
              </h1>
              <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted-foreground">
                Update access, assistant defaults, leader defaults, and
                system-wide model behavior.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || Boolean(accessDraftError)}
              className="flex h-9 items-center gap-2 rounded-full bg-primary px-5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Save className="size-4" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
          <section>
            <SectionHeader
              title="Access Configuration"
              description="Manage the shared admin access code used to unlock the control plane."
            />
            <div>
              <SettingsRow
                label="Shared Admin Access"
                description="Autopoe uses one shared admin access code instead of multiple user accounts."
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="new-access-code"
                      className={settingsFieldLabelClass}
                    >
                      New Access Code
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="new-access-code"
                        type={showNewAccessCode ? "text" : "password"}
                        value={accessDraft.newCode}
                        onChange={(event) =>
                          setAccessDraft((current) => ({
                            ...current,
                            newCode: event.target.value,
                          }))
                        }
                        placeholder="Leave empty to keep the current access code"
                        className={settingsInputClass}
                      />
                      <button
                        type="button"
                        aria-label={
                          showNewAccessCode
                            ? "Hide new access code"
                            : "Show new access code"
                        }
                        onClick={() =>
                          setShowNewAccessCode((current) => !current)
                        }
                        className={settingsIconButtonClass}
                      >
                        {showNewAccessCode ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="confirm-access-code"
                      className={settingsFieldLabelClass}
                    >
                      Confirm Access Code
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="confirm-access-code"
                        type={showConfirmAccessCode ? "text" : "password"}
                        value={accessDraft.confirmCode}
                        onChange={(event) =>
                          setAccessDraft((current) => ({
                            ...current,
                            confirmCode: event.target.value,
                          }))
                        }
                        placeholder="Repeat the new access code"
                        className={settingsInputClass}
                      />
                      <button
                        type="button"
                        aria-label={
                          showConfirmAccessCode
                            ? "Hide confirmed access code"
                            : "Show confirmed access code"
                        }
                        onClick={() =>
                          setShowConfirmAccessCode((current) => !current)
                        }
                        className={settingsIconButtonClass}
                      >
                        {showConfirmAccessCode ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className={cn("space-y-2", settingsHelpTextClass)}>
                    <p>
                      Saving a new access code invalidates all current admin
                      sessions. You will need to unlock the console again with
                      the new code.
                    </p>
                    <p>
                      The first access code is not created here. When Autopoe
                      starts without one, it automatically generates a code and
                      writes it to the local startup log.
                    </p>
                    {accessDraftError ? (
                      <p className="text-destructive">{accessDraftError}</p>
                    ) : null}
                  </div>
                </div>
              </SettingsRow>
            </div>
          </section>

          <section className="mt-8 border-t border-border pt-8">
            <SectionHeader
              title="Assistant Configuration"
              description="Choose the role that powers the system assistant."
            />
            <div>
              <SettingsRow label="Assistant Role" description="System role">
                <Select
                  value={settings.assistant.role_name}
                  onValueChange={(value) =>
                    setLocalSettings({
                      ...settings,
                      assistant: {
                        ...settings.assistant,
                        role_name: value,
                      },
                    })
                  }
                >
                  <SelectTrigger className={settingsSelectTriggerClass}>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.name} value={role.name}>
                        <div className="flex min-w-0 flex-col items-start">
                          <span>{role.name}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {role.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assistantRole ? (
                  <div
                    data-testid="assistant-role-guidance"
                    className={cn("mt-2 space-y-2", settingsHelpTextClass)}
                  >
                    <p>{assistantRole.description}</p>
                    <p>
                      This role only changes the Assistant&apos;s behavior
                      template. Regardless of the selected role, Assistant
                      remains the system default entry and task boundary
                      manager.
                    </p>
                  </div>
                ) : null}
              </SettingsRow>

              <SettingsRow
                label="Network Access"
                description="Hard network permission boundary"
              >
                <div className="space-y-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.assistant.allow_network}
                    aria-label="Network Access"
                    onClick={() =>
                      setLocalSettings({
                        ...settings,
                        assistant: {
                          ...settings.assistant,
                          allow_network: !settings.assistant.allow_network,
                        },
                      })
                    }
                    className={cn(
                      "inline-flex h-8 w-[72px] items-center rounded-full border px-1 transition-colors",
                      settings.assistant.allow_network
                        ? "border-graph-status-running/30 bg-graph-status-running/15"
                        : "border-border bg-accent/30",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-all",
                        settings.assistant.allow_network
                          ? "translate-x-[40px] bg-graph-status-running text-background"
                          : "translate-x-0 bg-foreground text-background",
                      )}
                    >
                      {settings.assistant.allow_network ? "ON" : "OFF"}
                    </span>
                  </button>
                  <p className={settingsHelpTextClass}>
                    When disabled, the Assistant cannot make networked tool
                    calls even if its role still includes network-capable tools.
                  </p>
                </div>
              </SettingsRow>

              <SettingsRow
                label="Write Dirs"
                description="Writable directory boundaries"
              >
                <div className="space-y-2">
                  <textarea
                    aria-label="Write Dirs"
                    value={settings.assistant.write_dirs.join("\n")}
                    onChange={(e) =>
                      setLocalSettings({
                        ...settings,
                        assistant: {
                          ...settings.assistant,
                          write_dirs: e.target.value.split("\n"),
                        },
                      })
                    }
                    rows={4}
                    spellCheck={false}
                    placeholder="/workspace/output"
                    className={`min-h-[108px] ${settingsMonoInputClass}`}
                  />
                  <p className={settingsHelpTextClass}>
                    One directory per line. Empty lines are ignored. These paths
                    bound both the Assistant&apos;s own writes and the maximum
                    write access it can delegate to execution chains.
                  </p>
                </div>
              </SettingsRow>
            </div>
          </section>

          <section className="mt-8 border-t border-border pt-8">
            <SectionHeader
              title="Leader Configuration"
              description="Choose the default role used by each task tab's bound leader."
            />
            <div>
              <SettingsRow
                label="Leader Role"
                description="Default tab owner role"
              >
                <Select
                  value={settings.leader.role_name}
                  onValueChange={(value) =>
                    setLocalSettings({
                      ...settings,
                      leader: {
                        role_name: value,
                      },
                    })
                  }
                >
                  <SelectTrigger className={settingsSelectTriggerClass}>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.name} value={role.name}>
                        <div className="flex min-w-0 flex-col items-start">
                          <span>{role.name}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {role.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {leaderRole ? (
                  <p className={cn("mt-2", settingsHelpTextClass)}>
                    {leaderRole.description}
                  </p>
                ) : null}
              </SettingsRow>
            </div>
          </section>

          <section className="mt-8 border-t border-border pt-8">
            <SectionHeader
              title="Model Configuration"
              description="Set the active provider and model, explicit active-model metadata overrides, canonical parameters, and token-limit based automatic compact."
            />
            <div>
              <SettingsRow
                label="Active Provider"
                description="Used when roles do not override"
              >
                <Select
                  value={settings.model.active_provider_id}
                  onValueChange={(value) => {
                    setLocalSettings({
                      ...settings,
                      model: {
                        ...settings.model,
                        active_provider_id: value,
                        active_model: "",
                      },
                    });
                    setProviderModelQuery("");
                  }}
                >
                  <SelectTrigger className={settingsSelectTriggerClass}>
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({providerTypeLabel(p.type)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {activeProvider ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Using {activeProvider.name} ({activeProvider.base_url})
                  </p>
                ) : null}
              </SettingsRow>

              <SettingsRow label="Model" description="Catalog or manual ID">
                <div className="space-y-3">
                  {settings.model.active_provider_id ? (
                    activeProviderModels.length > 0 ? (
                      <div className="space-y-2">
                        <label className={settingsFieldLabelClass}>
                          Provider Models
                        </label>
                        <input
                          aria-label="Search Provider Models"
                          type="text"
                          value={providerModelQuery}
                          onChange={(event) =>
                            setProviderModelQuery(event.target.value)
                          }
                          placeholder="Search provider models"
                          className={settingsInputClass}
                        />
                        <Select
                          value={
                            activeProviderModels.some(
                              (model) =>
                                model.model === settings.model.active_model,
                            )
                              ? settings.model.active_model
                              : undefined
                          }
                          onValueChange={(value) =>
                            setLocalSettings({
                              ...settings,
                              model: {
                                ...settings.model,
                                active_model: value,
                              },
                            })
                          }
                        >
                          <SelectTrigger className={settingsSelectTriggerClass}>
                            <SelectValue placeholder="Select a provider model" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredActiveProviderModels.map((model) => (
                              <SelectItem key={model.model} value={model.model}>
                                {model.model}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {filteredActiveProviderModels.length === 0 ? (
                          <p className={settingsHelpTextClass}>
                            No provider models match the current search.
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className={settingsHelpTextClass}>
                        No saved provider models. Manage this catalog in
                        Providers, or enter a model ID manually below.
                      </p>
                    )
                  ) : null}

                  <input
                    type="text"
                    value={settings.model.active_model}
                    onChange={(e) =>
                      setLocalSettings({
                        ...settings,
                        model: {
                          ...settings.model,
                          active_model: e.target.value,
                        },
                      })
                    }
                    placeholder={
                      settings.model.active_provider_id
                        ? "Enter model ID manually"
                        : "Select a provider first"
                    }
                    className="w-full rounded-md border border-input bg-background/50 px-3 py-2 text-sm text-foreground shadow-xs transition-[border-color,background-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/50"
                  />
                </div>
                {settings.model.active_model ? (
                  <div className={cn("mt-2 space-y-1", settingsHelpTextClass)}>
                    <p>
                      Context window:{" "}
                      {effectiveContextWindowTokens
                        ? effectiveContextWindowTokens.toLocaleString()
                        : "Not resolved"}
                    </p>
                    <p>
                      Capabilities: input_image=
                      {effectiveModelCapabilities.input_image
                        ? "true"
                        : "false"}
                      , output_image=
                      {effectiveModelCapabilities.output_image
                        ? "true"
                        : "false"}
                    </p>
                  </div>
                ) : null}
              </SettingsRow>

              <SettingsRow
                label="Model Metadata Overrides"
                description="Explicit active-model capability and limit overrides"
              >
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="model-context-window"
                        className={settingsFieldLabelClass}
                      >
                        Context Window
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="model-context-window"
                          aria-label="Context Window"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={
                            settings.model.context_window_tokens === null
                              ? ""
                              : String(settings.model.context_window_tokens)
                          }
                          onChange={(e) => {
                            const nextValue = e.target.value.trim();
                            if (!/^\d*$/.test(nextValue)) {
                              return;
                            }
                            if (
                              nextValue &&
                              Number.parseInt(nextValue, 10) <= 0
                            ) {
                              return;
                            }
                            setLocalSettings({
                              ...settings,
                              model: {
                                ...settings.model,
                                context_window_tokens: nextValue
                                  ? Number.parseInt(nextValue, 10)
                                  : null,
                              },
                            });
                          }}
                          placeholder="Auto"
                          className={settingsMonoInputClass}
                        />
                        <span className="text-[13px] font-medium text-muted-foreground">
                          tokens
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className={settingsFieldLabelClass}>
                        Input Image
                      </label>
                      <Select
                        value={triStateFromNullableBool(
                          settings.model.input_image,
                        )}
                        onValueChange={(value: TriStateCapability) =>
                          setLocalSettings({
                            ...settings,
                            model: {
                              ...settings.model,
                              input_image: nullableBoolFromTriState(value),
                            },
                          })
                        }
                      >
                        <SelectTrigger
                          aria-label="Input Image"
                          className={settingsSelectTriggerClass}
                        >
                          <SelectValue placeholder="Auto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="enabled">Enabled</SelectItem>
                          <SelectItem value="disabled">Disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <label className={settingsFieldLabelClass}>
                        Output Image
                      </label>
                      <Select
                        value={triStateFromNullableBool(
                          settings.model.output_image,
                        )}
                        onValueChange={(value: TriStateCapability) =>
                          setLocalSettings({
                            ...settings,
                            model: {
                              ...settings.model,
                              output_image: nullableBoolFromTriState(value),
                            },
                          })
                        }
                      >
                        <SelectTrigger
                          aria-label="Output Image"
                          className={settingsSelectTriggerClass}
                        >
                          <SelectValue placeholder="Auto" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="enabled">Enabled</SelectItem>
                          <SelectItem value="disabled">Disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <p className={settingsHelpTextClass}>
                    These fields override the resolved metadata for the current
                    active model only. Auto keeps using the catalog result or
                    other resolved metadata instead of forcing a value.
                  </p>
                </div>
              </SettingsRow>

              <SettingsRow
                label="Default Model Parameters"
                valueClassName="w-full md:w-80"
              >
                <div className="rounded-xl border border-border bg-card/30 p-5">
                  <ModelParamsFields
                    className="w-full"
                    value={cloneModelParams(settings.model.params)}
                    onChange={(params) =>
                      setLocalSettings({
                        ...settings,
                        model: {
                          ...settings.model,
                          params,
                        },
                      })
                    }
                    emptyLabel="Not set"
                    numberPlaceholder="Not set"
                    reasoningDisableLabel={null}
                    helperText="Empty fields are omitted from outgoing provider requests. Reasoning effort and verbosity are mainly effective on reasoning-capable providers such as OpenAI Responses with GPT-5 family models."
                  />
                </div>
              </SettingsRow>

              <SettingsRow
                label="Request Timeout"
                description="Single attempt budget"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Request Timeout"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={String(settings.model.timeout_ms)}
                      onChange={(e) => {
                        const nextValue = e.target.value.trim();
                        if (!/^\d+$/.test(nextValue)) {
                          return;
                        }
                        const parsed = Number.parseInt(nextValue, 10);
                        if (!Number.isSafeInteger(parsed) || parsed <= 0) {
                          return;
                        }
                        setLocalSettings({
                          ...settings,
                          model: {
                            ...settings.model,
                            timeout_ms: parsed,
                          },
                        });
                      }}
                      className={settingsMonoInputClass}
                    />
                    <span className="text-[13px] font-medium text-muted-foreground">
                      ms
                    </span>
                  </div>
                  <p className={settingsHelpTextClass}>
                    Applies to a single LLM request attempt. Default is 10000ms.
                    Automatic retries can still make the full call take longer.
                  </p>
                </div>
              </SettingsRow>

              <SettingsRow
                label="Retry Policy"
                description="Transient error behavior"
              >
                <div className="space-y-3">
                  <Select
                    value={settings.model.retry_policy}
                    onValueChange={(value: RetryPolicy) =>
                      setLocalSettings({
                        ...settings,
                        model: {
                          ...settings.model,
                          retry_policy: value,
                        },
                      })
                    }
                  >
                    <SelectTrigger className={settingsSelectTriggerClass}>
                      <SelectValue placeholder="Select a retry policy" />
                    </SelectTrigger>
                    <SelectContent>
                      {retryPolicyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {settings.model.retry_policy === "limited" ? (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label
                          htmlFor="retry-attempts"
                          className={settingsFieldLabelClass}
                        >
                          Retry Attempts
                        </label>
                        <input
                          id="retry-attempts"
                          aria-label="Retry Attempts"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={String(settings.model.max_retries)}
                          onChange={(e) => {
                            const nextValue = e.target.value.trim();
                            if (!/^\d+$/.test(nextValue)) {
                              return;
                            }
                            const parsed = Number.parseInt(nextValue, 10);
                            if (!Number.isSafeInteger(parsed) || parsed <= 0) {
                              return;
                            }
                            setLocalSettings({
                              ...settings,
                              model: {
                                ...settings.model,
                                max_retries: parsed,
                              },
                            });
                          }}
                          className={settingsMonoInputClass}
                        />
                      </div>
                    </div>
                  ) : null}

                  <p className={settingsHelpTextClass}>
                    No retry fails immediately on transient errors. Limited
                    retries automatically up to the configured attempt count.
                    Unlimited keeps retrying transient failures until success,
                    interruption, or a non-transient error.
                  </p>
                </div>
              </SettingsRow>

              <SettingsRow
                label="Retry Backoff"
                description="Global exponential backoff"
              >
                <div className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <label
                        htmlFor="retry-initial-delay"
                        className={settingsFieldLabelClass}
                      >
                        Initial Delay
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="retry-initial-delay"
                          aria-label="Initial Delay"
                          type="text"
                          inputMode="decimal"
                          value={String(
                            settings.model.retry_initial_delay_seconds,
                          )}
                          onChange={(e) => {
                            const nextValue = e.target.value.trim();
                            if (!/^\d+(\.\d+)?$/.test(nextValue)) {
                              return;
                            }
                            const parsed = Number.parseFloat(nextValue);
                            if (!Number.isFinite(parsed) || parsed <= 0) {
                              return;
                            }
                            setLocalSettings({
                              ...settings,
                              model: {
                                ...settings.model,
                                retry_initial_delay_seconds: parsed,
                              },
                            });
                          }}
                          className={settingsMonoInputClass}
                        />
                        <span className="text-[13px] font-medium text-muted-foreground">
                          s
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="retry-max-delay"
                        className={settingsFieldLabelClass}
                      >
                        Max Delay
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="retry-max-delay"
                          aria-label="Max Delay"
                          type="text"
                          inputMode="decimal"
                          value={String(settings.model.retry_max_delay_seconds)}
                          onChange={(e) => {
                            const nextValue = e.target.value.trim();
                            if (!/^\d+(\.\d+)?$/.test(nextValue)) {
                              return;
                            }
                            const parsed = Number.parseFloat(nextValue);
                            if (!Number.isFinite(parsed) || parsed <= 0) {
                              return;
                            }
                            setLocalSettings({
                              ...settings,
                              model: {
                                ...settings.model,
                                retry_max_delay_seconds: parsed,
                              },
                            });
                          }}
                          className={settingsMonoInputClass}
                        />
                        <span className="text-[13px] font-medium text-muted-foreground">
                          s
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="retry-backoff-cap-retries"
                        className={settingsFieldLabelClass}
                      >
                        Cap Retries
                      </label>
                      <input
                        id="retry-backoff-cap-retries"
                        aria-label="Cap Retries"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={String(settings.model.retry_backoff_cap_retries)}
                        onChange={(e) => {
                          const nextValue = e.target.value.trim();
                          if (!/^\d+$/.test(nextValue)) {
                            return;
                          }
                          const parsed = Number.parseInt(nextValue, 10);
                          if (!Number.isSafeInteger(parsed) || parsed <= 0) {
                            return;
                          }
                          setLocalSettings({
                            ...settings,
                            model: {
                              ...settings.model,
                              retry_backoff_cap_retries: parsed,
                            },
                          });
                        }}
                        className={settingsMonoInputClass}
                      />
                    </div>
                  </div>

                  <p className={settingsHelpTextClass}>
                    Retries use exponential backoff from Initial Delay, stop
                    doubling after Cap Retries, and never exceed Max Delay.
                  </p>
                </div>
              </SettingsRow>

              <SettingsRow
                label="Automatic Compact"
                description="Token-limit based preflight execution-context compaction"
              >
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="auto-compact-token-limit"
                      className={settingsFieldLabelClass}
                    >
                      Token Limit
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="auto-compact-token-limit"
                        aria-label="Automatic Compact Token Limit"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={
                          settings.model.auto_compact_token_limit === null
                            ? ""
                            : String(settings.model.auto_compact_token_limit)
                        }
                        onChange={(e) => {
                          const nextValue = e.target.value.trim();
                          if (!/^\d*$/.test(nextValue)) {
                            return;
                          }
                          if (
                            nextValue &&
                            Number.parseInt(nextValue, 10) <= 0
                          ) {
                            return;
                          }
                          setLocalSettings({
                            ...settings,
                            model: {
                              ...settings.model,
                              auto_compact_token_limit: nextValue
                                ? Number.parseInt(nextValue, 10)
                                : null,
                            },
                          });
                        }}
                        placeholder="Disabled"
                        className={settingsMonoInputClass}
                      />
                      <span className="text-[13px] font-medium text-muted-foreground">
                        tokens
                      </span>
                    </div>
                  </div>

                  <p className={settingsHelpTextClass}>
                    Automatic compact is triggered by the latest successful API
                    usage baseline plus any locally added tail context after
                    that response. Leave this empty to disable automatic{" "}
                    <code>/compact</code>.
                  </p>
                  {knownSafeInputTokens !== null ? (
                    <p className={settingsHelpTextClass}>
                      Known safe input window:{" "}
                      {knownSafeInputTokens.toLocaleString()} tokens.
                      {settings.model.auto_compact_token_limit !== null &&
                      settings.model.auto_compact_token_limit >=
                        knownSafeInputTokens
                        ? " Save is blocked until the token limit is lower than this window."
                        : null}
                    </p>
                  ) : settings.model.auto_compact_token_limit !== null ? (
                    <p className="text-[11px] leading-relaxed text-graph-status-idle">
                      The current model window is not resolved, so this token
                      limit can be saved but cannot be fully validated yet.
                    </p>
                  ) : null}
                </div>
              </SettingsRow>
            </div>
          </section>

          <div className="mt-10 flex flex-col items-center border-t border-border pt-6 text-center">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Autopoe Agent Studio v{appVersion ?? "—"}
            </p>
            <p className="mt-1.5 text-[10px] text-muted-foreground/80">
              A multi-agent collaboration framework.
            </p>
          </div>
        </div>
      </div>
    </PageScaffold>
  );
}
