import {
  Network,
  Shield,
  Server,
  BookOpen,
  Wrench,
  Settings,
  PanelRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAgent } from "@/context/AgentContext";

const NAV_ITEMS = [
  { id: "graph", icon: Network, label: "Agent Graph" },
  { id: "steward", icon: Shield, label: "Steward Chat" },
  { id: "providers", icon: Server, label: "Providers" },
  { id: "roles", icon: BookOpen, label: "Roles" },
  { id: "tools", icon: Wrench, label: "Tools" },
];

interface SidebarProps {
  eventPanelVisible: boolean;
  onToggleEventPanel: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({
  eventPanelVisible,
  onToggleEventPanel,
  onOpenSettings,
}: SidebarProps) {
  const { currentPage, setCurrentPage } = useAgent();

  return (
    <div className="fixed left-0 top-0 h-screen w-12 bg-zinc-900 border-r border-zinc-800 flex flex-col items-center justify-between py-4 z-40">
      <div className="flex flex-col gap-2">
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setCurrentPage(id)}
            className={cn(
              "size-9 flex items-center justify-center rounded-md transition-colors",
              currentPage === id
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800",
            )}
            title={label}
          >
            <Icon className="size-5" />
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={onToggleEventPanel}
          className={cn(
            "size-9 flex items-center justify-center rounded-md transition-colors",
            eventPanelVisible
              ? "bg-zinc-700 text-zinc-100"
              : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800",
          )}
          title={eventPanelVisible ? "Hide Events" : "Show Events"}
        >
          <PanelRight className="size-5" />
        </button>
        <button
          onClick={onOpenSettings}
          className="size-9 flex items-center justify-center rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          title="Settings"
        >
          <Settings className="size-5" />
        </button>
      </div>
    </div>
  );
}
