import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  fetchProviderModels,
  fetchSettingsBootstrap,
  saveSettings,
  type ModelOption,
} from "@/lib/api";
import { ModelParamsFields } from "@/components/ModelParamsFields";
import { PageScaffold } from "@/components/layout/PageScaffold";
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
import type { ModelParams, Provider, Role } from "@/types";

interface UserSettings {
  assistant: {
    role_name: string;
  };
  model: {
    active_provider_id: string;
    active_model: string;
    params: ModelParams;
  };
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-6">
      <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
        {eyebrow}
      </p>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SettingsRow({
  children,
  description,
  label,
  valueClassName,
}: {
  children: ReactNode;
  description: string;
  label: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-8 border-b border-white/[0.04] py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <label className="text-sm font-medium">{label}</label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className={cn("w-64 shrink-0", valueClassName)}>{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  const activeProvider = useMemo(() => {
    if (!settings) return null;
    return (
      providers.find((p) => p.id === settings.model.active_provider_id) ?? null
    );
  }, [providers, settings]);

  useEffect(() => {
    let mounted = true;
    fetchSettingsBootstrap<UserSettings>()
      .then(
        ({
          settings: settingsData,
          providers: providersData,
          roles: rolesData,
          version,
        }) => {
          if (!mounted) return;
          setSettings(settingsData);
          setProviders(providersData);
          setRoles(rolesData);
          setAppVersion(version);
        },
      )
      .catch(() => {
        toast.error("Failed to load settings");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

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
    setSaving(true);
    try {
      await saveSettings({
        assistant: settings.assistant,
        model: settings.model,
      });
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
          <div className="mx-auto h-2 w-32 rounded-full skeleton-shimmer" />
          <p className="text-sm text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <PageScaffold
      title="Settings"
      description="Configure Assistant and AI model preferences"
      actions={
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98] hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="size-4" />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      }
    >
      <div className="h-full min-h-0 overflow-y-auto pr-2">
        <div className="mx-auto max-w-3xl pb-6">
          <section>
            <SectionHeader
              eyebrow="Assistant"
              title="Assistant Configuration"
              description="Choose the role that powers the system assistant."
            />
            <div>
              <SettingsRow
                label="Assistant Role"
                description="The Assistant uses this role's prompt and model configuration. The default system role is Steward."
              >
                <Select
                  value={settings.assistant.role_name}
                  onValueChange={(value) =>
                    setSettings({
                      ...settings,
                      assistant: {
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
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsRow>
            </div>
          </section>

          <section className="mt-8 border-t border-white/6 pt-8">
            <SectionHeader
              eyebrow="Model"
              title="Model Configuration"
              description="Set the default provider and model used when a role does not define its own override."
            />
            <div>
              <SettingsRow
                label="Active Provider"
                description="Choose the provider used for roles that do not define their own model override."
              >
                <Select
                  value={settings.model.active_provider_id}
                  onValueChange={(value) =>
                    setSettings({
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

              <SettingsRow
                label="Model"
                description="Select a catalog model when available, or enter a model ID manually."
              >
                <div className="mb-1.5 flex justify-end">
                  <button
                    onClick={refreshModels}
                    disabled={
                      !settings.model.active_provider_id || loadingModels
                    }
                    className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    <RefreshCw
                      className={cn("size-3", loadingModels && "animate-spin")}
                    />
                    Refresh
                  </button>
                </div>

                {models.length > 0 ? (
                  <Select
                    value={settings.model.active_model}
                    onValueChange={(value) =>
                      setSettings({
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
                      setSettings({
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
              </SettingsRow>

              <SettingsRow
                label="Default Model Parameters"
                description="These canonical parameters are merged into each request first. Roles can override selected fields. Unsupported parameters are ignored by the active provider."
                valueClassName="w-72"
              >
                <ModelParamsFields
                  className="w-full"
                  value={cloneModelParams(settings.model.params)}
                  onChange={(params) =>
                    setSettings({
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
              </SettingsRow>
            </div>
          </section>

          <div className="mt-8 border-t border-white/6 pt-4 text-sm text-muted-foreground">
            <p>Autopoe Agent Studio v{appVersion ?? "—"}</p>
            <p className="mt-1 text-xs">
              A multi-agent collaboration framework.
            </p>
          </div>
        </div>
      </div>
    </PageScaffold>
  );
}
