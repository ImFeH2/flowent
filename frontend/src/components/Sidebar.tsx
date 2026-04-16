import { cn } from "@/lib/utils";
import {
  useAgentConnectionRuntime,
  useAgentUI,
  type PageId,
} from "@/context/AgentContext";
import { usePanelDrag } from "@/hooks/usePanelDrag";
import { PanelResizer } from "@/components/PanelResizer";
import { SidebarActivityTicker } from "@/components/SidebarActivityTicker";
import {
  BookCopy,
  LayoutDashboard,
  ChartNoAxesCombined,
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
        "text-sidebar-foreground relative isolate z-40 flex flex-col overflow-hidden border-r border-white/[0.04] bg-black/60 shadow-2xl backdrop-blur-2xl transition-colors",
        autoHide ? "h-full" : "fixed inset-y-0 left-0 h-auto",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent opacity-30" />
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
                className="truncate font-medium tracking-tight text-white/90"
                style={{ fontSize: `${titleFontSizeRem.toFixed(3)}rem` }}
              >
                Autopoe
              </h1>
              <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    connected
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                      : "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]",
                  )}
                />
                <span className="text-[9px] font-medium uppercase tracking-wider text-white/50">
                  {connected ? "Live" : "Wait"}
                </span>
              </div>
            </div>
            <p className="text-[11px] font-medium text-white/40">
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
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-white/20",
                currentPage === id
                  ? "bg-white/[0.06] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.02)]"
                  : "text-white/50 hover:bg-white/[0.03] hover:text-white/90",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors duration-200",
                  currentPage === id
                    ? "text-white/90"
                    : "text-white/40 group-hover:text-white/80",
                )}
              />
              <span className="block truncate text-[13px] font-medium tracking-wide">
                {label}
              </span>
            </button>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/[0.04] px-4 py-3 bg-black/20">
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
