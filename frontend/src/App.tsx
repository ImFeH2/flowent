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
import {
  ShellBackground,
  ShellSurface,
} from "@/components/layout/ShellBackground";
import { PageLoadingState } from "@/components/layout/PageLoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const shellFloatingButtonClass =
  "z-30 flex items-center justify-center border border-border bg-surface-overlay text-muted-foreground backdrop-blur-xl transition-colors hover:bg-accent/80 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

const accessInputClass =
  "w-full rounded-[1rem] border border-input bg-background/50 px-4 py-3 text-[14px] text-foreground transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

const accessButtonClass =
  "flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-[13px] font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

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
      <Suspense
        fallback={
          <PageLoadingState
            label="Loading page..."
            barClassName="skeleton-shimmer animate-none"
          />
        }
      >
        <LazyPage />
      </Suspense>
    );
  };

  return (
    <ShellBackground variant="app">
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
                className="absolute inset-0 z-40 bg-background/72 backdrop-blur-[2px]"
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
        <ShellSurface
          variant={isWorkspace ? "workspace" : "page"}
          className={cn("h-full backdrop-blur-xl [contain:paint]")}
        >
          {isCompactLayout ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={
                  sidebarOpen ? "Close navigation" : "Open navigation"
                }
                onClick={() => setSidebarDrawerOpen((current) => !current)}
                className={cn(
                  shellFloatingButtonClass,
                  "absolute left-3.5 top-3.5 size-9 rounded-md",
                )}
              >
                {sidebarOpen ? (
                  <PanelLeftClose className="size-4" />
                ) : (
                  <PanelLeftOpen className="size-4" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-label="Logout"
                onClick={() => {
                  void logout();
                }}
                className={cn(
                  shellFloatingButtonClass,
                  "absolute right-3.5 top-3.5 h-9 gap-2 rounded-full px-3 text-[12px] font-medium",
                )}
              >
                <LogOut className="size-3.5" />
                Logout
              </Button>
            </>
          ) : null}
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
        </ShellSurface>
      </main>
    </ShellBackground>
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
    <ShellBackground variant="access">
      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-10">
        <ShellSurface
          variant="access"
          className="w-full max-w-[460px] rounded-2xl border border-border p-7 text-popover-foreground shadow-lg"
        >
          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-accent/40 text-foreground">
                <KeyRound className="size-5" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                  Access
                </p>
                <h1 className="mt-1 text-[24px] font-medium tracking-[-0.04em] text-foreground">
                  Enter Access Code
                </h1>
              </div>
            </div>

            <p className="mt-5 text-[13px] leading-6 text-muted-foreground">
              {description}
            </p>

            <div className="mt-7 space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="access-code"
                  className="text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/72"
                >
                  Access Code
                </label>
                <Input
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
                  className={accessInputClass}
                />
              </div>

              {error ? (
                <p className="text-[12px] leading-5 text-graph-status-error">
                  {error}
                </p>
              ) : (
                <p className="text-[12px] leading-5 text-muted-foreground">
                  This browser stays signed in until you logout or the access
                  code changes.
                </p>
              )}

              <Button
                type="button"
                variant="ghost"
                disabled={submitting || accessUnavailable}
                onClick={() => void handleSubmit()}
                className={accessButtonClass}
              >
                {submitting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {submitting ? "Verifying..." : "Unlock"}
              </Button>
            </div>
          </div>
        </ShellSurface>
      </div>
    </ShellBackground>
  );
}

function AppShell() {
  const { loading, state } = useAccess();

  if (loading) {
    return (
      <ShellBackground
        variant="access"
        className="flex min-h-screen items-center justify-center"
      >
        <PageLoadingState
          label="Loading access..."
          barClassName="skeleton-shimmer animate-none"
        />
      </ShellBackground>
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
              "rounded-md border border-border bg-surface-overlay text-foreground shadow-md",
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
