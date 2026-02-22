import {
  Network,
  Server,
  BookOpen,
  Wrench,
  Settings,
  PanelRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgent, type PageId } from "@/context/AgentContext";

const NAV_ITEMS: Array<{ id: PageId; icon: typeof Network; label: string }> = [
  { id: "graph", icon: Network, label: "Workspace" },
  { id: "providers", icon: Server, label: "Providers" },
  { id: "roles", icon: BookOpen, label: "Roles" },
  { id: "tools", icon: Wrench, label: "Tools" },
  { id: "settings", icon: Settings, label: "Settings" },
];

interface SidebarProps {
  eventPanelVisible: boolean;
  onToggleEventPanel: () => void;
}

export function Sidebar({
  eventPanelVisible,
  onToggleEventPanel,
}: SidebarProps) {
  const { currentPage, setCurrentPage } = useAgent();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 px-4 py-5">
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
          Autopoe
        </p>
        <h1 className="mt-1 text-lg font-semibold text-zinc-100">
          Control Center
        </h1>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setCurrentPage(id)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              currentPage === id
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="border-t border-zinc-800 p-3">
        <button
          onClick={onToggleEventPanel}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            eventPanelVisible
              ? "bg-zinc-700 text-zinc-100"
              : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
          )}
        >
          <PanelRight className="size-4 shrink-0" />
          <span>{eventPanelVisible ? "Hide Event Log" : "Show Event Log"}</span>
        </button>
      </div>
    </aside>
  );
}
