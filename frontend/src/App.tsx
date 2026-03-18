import "@/styles/App.css";
import { AnimatePresence, motion } from "motion/react";
import { Suspense, lazy, type ComponentType } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentProvider, useAgentUI, type PageId } from "@/context/AgentContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Sidebar } from "@/components/Sidebar";
import { HomePage } from "@/pages/HomePage";
import { cn } from "@/lib/utils";
import { usePanelWidth } from "@/hooks/usePanelDrag";

function lazyPage<TModule, TKey extends keyof TModule & string>(
  loader: () => Promise<TModule>,
  exportName: TKey,
) {
  return lazy(async () => {
    const module = await loader();
    return {
      default: module[exportName] as ComponentType,
    };
  });
}

const ProvidersPage = lazyPage(
  () => import("@/pages/ProvidersPage"),
  "ProvidersPage",
);
const RolesPage = lazyPage(() => import("@/pages/RolesPage"), "RolesPage");
const PromptsPage = lazyPage(
  () => import("@/pages/PromptsPage"),
  "PromptsPage",
);
const ToolsPage = lazyPage(() => import("@/pages/ToolsPage"), "ToolsPage");
const ChannelsPage = lazyPage(
  () => import("@/pages/ChannelsPage"),
  "ChannelsPage",
);
const SettingsPage = lazyPage(
  () => import("@/pages/SettingsPage"),
  "SettingsPage",
);

const lazyPageMap: Partial<Record<PageId, ComponentType>> = {
  providers: ProvidersPage,
  roles: RolesPage,
  prompts: PromptsPage,
  tools: ToolsPage,
  channels: ChannelsPage,
  settings: SettingsPage,
};

function PageLoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-2 w-32 rounded-full skeleton-shimmer" />
        <p className="text-sm text-muted-foreground">Loading page...</p>
      </div>
    </div>
  );
}

function AppContent() {
  const { currentPage } = useAgentUI();
  const isWorkspace = currentPage === "graph";
  const [sidebarWidth, setSidebarWidth] = usePanelWidth(
    "sidebar-width",
    256,
    180,
    400,
  );

  const LazyPage = lazyPageMap[currentPage];

  const renderPage = () => {
    if (!LazyPage) {
      return <HomePage />;
    }

    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <LazyPage />
      </Suspense>
    );
  };

  return (
    <div className="relative h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.042),transparent_22%),radial-gradient(circle_at_78%_14%,rgba(255,255,255,0.022),transparent_18%),linear-gradient(180deg,#040404_0%,#080808_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),transparent_18%,transparent_82%,rgba(255,255,255,0.015))]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:24px_24px]" />

      <Sidebar width={sidebarWidth} onWidthChange={setSidebarWidth} />

      <main
        className="relative z-10 h-full isolate"
        style={{
          marginLeft: `${sidebarWidth}px`,
          width: `calc(100% - ${sidebarWidth}px)`,
        }}
      >
        <div
          className={cn(
            "relative isolate h-full overflow-hidden backdrop-blur-xl [contain:paint]",
            isWorkspace
              ? "bg-[linear-gradient(180deg,rgba(11,11,12,0.88),rgba(9,9,10,0.84))]"
              : "bg-[linear-gradient(180deg,rgba(15,15,16,0.92),rgba(10,10,11,0.88))]",
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
