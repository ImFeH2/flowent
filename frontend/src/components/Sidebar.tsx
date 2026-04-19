import { cn } from "@/lib/utils";
import {
  useAgentConnectionRuntime,
  useAgentUI,
  type PageId,
} from "@/context/AgentContext";
import { useAccess } from "@/context/useAccess";
import { usePanelDrag } from "@/hooks/usePanelDrag";
import { PanelResizer } from "@/components/PanelResizer";
import { SidebarActivityTicker } from "@/components/SidebarActivityTicker";
import {
  BookCopy,
  LayoutDashboard,
  ChartNoAxesCombined,
  LogOut,
  PlugZap,
  Server,
  Users,
  MessageSquareQuote,
  Wrench,
  Radio,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const NAV_ITEMS: Array<{ id: PageId; label: string; icon: LucideIcon }> = [
  { id: "workspace", label: "Workspace", icon: LayoutDashboard },
  { id: "blueprints", label: "Blueprints", icon: BookCopy },
  { id: "providers", label: "Providers", icon: Server },
  { id: "roles", label: "Roles", icon: Users },
  { id: "prompts", label: "Prompts", icon: MessageSquareQuote },
  { id: "tools", label: "Tools", icon: Wrench },
  { id: "mcp", label: "MCP", icon: PlugZap },
  { id: "channels", label: "Channels", icon: Radio },
  { id: "stats", label: "Stats", icon: ChartNoAxesCombined },
  { id: "settings", label: "Settings", icon: Settings },
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
  const { connected } = useAgentConnectionRuntime();
  const { currentPage, setCurrentPage } = useAgentUI();
  const { logout } = useAccess();

  const { isDragging, startDrag } = usePanelDrag(width, onWidthChange, "right");
  const widthProgress = Math.max(0, Math.min(1, (width - 180) / 220));
  const headerPaddingY = 16 + widthProgress * 4;
  const titleFontSizeRem = 1.05 + widthProgress * 0.1;

  const navigate = (page: PageId) => {
    setCurrentPage(page);
    onNavigate?.();
  };

  return (
    <aside
      style={{ width: `${width}px` }}
      className={cn(
        "text-sidebar-foreground relative isolate z-40 flex flex-col overflow-hidden border-r border-sidebar-border bg-sidebar shadow-2xl backdrop-blur-2xl transition-colors",
        autoHide ? "h-full" : "fixed inset-y-0 left-0 h-auto",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{ background: "var(--shell-surface-sweep)" }}
      />
      <div className="flex h-full flex-col overflow-hidden">
        <div
          className="shrink-0 px-5"
          style={{
            paddingTop: `${headerPaddingY}px`,
            paddingBottom: `${headerPaddingY}px`,
          }}
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <h1
                className="truncate font-medium tracking-tight text-sidebar-foreground"
                style={{ fontSize: `${titleFontSizeRem.toFixed(3)}rem` }}
              >
                Autopoe
              </h1>
              <div className="flex items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-accent/60 px-2 py-0.5">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    connected
                      ? "bg-graph-status-running shadow-[0_0_10px_var(--graph-status-running)]"
                      : "bg-graph-status-idle shadow-[0_0_10px_var(--graph-status-idle)]",
                  )}
                />
                <span className="text-[9px] font-medium uppercase tracking-wider text-sidebar-foreground/62">
                  {connected ? "Connected" : "Reconnecting"}
                </span>
              </div>
            </div>
            <p className="text-[11px] font-medium text-sidebar-foreground/48">
              Agent Studio
            </p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 px-3 py-2 overflow-y-auto scrollbar-none">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                currentPage === id
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors duration-200",
                  currentPage === id
                    ? "text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/48 group-hover:text-sidebar-accent-foreground/88",
                )}
              />
              <span className="block truncate text-[13px] font-medium tracking-wide">
                {label}
              </span>
            </button>
          ))}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border bg-sidebar/80 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              void logout();
            }}
            className="mb-3 flex w-full items-center justify-between rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-left text-[12px] font-medium text-sidebar-foreground/78 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span>Logout</span>
            <LogOut className="size-3.5" />
          </button>
          <SidebarActivityTicker width={width} />
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
