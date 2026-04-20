import type { LucideIcon } from "lucide-react";
import {
  BookCopy,
  ChartNoAxesCombined,
  LayoutDashboard,
  MessageSquareQuote,
  PlugZap,
  Radio,
  Server,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import type { PageId } from "@/context/AgentContext";

export interface PageNavigationItem {
  id: PageId;
  label: string;
  icon: LucideIcon;
}

export const PAGE_NAVIGATION_ITEMS: PageNavigationItem[] = [
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

export function getPageNavigationLabel(pageId: PageId): string {
  return (
    PAGE_NAVIGATION_ITEMS.find((item) => item.id === pageId)?.label ?? pageId
  );
}
