import { useEffect, useMemo, useState, type ComponentType } from "react";
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
  Terminal,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import { fetchTools, type ToolInfo } from "@/lib/api";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { cn } from "@/lib/utils";

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
        "group cursor-pointer rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 transition-all duration-150 hover:-translate-y-px hover:border-white/[0.12] hover:bg-white/[0.045]",
        expanded && "border-white/[0.12] bg-white/[0.04]",
      )}
    >
      <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-white/[0.06]">
        <Icon className="size-4 text-primary" />
      </div>

      <code className="block text-sm font-mono font-medium">{tool.name}</code>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground/78">
        {tool.description}
      </p>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mt-3 border-t border-white/8 pt-3">
              <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground/50">
                Parameters
              </p>
              <pre className="max-h-48 overflow-auto rounded-lg border border-white/6 bg-black/[0.2] p-3 text-xs font-mono">
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
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTools()
      .then((items) => setTools(items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredTools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return tools;
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(normalizedQuery) ||
        tool.description.toLowerCase().includes(normalizedQuery),
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
    <PageScaffold
      title="Tools"
      description="Search and inspect the runtime tools currently available to agents."
    >
      <div className="flex h-full flex-col">
        <div className="mb-4 flex items-center gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools..."
              className="w-full rounded-lg border border-white/8 bg-white/[0.03] py-2 pl-10 pr-4 text-sm transition-colors placeholder:text-muted-foreground focus:border-white/16 focus:outline-none"
            />
          </div>
          <span className="shrink-0 text-sm text-muted-foreground">
            {filteredTools.length} tools
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2">
          {loading ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-32 rounded-xl skeleton-shimmer" />
              ))}
            </div>
          ) : filteredTools.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex h-full flex-col items-center justify-center text-center"
            >
              <Wrench className="size-7 text-muted-foreground/60" />
              <h3 className="mt-4 text-lg font-semibold">No Tools Found</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Try adjusting your search criteria.
              </p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {filteredTools.map((tool, i) => (
                <motion.div
                  key={tool.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
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
