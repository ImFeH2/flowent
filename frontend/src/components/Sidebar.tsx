import { cn } from "@/lib/utils";
import {
  useAgentConnectionRuntime,
  useAgentUI,
  type PageId,
} from "@/context/AgentContext";
import { usePanelDrag } from "@/hooks/usePanelDrag";
import { PanelResizer } from "@/components/PanelResizer";
import { SidebarActivityTicker } from "@/components/SidebarActivityTicker";

const NAV_ITEMS: Array<{ id: PageId; label: string }> = [
  { id: "workspace", label: "Workspace" },
  { id: "providers", label: "Providers" },
  { id: "roles", label: "Roles" },
  { id: "prompts", label: "Prompts" },
  { id: "tools", label: "Tools" },
  { id: "channels", label: "Channels" },
  { id: "settings", label: "Settings" },
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
  const headerPaddingY = 12 + widthProgress * 4;
  const titleFontSizeRem = 1.02 + widthProgress * 0.14;
  const statusFontSizePx = 10 + widthProgress * 0.4;

  const navigate = (page: PageId) => {
    setCurrentPage(page);
    onNavigate?.();
  };

  return (
    <aside
      style={{ width: `${width}px` }}
      className={cn(
        "text-sidebar-foreground relative isolate z-40 flex flex-col overflow-hidden border border-white/6 border-r-white/[0.11] bg-[linear-gradient(180deg,rgba(8,8,9,0.96),rgba(5,5,6,0.95))] shadow-[0_18px_44px_-34px_rgba(0,0,0,0.8)] backdrop-blur-xl [contain:paint]",
        autoHide ? "h-full" : "fixed inset-y-0 left-0 h-auto",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.016),transparent_20%,transparent_84%,rgba(255,255,255,0.008))]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/8" />
      <div className="flex h-full flex-col overflow-hidden">
        <div
          className="shrink-0 border-b border-white/[0.08] px-4"
          style={{
            paddingTop: `${headerPaddingY}px`,
            paddingBottom: `${headerPaddingY}px`,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex flex-wrap items-center gap-2">
              <h1
                className="truncate font-semibold tracking-[-0.03em] text-foreground"
                style={{ fontSize: `${titleFontSizeRem.toFixed(3)}rem` }}
              >
                Autopoe
              </h1>
              <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-muted-foreground/78">
                Agent Studio
              </span>
            </div>
            <div
              className="flex shrink-0 items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1"
              style={{ fontSize: `${statusFontSizePx.toFixed(2)}px` }}
            >
              <span
                className={cn(
                  "size-2 rounded-full shadow-[0_0_10px_currentColor]",
                  connected
                    ? "bg-graph-status-idle text-graph-status-idle"
                    : "bg-graph-status-initializing text-graph-status-initializing",
                )}
              />
              <span className="font-medium text-foreground/88">
                {connected ? "Connected" : "Reconnecting"}
              </span>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-4 pb-2 pt-3.5 text-[9px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/52">
          Navigation
        </div>

        <nav className="min-h-0 flex-1 space-y-1 px-3 pb-3 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id)}
              className={cn(
                "group flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors duration-150",
                currentPage === id
                  ? "bg-white/[0.05] text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.028] hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 h-5 w-px shrink-0 rounded-full transition-[opacity,background-color] duration-150",
                  currentPage === id
                    ? "bg-white/72 opacity-100"
                    : "bg-white/0 opacity-0 group-hover:bg-white/8 group-hover:opacity-100",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium leading-5">
                {label}
              </span>
            </button>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/[0.08] px-4 py-2.5">
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
