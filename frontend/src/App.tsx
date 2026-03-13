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
    <div className="relative h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(48,80,120,0.16),transparent_24%),radial-gradient(circle_at_78%_14%,rgba(255,255,255,0.04),transparent_18%),linear-gradient(180deg,#05070c_0%,#090c12_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_18%,transparent_82%,rgba(255,255,255,0.015))]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]" />

      <Sidebar width={sidebarWidth} onWidthChange={setSidebarWidth} />

      <main
        className="relative z-10 h-full"
        style={{ paddingLeft: `${sidebarWidth}px` }}
      >
        <div
          className={cn(
            "relative h-full overflow-hidden backdrop-blur-xl",
            isWorkspace
              ? "bg-[linear-gradient(180deg,rgba(11,15,24,0.84),rgba(8,11,18,0.8))]"
              : "bg-[linear-gradient(180deg,rgba(14,18,28,0.88),rgba(10,13,20,0.84))]",
          )}
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.024),transparent_18%,transparent_80%,rgba(255,255,255,0.014))]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/8" />
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
              className="relative h-full"
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
