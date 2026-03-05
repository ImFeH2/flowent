import { useEffect, useState } from "react";
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

type ProviderDraft = Omit<Provider, "id">;

const emptyDraft = (): ProviderDraft => ({
  name: "",
  type: "openai_compatible",
  base_url: "",
  api_key: "",
});

export function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const selectedProvider = providers.find((p) => p.id === selectedId);

  const refreshProviders = async () => {
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
  };

  useEffect(() => {
    void refreshProviders();
  }, []);

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
      <div className="flex w-[300px] flex-col border-r border-border bg-card/30">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Server className="size-4 text-primary" />
            <span className="font-semibold">Providers</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => void refreshProviders()}
              disabled={loading}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              title="Refresh"
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
              />
            </button>
            <button
              onClick={handleCreateNew}
              className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition-all active:scale-[0.98] hover:bg-primary/90"
              title="Add Provider"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="space-y-2 py-4 px-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg skeleton-shimmer" />
              ))}
            </div>
          ) : providers.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="py-8 text-center"
            >
              <p className="text-sm text-muted-foreground">No providers</p>
              <button
                onClick={handleCreateNew}
                className="mt-2 text-xs text-primary hover:underline"
              >
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
                    "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
                    selectedId === provider.id
                      ? "bg-accent border-l-2 border-primary"
                      : "hover:bg-accent/50 border-l-2 border-transparent",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">
                      {provider.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {providerTypeLabel(provider.type)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(provider.id);
                      }}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
      </div>

      <div className="flex-1 bg-card/20">
        {isCreating || selectedProvider ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
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
                      className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.98] hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Check className="size-4" />
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mx-auto max-w-xl space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Provider Name</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                    placeholder="e.g., OpenAI Production"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Provider Type</label>
                  <select
                    value={draft.type}
                    onChange={(e) =>
                      setDraft({ ...draft, type: e.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm transition-all duration-200 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {providerTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {draft.type === "openai_compatible"
                      ? "Any OpenAI-compatible API endpoint"
                      : draft.type === "anthropic"
                        ? "Anthropic Claude API"
                        : "Google Gemini API"}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Base URL</label>
                  <input
                    type="text"
                    value={draft.base_url}
                    onChange={(e) =>
                      setDraft({ ...draft, base_url: e.target.value })
                    }
                    placeholder="https://api.openai.com/v1"
                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-mono transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">API Key</label>
                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={draft.api_key}
                      onChange={(e) =>
                        setDraft({ ...draft, api_key: e.target.value })
                      }
                      placeholder="sk-..."
                      className="w-full rounded-lg border border-border bg-card px-3 py-2 pr-10 text-sm font-mono transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      {showKey ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your API key is encrypted and stored securely.
                  </p>
                </div>

                {!isCreating && selectedProvider && (
                  <div className="pt-6 border-t border-border">
                    <button
                      onClick={() => handleDelete(selectedProvider.id)}
                      className="flex items-center gap-2 rounded-md border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                      Delete Provider
                    </button>
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
            <div className="flex size-16 items-center justify-center rounded-2xl bg-accent">
              <Server className="size-8 text-primary/50" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No Provider Selected</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Select a provider from the list to edit, or create a new one to
              get started.
            </p>
            <button
              onClick={handleCreateNew}
              className="mt-4 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.98] hover:bg-primary/90"
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
