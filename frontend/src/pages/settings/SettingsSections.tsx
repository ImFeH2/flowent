import { Save } from "lucide-react";
import { ModelParamsFields } from "@/components/ModelParamsFields";
import {
  FormInput,
  FormSwitch,
  FormTextarea,
  SecretInput,
  formHelpTextClass,
  formLabelClass,
  formSelectTriggerClass,
} from "@/components/form/FormControls";
import {
  PageTitleBar,
  SectionHeader,
  SettingsRow,
} from "@/components/layout/PageScaffold";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cloneModelParams } from "@/lib/modelParams";
import { providerTypeLabel } from "@/lib/providerTypes";
import { cn } from "@/lib/utils";
import {
  nullableBoolFromTriState,
  triStateFromNullableBool,
  type TriStateCapability,
  type UserSettings,
} from "@/pages/settings/lib";
import type {
  AccessDraft,
  UpdateAccessDraft,
  UpdateSettings,
} from "@/pages/settings/useSettingsPageState";
import type { Provider, RetryPolicy, Role } from "@/types";

const retryPolicyOptions: Array<{ value: RetryPolicy; label: string }> = [
  { value: "no_retry", label: "No retry" },
  { value: "limited", label: "Limited" },
  { value: "unlimited", label: "Unlimited" },
];

interface SettingsHeaderProps {
  accessDraftError: string | null;
  onSave: () => void;
  saving: boolean;
  settings: UserSettings;
}

export function SettingsHeader({
  accessDraftError,
  onSave,
  saving,
  settings,
}: SettingsHeaderProps) {
  return (
    <PageTitleBar
      title="Settings"
      actions={
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={
            saving || Boolean(accessDraftError) || !settings.working_dir.trim()
          }
          className="text-[13px]"
        >
          <Save className="size-4" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      }
      className="mb-8"
    />
  );
}

interface AccessConfigurationSectionProps {
  accessDraft: AccessDraft;
  accessDraftError: string | null;
  onAccessDraftChange: UpdateAccessDraft;
}

export function AccessConfigurationSection({
  accessDraft,
  accessDraftError,
  onAccessDraftChange,
}: AccessConfigurationSectionProps) {
  return (
    <section>
      <SectionHeader title="Access Configuration" />
      <div className="space-y-6">
        <div className="space-y-2">
          <label htmlFor="new-access-code" className={formLabelClass}>
            New Access Code
          </label>
          <SecretInput
            id="new-access-code"
            value={accessDraft.newCode}
            onChange={(event) =>
              onAccessDraftChange((current) => ({
                ...current,
                newCode: event.target.value,
              }))
            }
            placeholder="Leave empty to keep the current access code"
            showLabel="Show new access code"
            hideLabel="Hide new access code"
            buttonSize="default"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="confirm-access-code" className={formLabelClass}>
            Confirm Access Code
          </label>
          <SecretInput
            id="confirm-access-code"
            value={accessDraft.confirmCode}
            onChange={(event) =>
              onAccessDraftChange((current) => ({
                ...current,
                confirmCode: event.target.value,
              }))
            }
            placeholder="Repeat the new access code"
            showLabel="Show confirmed access code"
            hideLabel="Hide confirmed access code"
            buttonSize="default"
          />
        </div>

        <div className={cn("space-y-2", formHelpTextClass)}>
          {accessDraftError ? (
            <p className="text-destructive">{accessDraftError}</p>
          ) : null}
          <p>
            Saving a new access code signs out all current admin sessions. You
            will need to unlock the admin console again with the new code.
          </p>
          <p>
            If no access code is configured, Autopoe generates one at startup.
            The current access code is written to the local startup log on every
            startup and is never shown here.
          </p>
        </div>
      </div>
    </section>
  );
}

interface PathConfigurationSectionProps {
  onSettingsChange: UpdateSettings;
  settings: UserSettings;
}

