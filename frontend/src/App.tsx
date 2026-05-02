import "@/styles/App.css";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  KeyRound,
  LoaderCircle,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
} from "lucide-react";
import {
  Suspense,
  lazy,
  useState,
  type ComponentType,
  type FormEvent,
} from "react";
import { Toaster } from "sonner";
import { SecretInput } from "@/components/form/FormControls";
import { ImageViewerProvider } from "@/components/ImageViewer";
import { Sidebar } from "@/components/Sidebar";
import {
  ShellBackground,
  ShellSurface,
} from "@/components/layout/ShellBackground";
import { PageLoadingState } from "@/components/layout/PageLoadingState";
import { ShellHeader } from "@/components/layout/ShellHeader";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentProvider, useAgentUI, type PageId } from "@/context/AgentContext";
import { AccessProvider } from "@/context/AccessContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { useAccess } from "@/context/useAccess";
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
const AssistantPage = lazyPage(
  () => import("@/pages/AssistantPage"),
  "AssistantPage",
);
const StatsPage = lazyPage(() => import("@/pages/StatsPage"), "StatsPage");
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
  assistant: AssistantPage,
  workspace: HomePage,
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
  "h-12 w-full rounded-xl border border-input bg-background/55 px-4 pr-12 font-mono text-[15px] text-foreground transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground focus:bg-background/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

const accessButtonClass =
  "flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-[13px] font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50";

const accessHintClass =
  "rounded-xl border border-border/80 bg-background/35 px-3.5 py-3 text-[12px] leading-5 text-muted-foreground";

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

  const pageContent = (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentPage}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        className="relative h-full"
      >
        {isWorkspace ? (
          renderPage()
        ) : (
          <div className="mx-auto flex h-full w-full max-w-[1320px] min-h-0 flex-col px-4 sm:px-6 lg:px-8">
            <ShellHeader
              compact={isCompactLayout}
              onOpenNavigation={() => setSidebarDrawerOpen(true)}
            />
            <div className="min-h-0 flex-1">{renderPage()}</div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );

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
        {isWorkspace ? (
          <ShellSurface
            variant="workspace"
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
            {pageContent}
          </ShellSurface>
        ) : (
          <div className="h-full [contain:paint]">{pageContent}</div>
        )}
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
    ? "Access was reset locally. Restart Flowent to generate a new access code in the startup log."
    : "Use the access code printed in the local startup log to continue.";

  const handleSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (accessUnavailable) {
      return;
    }
    if (!code.trim()) {
      setError("Enter the access code from the startup log");
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
          className="w-full max-w-[440px] rounded-2xl border border-border p-6 text-popover-foreground shadow-lg sm:p-7"
        >
          <motion.form
            className="relative z-10"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div className="flex items-start gap-3.5">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-accent/40 text-foreground">
                <KeyRound className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-medium tracking-normal text-muted-foreground">
                  Flowent
                </p>
                <h1 className="mt-1 text-[24px] font-medium tracking-normal text-foreground">
                  Enter Access Code
                </h1>
              </div>
            </div>

            <p
              id="access-code-description"
              className="mt-5 text-[13px] leading-6 text-muted-foreground"
            >
              {description}
            </p>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="access-code"
                  className="text-[12px] font-medium text-foreground/80"
                >
                  Access Code
                </label>
                <SecretInput
                  id="access-code"
                  autoFocus={!accessUnavailable}
                  autoCapitalize="none"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={code}
                  disabled={submitting || accessUnavailable}
                  aria-describedby="access-code-description access-code-feedback"
                  aria-invalid={Boolean(error)}
                  onChange={(event) => {
                    setCode(event.target.value);
                    if (error) {
                      setError("");
                    }
                  }}
                  placeholder="Enter access code"
                  showLabel="Show access code"
                  hideLabel="Hide access code"
                  buttonSize="default"
                  mono
                  className={accessInputClass}
                />
              </div>

              <AnimatePresence mode="wait" initial={false}>
                {error ? (
                  <motion.p
                    key="error"
                    id="access-code-feedback"
                    role="alert"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.16 }}
                    className="rounded-xl border border-graph-status-error/30 bg-graph-status-error/10 px-3.5 py-3 text-[12px] leading-5 text-graph-status-error"
                  >
                    {error}
                  </motion.p>
                ) : (
                  <motion.div
                    key="hint"
                    id="access-code-feedback"
                    role="status"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.16 }}
                    className={cn(accessHintClass, "flex gap-2.5")}
                  >
                    <ShieldCheck
                      className="mt-0.5 size-3.5 shrink-0 text-foreground/70"
                      aria-hidden="true"
                    />
                    <span>
                      This browser stays unlocked until you sign out or the
                      access code changes.
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                type="submit"
                variant="ghost"
                disabled={submitting || accessUnavailable}
                className={accessButtonClass}
              >
                {submitting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
                {submitting ? "Verifying..." : "Unlock Flowent"}
              </Button>
            </div>
          </motion.form>
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
