import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  fetchProviderModels,
  fetchSettingsBootstrap,
  saveSettings,
  type ModelOption,
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
import { cloneModelParams } from "@/lib/modelParams";
import { providerTypeLabel } from "@/lib/providerTypes";
import { cn } from "@/lib/utils";
import type { ModelCapabilities, ModelParams, RetryPolicy } from "@/types";

const retryPolicyOptions: Array<{ value: RetryPolicy; label: string }> = [
  { value: "no_retry", label: "No retry" },
  { value: "limited", label: "Limited" },
  { value: "unlimited", label: "Unlimited" },
];

interface UserSettings {
  assistant: {
    role_name: string;
    allow_network: boolean;
    write_dirs: string[];
  };
  leader: {
    role_name: string;
  };
  model: {
    active_provider_id: string;
    active_model: string;
    capabilities: ModelCapabilities | null;
    context_window_tokens: number | null;
    timeout_ms: number;
    retry_policy: RetryPolicy;
    max_retries: number;
    retry_initial_delay_seconds: number;
    retry_max_delay_seconds: number;
    retry_backoff_cap_retries: number;
    auto_compact: boolean;
    auto_compact_threshold: number;
    params: ModelParams;
  };
}

function normalizeWriteDirs(writeDirs: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const rawDir of writeDirs) {
    const trimmed = rawDir.trim();
    if (!trimmed) {
      continue;
    }
    const normalizedDir = trimmed.replace(/\/+$/u, "") || "/";
    if (seen.has(normalizedDir)) {
      continue;
    }
    seen.add(normalizedDir);
    normalized.push(normalizedDir);
  }
  return normalized;
}

