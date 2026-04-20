import { useState } from "react";
import { AssistantPanel } from "@/components/AssistantPanel";
import { PageScaffold, PageTitleBar } from "@/components/layout/PageScaffold";
import { AgentDetailPanel } from "@/components/workspace/WorkspacePanels";
import {
  useAgentConnectionRuntime,
  useAgentNodesRuntime,
} from "@/context/AgentContext";
import { getAssistantNode } from "@/lib/assistant";
import { cn } from "@/lib/utils";

export function AssistantPage() {
  const { agents } = useAgentNodesRuntime();
  const { connected } = useAgentConnectionRuntime();
  const assistantNode = getAssistantNode(agents);
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <PageScaffold className="min-h-0 py-6">
      <PageTitleBar
        title="Assistant"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {assistantNode?.role_name ? (
              <span className="rounded-full border border-border bg-accent/35 px-2.5 py-1 text-[11px] font-medium text-foreground/82">
                Role: {assistantNode.role_name}
              </span>
            ) : null}
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider",
                connected
                  ? "border-graph-status-running/18 bg-graph-status-running/[0.12] text-graph-status-running"
                  : "border-graph-status-idle/18 bg-graph-status-idle/[0.12] text-graph-status-idle",
              )}
            >
              {connected ? "Online" : "Connecting"}
            </span>
          </div>
        }
      />
      <div className="min-h-0 flex-1 pt-6">
        <div className="h-full overflow-hidden rounded-xl border border-border bg-surface-overlay/90 shadow-md">
          {detailsOpen && assistantNode ? (
            <AgentDetailPanel
              agent={assistantNode}
              onClose={() => setDetailsOpen(false)}
            />
          ) : (
            <AssistantPanel
              onOpenDetails={
                assistantNode ? () => setDetailsOpen(true) : undefined
              }
              variant="page"
            />
          )}
        </div>
      </div>
    </PageScaffold>
  );
}
