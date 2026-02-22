import "@/styles/App.css";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentProvider, useAgent } from "@/context/AgentContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { Sidebar } from "@/components/Sidebar";
import { HomePage } from "@/pages/HomePage";
import { ProvidersPage } from "@/pages/ProvidersPage";
import { RolesPage } from "@/pages/RolesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { ToolsPage } from "@/pages/ToolsPage";
import { cn } from "@/lib/utils";

function AppContent() {
  const { currentPage } = useAgent();
  const isWorkspace = currentPage === "graph";
  const [workspaceSidebarOpen, setWorkspaceSidebarOpen] = useState(false);

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
    <div className="relative h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(71,85,105,0.22),transparent_58%),radial-gradient(ellipse_at_bottom,rgba(14,116,144,0.14),transparent_62%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.35),rgba(2,6,23,0.86))]" />

      {!isWorkspace && <Sidebar />}

      {isWorkspace && (
        <>
          <div
            className="absolute inset-y-0 left-0 z-30 w-4"
            onMouseEnter={() => setWorkspaceSidebarOpen(true)}
          />

          <button
            onClick={() => setWorkspaceSidebarOpen((prev) => !prev)}
            className="absolute left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/60 text-muted-foreground shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur-lg transition-colors hover:text-foreground"
            title={workspaceSidebarOpen ? "Hide navigation" : "Show navigation"}
          >
            {workspaceSidebarOpen ? (
              <X className="size-4" />
            ) : (
              <Menu className="size-4" />
            )}
          </button>

          <AnimatePresence>
            {workspaceSidebarOpen && (
              <motion.div
                initial={{ x: -280, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -280, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                onMouseLeave={() => setWorkspaceSidebarOpen(false)}
                className="absolute left-4 top-16 z-40 h-[calc(100%-1.75rem)]"
              >
                <Sidebar
                  autoHide
                  onNavigate={() => setWorkspaceSidebarOpen(false)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      <main
        className={cn(
          "relative z-10 h-full p-3",
          isWorkspace ? "ml-0" : "ml-72",
        )}
      >
        <div
          className={cn(
            "h-full overflow-hidden border shadow-2xl",
            isWorkspace
              ? "rounded-[1.75rem] border-white/10 bg-black/65 shadow-[0_40px_120px_rgba(0,0,0,0.65)]"
              : "rounded-2xl border-border/60 bg-card/50",
          )}
        >
          <ThemeAwareToaster />
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

function ThemeAwareToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        className:
          "rounded-xl border border-border bg-card text-foreground shadow-xl",
      }}
    />
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
