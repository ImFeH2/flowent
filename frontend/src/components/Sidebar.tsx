import {
  BookOpen,
  Bot,
  Moon,
  Network,
  ScrollText,
  Server,
  Settings,
  Sparkles,
  Sun,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useAgentRuntime,
  useAgentUI,
  type PageId,
} from "@/context/AgentContext";
import { useTheme } from "@/context/ThemeContext";
import { usePanelDrag } from "@/hooks/usePanelDrag";
import { PanelResizer } from "@/components/PanelResizer";

const NAV_ITEMS: Array<{ id: PageId; icon: typeof Network; label: string }> = [
  { id: "graph", icon: Network, label: "Workspace" },
  { id: "providers", icon: Server, label: "Providers" },
  { id: "roles", icon: BookOpen, label: "Roles" },
  { id: "prompts", icon: ScrollText, label: "Prompts" },
  { id: "tools", icon: Wrench, label: "Tools" },
  { id: "settings", icon: Settings, label: "Settings" },
];

interface SidebarProps {
  autoHide?: boolean;
  className?: string;
  onNavigate?: () => void;
  width: number;
  onWidthChange: (w: number) => void;
}

export function Sidebar({
  autoHide = false,
  className,
  onNavigate,
  width,
  onWidthChange,
}: SidebarProps) {
  const { connected, agents } = useAgentRuntime();
  const { currentPage, setCurrentPage } = useAgentUI();
  const { theme, toggleTheme } = useTheme();

  const { isDragging, startDrag } = usePanelDrag(width, onWidthChange, "right");

  const runningCount = Array.from(agents.values()).filter(
    (agent) => agent.state === "running",
  ).length;

  const navigate = (page: PageId) => {
    setCurrentPage(page);
    onNavigate?.();
  };

  return (
    <aside
      style={{ width: `${width}px` }}
      className={cn(
        "bg-sidebar text-sidebar-foreground border-sidebar-border z-40 flex flex-col border-r relative",
        autoHide ? "h-full" : "fixed left-0 top-0 h-screen",
        className,
      )}
    >
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-sidebar-border border-b px-4 py-4 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/80 truncate">
                Autopoe
              </p>
              <h1 className="mt-1 text-base font-semibold tracking-tight text-foreground truncate">
                Agent Studio
              </h1>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="hover:bg-sidebar-accent shrink-0 text-muted-foreground flex size-8 items-center justify-center rounded-md transition-colors hover:text-foreground"
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
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap overflow-hidden">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                connected ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            <span className="truncate">
              {connected ? "CONNECTED" : "RECONNECTING"}
            </span>
          </div>
        </div>

        <div className="mt-4 mb-2 px-4 text-[10px] shrink-0 font-semibold uppercase tracking-[0.2em] text-muted-foreground/70 truncate">
          Workspace
        </div>

        <nav className="flex-1 space-y-1 px-3 overflow-y-auto min-h-0">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id)}
              className={cn(
                "hover:bg-sidebar-accent group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                currentPage === id
                  ? "bg-sidebar-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  currentPage === id
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <span className="font-medium truncate">{label}</span>
            </button>
          ))}
        </nav>

        <div className="border-sidebar-border border-t px-4 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary/12 text-primary">
              <Bot className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">Live Agents</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {agents.size} total · {runningCount} RUNNING
              </p>
            </div>
          </div>

          <div className="bg-sidebar-accent mt-3 flex items-center gap-2 rounded-sm px-2.5 py-2 text-[11px] text-muted-foreground overflow-hidden">
            <Sparkles className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">Click a node to view details</span>
          </div>
        </div>
      </div>
      <PanelResizer
        position="right"
        isDragging={isDragging}
        onMouseDown={startDrag}
      />
    </aside>
  );
}
