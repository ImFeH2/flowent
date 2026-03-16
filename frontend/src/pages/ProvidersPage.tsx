import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createProvider,
  deleteProvider,
  fetchProviders,
  updateProvider,
} from "@/lib/api";
import { providerTypeLabel, providerTypeOptions } from "@/lib/providerTypes";
import type { Provider } from "@/types";
import { cn } from "@/lib/utils";
import { usePanelDrag, usePanelWidth } from "@/hooks/usePanelDrag";
import { PanelResizer } from "@/components/PanelResizer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProviderDraft = Omit<Provider, "id">;

const emptyDraft = (): ProviderDraft => ({
  name: "",
  type: "openai_compatible",
  base_url: "",
  api_key: "",
});

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
  label,
  description,
  children,
  valueClassName,
}: {
  label: string;
  description: string;
  children: ReactNode;
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

export function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [panelWidth, setPanelWidth] = usePanelWidth(
    "providers-panel-width",
    300,
    200,
    500,
  );
  const { isDragging, startDrag } = usePanelDrag(
    panelWidth,
    setPanelWidth,
    "right",
  );

  const selectedProvider = providers.find((p) => p.id === selectedId);

  const refreshProviders = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchProviders();
      setProviders(items);
      if (selectedId && !items.find((p) => p.id === selectedId)) {
        setSelectedId(null);
        setIsCreating(false);
      }
    } catch {
      toast.error("Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void refreshProviders();
  }, [refreshProviders]);

  const handleSelect = (provider: Provider) => {
    setSelectedId(provider.id);
    setIsCreating(false);
    setDraft({
      name: provider.name,
      type: provider.type,
      base_url: provider.base_url,
      api_key: provider.api_key,
    });
    setShowKey(false);
  };

  const handleCreateNew = () => {
    setIsCreating(true);
    setSelectedId(null);
    setDraft(emptyDraft());
    setShowKey(false);
  };

  const handleCancel = () => {
    if (isCreating) {
      setIsCreating(false);
      setDraft(emptyDraft());
    } else if (selectedProvider) {
      setDraft({
        name: selectedProvider.name,
        type: selectedProvider.type,
        base_url: selectedProvider.base_url,
        api_key: selectedProvider.api_key,
      });
    }
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast.error("Provider name is required");
      return;
    }
    setSaving(true);
    try {
      if (isCreating) {
        const created = await createProvider(draft);
        setProviders((prev) => [...prev, created]);
        setIsCreating(false);
        setSelectedId(created.id);
        toast.success("Provider created");
      } else if (selectedId) {
        const updated = await updateProvider(selectedId, draft);
        setProviders((prev) =>
          prev.map((p) => (p.id === selectedId ? updated : p)),
        );
        toast.success("Provider updated");
      }
    } catch {
      toast.error(
        isCreating ? "Failed to create provider" : "Failed to update provider",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this provider?")) return;
    try {
      await deleteProvider(id);
      setProviders((prev) => prev.filter((p) => p.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setDraft(emptyDraft());
      }
      toast.success("Provider deleted");
    } catch {
      toast.error("Failed to delete provider");
    }
  };

  const hasChanges = isCreating
    ? draft.name !== "" || draft.base_url !== "" || draft.api_key !== ""
    : selectedProvider
      ? draft.name !== selectedProvider.name ||
        draft.type !== selectedProvider.type ||
        draft.base_url !== selectedProvider.base_url ||
        draft.api_key !== selectedProvider.api_key
      : false;

  return (
    <div className="flex h-full">
      <div
        style={{ width: `${panelWidth}px` }}
        className="relative flex shrink-0 flex-col border-r border-white/6 bg-black/[0.18]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/6 px-4 py-3">
          <div className="min-w-0 flex items-center gap-2">
            <Server className="size-4 shrink-0 text-primary" />
            <span className="font-semibold truncate">Providers</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => void refreshProviders()}
              disabled={loading}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
              title="Refresh"
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
              />
            </button>
            <button
              onClick={handleCreateNew}
              className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground transition-all active:scale-[0.98] hover:bg-primary/90"
              title="Add Provider"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="space-y-2 py-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 rounded-md skeleton-shimmer" />
              ))}
            </div>
          ) : providers.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-10 text-center"
            >
              <p className="text-sm text-muted-foreground">No providers</p>
              <button
                onClick={handleCreateNew}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="size-3.5" />
                Add your first provider
              </button>
            </motion.div>
          ) : (
            <div className="space-y-1">
              {providers.map((provider, i) => (
                <motion.button
                  key={provider.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => handleSelect(provider)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-all",
                    selectedId === provider.id
                      ? "bg-white/[0.065] text-foreground"
                      : "hover:bg-white/[0.04]",
                  )}
                >
                  <span
                    className={cn(
                      "h-7 w-px shrink-0 rounded-full",
                      selectedId === provider.id
                        ? "bg-primary/70"
                        : "bg-transparent",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">
                      {provider.name}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {providerTypeLabel(provider.type)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(provider.id);
                      }}
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </button>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
        <PanelResizer
          position="right"
          isDragging={isDragging}
          onMouseDown={startDrag}
        />
      </div>

      <div className="min-w-0 flex-1 overflow-hidden bg-white/[0.012]">
        {isCreating || selectedProvider ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-white/6 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {isCreating ? "New Provider" : selectedProvider?.name}
                </h2>{" "}
                <p className="text-sm text-muted-foreground">
                  {isCreating
                    ? "Configure a new LLM provider"
                    : `ID: ${selectedProvider?.id}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {hasChanges && (
                  <>
                    <button
                      onClick={handleCancel}
                      disabled={saving}
                      className="rounded-md border border-white/8 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-white/[0.05]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98] hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Check className="size-4" />
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-xl py-6">
                <SectionHeader
                  eyebrow="Provider"
                  title="Identity"
                  description="Display name and API type"
                />
                <SettingsRow
                  label="Name"
                  description="Display name for this provider"
                >
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                    placeholder="e.g., OpenAI Production"
                    className="w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 text-sm transition-all placeholder:text-muted-foreground focus:border-white/16 focus:outline-none"
                  />
                </SettingsRow>
                <SettingsRow
                  label="Type"
                  description="API format used by this provider"
                >
                  <Select
                    value={draft.type}
                    onValueChange={(value) =>
                      setDraft({ ...draft, type: value })
                    }
                  >
                    <SelectTrigger className="w-full rounded-md border-white/8 bg-black/[0.22]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providerTypeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingsRow>

                <div className="mt-8 border-t border-white/6 pt-8">
                  <SectionHeader
                    eyebrow="Connection"
                    title="Endpoint"
                    description="API endpoint and authentication"
                  />
                  <SettingsRow label="Base URL" description="API endpoint URL">
                    <input
                      type="text"
                      value={draft.base_url}
                      onChange={(e) =>
                        setDraft({ ...draft, base_url: e.target.value })
                      }
                      placeholder="https://api.openai.com/v1"
                      className="w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 text-sm transition-all placeholder:text-muted-foreground focus:border-white/16 focus:outline-none"
                    />
                  </SettingsRow>
                  <SettingsRow
                    label="API Key"
                    description="Authentication key (optional)"
                  >
                    <div className="relative">
                      <input
                        type={showKey ? "text" : "password"}
                        value={draft.api_key}
                        onChange={(e) =>
                          setDraft({ ...draft, api_key: e.target.value })
                        }
                        placeholder="sk-..."
                        className="w-full rounded-md border border-white/8 bg-black/[0.22] px-3 py-2 pr-9 text-sm transition-all placeholder:text-muted-foreground focus:border-white/16 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
                      >
                        {showKey ? (
                          <EyeOff className="size-4" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </button>
                    </div>
                  </SettingsRow>
                </div>

                {!isCreating && selectedProvider && (
                  <div className="mt-8 border-t border-white/6 pt-4">
                    <p className="text-xs text-muted-foreground">
                      ID:{" "}
                      <code className="font-mono">{selectedProvider.id}</code>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex h-full flex-col items-center justify-center text-center"
          >
            <Server className="size-8 text-muted-foreground/60" />
            <h3 className="mt-4 text-lg font-semibold">No Provider Selected</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Select a provider from the list to edit, or create a new one to
              get started.
            </p>
            <button
              onClick={handleCreateNew}
              className="mt-4 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98] hover:bg-primary/90"
            >
              <Plus className="size-4" />
              Add Provider
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
