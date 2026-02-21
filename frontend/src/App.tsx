import "@/styles/App.css";
import { useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentProvider, useAgent } from "@/context/AgentContext";
import { AgentTree } from "@/components/AgentTree";
import { EventLog } from "@/components/EventLog";
import { Sidebar } from "@/components/Sidebar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { StewardPanel } from "@/components/StewardPanel";
import { ProvidersPage } from "@/pages/ProvidersPage";
import { RolesPage } from "@/pages/RolesPage";
import { ToolsPage } from "@/pages/ToolsPage";

function AppContent() {
  const { eventPanelVisible, toggleEventPanel, currentPage } = useAgent();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const renderPage = () => {
    switch (currentPage) {
      case "steward":
        return <StewardPanel />;
      case "providers":
        return <ProvidersPage />;
      case "roles":
        return <RolesPage />;
      case "tools":
        return <ToolsPage />;
      default:
        return <AgentTree />;
    }
  };

  return (
    <>
      <div className="flex h-screen bg-zinc-950 text-zinc-100">
        <Sidebar
          eventPanelVisible={eventPanelVisible}
          onToggleEventPanel={toggleEventPanel}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="flex-1 ml-12">{renderPage()}</div>
        <EventLog />
      </div>
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
