import {
  BookOpen,
  Bot,
  Network,
  ScrollText,
  Server,
  Settings,
  Sparkles,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useAgentRuntime,
  useAgentUI,
  type PageId,
} from "@/context/AgentContext";
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
        "text-sidebar-foreground z-40 flex flex-col overflow-hidden border border-white/6 bg-[linear-gradient(180deg,rgba(5,7,11,0.84),rgba(8,11,18,0.76))] shadow-[0_18px_44px_-34px_rgba(0,0,0,0.8)] backdrop-blur-xl",
        autoHide
          ? "h-full rounded-[1rem]"
          : "fixed inset-y-3 left-3 h-auto rounded-[1.05rem]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.028),transparent_22%,transparent_82%,rgba(255,255,255,0.015))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/8" />
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 border-b border-white/6 px-4 py-[1.125rem]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]">
              <Bot className="size-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/75">
                Autopoe
              </p>
              <h1 className="mt-1 truncate text-[1.05rem] font-semibold tracking-[-0.03em] text-foreground">
                Agent Studio
              </h1>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                Multi-agent orchestration workspace
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[11px]">
            <span
              className={cn(
                "size-2 rounded-full shadow-[0_0_10px_currentColor]",
                connected
                  ? "bg-emerald-400 text-emerald-400"
                  : "bg-amber-400 text-amber-400",
              )}
            />
            <span className="font-medium text-foreground">
              {connected ? "Connected" : "Reconnecting"}
            </span>
            <span className="text-muted-foreground">
              {agents.size} nodes online
            </span>
          </div>
        </div>

        <div className="mb-2 mt-5 shrink-0 px-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/60">
          Navigation
        </div>

        <nav className="min-h-0 flex-1 space-y-1.5 px-3 overflow-y-auto">
          {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                currentPage === id
                  ? "bg-white/[0.05] text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.028] hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "h-7 w-px shrink-0 rounded-full transition-all",
                  currentPage === id
                    ? "bg-primary/70 opacity-100"
                    : "bg-white/0 opacity-0 group-hover:bg-white/8 group-hover:opacity-100",
                )}
              />
              <div
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-md transition-all",
                  currentPage === id
                    ? "bg-primary/12 text-primary"
                    : "bg-white/[0.02] text-muted-foreground group-hover:bg-white/[0.035] group-hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
              </div>
              <div className="min-w-0 text-left">
                <span className="block truncate font-medium">{label}</span>
                <span className="block truncate text-[11px] text-muted-foreground/75">
                  {id === "graph"
                    ? "Forest and assistant panels"
                    : id === "providers"
                      ? "Model backends and catalogs"
                      : id === "roles"
                        ? "Behavior templates and overrides"
                        : id === "prompts"
                          ? "Global system guidance"
                          : id === "tools"
                            ? "Available runtime capabilities"
                            : "Runtime defaults and event log"}
                </span>
              </div>
            </button>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/6 px-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Bot className="size-4 text-primary" />
              <span>Runtime Snapshot</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {agents.size} total nodes · {runningCount} running
            </p>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Sparkles className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">
                Select a node to inspect its live context
              </span>
            </div>
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
