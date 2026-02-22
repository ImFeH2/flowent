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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(120,120,130,0.08),transparent_52%),radial-gradient(ellipse_at_bottom_right,rgba(18,18,22,0.38),transparent_58%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(10,10,12,0.22),rgba(6,6,8,0.94))]" />

      {!isWorkspace && <Sidebar />}

      {isWorkspace && (
        <>
          <button
            type="button"
            aria-label="Reveal navigation"
            className="absolute inset-y-0 left-0 z-30 w-4"
            onMouseEnter={() => setWorkspaceSidebarOpen(true)}
            onFocus={() => setWorkspaceSidebarOpen(true)}
          />

          <button
            type="button"
            onClick={() => setWorkspaceSidebarOpen((prev) => !prev)}
            className="absolute left-4 top-4 z-40 flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-[#10131a]/88 text-muted-foreground shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-colors hover:bg-[#161a24] hover:text-foreground"
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
          "relative z-10 h-full p-2.5",
          isWorkspace ? "ml-0" : "ml-72",
        )}
      >
        <div
          className={cn(
            "h-full overflow-hidden border shadow-2xl",
            isWorkspace
              ? "rounded-xl border-white/10 bg-[#0c0f16]/88 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
              : "rounded-xl border-white/10 bg-[#10131a]/78 shadow-[0_18px_60px_rgba(0,0,0,0.4)]",
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
          "rounded-md border border-border bg-[#121620] text-foreground shadow-xl",
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
