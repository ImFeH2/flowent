import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  PageScaffold,
  SectionHeader,
  SettingsRow,
} from "@/components/layout/PageScaffold";
import { providerTypeLabel, providerTypeOptions } from "@/lib/providerTypes";
import { buildProviderRequestPreview } from "@/lib/providerUrls";
import type { Provider } from "@/types";
import { cn } from "@/lib/utils";
import { usePanelDrag, usePanelWidth } from "@/hooks/usePanelDrag";
import { PanelResizer } from "@/components/PanelResizer";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

export function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<ProviderDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<Provider | null>(
    null,
  );
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
  const endpointPreview = useMemo(
    () => buildProviderRequestPreview(draft.type, draft.base_url),
    [draft.base_url, draft.type],
  );

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
    if (!draft.base_url.trim()) {
      toast.error("Provider base URL is required");
      return;
    }
    if (endpointPreview.error) {
      toast.error(endpointPreview.error);
      return;
    }
    setSaving(true);
    try {
      if (isCreating) {
        const created = await createProvider(draft);
        setProviders((prev) => [...prev, created]);
        setIsCreating(false);
        setSelectedId(created.id);
        setDraft({
          name: created.name,
          type: created.type,
          base_url: created.base_url,
          api_key: created.api_key,
        });
        toast.success("Provider created");
      } else if (selectedId) {
        const updated = await updateProvider(selectedId, draft);
        setProviders((prev) =>
          prev.map((p) => (p.id === selectedId ? updated : p)),
        );
        setDraft({
          name: updated.name,
          type: updated.type,
          base_url: updated.base_url,
          api_key: updated.api_key,
        });
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

  const handleDelete = async () => {
    if (!providerToDelete) return;
    const id = providerToDelete.id;
    setProviderToDelete(null);
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
    <PageScaffold
      title="Providers"
      description="Manage available LLM providers and preview their resolved request endpoints."
      className="overflow-hidden"
    >
      <div className="flex min-h-0 flex-1">
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
              <Button
                onClick={() => void refreshProviders()}
                disabled={loading}
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                title="Refresh"
              >
                <RefreshCw
                  className={cn("size-3.5", loading && "animate-spin")}
                />
              </Button>
              <Button
                onClick={handleCreateNew}
                size="icon-sm"
                title="Add Provider"
              >
                <Plus className="size-3.5" />
              </Button>
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
                <Button onClick={handleCreateNew} size="sm" className="mt-3">
                  <Plus className="size-3.5" />
                  Add your first provider
                </Button>
              </motion.div>
            ) : (
              <div className="space-y-1">
                {providers.map((provider, i) => (
                  <motion.div
                    key={provider.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelect(provider)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleSelect(provider);
                      }
                    }}
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
                    <div className="min-w-0 flex flex-1 items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {provider.name}
                      </p>
                      <span className="shrink-0 rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-muted-foreground/78">
                        {providerTypeLabel(provider.type)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        onClick={(event) => {
                          event.stopPropagation();
                          setProviderToDelete(provider);
                        }}
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </motion.div>
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
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {isCreating
                      ? "Configure a new LLM provider"
                      : `ID: ${selectedProvider?.id}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {hasChanges && (
                    <>
                      <Button
                        onClick={handleCancel}
                        disabled={saving}
                        variant="ghost"
                        className="border border-white/8 text-foreground hover:bg-white/[0.05]"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void handleSave()}
                        disabled={saving}
                      >
                        <Check className="size-4" />
                        {saving ? "Saving..." : "Save"}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-xl py-6">
                  <SectionHeader
                    title="Identity"
                    eyebrow="Provider"
                    description="Set the provider name and runtime type used across roles and settings."
                  />
                  <SettingsRow label="Name">
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
                  <SettingsRow label="Type">
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
                      title="Endpoint"
                      eyebrow="Endpoint"
                      description="Configure the base URL, inspect the resolved request preview, and optionally store an API key."
                    />
                    <SettingsRow label="Base URL">
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
                      label="Request Preview"
                      description="Resolved endpoint"
                    >
                      <div
                        className={cn(
                          "w-full rounded-md border px-3 py-2 text-sm",
                          endpointPreview.error
                            ? "border-destructive/30 bg-destructive/5 text-destructive"
                            : "border-white/8 bg-black/[0.22] text-foreground",
                        )}
                      >
                        {endpointPreview.error ? (
                          endpointPreview.error
                        ) : endpointPreview.previewUrl ? (
                          <code className="font-mono text-[12px]">
                            {endpointPreview.previewUrl}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">
                            Enter a base URL to preview the final request
                            endpoint
                          </span>
                        )}
                      </div>
                    </SettingsRow>
                    <SettingsRow label="API Key" description="Optional">
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
                        <Button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          variant="ghost"
                          size="icon-xs"
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                        >
                          {showKey ? (
                            <EyeOff className="size-4" />
                          ) : (
                            <Eye className="size-4" />
                          )}
                        </Button>
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
              <h3 className="mt-4 text-lg font-semibold">
                No Provider Selected
              </h3>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Select a provider from the list to edit, or create a new one to
                get started.
              </p>
              <Button onClick={handleCreateNew} className="mt-4">
                <Plus className="size-4" />
                Add Provider
              </Button>
            </motion.div>
          )}
        </div>
      </div>
      <AlertDialog
        open={providerToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setProviderToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete provider?</AlertDialogTitle>
            <AlertDialogDescription>
              {providerToDelete
                ? `This will permanently remove ${providerToDelete.name}.`
                : "This will permanently remove the selected provider."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="ghost">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button variant="destructive" onClick={() => void handleDelete()}>
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageScaffold>
  );
}
