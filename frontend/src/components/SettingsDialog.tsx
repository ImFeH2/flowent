import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Zap, Sparkles, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  fetchSettings,
  saveSettings,
  fetchProviders,
  fetchProviderModels,
  type ModelOption,
} from "@/lib/api";
import type { Provider } from "@/types";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type SettingTab = "general" | "model";

interface UserSettings {
  event_log: {
    timestamp_format: string;
  };
  model: {
    active_provider_id: string;
    active_model: string;
  };
}

const tabs = [
  {
    id: "general" as SettingTab,
    label: "General",
    icon: Zap,
    color: "text-blue-400",
  },
  {
    id: "model" as SettingTab,
    label: "Model",
    icon: Sparkles,
    color: "text-violet-400",
  },
];

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingTab>("general");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const mouseUpTargetRef = useRef<EventTarget | null>(null);

  useEffect(() => {
    if (open) {
      fetchProviders()
        .then(setProviders)
        .catch(() => toast.error("Failed to load providers"));
    }
  }, [open]);

  useEffect(() => {
    if (open && !settings) {
      fetchSettings<UserSettings>()
        .then((data) => setSettings(data))
        .catch(() => toast.error("Failed to load settings"));
    }
  }, [open, settings]);

  useEffect(() => {
    if (settings?.model.active_provider_id) {
      handleFetchModels(settings.model.active_provider_id);
    }
  }, [settings?.model.active_provider_id]);

  const handleFetchModels = async (providerId: string) => {
    if (!providerId) return;
    setLoadingModels(true);
    try {
      const fetchedModels = await fetchProviderModels(providerId);
      setModels(fetchedModels);
    } catch {
      toast.error("Failed to fetch models");
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setLoading(true);
    try {
      await saveSettings({
        event_log: settings.event_log,
        model: settings.model,
      });
      toast.success("Settings saved");
      onClose();
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    mouseDownTargetRef.current = e.target;
  };

  const handleBackdropMouseUp = (e: React.MouseEvent) => {
    mouseUpTargetRef.current = e.target;
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (
      mouseDownTargetRef.current === e.currentTarget &&
      mouseUpTargetRef.current === e.currentTarget &&
      e.target === e.currentTarget
    ) {
      onClose();
    }
    mouseDownTargetRef.current = null;
    mouseUpTargetRef.current = null;
  };

  if (!open || !settings) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onMouseDown={handleBackdropMouseDown}
        onMouseUp={handleBackdropMouseUp}
        onClick={handleBackdropClick}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: "spring", duration: 0.3 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900/95 shadow-2xl backdrop-blur flex overflow-hidden"
        >
          <div className="w-48 border-r border-zinc-800 bg-zinc-950/50 p-4 flex flex-col">
            <div className="mb-6">
              <h2 className="text-base font-semibold text-zinc-100 px-3">
                Settings
              </h2>
            </div>
            <nav className="flex-1 space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 relative",
                      isActive
                        ? "bg-zinc-800 text-zinc-100"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50",
                    )}
                  >
                    <Icon className={cn("size-4", isActive && tab.color)} />
                    <span className="text-sm font-medium">{tab.label}</span>
                    {isActive && (
                      <ChevronRight className="size-4 ml-auto text-zinc-500" />
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="pt-4 border-t border-zinc-800">
              <button
                onClick={onClose}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors text-sm"
              >
                <X className="size-4" />
                <span>Close</span>
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === "general" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Event Log
                  </h3>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">
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
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none"
                    >
                      <option value="relative">Relative (2m ago)</option>
                      <option value="absolute">Absolute (14:30:45)</option>
                      <option value="both">Both</option>
                    </select>
                  </div>
                </div>
              )}
              {activeTab === "model" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Model Configuration
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Configure providers in the Providers page from the sidebar.
                  </p>
                  <div>
                    <label className="text-xs text-zinc-400 mb-1 block">
                      Active Provider
                    </label>
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
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                    >
                      <option value="">Select a provider</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.type})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label className="text-xs text-zinc-400">
                        Active Model
                      </label>
                      {settings.model.active_provider_id && (
                        <button
                          onClick={() =>
                            handleFetchModels(settings.model.active_provider_id)
                          }
                          disabled={loadingModels}
                          className="text-zinc-500 hover:text-zinc-300 transition-colors"
                          title="Refresh models"
                        >
                          <RefreshCw
                            className={cn(
                              "size-3",
                              loadingModels && "animate-spin",
                            )}
                          />
                        </button>
                      )}
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
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
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
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 font-mono focus:outline-none focus:border-zinc-500"
                        placeholder={
                          loadingModels ? "Loading models..." : "model-id"
                        }
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-zinc-800 px-6 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={loading}
              >
                {loading ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
