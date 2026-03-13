import "@/styles/App.css";
import { AnimatePresence, motion } from "motion/react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentProvider, useAgentUI } from "@/context/AgentContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Sidebar } from "@/components/Sidebar";
import { HomePage } from "@/pages/HomePage";
import { ProvidersPage } from "@/pages/ProvidersPage";
import { PromptsPage } from "@/pages/PromptsPage";
import { RolesPage } from "@/pages/RolesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ToolsPage } from "@/pages/ToolsPage";
import { cn } from "@/lib/utils";
import { usePanelWidth } from "@/hooks/usePanelDrag";

function AppContent() {
  const { currentPage } = useAgentUI();
  const isWorkspace = currentPage === "graph";
  const [sidebarWidth, setSidebarWidth] = usePanelWidth(
    "sidebar-width",
    256,
    180,
    400,
  );

  const renderPage = () => {
    switch (currentPage) {
      case "providers":
        return <ProvidersPage />;
      case "roles":
        return <RolesPage />;
      case "prompts":
        return <PromptsPage />;
      case "tools":
        return <ToolsPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <HomePage />;
    }
  };

  return (
    <div className="relative h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--surface-3),transparent_52%)] opacity-40" />

      <Sidebar width={sidebarWidth} onWidthChange={setSidebarWidth} />

      <main
        className={cn("relative z-10 h-full")}
        style={{ marginLeft: `${sidebarWidth}px` }}
      >
        <div
          className={cn(
            "h-full overflow-hidden",
            isWorkspace ? "bg-glass-bg" : "bg-surface-overlay",
          )}
        >
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              className:
                "rounded-md border border-border bg-surface-2 text-foreground shadow-xl",
            }}
          />
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="h-full"
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AgentProvider>
        <TooltipProvider delayDuration={300}>
          <AppContent />
        </TooltipProvider>
      </AgentProvider>
    </ThemeProvider>
  );
}

export default App;
