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
    availableActiveProviderModels,
    appVersion,
    assistantRole,
    effectiveContextWindowTokens,
    effectiveModelCapabilities,
    handleSave,
    knownSafeInputTokens,
    leaderRole,
    loading,
    providers,
    roles,
    saving,
    settings,
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
            availableActiveProviderModels={availableActiveProviderModels}
            effectiveContextWindowTokens={effectiveContextWindowTokens}
            effectiveModelCapabilities={effectiveModelCapabilities}
            knownSafeInputTokens={knownSafeInputTokens}
            onSettingsChange={updateSettings}
            providers={providers}
            settings={settings}
          />
          <SettingsFooter appVersion={appVersion} />
        </div>
      </div>
    </PageScaffold>
  );
}