export function PathConfigurationSection({
  onSettingsChange,
  settings,
}: PathConfigurationSectionProps) {
  return (
    <section className="mt-12 border-t border-border pt-8">
      <SectionHeader title="Path Configuration" />
      <div className="border border-dashed border-border rounded-lg bg-card/30">
        <SettingsRow
          label="App Data Directory"
          description="Instance storage root"
        >
          <div className="space-y-2">
            <FormInput
              aria-label="App Data Directory"
              value={settings.app_data_dir}
              readOnly
              mono
            />
            <div className={cn("space-y-2", formHelpTextClass)}></div>
          </div>
        </SettingsRow>

        <SettingsRow
          label="Working Directory"
          description="Default system task root"
        >
          <div className="space-y-2">
            <FormInput
              aria-label="Working Directory"
              value={settings.working_dir}
              onChange={(event) =>
                onSettingsChange((current) => ({
                  ...current,
                  working_dir: event.target.value,
                }))
              }
              placeholder="/workspace/project"
              mono
            />
            <div className={cn("space-y-2", formHelpTextClass)}>
              {!settings.working_dir.trim() ? (
                <p className="text-destructive">
                  Working Directory must not be empty.
                </p>
              ) : null}
            </div>
          </div>
        </SettingsRow>
      </div>
    </section>
  );
}

interface AssistantConfigurationSectionProps {
  assistantRole: Role | null;
  onSettingsChange: UpdateSettings;
  roles: Role[];
  settings: UserSettings;
}

