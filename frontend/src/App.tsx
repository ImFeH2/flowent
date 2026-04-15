import "@/styles/App.css";
import { AnimatePresence, motion } from "motion/react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Suspense, lazy, useState, type ComponentType } from "react";
import { Toaster } from "sonner";
import { ImageViewerProvider } from "@/components/ImageViewer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentProvider, useAgentUI, type PageId } from "@/context/AgentContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
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

const HomePage = lazyPage(() => import("@/pages/HomePage"), "HomePage");
const StatsPage = lazyPage(() => import("@/pages/StatsPage"), "StatsPage");
const BlueprintsPage = lazyPage(
  () => import("@/pages/BlueprintsPage"),
  "BlueprintsPage",
);
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

const lazyPageMap: Record<PageId, ComponentType> = {
  workspace: HomePage,
  stats: StatsPage,
  blueprints: BlueprintsPage,
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
  const isWorkspace = currentPage === "workspace";
  const isCompactLayout = useMediaQuery("(max-width: 980px)");
  const [sidebarWidth, setSidebarWidth] = usePanelWidth(
    "sidebar-width",
    232,
    196,
    320,
  );
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);

  const LazyPage = lazyPageMap[currentPage];
  const sidebarOpen = isCompactLayout && sidebarDrawerOpen;

  const renderPage = () => {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <LazyPage />
      </Suspense>
    );
  };

  return (
    <div className="relative h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.032),transparent_18%),radial-gradient(circle_at_72%_12%,rgba(255,255,255,0.012),transparent_18%),linear-gradient(180deg,#050505_0%,#070707_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_16%,transparent_86%,rgba(255,255,255,0.012))]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.022] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:20px_20px]" />

      {isCompactLayout ? (
        <AnimatePresence>
          {sidebarOpen ? (
            <>
              <motion.button
                type="button"
                aria-label="Close navigation"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
                onClick={() => setSidebarDrawerOpen(false)}
              />
              <motion.div
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-y-0 left-0 z-50"
              >
                <Sidebar
                  autoHide
                  width={Math.min(sidebarWidth, 320)}
                  onWidthChange={setSidebarWidth}
                  onNavigate={() => setSidebarDrawerOpen(false)}
                />
              </motion.div>
            </>
          ) : null}
        </AnimatePresence>
      ) : (
        <Sidebar width={sidebarWidth} onWidthChange={setSidebarWidth} />
      )}

      <main
        className="relative z-10 h-full isolate"
        style={
          isCompactLayout
            ? undefined
            : {
                marginLeft: `${sidebarWidth}px`,
                width: `calc(100% - ${sidebarWidth}px)`,
              }
        }
      >
        <div
          className={cn(
            "relative isolate h-full overflow-hidden backdrop-blur-xl [contain:paint]",
            isWorkspace
              ? "bg-[linear-gradient(180deg,rgba(11,11,12,0.9),rgba(9,9,10,0.86))]"
              : "bg-[linear-gradient(180deg,rgba(13,13,14,0.9),rgba(10,10,11,0.88))]",
          )}
        >
          {isCompactLayout ? (
            <button
              type="button"
              aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
              onClick={() => setSidebarDrawerOpen((current) => !current)}
              className="absolute left-3.5 top-3.5 z-30 flex size-9 items-center justify-center rounded-md border border-white/10 bg-black/28 text-white/72 backdrop-blur-xl transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="size-4" />
              ) : (
                <PanelLeftOpen className="size-4" />
              )}
            </button>
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_16%,transparent_84%,rgba(255,255,255,0.012))]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/8" />
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              className:
                "rounded-md border border-border bg-surface-2 text-foreground shadow-[0_24px_60px_-32px_rgba(0,0,0,0.85)]",
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
        <ImageViewerProvider>
          <TooltipProvider delayDuration={300}>
            <AppContent />
          </TooltipProvider>
        </ImageViewerProvider>
      </AgentProvider>
    </ThemeProvider>
  );
}

export default App;
