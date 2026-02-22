import "@/styles/App.css";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentProvider, useAgent } from "@/context/AgentContext";
import { EventLog } from "@/components/EventLog";
import { Sidebar } from "@/components/Sidebar";
import { HomePage } from "@/pages/HomePage";
import { ProvidersPage } from "@/pages/ProvidersPage";
import { RolesPage } from "@/pages/RolesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ToolsPage } from "@/pages/ToolsPage";

function AppContent() {
  const { eventPanelVisible, toggleEventPanel, currentPage } = useAgent();

  const renderPage = () => {
    switch (currentPage) {
      case "providers":
        return <ProvidersPage />;
      case "roles":
        return <RolesPage />;
      case "tools":
        return <ToolsPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <>
      <div className="flex h-screen bg-zinc-950 text-zinc-100">
        <Sidebar
          eventPanelVisible={eventPanelVisible}
          onToggleEventPanel={toggleEventPanel}
        />
        <div className="ml-64 flex-1">{renderPage()}</div>
        <EventLog />
      </div>
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