export function AssistantConfigurationSection({
  assistantRole,
  onSettingsChange,
  roles,
  settings,
}: AssistantConfigurationSectionProps) {
  return (
    <section className="mt-12 border-t border-border pt-8">
      <SectionHeader title="Assistant Configuration" />
      <div className="border border-dashed border-border rounded-lg bg-card/30">
        <SettingsRow label="Assistant Role" description="System role">
          <Select
            value={settings.assistant.role_name}
            onValueChange={(value) =>
              onSettingsChange((current) => ({
                ...current,
                assistant: {
                  ...current.assistant,
                  role_name: value,
                },
              }))
            }
          >
            <SelectTrigger className={formSelectTriggerClass}>
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.name} value={role.name}>
                  <div className="flex min-w-0 flex-col items-start">
                    <span>{role.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {role.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {assistantRole ? (
            <div
              data-testid="assistant-role-guidance"
              className={cn("mt-2 space-y-2", formHelpTextClass)}
            >
              <p>{assistantRole.description}</p>
              <p>
                This role only changes the Assistant&apos;s behavior template.
                Regardless of the selected role, Assistant remains the system
                default entry and task boundary manager.
              </p>
            </div>
          ) : null}
        </SettingsRow>

        <SettingsRow
          label="Network Access"
          description="Hard network permission boundary"
        >
          <div className="space-y-2">
            <FormSwitch
              checked={settings.assistant.allow_network}
              label="Network Access"
              onCheckedChange={(nextValue) =>
                onSettingsChange((current) => ({
                  ...current,
                  assistant: {
                    ...current.assistant,
                    allow_network: nextValue,
                  },
                }))
              }
              showStateText
            />
            <p className={formHelpTextClass}>
              When disabled, the Assistant cannot make networked tool calls even
              if its role still includes network-capable tools.
            </p>
          </div>
        </SettingsRow>

        <SettingsRow
          label="Write Dirs"
          description="Writable directory boundaries"
        >
          <div className="space-y-2">
            <FormTextarea
              aria-label="Write Dirs"
              value={settings.assistant.write_dirs.join("\n")}
              onChange={(event) =>
                onSettingsChange((current) => ({
                  ...current,
                  assistant: {
                    ...current.assistant,
                    write_dirs: event.target.value.split("\n"),
                  },
                }))
              }
              rows={4}
              spellCheck={false}
              placeholder="/workspace/output"
              className="min-h-[108px]"
              mono
            />
            <p className={formHelpTextClass}>
              One directory per line. Empty lines are ignored. These paths bound
              both the Assistant&apos;s own writes and the maximum write access
              it can delegate to execution chains.
            </p>
          </div>
        </SettingsRow>
      </div>
    </section>
  );
}

interface LeaderConfigurationSectionProps {
  leaderRole: Role | null;
  onSettingsChange: UpdateSettings;
  roles: Role[];
  settings: UserSettings;
}

export function LeaderConfigurationSection({
  leaderRole,
  onSettingsChange,
  roles,
  settings,
}: LeaderConfigurationSectionProps) {
  return (
    <section className="mt-12 border-t border-border pt-8">
      <SectionHeader title="Leader Configuration" />
      <div className="border border-dashed border-border rounded-lg bg-card/30">
        <SettingsRow
          label="Leader Role"
          description="Default workflow owner role"
        >
          <Select
            value={settings.leader.role_name}
            onValueChange={(value) =>
              onSettingsChange((current) => ({
                ...current,
                leader: {
                  role_name: value,
                },
              }))
            }
          >
            <SelectTrigger className={formSelectTriggerClass}>
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.name} value={role.name}>
                  <div className="flex min-w-0 flex-col items-start">
                    <span>{role.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {role.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {leaderRole ? (
            <p className={cn("mt-2", formHelpTextClass)}>
              {leaderRole.description}
            </p>
          ) : null}
        </SettingsRow>
      </div>
    </section>
  );
}

interface ModelConfigurationSectionProps {
  activeProvider: Provider | null;
  activeProviderModels: Provider["models"];
  availableActiveProviderModels: Provider["models"];
  effectiveContextWindowTokens: number | null;
  effectiveModelCapabilities: {
    input_image: boolean;
    output_image: boolean;
  };
  knownSafeInputTokens: number | null;
  onSettingsChange: UpdateSettings;
  providers: Provider[];
  settings: UserSettings;
}

export function ModelConfigurationSection({
  activeProvider,
  activeProviderModels,
  availableActiveProviderModels,
  effectiveContextWindowTokens,
  effectiveModelCapabilities,
  knownSafeInputTokens,
  onSettingsChange,
  providers,
  settings,
}: ModelConfigurationSectionProps) {
  return (
    <section className="mt-12 border-t border-border pt-8">
      <SectionHeader title="Model Configuration" />
      <div className="border border-dashed border-border rounded-lg bg-card/30">
        <SettingsRow
          label="Active Provider"
          description="Used when roles do not override"
        >
          <Select
            value={settings.model.active_provider_id}
            onValueChange={(value) => {
              onSettingsChange((current) => ({
                ...current,
                model: {
                  ...current.model,
                  active_provider_id: value,
                  active_model: "",
                },
              }));
            }}
          >
            <SelectTrigger className={formSelectTriggerClass}>
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name} ({providerTypeLabel(provider.type)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeProvider ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Using {activeProvider.name} ({activeProvider.base_url})
            </p>
          ) : null}
        </SettingsRow>

        <SettingsRow label="Model" description="Catalog or manual ID">
          <div className="space-y-3">
            {settings.model.active_provider_id ? (
              activeProviderModels.length > 0 ? (
                <div className="space-y-2">
                  <label className={formLabelClass}>Provider Models</label>
                  <Select
                    value={
                      availableActiveProviderModels.some(
                        (model) => model.model === settings.model.active_model,
                      )
                        ? settings.model.active_model
                        : undefined
                    }
                    onValueChange={(value) =>
                      onSettingsChange((current) => ({
                        ...current,
                        model: {
                          ...current.model,
                          active_model: value,
                        },
                      }))
                    }
                  >
                    <SelectTrigger className={formSelectTriggerClass}>
                      <SelectValue placeholder="Select a provider model" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableActiveProviderModels.map((model) => (
                        <SelectItem key={model.model} value={model.model}>
                          {model.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className={formHelpTextClass}>
                  No saved provider models. Manage this catalog in Providers, or
                  enter a model ID manually below.
                </p>
              )
            ) : null}

            <FormInput
              value={settings.model.active_model}
              onChange={(event) =>
                onSettingsChange((current) => ({
                  ...current,
                  model: {
                    ...current.model,
                    active_model: event.target.value,
                  },
                }))
              }
              placeholder={
                settings.model.active_provider_id
                  ? "Enter model ID manually"
                  : "Select a provider first"
              }
            />
          </div>
          {settings.model.active_model ? (
            <div className={cn("mt-2 space-y-1", formHelpTextClass)}>
              <p>
                Context window:{" "}
                {effectiveContextWindowTokens
                  ? effectiveContextWindowTokens.toLocaleString()
                  : "Not resolved"}
              </p>
              <p>
                Capabilities: input_image=
                {effectiveModelCapabilities.input_image ? "true" : "false"},
                output_image=
                {effectiveModelCapabilities.output_image ? "true" : "false"}
              </p>
            </div>
          ) : null}
        </SettingsRow>

        <SettingsRow
          label="Model Metadata Overrides"
          description="Explicit active-model capability and limit overrides"
        >
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label
                  htmlFor="model-context-window"
                  className={formLabelClass}
                >
                  Context Window
                </label>
                <div className="flex items-center gap-2">
                  <FormInput
                    id="model-context-window"
                    aria-label="Context Window"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={
                      settings.model.context_window_tokens === null
                        ? ""
                        : String(settings.model.context_window_tokens)
                    }
                    onChange={(event) => {
                      const nextValue = event.target.value.trim();
                      if (!/^\d*$/.test(nextValue)) {
                        return;
                      }
                      if (nextValue && Number.parseInt(nextValue, 10) <= 0) {
                        return;
                      }
                      onSettingsChange((current) => ({
                        ...current,
                        model: {
                          ...current.model,
                          context_window_tokens: nextValue
                            ? Number.parseInt(nextValue, 10)
                            : null,
                        },
                      }));
                    }}
                    placeholder="Auto"
                    mono
                  />
                  <span className="text-[13px] font-medium text-muted-foreground">
                    tokens
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label className={formLabelClass}>Input Image</label>
                <Select
                  value={triStateFromNullableBool(settings.model.input_image)}
                  onValueChange={(value: TriStateCapability) =>
                    onSettingsChange((current) => ({
                      ...current,
                      model: {
                        ...current.model,
                        input_image: nullableBoolFromTriState(value),
                      },
                    }))
                  }
                >
                  <SelectTrigger
                    aria-label="Input Image"
                    className={formSelectTriggerClass}
                  >
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className={formLabelClass}>Output Image</label>
                <Select
                  value={triStateFromNullableBool(settings.model.output_image)}
                  onValueChange={(value: TriStateCapability) =>
                    onSettingsChange((current) => ({
                      ...current,
                      model: {
                        ...current.model,
                        output_image: nullableBoolFromTriState(value),
                      },
                    }))
                  }
                >
                  <SelectTrigger
                    aria-label="Output Image"
                    className={formSelectTriggerClass}
                  >
                    <SelectValue placeholder="Auto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto</SelectItem>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <p className={formHelpTextClass}>
              These fields override the resolved metadata for the current active
              model only. Auto keeps using the catalog result or other resolved
              metadata instead of forcing a value.
            </p>
          </div>
        </SettingsRow>

        <SettingsRow
          label="Default Model Parameters"
          valueClassName="w-full md:w-80"
        >
          <div className="rounded-xl border border-border bg-card/30 p-5">
            <ModelParamsFields
              className="w-full"
              value={cloneModelParams(settings.model.params)}
              onChange={(params) =>
                onSettingsChange((current) => ({
                  ...current,
                  model: {
                    ...current.model,
                    params,
                  },
                }))
              }
              emptyLabel="Not set"
              numberPlaceholder="Not set"
              reasoningDisableLabel={null}
              helperText="Empty fields are omitted from outgoing provider requests. Reasoning effort and verbosity are mainly effective on reasoning-capable providers such as OpenAI Responses with GPT-5 family models."
            />
          </div>
        </SettingsRow>

        <SettingsRow
          label="Request Timeout"
          description="Single attempt budget"
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FormInput
                aria-label="Request Timeout"
                inputMode="numeric"
                pattern="[0-9]*"
                value={String(settings.model.timeout_ms)}
                onChange={(event) => {
                  const nextValue = event.target.value.trim();
                  if (!/^\d+$/.test(nextValue)) {
                    return;
                  }
                  const parsed = Number.parseInt(nextValue, 10);
                  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
                    return;
                  }
                  onSettingsChange((current) => ({
                    ...current,
                    model: {
                      ...current.model,
                      timeout_ms: parsed,
                    },
                  }));
                }}
                mono
              />
              <span className="text-[13px] font-medium text-muted-foreground">
                ms
              </span>
            </div>
            <p className={formHelpTextClass}>
              Applies to a single LLM request attempt. Default is 10000ms.
              Automatic retries can still make the full call take longer.
            </p>
          </div>
        </SettingsRow>

        <SettingsRow
          label="Retry Policy"
          description="Transient error behavior"
        >
          <div className="space-y-3">
            <Select
              value={settings.model.retry_policy}
              onValueChange={(value: RetryPolicy) =>
                onSettingsChange((current) => ({
                  ...current,
                  model: {
                    ...current.model,
                    retry_policy: value,
                  },
                }))
              }
            >
              <SelectTrigger className={formSelectTriggerClass}>
                <SelectValue placeholder="Select a retry policy" />
              </SelectTrigger>
              <SelectContent>
                {retryPolicyOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {settings.model.retry_policy === "limited" ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label htmlFor="retry-attempts" className={formLabelClass}>
                    Retry Attempts
                  </label>
                  <FormInput
                    id="retry-attempts"
                    aria-label="Retry Attempts"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={String(settings.model.max_retries)}
                    onChange={(event) => {
                      const nextValue = event.target.value.trim();
                      if (!/^\d+$/.test(nextValue)) {
                        return;
                      }
                      const parsed = Number.parseInt(nextValue, 10);
                      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
                        return;
                      }
                      onSettingsChange((current) => ({
                        ...current,
                        model: {
                          ...current.model,
                          max_retries: parsed,
                        },
                      }));
                    }}
                    mono
                  />
                </div>
              </div>
            ) : null}

            <p className={formHelpTextClass}>
              No retry fails immediately on transient errors. Limited retries
              automatically up to the configured attempt count. Unlimited keeps
              retrying transient failures until success, interruption, or a
              non-transient error.
            </p>
          </div>
        </SettingsRow>

        <SettingsRow
          label="Retry Backoff"
          description="Global exponential backoff"
        >
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="retry-initial-delay" className={formLabelClass}>
                  Initial Delay
                </label>
                <div className="flex items-center gap-2">
                  <FormInput
                    id="retry-initial-delay"
                    aria-label="Initial Delay"
                    inputMode="decimal"
                    value={String(settings.model.retry_initial_delay_seconds)}
                    onChange={(event) => {
                      const nextValue = event.target.value.trim();
                      if (!/^\d+(\.\d+)?$/.test(nextValue)) {
                        return;
                      }
                      const parsed = Number.parseFloat(nextValue);
                      if (!Number.isFinite(parsed) || parsed <= 0) {
                        return;
                      }
                      onSettingsChange((current) => ({
                        ...current,
                        model: {
                          ...current.model,
                          retry_initial_delay_seconds: parsed,
                        },
                      }));
                    }}
                    mono
                  />
                  <span className="text-[13px] font-medium text-muted-foreground">
                    s
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="retry-max-delay" className={formLabelClass}>
                  Max Delay
                </label>
                <div className="flex items-center gap-2">
                  <FormInput
                    id="retry-max-delay"
                    aria-label="Max Delay"
                    inputMode="decimal"
                    value={String(settings.model.retry_max_delay_seconds)}
                    onChange={(event) => {
                      const nextValue = event.target.value.trim();
                      if (!/^\d+(\.\d+)?$/.test(nextValue)) {
                        return;
                      }
                      const parsed = Number.parseFloat(nextValue);
                      if (!Number.isFinite(parsed) || parsed <= 0) {
                        return;
                      }
                      onSettingsChange((current) => ({
                        ...current,
                        model: {
                          ...current.model,
                          retry_max_delay_seconds: parsed,
                        },
                      }));
                    }}
                    mono
                  />
                  <span className="text-[13px] font-medium text-muted-foreground">
                    s
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="retry-backoff-cap-retries"
                  className={formLabelClass}
                >
                  Cap Retries
                </label>
                <FormInput
                  id="retry-backoff-cap-retries"
                  aria-label="Cap Retries"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={String(settings.model.retry_backoff_cap_retries)}
                  onChange={(event) => {
                    const nextValue = event.target.value.trim();
                    if (!/^\d+$/.test(nextValue)) {
                      return;
                    }
                    const parsed = Number.parseInt(nextValue, 10);
                    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
                      return;
                    }
                    onSettingsChange((current) => ({
                      ...current,
                      model: {
                        ...current.model,
                        retry_backoff_cap_retries: parsed,
                      },
                    }));
                  }}
                  mono
                />
              </div>
            </div>

            <p className={formHelpTextClass}>
              Retries use exponential backoff from Initial Delay, stop doubling
              after Cap Retries, and never exceed Max Delay.
            </p>
          </div>
        </SettingsRow>

        <SettingsRow
          label="Automatic Compact"
          description="Token-limit based preflight execution-context compaction"
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <label
                htmlFor="auto-compact-token-limit"
                className={formLabelClass}
              >
                Token Limit
              </label>
              <div className="flex items-center gap-2">
                <FormInput
                  id="auto-compact-token-limit"
                  aria-label="Automatic Compact Token Limit"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={
                    settings.model.auto_compact_token_limit === null
                      ? ""
                      : String(settings.model.auto_compact_token_limit)
                  }
                  onChange={(event) => {
                    const nextValue = event.target.value.trim();
                    if (!/^\d*$/.test(nextValue)) {
                      return;
                    }
                    if (nextValue && Number.parseInt(nextValue, 10) <= 0) {
                      return;
                    }
                    onSettingsChange((current) => ({
                      ...current,
                      model: {
                        ...current.model,
                        auto_compact_token_limit: nextValue
                          ? Number.parseInt(nextValue, 10)
                          : null,
                      },
                    }));
                  }}
                  placeholder="Disabled"
                  mono
                />
                <span className="text-[13px] font-medium text-muted-foreground">
                  tokens
                </span>
              </div>
            </div>

            <p className={formHelpTextClass}>
              Automatic compact is triggered by the latest successful API usage
              baseline plus any locally added tail context after that response.
              Leave this empty to disable automatic <code>/compact</code>.
            </p>
            {knownSafeInputTokens !== null ? (
              <p className={formHelpTextClass}>
                Known safe input window: {knownSafeInputTokens.toLocaleString()}{" "}
                tokens.
                {settings.model.auto_compact_token_limit !== null &&
                settings.model.auto_compact_token_limit >= knownSafeInputTokens
                  ? " Save is blocked until the token limit is lower than this window."
                  : null}
              </p>
            ) : settings.model.auto_compact_token_limit !== null ? (
              <p className="text-[11px] leading-relaxed text-graph-status-idle">
                The current model window is not resolved, so this token limit
                can be saved but cannot be fully validated yet.
              </p>
            ) : null}
          </div>
        </SettingsRow>
      </div>
    </section>
  );
}

interface SettingsFooterProps {
  appVersion: string | null;
}

export function SettingsFooter({ appVersion }: SettingsFooterProps) {
  return (
    <div className="mt-10 flex flex-col items-center border-t border-border pt-6 text-center">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Autopoe Agent Studio v{appVersion ?? "—"}
      </p>
      <p className="mt-1.5 text-[10px] text-muted-foreground/80">
        A multi-agent collaboration framework.
      </p>
    </div>
  );
}
