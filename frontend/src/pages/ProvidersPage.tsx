import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Check,
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
import {
  formatProviderHeaders,
  parseProviderHeadersInput,
} from "@/lib/providerHeaders";
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

type ProviderDraft = Omit<Provider, "id" | "headers"> & {
  headers_text: string;
};

const emptyDraft = (): ProviderDraft => ({
  name: "",
  type: "openai_compatible",
  base_url: "",
  api_key: "",
  headers_text: "",
  retry_429_delay_seconds: 0,
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
  const parsedHeaders = useMemo(
    () => parseProviderHeadersInput(draft.headers_text),
    [draft.headers_text],
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
      headers_text: formatProviderHeaders(provider.headers),
      retry_429_delay_seconds: provider.retry_429_delay_seconds,
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
        headers_text: formatProviderHeaders(selectedProvider.headers),
        retry_429_delay_seconds: selectedProvider.retry_429_delay_seconds,
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
    if (parsedHeaders.error) {
      toast.error(parsedHeaders.error);
      return;
    }

    const payload = {
      name: draft.name,
      type: draft.type,
      base_url: draft.base_url,
      api_key: draft.api_key,
      headers: parsedHeaders.headers,
      retry_429_delay_seconds: draft.retry_429_delay_seconds,
    };

    setSaving(true);
    try {
      if (isCreating) {
        const created = await createProvider(payload);
        setProviders((prev) => [...prev, created]);
        setIsCreating(false);
        setSelectedId(created.id);
        setDraft({
          name: created.name,
          type: created.type,
          base_url: created.base_url,
          api_key: created.api_key,
          headers_text: formatProviderHeaders(created.headers),
          retry_429_delay_seconds: created.retry_429_delay_seconds,
        });
        toast.success("Provider created");
      } else if (selectedId) {
        const updated = await updateProvider(selectedId, payload);
        setProviders((prev) =>
          prev.map((p) => (p.id === selectedId ? updated : p)),
        );
        setDraft({
          name: updated.name,
          type: updated.type,
          base_url: updated.base_url,
          api_key: updated.api_key,
          headers_text: formatProviderHeaders(updated.headers),
          retry_429_delay_seconds: updated.retry_429_delay_seconds,
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
    ? draft.name !== "" ||
      draft.base_url !== "" ||
      draft.api_key !== "" ||
      draft.headers_text !== "" ||
      draft.retry_429_delay_seconds !== 0
    : selectedProvider
      ? draft.name !== selectedProvider.name ||
        draft.type !== selectedProvider.type ||
        draft.base_url !== selectedProvider.base_url ||
        draft.api_key !== selectedProvider.api_key ||
        draft.headers_text !==
          formatProviderHeaders(selectedProvider.headers) ||
        draft.retry_429_delay_seconds !==
          selectedProvider.retry_429_delay_seconds
      : false;

  return (
    <PageScaffold className="overflow-hidden p-0 md:p-0">
      <div className="flex h-full w-full">
        {/* Left Sidebar List */}
        <div
          style={{ width: `${panelWidth}px` }}
          className="relative flex shrink-0 flex-col border-r border-white/[0.04] bg-white/[0.01] pt-8 pl-8"
        >
          <div className="flex shrink-0 items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-white/40" />
              <span className="text-[13px] font-medium text-white/80">
                Providers
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => void refreshProviders()}
                disabled={loading}
                className="flex size-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                <RefreshCw
                  className={cn("size-3.5", loading && "animate-spin")}
                />
              </button>
              <button
                type="button"
                onClick={handleCreateNew}
                className="flex size-7 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            {loading ? (
              <div className="space-y-1">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-10 w-full animate-pulse rounded-lg bg-white/[0.02]"
                  />
                ))}
              </div>
            ) : providers.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-10 text-center"
              >
                <p className="text-[13px] text-white/40">No providers</p>
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/[0.06]"
                >
                  <Plus className="size-3" />
                  Add Provider
                </button>
              </motion.div>
            ) : (
              <div className="space-y-0.5">
                {providers.map((provider, i) => (
                  <motion.div
                    key={provider.id}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
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
                      "group flex w-full items-center justify-between rounded-lg px-3 py-2.5 transition-all",
                      selectedId === provider.id
                        ? "bg-white/[0.06] text-white"
                        : "text-white/60 hover:bg-white/[0.03] hover:text-white/90",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">
                        {provider.name}
                      </p>
                      <p className="truncate text-[11px] text-white/40">
                        {providerTypeLabel(provider.type)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setProviderToDelete(provider);
                      }}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md opacity-0 transition-opacity hover:bg-white/[0.08] hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3" />
                    </button>
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

        {/* Right Content Area */}
        <div className="min-w-0 flex-1 overflow-y-auto bg-transparent">
          {isCreating || selectedProvider ? (
            <div className="flex min-h-full flex-col px-8 py-8 md:px-12 md:py-10">
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-medium text-white/90">
                    {isCreating ? "New Provider" : selectedProvider?.name}
                  </h2>
                  <p className="mt-1 text-[13px] text-white/40">
                    {isCreating
                      ? "Configure a new LLM backend"
                      : `ID: ${selectedProvider?.id}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {hasChanges && (
                    <>
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={saving}
                        className="rounded-full px-4 py-1.5 text-[13px] font-medium text-white/60 transition-colors hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-[13px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        <Check className="size-3.5" />
                        {saving ? "Saving..." : "Save"}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mx-auto w-full max-w-[640px] flex-1">
                <SectionHeader
                  title="Identity"
                  description="Set the provider name and runtime type."
                />
                <div className="mb-10 space-y-2">
                  <SettingsRow label="Name">
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                      placeholder="e.g., OpenAI Production"
                      className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/30 transition-colors focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                    />
                  </SettingsRow>
                  <SettingsRow label="Type">
                    <Select
                      value={draft.type}
                      onValueChange={(value) =>
                        setDraft({ ...draft, type: value })
                      }
                    >
                      <SelectTrigger className="w-full rounded-lg border-white/[0.06] bg-white/[0.02] text-[13px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl border-white/[0.08] bg-black/80 backdrop-blur-xl">
                        {providerTypeOptions.map((opt) => (
                          <SelectItem
                            key={opt.value}
                            value={opt.value}
                            className="text-[13px]"
                          >
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingsRow>
                </div>

                <div className="border-t border-white/[0.04] pt-8">
                  <SectionHeader
                    title="Endpoint Details"
                    description="Configure connection details and optional credentials."
                  />
                  <div className="space-y-2">
                    <SettingsRow label="Base URL">
                      <input
                        type="text"
                        value={draft.base_url}
                        onChange={(e) =>
                          setDraft({ ...draft, base_url: e.target.value })
                        }
                        placeholder="https://api.openai.com/v1"
                        className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/30 transition-colors focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                      />
                    </SettingsRow>
                    <SettingsRow
                      label="Request Preview"
                      description="Resolved endpoint based on configuration"
                    >
                      <div
                        className={cn(
                          "w-full rounded-lg border px-3.5 py-2.5 text-[12px]",
                          endpointPreview.error
                            ? "border-red-500/20 bg-red-500/5 text-red-400"
                            : "border-white/[0.04] bg-white/[0.01] text-white/70",
                        )}
                      >
                        {endpointPreview.error ? (
                          endpointPreview.error
                        ) : endpointPreview.previewUrl ? (
                          <code className="font-mono">
                            {endpointPreview.previewUrl}
                          </code>
                        ) : (
                          <span className="text-white/30">
                            Enter a base URL to preview
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
                          className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 pr-10 text-[13px] text-white placeholder:text-white/30 transition-colors focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
                        >
                          {showKey ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </button>
                      </div>
                    </SettingsRow>
                    <SettingsRow
                      label="Headers"
                      description="Optional JSON object"
                    >
                      <div className="space-y-2">
                        <textarea
                          value={draft.headers_text}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              headers_text: e.target.value,
                            })
                          }
                          placeholder={'{\n  "Authorization": "Bearer ..."\n}'}
                          spellCheck={false}
                          className={cn(
                            "min-h-[140px] w-full rounded-lg border bg-white/[0.02] px-3.5 py-3 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:outline-none",
                            parsedHeaders.error
                              ? "border-red-500/30 focus:border-red-500/50 text-red-300"
                              : "border-white/[0.06] focus:border-white/20 focus:bg-white/[0.04]",
                          )}
                        />
                        {parsedHeaders.error && (
                          <p className="text-[11px] text-red-400">
                            {parsedHeaders.error}
                          </p>
                        )}
                      </div>
                    </SettingsRow>
                    <SettingsRow
                      label="429 Retry Delay"
                      description="Extra wait after HTTP 429"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            aria-label="429 Retry Delay"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={String(draft.retry_429_delay_seconds)}
                            onChange={(e) => {
                              const nextValue = e.target.value.trim();
                              if (!/^\d+$/.test(nextValue)) {
                                return;
                              }
                              const parsed = Number.parseInt(nextValue, 10);
                              if (!Number.isSafeInteger(parsed) || parsed < 0) {
                                return;
                              }
                              setDraft({
                                ...draft,
                                retry_429_delay_seconds: parsed,
                              });
                            }}
                            className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5 font-mono text-[13px] text-white transition-colors placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
                          />
                          <span className="text-[13px] font-medium text-white/40">
                            s
                          </span>
                        </div>
                        <p className="text-[11px] text-white/40 leading-relaxed">
                          Adds extra wait only when this provider returns HTTP
                          429 and the system will continue retrying.
                        </p>
                      </div>
                    </SettingsRow>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center px-6 text-center"
            >
              <div className="flex size-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.02] shadow-sm">
                <Server className="size-5 text-white/40" />
              </div>
              <h3 className="mt-5 text-[15px] font-medium text-white/90">
                No Provider Selected
              </h3>
              <p className="mt-1.5 max-w-sm text-[13px] text-white/40">
                Select a provider from the sidebar to edit its connection
                details.
              </p>
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
