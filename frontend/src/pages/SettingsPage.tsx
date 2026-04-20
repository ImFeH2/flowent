import { PageScaffold } from "@/components/layout/PageScaffold";
import { PageLoadingState } from "@/components/layout/PageLoadingState";
import {
  AccessConfigurationSection,
  AssistantConfigurationSection,
  LeaderConfigurationSection,
  ModelConfigurationSection,
  PathConfigurationSection,
  SettingsFooter,
  SettingsHeader,
} from "@/pages/settings/SettingsSections";
import { useSettingsPageState } from "@/pages/settings/useSettingsPageState";

export function SettingsPage() {
  const {
    accessDraft,
    accessDraftError,
    activeProvider,
    activeProviderModels,
    appVersion,
    assistantRole,
    effectiveContextWindowTokens,
    effectiveModelCapabilities,
    filteredActiveProviderModels,
    handleSave,
    knownSafeInputTokens,
    leaderRole,
    loading,
    providerModelQuery,
    providers,
    roles,
    saving,
    settings,
    setProviderModelQuery,
    updateAccessDraft,
    updateSettings,
  } = useSettingsPageState();

  if (loading || !settings) {
    return (
      <PageLoadingState
        label="Loading settings..."
        textClassName="text-[13px]"
      />
    );
  }

  return (
    <PageScaffold>
      <div className="h-full min-h-0 overflow-y-auto pr-2 scrollbar-none">
        <div className="mx-auto max-w-[680px] pb-10 pt-6">
          <SettingsHeader
            accessDraftError={accessDraftError}
            onSave={() => {
              void handleSave();
            }}
            saving={saving}
            settings={settings}
          />
          <AccessConfigurationSection
            accessDraft={accessDraft}
            accessDraftError={accessDraftError}
            onAccessDraftChange={updateAccessDraft}
          />
          <PathConfigurationSection
            onSettingsChange={updateSettings}
            settings={settings}
          />
          <AssistantConfigurationSection
            assistantRole={assistantRole}
            onSettingsChange={updateSettings}
            roles={roles}
            settings={settings}
          />
          <LeaderConfigurationSection
            leaderRole={leaderRole}
            onSettingsChange={updateSettings}
            roles={roles}
            settings={settings}
          />
          <ModelConfigurationSection
            activeProvider={activeProvider}
            activeProviderModels={activeProviderModels}
            effectiveContextWindowTokens={effectiveContextWindowTokens}
            effectiveModelCapabilities={effectiveModelCapabilities}
            filteredActiveProviderModels={filteredActiveProviderModels}
            knownSafeInputTokens={knownSafeInputTokens}
            onProviderModelQueryChange={setProviderModelQuery}
            onSettingsChange={updateSettings}
            providerModelQuery={providerModelQuery}
            providers={providers}
            settings={settings}
          />
          <SettingsFooter appVersion={appVersion} />
        </div>
      </div>
    </PageScaffold>
  );
}
