import "@/styles/App.css";
import { useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentProvider, useAgent } from "@/context/AgentContext";
import { AgentTree } from "@/components/AgentTree";
import { EventLog } from "@/components/EventLog";
import { PathAccessDialog } from "@/components/PathAccessDialog";
import { Sidebar } from "@/components/Sidebar";
import { SettingsDialog } from "@/components/SettingsDialog";

function AppContent() {
  const { eventPanelVisible, toggleEventPanel } = useAgent();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <div className="flex h-screen bg-zinc-950 text-zinc-100">
        <Sidebar
          eventPanelVisible={eventPanelVisible}
          onToggleEventPanel={toggleEventPanel}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="flex-1 ml-12">
          <AgentTree />
        </div>
        <EventLog />
      </div>
      <PathAccessDialog />
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
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
