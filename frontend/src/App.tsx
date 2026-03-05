import "@/styles/App.css";
import { AnimatePresence, motion } from "motion/react";
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,var(--surface-3),transparent_52%)] opacity-40" />

      <Sidebar />

      <main className={cn("relative z-10 h-full p-2.5", "ml-72")}>
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
