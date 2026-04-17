import "@/styles/App.css";
import { AnimatePresence, motion } from "motion/react";
import {
  KeyRound,
  LoaderCircle,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Suspense, lazy, useState, type ComponentType } from "react";
import { Toaster } from "sonner";
import { ImageViewerProvider } from "@/components/ImageViewer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentProvider, useAgentUI, type PageId } from "@/context/AgentContext";
import { AccessProvider } from "@/context/AccessContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { useAccess } from "@/context/useAccess";
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
const McpPage = lazyPage(() => import("@/pages/McpPage"), "McpPage");
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
  blueprints: BlueprintsPage,
  providers: ProvidersPage,
  mcp: McpPage,
  roles: RolesPage,
  prompts: PromptsPage,
  tools: ToolsPage,
  channels: ChannelsPage,
  stats: StatsPage,
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
  const { logout } = useAccess();
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
            <>
              <button
                type="button"
                aria-label={
                  sidebarOpen ? "Close navigation" : "Open navigation"
                }
                onClick={() => setSidebarDrawerOpen((current) => !current)}
                className="absolute left-3.5 top-3.5 z-30 flex size-9 items-center justify-center rounded-md border border-white/10 bg-black/28 text-white/72 backdrop-blur-xl transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                {sidebarOpen ? (
                  <PanelLeftClose className="size-4" />
                ) : (
                  <PanelLeftOpen className="size-4" />
                )}
              </button>
              <button
                type="button"
                aria-label="Logout"
                onClick={() => {
                  void logout();
                }}
                className="absolute right-3.5 top-3.5 z-30 flex h-9 items-center gap-2 rounded-full border border-white/10 bg-black/28 px-3 text-[12px] font-medium text-white/72 backdrop-blur-xl transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <LogOut className="size-3.5" />
                Logout
              </button>
            </>
          ) : null}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_16%,transparent_84%,rgba(255,255,255,0.012))]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/8" />
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

function normalizeAccessError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Failed to verify access code";
  }
  return error.message.replace(/^Failed to verify access code:\s*/u, "");
}

function AccessGate() {
  const { login, state } = useAccess();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const accessUnavailable = state.requires_restart;
  const description = accessUnavailable
    ? "Access was reset locally. Restart Autopoe to generate a new access code in the startup log."
    : state.bootstrap_generated
      ? "A new access code was generated at startup. Read the local startup log and enter it here to unlock the admin console."
      : "Enter the shared admin access code to unlock the admin console.";

  const handleSubmit = async () => {
    if (accessUnavailable) {
      return;
    }
    if (!code.trim()) {
      setError("Enter an access code");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await login(code);
      setCode("");
    } catch (loginError) {
      setError(normalizeAccessError(loginError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.032),transparent_18%),radial-gradient(circle_at_72%_12%,rgba(255,255,255,0.012),transparent_18%),linear-gradient(180deg,#050505_0%,#070707_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_16%,transparent_86%,rgba(255,255,255,0.012))]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.022] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:20px_20px]" />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10">
        <div className="w-full max-w-[460px] rounded-[1.5rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,17,18,0.96),rgba(11,11,12,0.94))] p-7 shadow-[0_30px_90px_-42px_rgba(0,0,0,0.95),0_16px_38px_-28px_rgba(255,255,255,0.08)] backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/88">
              <KeyRound className="size-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-white/38">
                Access
              </p>
              <h1 className="mt-1 text-[24px] font-medium tracking-[-0.04em] text-white">
                Enter Access Code
              </h1>
            </div>
          </div>

          <p className="mt-5 text-[13px] leading-6 text-white/48">
            {description}
          </p>

          <div className="mt-7 space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="access-code"
                className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/45"
              >
                Access Code
              </label>
              <input
                id="access-code"
                type="password"
                autoComplete="current-password"
                value={code}
                disabled={submitting || accessUnavailable}
                onChange={(event) => setCode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder="Enter access code"
                className="w-full rounded-[1rem] border border-white/[0.08] bg-black/30 px-4 py-3 text-[14px] text-white transition-colors placeholder:text-white/28 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {error ? (
              <p className="text-[12px] leading-5 text-red-200">{error}</p>
            ) : (
              <p className="text-[12px] leading-5 text-white/38">
                This browser stays signed in until you logout or the access code
                changes.
              </p>
            )}

            <button
              type="button"
              disabled={submitting || accessUnavailable}
              onClick={() => void handleSubmit()}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-[13px] font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {submitting ? "Verifying..." : "Unlock"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppShell() {
  const { loading, state } = useAccess();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#050505_0%,#070707_100%)]">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-2 w-32 rounded-full skeleton-shimmer" />
          <p className="text-sm text-muted-foreground">Loading access...</p>
        </div>
      </div>
    );
  }

  if (!state.authenticated) {
    return <AccessGate />;
  }

  return (
    <AgentProvider>
      <ImageViewerProvider>
        <AppContent />
      </ImageViewerProvider>
    </AgentProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AccessProvider>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            className:
              "rounded-md border border-border bg-surface-2 text-foreground shadow-[0_24px_60px_-32px_rgba(0,0,0,0.85)]",
          }}
        />
        <TooltipProvider delayDuration={300}>
          <AppShell />
        </TooltipProvider>
      </AccessProvider>
    </ThemeProvider>
  );
}

export default App;
