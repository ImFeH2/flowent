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
        "group cursor-pointer rounded-2xl border border-white/[0.04] bg-white/[0.01] p-5 transition-all duration-300 hover:border-white/[0.08] hover:bg-white/[0.03] hover:shadow-lg hover:shadow-black/50",
        expanded &&
          "border-white/[0.08] bg-white/[0.03] shadow-lg shadow-black/50",
      )}
    >
      <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-white/[0.03] border border-white/[0.04] transition-colors group-hover:bg-white/[0.06] group-hover:border-white/[0.08]">
        <Icon className="size-4.5 text-white/80" />
      </div>

      <code className="block text-[13px] font-mono font-medium text-white/90">
        {tool.name}
      </code>
      <p className="mt-2 text-[12px] leading-relaxed text-white/40">
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
            <div className="mt-4 border-t border-white/[0.04] pt-4">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/30">
                Parameters
              </p>
              <pre className="max-h-48 overflow-auto rounded-xl border border-white/[0.04] bg-black/40 p-3.5 text-[11px] font-mono text-white/60 scrollbar-none">
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
        <div className="mb-6 flex items-center gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools..."
              className="w-full rounded-full border border-white/[0.06] bg-white/[0.02] py-2.5 pl-10 pr-5 text-[13px] text-white transition-colors placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.04] focus:outline-none"
            />
          </div>
          <span className="shrink-0 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[11px] font-medium text-white/50">
            {filteredTools.length} tools
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-2 scrollbar-none">
          {loading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-36 animate-pulse rounded-2xl border border-white/[0.04] bg-white/[0.02]"
                />
              ))}
            </div>
          ) : filteredTools.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex h-full flex-col items-center justify-center text-center"
            >
              <div className="flex size-14 items-center justify-center rounded-3xl border border-white/[0.06] bg-white/[0.02] shadow-sm">
                <Wrench className="size-6 text-white/40" />
              </div>
              <h3 className="mt-5 text-[15px] font-medium text-white/90">
                No Tools Found
              </h3>
              <p className="mt-1.5 text-[13px] text-white/40">
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
