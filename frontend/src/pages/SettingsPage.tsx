import { useEffect, useMemo, useState } from "react";
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
import type { ModelParams, Provider, Role } from "@/types";

interface UserSettings {
  assistant: {
    role_name: string;
  };
  model: {
    active_provider_id: string;
    active_model: string;
    timeout_ms: number;
    params: ModelParams;
  };
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
      description="Configure the default Assistant role, provider, model, canonical model parameters, and request timeout."
      actions={
        <Button onClick={() => void handleSave()} disabled={saving}>
          <Save className="size-4" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
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
              <SettingsRow label="Assistant Role" description="System role">
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
                        setSettings({
                          ...settings,
                          model: {
                            ...settings.model,
                            timeout_ms: parsed,
                          },
                        });
                      }}
                      className="w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 text-sm transition-all duration-200 placeholder:text-muted-foreground focus:border-white/16 focus:outline-none"
                    />
                    <span className="text-xs text-muted-foreground">ms</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Applies to a single LLM request attempt. Default is 10000ms.
                    Automatic retries can still make the full call take longer.
                  </p>
                </div>
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
