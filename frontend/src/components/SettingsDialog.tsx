import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Sparkles, Palette, Zap, Database, ChevronRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

type SettingTab = "general" | "model" | "appearance" | "advanced";

interface TabConfig {
  id: SettingTab;
  label: string;
  icon: React.ElementType;
  color: string;
}

const tabs: TabConfig[] = [
  { id: "general", label: "General", icon: Zap, color: "text-blue-400" },
  { id: "model", label: "Model", icon: Sparkles, color: "text-violet-400" },
];


interface UserSettings {
  event_log: {
    timestamp_format: string;
  };
  model: {
    provider: string;
    default_model: string;
    api_base_url: string;
    api_key: string;
  };
}

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

function ModelSettings({
  settings,
  onUpdate,
}: {
  settings: UserSettings;
  onUpdate: (s: UserSettings) => void;
}) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <div className="space-y-6">
      <SettingSection
        title="Model Configuration"
        description="Configure the AI model used by agents"
      >
        <SettingRow label="Provider" description="AI model provider">
          <Select
            options={[{ value: "openrouter", label: "OpenRouter" }]}
            value={settings.model.provider}
            onChange={(v) => onUpdate({ ...settings, model: { ...settings.model, provider: v } })}
          />
        </SettingRow>
        <SettingRow label="Model" description="Model identifier (e.g., anthropic/claude-3.5-sonnet)">
          <TextInput
            value={settings.model.default_model}
            onChange={(v) =>
              onUpdate({ ...settings, model: { ...settings.model, default_model: v } })
            }
            placeholder="anthropic/claude-3.5-sonnet"
          />
        </SettingRow>
        <SettingRow label="API Base URL" description="OpenRouter API endpoint">
          <TextInput
            value={settings.model.api_base_url}
            onChange={(v) =>
              onUpdate({ ...settings, model: { ...settings.model, api_base_url: v } })
            }
          />
        </SettingRow>
        <SettingRow label="API Key" description="Your API key for authentication">
          <div className="relative w-64">
            <input
              type={showApiKey ? "text" : "password"}
              value={settings.model.api_key}
              onChange={(e) => onUpdate({ ...settings, model: { ...settings.model, api_key: e.target.value } })}
              placeholder="sk-..."
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-3 pr-10 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
              title={showApiKey ? "Hide API Key" : "Show API Key"}
            >
              {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
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

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900",
        checked ? "bg-emerald-600" : "bg-zinc-700"
      )}
    >
      <motion.span
        layout
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform",
          checked ? "translate-x-6" : "translate-x-1"
        )}
      />
    </button>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      className="w-24 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
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
