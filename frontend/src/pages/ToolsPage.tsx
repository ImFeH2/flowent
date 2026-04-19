import { useMemo, useState, type ComponentType } from "react";
import useSWR from "swr";
import { AnimatePresence, motion } from "motion/react";
import {
  Clock,
  FileCode,
  FilePen,
  FileText,
  FolderPlus,
  GitBranch,
  Globe,
  LayoutDashboard,
  Link,
  ListTodo,
  Network,
  Plug,
  Search,
  Send,
  Settings,
  Shield,
  Terminal,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import { fetchTools, type ToolInfo } from "@/lib/api";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { cn } from "@/lib/utils";

const toolSearchInputClass =
  "h-8 w-full rounded-md border border-input bg-background/50 pl-10 pr-3 text-[13px] text-foreground shadow-xs transition-[border-color,background-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:bg-background/65 focus:outline-none focus:ring-[3px] focus:ring-ring/50";
const toolChipClass =
  "inline-flex h-5 shrink-0 items-center rounded-full border border-border bg-accent/20 px-2.5 text-[11px] font-medium text-muted-foreground";

const TOOL_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  send: Send,
  idle: Clock,
  sleep: Clock,
  todo: ListTodo,
  contacts: Network,
  list_tools: Wrench,
  list_roles: Users,
  list_tabs: LayoutDashboard,
  exec: Terminal,
  read: FileText,
  edit: FilePen,
  fetch: Globe,
  create_tab: FolderPlus,
  create_agent: GitBranch,
  connect: Link,
  set_permissions: Shield,
  manage_providers: Plug,
  manage_roles: UserCog,
  manage_settings: Settings,
  manage_prompts: FileCode,
};

function ToolCard({
  expanded,
  onToggle,
  tool,
}: {
  expanded: boolean;
  onToggle: () => void;
  tool: ToolInfo;
}) {
  const Icon = TOOL_ICONS[tool.name] ?? Wrench;

  return (
    <div
      onClick={onToggle}
      title={tool.description}
      className={cn(
        "group cursor-pointer rounded-xl border border-border bg-card/30 p-5 shadow-none transition-colors duration-300 hover:border-ring/25 hover:bg-accent/20 hover:shadow-sm",
        expanded && "border-border bg-accent/20 shadow-sm",
      )}
    >
      <div className="mb-4 flex size-10 items-center justify-center rounded-xl border border-border bg-accent/25 transition-colors group-hover:bg-accent/40">
        <Icon className="size-4.5 text-foreground/80" />
      </div>

      <code className="block text-[13px] font-mono font-medium text-foreground">
        {tool.name}
      </code>
      <p className="mt-2 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/75">
        {tool.source === "mcp"
          ? `MCP · ${tool.server_name ?? "unknown"}`
          : "Builtin"}
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
        {tool.description}
      </p>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mt-4 border-t border-border pt-4">
              {tool.source === "mcp" ? (
                <div className="mb-4 space-y-2 text-[11px] text-muted-foreground">
                  <div>
                    Raw Tool Name{" "}
                    <code className="font-mono text-foreground/82">
                      {tool.tool_name ?? "unknown"}
                    </code>
                  </div>
                  <div>
                    Fully Qualified ID{" "}
                    <code className="font-mono text-foreground/82">
                      {tool.fully_qualified_id ?? tool.name}
                    </code>
                  </div>
                  <div className="flex flex-wrap gap-2 uppercase tracking-[0.14em]">
                    {tool.read_only_hint ? (
                      <span className="rounded-full border border-primary/15 bg-primary/10 px-2 py-1 text-[10px] text-primary">
                        readOnly
                      </span>
                    ) : null}
                    {tool.destructive_hint ? (
                      <span className="rounded-full border border-destructive/20 bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
                        destructive
                      </span>
                    ) : null}
                    {tool.open_world_hint ? (
                      <span className="rounded-full border border-graph-status-idle/20 bg-graph-status-idle/[0.12] px-2 py-1 text-[10px] text-graph-status-idle">
                        openWorld
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/75">
                Parameters
              </p>
              <pre className="max-h-48 select-text overflow-auto rounded-xl border border-border bg-background/50 p-3.5 text-[11px] font-mono text-foreground/70 scrollbar-none">
                {JSON.stringify(tool.parameters ?? {}, null, 2)}
              </pre>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function ToolsPage() {
  const { data: tools = [], isLoading: loading } = useSWR("tools", fetchTools);

  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filteredTools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return tools;
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(normalizedQuery) ||
        tool.description.toLowerCase().includes(normalizedQuery) ||
        (tool.server_name ?? "").toLowerCase().includes(normalizedQuery),
    );
  }, [query, tools]);

  const toggle = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  return (
    <PageScaffold>
      <div className="flex h-full flex-col pt-8 px-8">
        <div className="mb-6">
          <h1 className="text-[28px] font-medium tracking-[-0.04em] text-foreground">
            Tools
          </h1>
          <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
            Browse the current tool directory, including built-in tools and
            discovered MCP tools.
          </p>
        </div>
        <div className="mb-6 flex items-center gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools..."
              className={toolSearchInputClass}
            />
          </div>
          <span className={toolChipClass}>{filteredTools.length} tools</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2 scrollbar-none">
          {loading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-36 animate-pulse rounded-xl border border-border bg-accent/20"
                />
              ))}
            </div>
          ) : filteredTools.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center text-center"
            >
              <div className="flex size-14 items-center justify-center rounded-xl border border-border bg-accent/20 shadow-sm">
                <Wrench className="size-6 text-muted-foreground" />
              </div>
              <h3 className="mt-5 text-[15px] font-medium text-foreground">
                No Tools Found
              </h3>
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                Try adjusting your search criteria.
              </p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 pb-8">
              {filteredTools.map((tool, i) => (
                <motion.div
                  key={tool.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <ToolCard
                    tool={tool}
                    expanded={expanded.has(tool.name)}
                    onToggle={() => toggle(tool.name)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageScaffold>
  );
}
