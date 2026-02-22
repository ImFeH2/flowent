import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface ToolInfo {
  name: string;
  description: string;
}

export function ToolsPage() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tools")
      .then((res) => res.json())
      .then((data) => setTools(data.tools ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-950 p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">Built-in Tools</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Tools available to agents. Assign them via the Conductor&apos;s spawn
          command.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 text-zinc-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {tools.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-8">
              No tools registered.
            </p>
          )}
          {tools.map((tool) => (
            <div
              key={tool.name}
              className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3"
            >
              <code className="text-xs font-mono text-amber-400 bg-amber-400/10 px-2 py-1 rounded border border-amber-400/20 shrink-0">
                {tool.name}
              </code>
              <p className="text-sm text-zinc-400">{tool.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
