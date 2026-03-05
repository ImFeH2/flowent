import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save, Settings } from "lucide-react";
import { toast } from "sonner";
import {
  fetchProviderModels,
  fetchProviders,
  fetchSettings,
  saveSettings,
  type ModelOption,
} from "@/lib/api";
import type { Provider } from "@/types";
import { cn } from "@/lib/utils";
import { providerTypeLabel } from "@/lib/providerTypes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface UserSettings {
  model: {
    active_provider_id: string;
    active_model: string;
  };
}

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
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
    Promise.all([fetchSettings<UserSettings>(), fetchProviders()])
      .then(([settingsData, providersData]) => {
        if (!mounted) return;
        setSettings(settingsData);
        setProviders(providersData);
      })
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
    fetch("/api/meta")
      .then((res) => res.json() as Promise<{ version?: string }>)
      .then((data) => {
        setAppVersion(typeof data.version === "string" ? data.version : null);
      })
      .catch(() => {});
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
      await saveSettings({ model: settings.model });
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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Settings className="size-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure your AI model preferences
            </p>
          </div>
        </div>
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.98] hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="size-4" />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold">Model Configuration</h2>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Active Provider</label>
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
                  <SelectTrigger>
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
                {activeProvider && (
                  <p className="text-xs text-muted-foreground">
                    Using {activeProvider.name} ({activeProvider.base_url})
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Model</label>
                  <button
                    onClick={refreshModels}
                    disabled={
                      !settings.model.active_provider_id || loadingModels
                    }
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
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
                    <SelectTrigger>
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
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/50 p-4">
            <h3 className="mb-2 text-sm font-semibold">About</h3>
            <p className="text-sm text-muted-foreground">
              Autopoe Agent Studio v{appVersion ?? "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              A multi-agent collaboration framework.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
