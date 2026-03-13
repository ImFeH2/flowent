import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, ChevronRight, Search, Wrench } from "lucide-react";
import { fetchTools, type ToolInfo } from "@/lib/api";
import { PageScaffold, SoftPanel } from "@/components/layout/PageScaffold";

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
      description="Available tools for agents to use"
      actions={
        <span className="text-sm text-muted-foreground">
          {filteredTools.length} tools
        </span>
      }
    >
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        <SoftPanel className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="border-b border-white/6 px-4 py-4 md:px-5">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tools..."
                className="w-full rounded-md border border-white/8 bg-black/[0.22] py-2 pl-10 pr-4 text-sm transition-all duration-200 placeholder:text-muted-foreground focus:border-white/16 focus:outline-none"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-5">
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 rounded-md skeleton-shimmer" />
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
                  Try adjusting your search query.
                </p>
              </motion.div>
            ) : (
              <div className="divide-y divide-white/6">
                {filteredTools.map((tool, i) => {
                  const isExpanded = expanded.has(tool.name);
                  return (
                    <motion.div
                      key={tool.name}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="transition-colors hover:bg-white/[0.026]"
                    >
                      <button
                        onClick={() => toggle(tool.name)}
                        className="flex w-full items-center gap-3 px-0 py-3 text-left"
                      >
                        <div className="flex size-7 items-center justify-center rounded-md bg-white/[0.05]">
                          {isExpanded ? (
                            <ChevronDown className="size-4 text-primary" />
                          ) : (
                            <ChevronRight className="size-4 text-primary" />
                          )}
                        </div>
                        <code className="rounded-sm bg-white/[0.05] px-2 py-1 text-xs font-mono">
                          {tool.name}
                        </code>
                        <span className="flex-1 truncate text-sm text-muted-foreground">
                          {tool.description}
                        </span>
                      </button>

                      {isExpanded && tool.parameters && (
                        <div className="border-t border-white/6 py-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Parameters
                          </p>
                          <pre className="max-h-64 overflow-auto rounded-md border border-white/6 bg-black/[0.2] p-3 text-xs font-mono">
                            {JSON.stringify(tool.parameters, null, 2)}
                          </pre>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </SoftPanel>
      </div>
    </PageScaffold>
  );
}
