import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Sparkles, Zap, ChevronRight, Eye, EyeOff, Plus, Trash2, Loader2, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type SettingTab = "general" | "provider" | "model";

interface TabConfig {
  id: SettingTab;
  label: string;
  icon: React.ElementType;
  color: string;
}

const tabs: TabConfig[] = [
  { id: "general", label: "General", icon: Zap, color: "text-blue-400" },
  { id: "provider", label: "Provider", icon: Server, color: "text-amber-400" },
  { id: "model", label: "Model", icon: Sparkles, color: "text-violet-400" },
];

interface ProviderConfig {
  name: string;
  provider_type: string;
  api_base_url: string;
  api_key: string;
}

interface UserSettings {
  event_log: {
    timestamp_format: string;
  };
  model: {
    active_provider: string;
    active_model: string;
    providers: ProviderConfig[];
    all_providers: ProviderConfig[];
  };
}

interface ModelOption {
  id: string;
  name: string | null;
}

const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI Compatible" },
  { value: "anthropic", label: "Anthropic" },
  { value: "gemini", label: "Google Gemini" },
  { value: "ollama", label: "Ollama" },
];

const BUILTIN_PROVIDER_NAMES = [
  "OpenRouter",
  "ModelScope",
];

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingTab>("general");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const mouseUpTargetRef = useRef<EventTarget | null>(null);

  useEffect(() => {
    if (open && !settings) {
      fetch("/api/settings")
        .then((res) => res.json())
        .then((data) => setSettings(data))
        .catch(() => {
          toast.error("Failed to load settings");
        });
    }
  }, [open, settings]);

  const handleSave = async () => {
    if (!settings) return;
    setLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Settings saved successfully");
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

  if (!open) return null;
  if (!settings) return null;

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
          className="w-full max-w-5xl h-[85vh] rounded-xl border border-zinc-700 bg-zinc-900/95 shadow-2xl backdrop-blur flex overflow-hidden"
        >
          <div className="w-56 border-r border-zinc-800 bg-zinc-950/50 p-4 flex flex-col">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-zinc-100 px-3">Settings</h2>
              <p className="text-xs text-zinc-500 px-3 mt-1">Customize your experience</p>
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
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
                      isActive
                        ? "bg-zinc-800 text-zinc-100 shadow-lg"
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-gradient-to-r from-zinc-800 to-zinc-800/50 rounded-lg"
                        transition={{ type: "spring", duration: 0.5 }}
                      />
                    )}
                    <Icon className={cn("size-4 relative z-10", isActive && tab.color)} />
                    <span className="text-sm font-medium relative z-10">{tab.label}</span>
                    {isActive && (
                      <ChevronRight className="size-4 ml-auto relative z-10 text-zinc-500" />
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
            <div className="border-b border-zinc-800 px-8 py-5">
              <div className="flex items-center gap-3">
                {(() => {
                  const tab = tabs.find((t) => t.id === activeTab);
                  const Icon = tab?.icon;
                  return (
                    <>
                      {Icon && <Icon className={cn("size-5", tab.color)} />}
                      <h3 className="text-lg font-semibold text-zinc-100">{tab?.label}</h3>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-8"
                >
                  {activeTab === "general" && <GeneralSettings settings={settings} onUpdate={setSettings} />}
                  {activeTab === "provider" && <ProviderSettings settings={settings} onUpdate={setSettings} />}
                  {activeTab === "model" && <ModelSettings settings={settings} onUpdate={setSettings} />}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="flex justify-end gap-3 border-t border-zinc-800 px-8 py-5 bg-zinc-950/30">
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
                className="bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20"
                disabled={loading}
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function GeneralSettings({
  settings,
  onUpdate,
}: {
  settings: UserSettings;
  onUpdate: (s: UserSettings) => void;
}) {
  return (
    <div className="space-y-6">
      <SettingSection title="Event Log" description="Configure how events are displayed">
        <SettingRow
          label="Event timestamp format"
          description="Choose how timestamps are displayed"
        >
          <Select
            options={[
              { value: "relative", label: "Relative (2m ago)" },
              { value: "absolute", label: "Absolute (14:30:45)" },
              { value: "both", label: "Both" },
            ]}
            value={settings.event_log.timestamp_format}
            onChange={(v) =>
              onUpdate({ ...settings, event_log: { ...settings.event_log, timestamp_format: v } })
            }
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
}

function ProviderSettings({
  settings,
  onUpdate,
}: {
  settings: UserSettings;
  onUpdate: (s: UserSettings) => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState<ProviderConfig>({
    name: "",
    provider_type: "openai",
    api_base_url: "",
    api_key: "",
  });

  const allProviders = settings.model.all_providers || [];

  const handleApiKeyChange = (providerName: string, apiKey: string) => {
    const isBuiltin = BUILTIN_PROVIDER_NAMES.includes(providerName);
    const updatedAllProviders = allProviders.map((p) =>
      p.name === providerName ? { ...p, api_key: apiKey } : p
    );

    let updatedCustomProviders: ProviderConfig[];
    if (isBuiltin) {
      const existing = settings.model.providers.find((p) => p.name === providerName);
      if (existing) {
        updatedCustomProviders = settings.model.providers.map((p) =>
          p.name === providerName ? { ...p, api_key: apiKey } : p
        );
      } else {
        const base = allProviders.find((p) => p.name === providerName)!;
        updatedCustomProviders = [
          ...settings.model.providers,
          { ...base, api_key: apiKey },
        ];
      }
    } else {
      updatedCustomProviders = settings.model.providers.map((p) =>
        p.name === providerName ? { ...p, api_key: apiKey } : p
      );
    }

    onUpdate({
      ...settings,
      model: {
        ...settings.model,
        providers: updatedCustomProviders,
        all_providers: updatedAllProviders,
      },
    });
  };

  const handleAdd = () => {
    if (!newProvider.name || !newProvider.api_base_url) {
      toast.error("Name and Base URL are required");
      return;
    }
    if (allProviders.some((p) => p.name === newProvider.name)) {
      toast.error("Provider name already exists");
      return;
    }
    onUpdate({
      ...settings,
      model: {
        ...settings.model,
        providers: [...settings.model.providers, { ...newProvider }],
        all_providers: [...allProviders, { ...newProvider }],
      },
    });
    setNewProvider({ name: "", provider_type: "openai", api_base_url: "", api_key: "" });
    setShowAddForm(false);
  };

  const handleDelete = (name: string) => {
    onUpdate({
      ...settings,
      model: {
        ...settings.model,
        providers: settings.model.providers.filter((p) => p.name !== name),
        all_providers: allProviders.filter((p) => p.name !== name),
        active_provider:
          settings.model.active_provider === name
            ? "OpenRouter"
            : settings.model.active_provider,
      },
    });
  };

  return (
    <div className="space-y-6">
      <SettingSection title="Available Providers" description="Manage LLM providers and configure API keys">
        <div className="space-y-1">
          {allProviders.map((provider) => {
            const isBuiltin = BUILTIN_PROVIDER_NAMES.includes(provider.name);
            return (
              <ProviderRow
                key={provider.name}
                provider={provider}
                isBuiltin={isBuiltin}
                onApiKeyChange={(key) => handleApiKeyChange(provider.name, key)}
                onDelete={isBuiltin ? undefined : () => handleDelete(provider.name)}
              />
            );
          })}
        </div>

        {showAddForm ? (
          <div className="mt-4 p-4 rounded-lg border border-zinc-700 bg-zinc-800/50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Name</label>
                <input
                  value={newProvider.name}
                  onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                  placeholder="My Provider"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Type</label>
                <select
                  value={newProvider.provider_type}
                  onChange={(e) =>
                    setNewProvider({ ...newProvider, provider_type: e.target.value })
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none"
                >
                  {PROVIDER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Base URL</label>
              <input
                value={newProvider.api_base_url}
                onChange={(e) =>
                  setNewProvider({ ...newProvider, api_base_url: e.target.value })
                }
                placeholder="https://api.example.com/v1"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">API Key</label>
              <input
                type="password"
                value={newProvider.api_key}
                onChange={(e) =>
                  setNewProvider({ ...newProvider, api_key: e.target.value })
                }
                placeholder="sk-..."
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(false)}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Add
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-3 flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Plus className="size-4" />
            Add Custom Provider
          </button>
        )}
      </SettingSection>
    </div>
  );
}

function ProviderRow({
  provider,
  isBuiltin,
  onApiKeyChange,
  onDelete,
}: {
  provider: ProviderConfig;
  isBuiltin: boolean;
  onApiKeyChange: (key: string) => void;
  onDelete?: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const needsApiKey = provider.provider_type !== "ollama";

  return (
    <div className="flex items-center gap-3 py-3 px-4 rounded-lg hover:bg-zinc-800/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-300">{provider.name}</span>
          {isBuiltin && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">
              built-in
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
            {provider.provider_type}
          </span>
        </div>
        <p className="text-xs text-zinc-500 truncate mt-0.5">{provider.api_base_url}</p>
      </div>

      {needsApiKey && (
        <div className="relative w-52 shrink-0">
          <input
            type={showKey ? "text" : "password"}
            value={provider.api_key}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="API Key"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-3 pr-8 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
      )}

      {onDelete && (
        <button
          onClick={onDelete}
          className="text-zinc-500 hover:text-red-400 transition-colors shrink-0"
          title="Delete provider"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}

function ModelSettings({
  settings,
  onUpdate,
}: {
  settings: UserSettings;
  onUpdate: (s: UserSettings) => void;
}) {
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const allProviders = settings.model.all_providers || [];
  const activeProviderName = settings.model.active_provider;
  const activeProvider = allProviders.find((p) => p.name === activeProviderName);

  useEffect(() => {
    if (!activeProvider) return;

    let cancelled = false;
    setLoadingModels(true);
    setModelOptions([]);

    fetch("/api/providers/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_type: activeProvider.provider_type,
        api_base_url: activeProvider.api_base_url,
        api_key: activeProvider.api_key,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.models && data.models.length > 0) {
          setModelOptions(data.models);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });

    return () => { cancelled = true; };
  }, [activeProviderName]);

  const handleProviderChange = (name: string) => {
    onUpdate({
      ...settings,
      model: { ...settings.model, active_provider: name, active_model: "" },
    });
  };

  return (
    <div className="space-y-6">
      <SettingSection title="Model Selection" description="Choose which provider and model to use for agents">
        <SettingRow label="Provider" description="Select from your configured providers">
          <Select
            options={allProviders.map((p) => ({ value: p.name, label: p.name }))}
            value={settings.model.active_provider}
            onChange={handleProviderChange}
          />
        </SettingRow>
        <SettingRow label="Model" description="Select a model or enter an ID manually">
          {loadingModels ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400 w-64 justify-center">
              <Loader2 className="size-4 animate-spin" />
              <span>Loading models...</span>
            </div>
          ) : modelOptions.length > 0 ? (
            <select
              value={settings.model.active_model}
              onChange={(e) =>
                onUpdate({
                  ...settings,
                  model: { ...settings.model, active_model: e.target.value },
                })
              }
              className="w-64 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              <option value="">-- Select a model --</option>
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))}
            </select>
          ) : (
            <TextInput
              value={settings.model.active_model}
              onChange={(v) =>
                onUpdate({
                  ...settings,
                  model: { ...settings.model, active_model: v },
                })
              }
              placeholder="model-id"
            />
          )}
        </SettingRow>
      </SettingSection>
    </div>
  );
}

function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-zinc-200">{title}</h4>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 px-4 rounded-lg hover:bg-zinc-800/30 transition-colors">
      <div className="flex-1 min-w-0 pr-4">
        <label className="text-sm font-medium text-zinc-300 block">{label}</label>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-64 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
    />
  );
}

function Select({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-64 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