export function SettingsPage() {
  const {
    data: bootstrapData,
    isLoading: loading,
    mutate: mutateSettings,
  } = useSWR("settingsBootstrap", () => fetchSettingsBootstrap<UserSettings>());

  const [localSettings, setLocalSettings] = useState<UserSettings | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  const providers = useMemo(
    () => bootstrapData?.providers ?? [],
    [bootstrapData?.providers],
  );
  const roles = useMemo(
    () => bootstrapData?.roles ?? [],
    [bootstrapData?.roles],
  );
  const appVersion = bootstrapData?.version ?? null;

  // Sync local settings when bootstrap data loads
  useEffect(() => {
    if (bootstrapData?.settings && !localSettings) {
      setLocalSettings(bootstrapData.settings);
    }
  }, [bootstrapData?.settings, localSettings]);

  const settings = localSettings ?? bootstrapData?.settings ?? null;

  const activeProvider = useMemo(() => {
    if (!settings) return null;
    return (
      providers.find((p) => p.id === settings.model.active_provider_id) ?? null
    );
  }, [providers, settings]);
  const assistantRole = useMemo(() => {
    if (!settings) return null;
    return (
      roles.find((role) => role.name === settings.assistant.role_name) ?? null
    );
  }, [roles, settings]);

  const selectedModel = useMemo(() => {
    if (!settings?.model.active_model) {
      return null;
    }
    return (
      models.find((model) => model.id === settings.model.active_model) ?? null
    );
  }, [models, settings?.model.active_model]);
  const effectiveModelCapabilities =
    selectedModel?.capabilities ?? settings?.model.capabilities ?? null;
  const effectiveContextWindowTokens =
    selectedModel?.context_window_tokens ??
    settings?.model.context_window_tokens ??
    null;
  const leaderRole = useMemo(() => {
    if (!settings) return null;
    return (
      roles.find((role) => role.name === settings.leader.role_name) ?? null
    );
  }, [roles, settings]);

  useEffect(() => {
    if (!settings?.model.active_provider_id) {
      setModels([]);
      return;
    }

    let mounted = true;
    setLoadingModels(true);
    fetchProviderModels(settings.model.active_provider_id)
      .then((items) => {
        if (!mounted) return;
        setModels(items);
      })
      .catch(() => {
        toast.error("Failed to fetch models");
      })
      .finally(() => {
        if (mounted) setLoadingModels(false);
      });

    return () => {
      mounted = false;
    };
  }, [settings?.model.active_provider_id]);

  const refreshModels = async () => {
    if (!settings?.model.active_provider_id) return;
    setLoadingModels(true);
    try {
      const items = await fetchProviderModels(
        settings.model.active_provider_id,
      );
      setModels(items);
      toast.success("Models refreshed");
    } catch {
      toast.error("Failed to fetch models");
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    if (
      settings.model.retry_max_delay_seconds <
      settings.model.retry_initial_delay_seconds
    ) {
      toast.error("Max Delay must be greater than or equal to Initial Delay");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        assistant: {
          ...settings.assistant,
          write_dirs: normalizeWriteDirs(settings.assistant.write_dirs),
        },
        leader: settings.leader,
        model: settings.model,
      };
      const savedSettings = await saveSettings<UserSettings>(payload);

      setLocalSettings(savedSettings);
      void mutateSettings(
        (current) =>
          current ? { ...current, settings: savedSettings } : current,
        false,
      );

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
          <div className="mx-auto h-2 w-32 animate-pulse rounded-full bg-white/[0.05]" />
          <p className="text-[13px] text-white/40">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <PageScaffold>
      <div className="h-full min-h-0 overflow-y-auto pr-2 scrollbar-none">
        <div className="mx-auto max-w-[680px] pb-10 pt-8">
          <div className="mb-8 flex justify-end">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex h-9 items-center gap-2 rounded-full bg-white px-5 text-[13px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Save className="size-4" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
          <section>
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
                  <SelectTrigger className="w-full rounded-md border-white/8 bg-black/[0.22]">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.name} value={role.name}>
                        <div className="flex min-w-0 flex-col items-start">
                          <span>{role.name}</span>
                          <span className="text-[11px] text-white/50">
                            {role.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {assistantRole ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-white/40">
                    {assistantRole.description}
                  </p>
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
                        ? "border-emerald-400/30 bg-emerald-400/15"
                        : "border-white/[0.08] bg-white/[0.04]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-all",
                        settings.assistant.allow_network
                          ? "translate-x-[40px] bg-emerald-300 text-black"
                          : "translate-x-0 bg-white/90 text-black",
                      )}
                    >
                      {settings.assistant.allow_network ? "ON" : "OFF"}
                    </span>
                  </button>
                  <p className="text-[11px] text-white/40 leading-relaxed">
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
                    className="min-h-[108px] w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                  />
                  <p className="text-[11px] text-white/40 leading-relaxed">
                    One directory per line. Empty lines are ignored. These paths
                    bound both the Assistant&apos;s own writes and the maximum
                    write access it can delegate to execution chains.
                  </p>
                </div>
              </SettingsRow>
            </div>
          </section>

          <section className="mt-8 border-t border-white/6 pt-8">
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
                  <SelectTrigger className="w-full rounded-md border-white/8 bg-black/[0.22]">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.name} value={role.name}>
                        <div className="flex min-w-0 flex-col items-start">
                          <span>{role.name}</span>
                          <span className="text-[11px] text-white/50">
                            {role.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {leaderRole ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-white/40">
                    {leaderRole.description}
                  </p>
                ) : null}
              </SettingsRow>
            </div>
          </section>

          <section className="mt-8 border-t border-white/6 pt-8">
            <SectionHeader
              title="Model Configuration"
              description="Set the default provider, model, and canonical parameters used when a role does not define its own override."
            />
            <div>
              <SettingsRow
                label="Active Provider"
                description="Used when roles do not override"
              >
                <Select
                  value={settings.model.active_provider_id}
                  onValueChange={(value) =>
                    setLocalSettings({
                      ...settings,
                      model: {
                        ...settings.model,
                        active_provider_id: value,
                        active_model: "",
                      },
                    })
                  }
                >
                  <SelectTrigger className="w-full rounded-md border-white/8 bg-black/[0.22]">
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
                <div className="mb-1.5 flex justify-end">
                  <Button
                    onClick={refreshModels}
                    disabled={
                      !settings.model.active_provider_id || loadingModels
                    }
                    variant="ghost"
                    size="xs"
                    className="h-auto px-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                  >
                    <RefreshCw
                      className={cn("size-3", loadingModels && "animate-spin")}
                    />
                    Refresh
                  </Button>
                </div>

                {models.length > 0 ? (
                  <Select
                    value={settings.model.active_model}
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
                    <SelectTrigger className="w-full rounded-md border-white/8 bg-black/[0.22]">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
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
                      loadingModels
                        ? "Loading models..."
                        : "Enter model ID manually"
                    }
                    className="w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 text-sm transition-all duration-200 placeholder:text-muted-foreground focus:border-white/16 focus:outline-none"
                  />
                )}
                {settings.model.active_model ? (
                  <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-white/40">
                    <p>
                      Context window:{" "}
                      {effectiveContextWindowTokens
                        ? effectiveContextWindowTokens.toLocaleString()
                        : "Not resolved"}
                    </p>
                    <p>
                      Capabilities: input_image=
                      {effectiveModelCapabilities?.input_image
                        ? "true"
                        : "false"}
                      , output_image=
                      {effectiveModelCapabilities?.output_image
                        ? "true"
                        : "false"}
                    </p>
                  </div>
                ) : null}
              </SettingsRow>

              <SettingsRow
                label="Default Model Parameters"
                valueClassName="w-full md:w-80"
              >
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-5">
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
                      className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                    />
                    <span className="text-[13px] font-medium text-white/40">
                      ms
                    </span>
                  </div>
                  <p className="text-[11px] text-white/40 leading-relaxed">
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
                    <SelectTrigger className="w-full rounded-md border-white/8 bg-black/[0.22]">
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
                          className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/45"
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
                          className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                        />
                      </div>
                    </div>
                  ) : null}

                  <p className="text-[11px] text-white/40 leading-relaxed">
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
                        className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/45"
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
                          className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                        />
                        <span className="text-[13px] font-medium text-white/40">
                          s
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="retry-max-delay"
                        className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/45"
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
                          className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                        />
                        <span className="text-[13px] font-medium text-white/40">
                          s
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="retry-backoff-cap-retries"
                        className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/45"
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
                        className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-white/40 leading-relaxed">
                    Retries use exponential backoff from Initial Delay, stop
                    doubling after Cap Retries, and never exceed Max Delay.
                  </p>
                </div>
              </SettingsRow>

              <SettingsRow
                label="Automatic Compact"
                description="Preflight execution-context compaction"
              >
                <div className="space-y-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.model.auto_compact}
                    aria-label="Automatic Compact"
                    onClick={() =>
                      setLocalSettings({
                        ...settings,
                        model: {
                          ...settings.model,
                          auto_compact: !settings.model.auto_compact,
                        },
                      })
                    }
                    className={cn(
                      "inline-flex h-8 w-[72px] items-center rounded-full border px-1 transition-colors",
                      settings.model.auto_compact
                        ? "border-emerald-400/30 bg-emerald-400/15"
                        : "border-white/[0.08] bg-white/[0.04]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-all",
                        settings.model.auto_compact
                          ? "translate-x-[40px] bg-emerald-300 text-black"
                          : "translate-x-0 bg-white/90 text-black",
                      )}
                    >
                      {settings.model.auto_compact ? "ON" : "OFF"}
                    </span>
                  </button>

                  <div className="space-y-1">
                    <label
                      htmlFor="auto-compact-threshold"
                      className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/45"
                    >
                      Threshold
                    </label>
                    <input
                      id="auto-compact-threshold"
                      aria-label="Automatic Compact Threshold"
                      type="text"
                      inputMode="decimal"
                      value={String(settings.model.auto_compact_threshold)}
                      onChange={(e) => {
                        const nextValue = e.target.value.trim();
                        if (!/^\d+(\.\d+)?$/.test(nextValue)) {
                          return;
                        }
                        const parsed = Number.parseFloat(nextValue);
                        if (
                          !Number.isFinite(parsed) ||
                          parsed <= 0 ||
                          parsed >= 1
                        ) {
                          return;
                        }
                        setLocalSettings({
                          ...settings,
                          model: {
                            ...settings.model,
                            auto_compact_threshold: parsed,
                          },
                        });
                      }}
                      className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                    />
                  </div>

                  <p className="text-[11px] text-white/40 leading-relaxed">
                    When enabled, the runtime compacts execution context before
                    the estimated input reaches the configured fraction of the
                    safe model window. If the context window is not resolved for
                    the current model, only manual <code>/compact</code> is
                    used.
                  </p>
                </div>
              </SettingsRow>
            </div>
          </section>

          <div className="mt-10 border-t border-white/[0.04] pt-6 flex flex-col items-center text-center">
            <p className="text-[11px] font-medium text-white/40 tracking-wide uppercase">
              Autopoe Agent Studio v{appVersion ?? "—"}
            </p>
            <p className="mt-1.5 text-[10px] text-white/30">
              A multi-agent collaboration framework.
            </p>
          </div>
        </div>
      </div>
    </PageScaffold>
  );
}
