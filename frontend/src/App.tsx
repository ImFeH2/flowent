import "@/styles/App.css";
import { useState, type PointerEvent } from "react";
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

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isWorkspace || workspaceSidebarOpen) return;
    if (event.pointerType !== "mouse") return;
    if (event.buttons !== 0) return;
    if (event.clientX <= 12) setWorkspaceSidebarOpen(true);
  };

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
    <div
      className="relative h-screen overflow-hidden bg-background"
      onPointerMove={handlePointerMove}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--surface-3),transparent_52%)] opacity-40" />

      {!isWorkspace && <Sidebar />}

      {isWorkspace && (
        <>
          <button
            type="button"
            onClick={() => setWorkspaceSidebarOpen((prev) => !prev)}
            className="absolute left-4 top-4 z-40 flex h-9 w-9 items-center justify-center rounded-md border border-glass-border bg-surface-overlay text-muted-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-surface-3 hover:text-foreground"
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
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                onMouseLeave={() => setWorkspaceSidebarOpen(false)}
                className="absolute left-4 top-16 bottom-4 z-40"
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
          "relative z-10 h-full p-2.5",
          isWorkspace ? "ml-0" : "ml-72",
        )}
      >
        <div
          className={cn(
            "h-full overflow-hidden rounded-xl border shadow-2xl",
            isWorkspace
              ? "border-glass-border bg-glass-bg shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
              : "border-glass-border bg-surface-overlay shadow-[0_18px_60px_rgba(0,0,0,0.4)]",
          )}
        >
          <ThemeAwareToaster />
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

function ThemeAwareToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      toastOptions={{
        className:
          "rounded-md border border-border bg-surface-2 text-foreground shadow-xl",
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
