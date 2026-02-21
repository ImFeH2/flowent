const TOOLS = [
  {
    name: "spawn",
    description:
      "Create a new agent node with a specific role. Establishes a bidirectional connection.",
  },
  {
    name: "send",
    description: "Send a message to a connected node by UUID.",
  },
  {
    name: "connect",
    description:
      "Establish a bidirectional connection between two nodes. Caller must be connected to at least one.",
  },
  {
    name: "list_connections",
    description: "List all nodes connected to the current node.",
  },
  {
    name: "read",
    description:
      "Read a file with line numbers, or list a directory. Supports start_line/end_line range.",
  },
  {
    name: "edit",
    description:
      "Replace a range of lines in a file with new content. Creates file if it does not exist.",
  },
  {
    name: "exec",
    description: "Execute a shell command in a sandboxed firejail environment.",
  },
  {
    name: "fetch",
    description: "Make an HTTP request to a URL and return the response body.",
  },
  {
    name: "todo",
    description: "Manage a task checklist. Actions: add, update, remove, list.",
  },
  {
    name: "idle",
    description:
      "Enter idle state. Suspends execution until a new message arrives.",
  },
  {
    name: "exit",
    description: "Terminate this agent after completing all work.",
  },
];

export function ToolsPage() {
  return (
    <div className="flex flex-col h-full bg-zinc-950 p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">Built-in Tools</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Tools available to agents. Assign them via the Conductor&apos;s spawn
          command.
        </p>
      </div>

      <div className="space-y-2">
        {TOOLS.map((tool) => (
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
    </div>
  );
}
