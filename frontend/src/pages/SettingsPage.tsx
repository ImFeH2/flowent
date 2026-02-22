import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
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

interface UserSettings {
  event_log: {
    timestamp_format: string;
  };
  model: {
    active_provider_id: string;
    active_model: string;
  };
}

export function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
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
      await saveSettings(settings);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-400">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Settings</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage active provider, model, and interface behavior.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="size-4" />
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-200">Event Log</h2>
          <label className="mb-1 block text-xs text-zinc-400">
            Timestamp Format
          </label>
          <select
            value={settings.event_log.timestamp_format}
            onChange={(e) =>
              setSettings({
                ...settings,
                event_log: {
                  ...settings.event_log,
                  timestamp_format: e.target.value,
                },
              })
            }
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
          >
            <option value="relative">Relative (2m ago)</option>
            <option value="absolute">Absolute (14:30:45)</option>
            <option value="both">Both</option>
          </select>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-200">
            Active Model
          </h2>

          <label className="mb-1 block text-xs text-zinc-400">Provider</label>
          <select
            value={settings.model.active_provider_id}
            onChange={(e) =>
              setSettings({
                ...settings,
                model: {
                  ...settings.model,
                  active_provider_id: e.target.value,
                  active_model: "",
                },
              })
            }
            className="mb-3 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
          >
            <option value="">Select a provider</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({providerTypeLabel(p.type)})
              </option>
            ))}
          </select>

          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-zinc-400">Model</label>
            <button
              onClick={refreshModels}
              disabled={!settings.model.active_provider_id || loadingModels}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={cn("size-3", loadingModels && "animate-spin")}
              />
              Refresh
            </button>
          </div>

          {models.length > 0 ? (
            <select
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
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
            >
              <option value="">Select a model</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          ) : (
            <input
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
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200"
              placeholder={
                loadingModels ? "Loading models..." : "Enter model id manually"
              }
            />
          )}

          <p className="mt-3 text-xs text-zinc-500">
            {activeProvider
              ? `Current provider: ${activeProvider.name}`
              : "Select a provider first."}
          </p>
        </section>
      </div>
    </div>
  );
}
