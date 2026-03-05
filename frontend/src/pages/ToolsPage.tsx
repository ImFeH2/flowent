import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, ChevronRight, Search, Wrench } from "lucide-react";

interface ToolInfo {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export function ToolsPage() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/tools")
      .then((res) => res.json())
      .then((data) => setTools(data.tools ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q),
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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Wrench className="size-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Tools</h1>
            <p className="text-sm text-muted-foreground">
              Available tools for agents to use
            </p>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredTools.length} tools
        </div>
      </div>

      <div className="border-b border-border px-6 py-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools..."
            className="w-full rounded-lg border border-border bg-card py-2 pl-10 pr-4 text-sm transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="mx-auto max-w-3xl space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl skeleton-shimmer" />
            ))}
          </div>
        ) : filteredTools.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex h-full flex-col items-center justify-center text-center"
          >
            <div className="flex size-16 items-center justify-center rounded-2xl bg-accent">
              <Wrench className="size-8 text-primary/50" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No Tools Found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting your search query.
            </p>
          </motion.div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3">
            {filteredTools.map((tool, i) => {
              const isExpanded = expanded.has(tool.name);
              return (
                <motion.div
                  key={tool.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-foreground/15"
                >
                  <button
                    onClick={() => toggle(tool.name)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                      {isExpanded ? (
                        <ChevronDown className="size-4 text-primary" />
                      ) : (
                        <ChevronRight className="size-4 text-primary" />
                      )}
                    </div>
                    <code className="rounded-md bg-accent px-2 py-1 text-xs font-mono">
                      {tool.name}
                    </code>
                    <span className="flex-1 truncate text-sm text-muted-foreground">
                      {tool.description}
                    </span>
                  </button>

                  {isExpanded && tool.parameters && (
                    <div className="border-t border-border bg-card/50 px-4 py-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Parameters
                      </p>
                      <pre className="max-h-64 overflow-auto rounded-lg bg-background p-3 text-xs font-mono">
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
    </div>
  );
}
