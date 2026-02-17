import "@/styles/App.css";
import { useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentProvider, useAgent } from "@/context/AgentContext";
import { AgentTree } from "@/components/AgentTree";
import { EventLog } from "@/components/EventLog";
import { Sidebar } from "@/components/Sidebar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { CreateStewardDialog } from "@/components/CreateStewardDialog";

function AppContent() {
  const { eventPanelVisible, toggleEventPanel } = useAgent();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createStewardOpen, setCreateStewardOpen] = useState(false);

  return (
    <>
      <div className="flex h-screen bg-zinc-950 text-zinc-100">
        <Sidebar
          eventPanelVisible={eventPanelVisible}
          onToggleEventPanel={toggleEventPanel}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="flex-1 ml-12">
          <AgentTree onCreateSteward={() => setCreateStewardOpen(true)} />
        </div>
        <EventLog />
      </div>
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
      <CreateStewardDialog
        open={createStewardOpen}
        onClose={() => setCreateStewardOpen(false)}
      />
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          className: "bg-zinc-900 border-zinc-800 text-zinc-100",
        }}
      />
    </>
  );
}

function App() {
  return (
    <AgentProvider>
      <TooltipProvider delayDuration={300}>
        <AppContent />
      </TooltipProvider>
    </AgentProvider>
  );
}

export default App;
