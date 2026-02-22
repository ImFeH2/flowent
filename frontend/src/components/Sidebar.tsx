import {
  BookOpen,
  Bot,
  Moon,
  Network,
  Server,
  Settings,
  Sparkles,
  Sun,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgent, type PageId } from "@/context/AgentContext";
import { useTheme } from "@/context/ThemeContext";

const NAV_ITEMS: Array<{ id: PageId; icon: typeof Network; label: string }> = [
  { id: "graph", icon: Network, label: "Workspace" },
  { id: "providers", icon: Server, label: "Providers" },
  { id: "roles", icon: BookOpen, label: "Roles" },
  { id: "tools", icon: Wrench, label: "Tools" },
  { id: "settings", icon: Settings, label: "Settings" },
];

interface SidebarProps {
  autoHide?: boolean;
  className?: string;
  onNavigate?: () => void;
}

export function Sidebar({
  autoHide = false,
  className,
  onNavigate,
}: SidebarProps) {
  const { currentPage, setCurrentPage, connected, agents } = useAgent();
  const { theme, toggleTheme } = useTheme();

  const runningCount = Array.from(agents.values()).filter(
    (agent) => agent.state === "running",
  ).length;

  const navigate = (page: PageId) => {
    setCurrentPage(page);
    onNavigate?.();
  };

  return (
    <aside
      className={cn(
        "z-40 flex w-72 flex-col",
        autoHide ? "h-full" : "fixed left-0 top-0 h-screen p-2.5",
        className,
      )}
    >
      <div className="flex h-full flex-col rounded-xl border border-white/10 bg-black/75 p-3 shadow-[0_25px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="mb-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-primary/80">
                Autopoe
              </p>
              <h1 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                Agent Studio
              </h1>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex size-8 items-center justify-center rounded-md border border-white/10 bg-black/60 text-muted-foreground shadow-sm transition-all hover:bg-white/10 hover:text-foreground"
              title={
                theme === "light"
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
            >
              {theme === "light" ? (
                <Moon className="size-4" />
              ) : (
                <Sun className="size-4" />
              )}
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "size-2 rounded-full",
                connected ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            <span>{connected ? "Connected" : "Reconnecting"}</span>
          </div>
        </div>

        <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">
          Workspace
        </div>

        <nav className="flex-1 space-y-1 px-1">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200",
                currentPage === id
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                  : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  currentPage === id
                    ? "text-primary-foreground/80"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <span className="font-medium">{label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Bot className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold">Live Agents</p>
              <p className="text-[11px] text-muted-foreground">
                {agents.size} total · {runningCount} RUNNING
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-md border border-white/10 bg-black/50 px-2.5 py-2 text-[11px] text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            <span>Click a node to view details</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
