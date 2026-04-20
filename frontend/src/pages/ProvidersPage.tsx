import { motion } from "motion/react";
import {
  Check,
  PencilLine,
  Play,
  Plus,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";
import {
  PageScaffold,
  PageTitleBar,
  SectionHeader,
  SettingsRow,
} from "@/components/layout/PageScaffold";
import {
  FormInput,
  FormTextarea,
  SecretInput,
  formHelpTextClass,
  formSelectTriggerClass,
} from "@/components/form/FormControls";
import { providerTypeOptions } from "@/lib/providerTypes";
import { cn } from "@/lib/utils";
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
import { buildModelSummary } from "@/pages/providers/lib";
import { ProviderModelDialog } from "@/pages/providers/ProviderModelDialog";
import { ProvidersSidebar } from "@/pages/providers/ProvidersSidebar";
import { useProvidersPageState } from "@/pages/providers/useProvidersPageState";

export function ProvidersPage() {
  const {
    draft,
    endpointPreview,
    fetchingModels,
    handleCancel,
    handleCreateNew,
    handleDelete,
    handleDeleteModel,
    handleFetchModels,
    handleSave,
    handleSaveModel,
    handleSelect,
    handleTestModel,
    hasChanges,
    isCreating,
    isDragging,
    loading,
    modelEditorDraft,
    modelEditorState,
    modelTestStates,
    openCreateModelDialog,
    openEditModelDialog,
    panelWidth,
    parsedHeaders,
    providerToDelete,
    providers,
    refreshProviders,
    saving,
    selectedId,
    selectedProvider,
    setDraft,
    setModelEditorDraft,
    setProviderToDelete,
    startDrag,
    closeModelDialog,
  } = useProvidersPageState();

  return (
    <PageScaffold className="overflow-hidden px-4 pt-6 sm:px-5">
      <div className="flex h-full min-h-0 flex-col">
        <PageTitleBar title="Providers" />
        <div className="mt-6 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border/60 bg-card/[0.14]">
          <ProvidersSidebar
            isDragging={isDragging}
            loading={loading}
            onCreate={handleCreateNew}
            onDelete={setProviderToDelete}
            onRefresh={() => {
              void refreshProviders();
            }}
            onResizeStart={startDrag}
            onSelect={handleSelect}
            panelWidth={panelWidth}
            providers={providers}
            selectedId={selectedId}
          />

          <div className="min-w-0 flex-1 overflow-y-auto bg-transparent">
            {isCreating || selectedProvider ? (
              <div className="flex min-h-full flex-col px-8 py-8 md:px-12 md:py-10">
                <div className="mb-8 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-medium text-foreground">
                      {isCreating ? "New Provider" : selectedProvider?.name}
                    </h2>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      {isCreating
                        ? "Configure a new provider and its model catalog"
                        : `ID: ${selectedProvider?.id}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasChanges ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleCancel}
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleSave()}
                          disabled={saving}
                        >
                          <Check className="size-3.5" />
                          {saving ? "Saving..." : "Save"}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="mx-auto w-full max-w-[720px] flex-1">
                  <SectionHeader
                    title="Identity"
                    description="Set the provider name and runtime type."
                  />
                  <div className="mb-10 space-y-2">
                    <SettingsRow label="Name">
                      <FormInput
                        value={draft.name}
                        onChange={(event) =>
                          setDraft({ ...draft, name: event.target.value })
                        }
                        placeholder="e.g., OpenAI Production"
                      />
                    </SettingsRow>
                    <SettingsRow label="Type">
                      <Select
                        value={draft.type}
                        onValueChange={(value) =>
                          setDraft({ ...draft, type: value })
                        }
                      >
                        <SelectTrigger className={formSelectTriggerClass}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-border bg-popover">
                          {providerTypeOptions.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              className="text-[13px]"
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </SettingsRow>
                  </div>

                  <div className="border-t border-border pt-8">
                    <SectionHeader
                      title="Endpoint & Auth"
                      description="Configure connection details, request preview, credentials, and retry behavior."
                    />
                    <div className="space-y-2">
                      <SettingsRow label="Base URL">
                        <FormInput
                          value={draft.base_url}
                          onChange={(event) =>
                            setDraft({ ...draft, base_url: event.target.value })
                          }
                          placeholder="https://api.openai.com/v1"
                        />
                      </SettingsRow>
                      <SettingsRow
                        label="Request Preview"
                        description="Resolved endpoint based on the current draft"
                      >
                        <div
                          className={cn(
                            "w-full select-text rounded-md border px-3 py-2 text-[12px]",
                            endpointPreview.error
                              ? "border-destructive/20 bg-destructive/8 text-destructive"
                              : "border-border bg-card/30 text-foreground/80",
                          )}
                        >
                          {endpointPreview.error ? (
                            endpointPreview.error
                          ) : endpointPreview.previewUrl ? (
                            <code className="select-text font-mono">
                              {endpointPreview.previewUrl}
                            </code>
                          ) : (
                            <span className="text-muted-foreground">
                              Enter a base URL to preview
                            </span>
                          )}
                        </div>
                      </SettingsRow>
                      <SettingsRow label="API Key" description="Optional">
                        <SecretInput
                          value={draft.api_key}
                          onChange={(event) =>
                            setDraft({ ...draft, api_key: event.target.value })
                          }
                          placeholder="sk-..."
                          mono
                          showLabel="Show API key"
                          hideLabel="Hide API key"
                        />
                      </SettingsRow>
                      <SettingsRow
                        label="Headers"
                        description="Optional JSON object"
                      >
                        <div className="space-y-2">
                          <FormTextarea
                            value={draft.headers_text}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                headers_text: event.target.value,
                              })
                            }
                            placeholder={
                              '{\n  "Authorization": "Bearer ..."\n}'
                            }
                            spellCheck={false}
                            className={cn(
                              "min-h-[140px]",
                              parsedHeaders.error
                                ? "border-destructive/30 text-destructive focus-visible:border-destructive/50 focus-visible:ring-destructive/20"
                                : "",
                            )}
                            mono
                          />
                          {parsedHeaders.error ? (
                            <p className="text-[11px] text-destructive">
                              {parsedHeaders.error}
                            </p>
                          ) : null}
                        </div>
                      </SettingsRow>
                      <SettingsRow
                        label="429 Retry Delay"
                        description="Extra wait after HTTP 429"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <FormInput
                              aria-label="429 Retry Delay"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={String(draft.retry_429_delay_seconds)}
                              onChange={(event) => {
                                const nextValue = event.target.value.trim();
                                if (!/^\d+$/.test(nextValue)) {
                                  return;
                                }
                                const parsed = Number.parseInt(nextValue, 10);
                                if (
                                  !Number.isSafeInteger(parsed) ||
                                  parsed < 0
                                ) {
                                  return;
                                }
                                setDraft({
                                  ...draft,
                                  retry_429_delay_seconds: parsed,
                                });
                              }}
                              mono
                            />
                            <span className="text-[13px] font-medium text-muted-foreground">
                              s
                            </span>
                          </div>
                          <p className={formHelpTextClass}>
                            Adds extra wait only when this provider returns HTTP
                            429 and the system continues retrying.
                          </p>
                        </div>
                      </SettingsRow>
                    </div>
                  </div>

                  <div className="border-t border-border pt-8">
                    <SectionHeader
                      title="Models"
                      description="Manage this provider-scoped model catalog, fetch discovered entries, and run model-level tests against the current draft."
                    />

                    <div className="space-y-4 rounded-xl border border-border bg-card/30 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-medium text-foreground/80">
                            {draft.models.length} model
                            {draft.models.length === 1 ? "" : "s"}
                          </p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Fetch discovered models or maintain manual entries
                            in this draft before saving.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={fetchingModels}
                            onClick={() => void handleFetchModels()}
                          >
                            <RefreshCw
                              className={cn(
                                "size-3.5",
                                fetchingModels && "animate-spin",
                              )}
                            />
                            Fetch Models
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={openCreateModelDialog}
                          >
                            <Plus className="size-3.5" />
                            Add Model
                          </Button>
                        </div>
                      </div>

                      {draft.models.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border bg-background/35 px-4 py-5 text-center">
                          <p className="text-[13px] font-medium text-foreground/80">
                            No models in this provider draft
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                            Fetch models from the current draft connection, or
                            add a manual entry.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {draft.models.map((entry) => {
                            const testState = modelTestStates[entry.model];
                            return (
                              <div
                                key={entry.model}
                                className="rounded-xl border border-border bg-background/35 px-4 py-3"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="truncate select-text font-mono text-[13px] text-foreground/85">
                                        {entry.model}
                                      </p>
                                      <span
                                        className={cn(
                                          "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]",
                                          entry.source === "manual"
                                            ? "border-graph-status-idle/20 bg-graph-status-idle/[0.12] text-graph-status-idle"
                                            : "border-graph-status-running/20 bg-graph-status-running/[0.12] text-graph-status-running",
                                        )}
                                      >
                                        {entry.source === "manual"
                                          ? "Manual"
                                          : "Discovered"}
                                      </span>
                                    </div>
                                    <p className="mt-1 select-text text-[11px] leading-relaxed text-muted-foreground">
                                      {buildModelSummary(entry)}
                                    </p>
                                    {testState?.state === "running" ? (
                                      <p className="mt-2 select-text text-[11px] text-muted-foreground">
                                        Testing this model against the current
                                        draft provider...
                                      </p>
                                    ) : null}
                                    {testState?.state === "success" ? (
                                      <p className="mt-2 select-text text-[11px] text-graph-status-running">
                                        Test succeeded in{" "}
                                        {testState.duration_ms}
                                        ms
                                      </p>
                                    ) : null}
                                    {testState?.state === "error" ? (
                                      <p className="mt-2 select-text text-[11px] text-destructive">
                                        {testState.error_summary}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1.5">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      disabled={testState?.state === "running"}
                                      onClick={() =>
                                        void handleTestModel(entry)
                                      }
                                    >
                                      <Play className="size-3.5" />
                                      Test
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openEditModelDialog(entry)}
                                    >
                                      <PencilLine className="size-3.5" />
                                      Edit
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        handleDeleteModel(entry.model)
                                      }
                                    >
                                      <Trash2 className="size-3.5" />
                                      Delete
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {!isCreating && selectedProvider ? (
                    <div className="border-t border-border pt-8">
                      <SettingsRow label="Provider ID" description="Read-only">
                        <div className="select-text rounded-md border border-border bg-card/30 px-3 py-2 font-mono text-[12px] text-foreground/80">
                          {selectedProvider.id}
                        </div>
                      </SettingsRow>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full flex-col items-center justify-center px-6 text-center"
              >
                <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-accent/20 shadow-sm">
                  <Server className="size-5 text-muted-foreground" />
                </div>
                <h3 className="mt-5 text-[15px] font-medium text-foreground">
                  No Provider Selected
                </h3>
                <p className="mt-1.5 max-w-sm text-[13px] text-muted-foreground">
                  Select a provider from the sidebar to edit its connection
                  fields, model catalog, and model tests.
                </p>
              </motion.div>
            )}
          </div>
        </div>

        <ProviderModelDialog
          draft={modelEditorDraft}
          onClose={closeModelDialog}
          onDraftChange={setModelEditorDraft}
          onSave={handleSaveModel}
          state={modelEditorState}
        />

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
                <Button
                  variant="destructive"
                  onClick={() => void handleDelete()}
                >
                  Delete
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageScaffold>
  );
}
