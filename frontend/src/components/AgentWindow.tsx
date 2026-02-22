import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Rnd } from "react-rnd";
import {
  Group,
  Panel,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import {
  X,
  Wrench,
  ChevronDown,
  ChevronRight,
  Square,
  Brain,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/MarkdownContent";
import { CopyButton } from "@/components/CopyButton";
import { useAgent, type WindowState } from "@/context/AgentContext";
import { useAgentDetail } from "@/hooks/useAgentDetail";
import { HistoryView } from "@/components/HistoryView";
import { nodeTypeIcon, stateBadgeColor } from "@/lib/constants";
import { terminateNode } from "@/lib/api";

type ChatItem =
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string; streaming?: boolean }
  | { kind: "thinking"; content: string; streaming?: boolean }
  | {
      kind: "tool_use";
      toolName: string;
      toolCallId: string | null;
      args: Record<string, unknown> | null;
      result: string | null;
      resultStreaming?: boolean;
    }
  | { kind: "error"; content: string };

interface AgentWindowProps {
  agentId: string;
  windowState: WindowState;
  zoom: number;
}

export function AgentWindow({ agentId, windowState, zoom }: AgentWindowProps) {
  const {
    closeAgentWindow,
    updateWindowPosition,
    updateWindowSize,
    selectAgent,
    agents,
  } = useAgent();
  const { detail } = useAgentDetail(agentId);
  const [viewMode, setViewMode] = useState<"chat" | "history">("chat");
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottom.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 64;
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      const el = scrollRef.current;
      if (isAtBottom.current && el) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    isAtBottom.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [viewMode]);

  const chatItems = useMemo(() => {
    if (!detail) return [];
    const items: ChatItem[] = [];
    for (const e of detail.history) {
      if (e.type === "ReceivedMessage" && e.content && e.from_id === "human") {
        items.push({ kind: "user", content: e.content });
      } else if (e.type === "AssistantText" && e.content) {
        items.push({
          kind: "assistant",
          content: e.content,
          streaming: e.streaming,
        });
      } else if (e.type === "AssistantThinking" && e.content) {
        items.push({
          kind: "thinking",
          content: e.content,
          streaming: e.streaming,
        });
      } else if (e.type === "ToolCall") {
        items.push({
          kind: "tool_use",
          toolName: e.tool_name ?? "unknown",
          toolCallId: e.tool_call_id ?? null,
          args: e.arguments ?? null,
          result: e.result ?? null,
          resultStreaming: e.streaming,
        });
      } else if (e.type === "ErrorEntry" && e.content) {
        items.push({ kind: "error", content: e.content });
      }
    }
    return items;
  }, [detail]);

  const handleTerminate = useCallback(() => {
    terminateNode(agentId);
  }, [agentId]);

  const displayName = detail
    ? (detail.name ?? `${detail.node_type} ${agentId.slice(0, 8)}`)
    : agentId.slice(0, 8);
  const Icon = detail ? nodeTypeIcon[detail.node_type] : nodeTypeIcon.agent;
  const canTerminate =
    detail &&
    detail.state !== "terminated" &&
    detail.state !== "error" &&
    detail.node_type !== "steward" &&
    detail.node_type !== "conductor";

  return (
    <Rnd
      default={{
        x: windowState.x,
        y: windowState.y,
        width: windowState.width,
        height: windowState.height,
      }}
      minWidth={200}
      minHeight={200}
      dragHandleClassName="drag-handle"
      scale={zoom}
      onDragStop={(_e, d) => {
        updateWindowPosition(agentId, d.x, d.y);
      }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        updateWindowSize(agentId, ref.offsetWidth, ref.offsetHeight);
        updateWindowPosition(agentId, pos.x, pos.y);
      }}
      className="!pointer-events-auto"
      enableUserSelectHack={false}
    >
      <div
        className="flex h-full flex-col rounded-lg border border-zinc-700/60 bg-zinc-900/75 backdrop-blur-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drag-handle flex cursor-grab items-center gap-2 rounded-t-lg border-b border-zinc-700/60 bg-zinc-800/60 backdrop-blur-xl px-3 py-2 select-none">
          <Icon className="size-3.5 text-zinc-400" />
          <span className="text-xs font-medium text-zinc-200 truncate max-w-48">
            {displayName}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">
            {agentId.slice(0, 8)}
          </span>
          {detail && (
            <Badge
              variant="outline"
              className={`text-[10px] ${stateBadgeColor[detail.state]}`}
            >
              {detail.state}
            </Badge>
          )}
          {canTerminate && (
            <button
              onClick={handleTerminate}
              title="Terminate agent"
              className="rounded p-0.5 text-zinc-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
            >
              <Square className="size-3" />
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <span className="rounded bg-zinc-700/60 px-1.5 py-0.5 text-[10px] text-zinc-300">
              Read-only
            </span>
            <button
              onClick={() => setViewMode("chat")}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                viewMode === "chat"
                  ? "bg-zinc-600 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode("history")}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                viewMode === "history"
                  ? "bg-zinc-600 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              History
            </button>
            <button
              onClick={() => {
                closeAgentWindow(agentId);
                selectAgent(null);
              }}
              className="ml-1 rounded p-0.5 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <Group orientation="horizontal">
            <Panel defaultSize={30} minSize={15}>
              <div className="h-full overflow-y-auto p-3 space-y-3">
                {detail ? (
                  <>
                    <DetailField label="ID">
                      <span className="text-[10px] text-zinc-400 font-mono truncate block">
                        {detail.id}
                      </span>
                    </DetailField>
                    {detail.todos.length > 0 && (
                      <DetailField label="Todos">
                        <div className="space-y-0.5">
                          {detail.todos.map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center gap-1.5 text-[11px]"
                            >
                              <span
                                className={
                                  t.done ? "text-emerald-400" : "text-zinc-500"
                                }
                              >
                                {t.done ? "\u2713" : "\u25CB"}
                              </span>
                              <span
                                className={
                                  t.done
                                    ? "text-zinc-500 line-through"
                                    : "text-zinc-300"
                                }
                              >
                                {t.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      </DetailField>
                    )}
                    {detail.connections.length > 0 && (
                      <DetailField label="Connections">
                        <div className="space-y-0.5">
                          {detail.connections.map((id) => {
                            const connNode = agents.get(id);
                            const label =
                              connNode?.name ??
                              connNode?.node_type ??
                              id.slice(0, 8);
                            return (
                              <div
                                key={id}
                                className="flex items-center gap-1.5 text-[11px] text-zinc-400"
                              >
                                <span className="text-zinc-300 truncate">
                                  {label}
                                </span>
                                <span className="font-mono text-zinc-600 text-[10px]">
                                  {id.slice(0, 8)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </DetailField>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-zinc-500">Loading...</p>
                )}
              </div>
            </Panel>
            <PanelResizeHandle className="w-px bg-zinc-700 hover:bg-zinc-500 transition-colors" />
            <Panel defaultSize={70} minSize={30}>
              <div className="flex h-full flex-col">
                <div
                  ref={scrollRef}
                  onScroll={onScroll}
                  className="flex-1 min-h-0 overflow-y-auto scroll-smooth"
                >
                  <div ref={contentRef}>
                    {viewMode === "chat" ? (
                      <div className="space-y-2 px-3 py-2">
                        {chatItems.map((item, i) => (
                          <ChatItemRenderer key={i} item={item} />
                        ))}
                      </div>
                    ) : (
                      detail?.history && (
                        <HistoryView history={detail.history} />
                      )
                    )}
                  </div>
                </div>
              </div>
            </Panel>
          </Group>
        </div>
      </div>
    </Rnd>
  );
}

function ChatItemRenderer({ item }: { item: ChatItem }) {
  if (item.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="group relative max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed bg-blue-600/20 text-blue-200">
          <div className="absolute right-1 top-1">
            <CopyButton text={item.content} />
          </div>
          <MarkdownContent content={item.content} className="text-blue-200" />
        </div>
      </div>
    );
  }

  if (item.kind === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="group relative max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed bg-zinc-800/80 text-zinc-200">
          <div className="absolute right-1 top-1">
            <CopyButton text={item.content} />
          </div>
          <MarkdownContent content={item.content} className="text-zinc-200" />
        </div>
      </div>
    );
  }

  if (item.kind === "thinking") {
    return <ThinkingBlock content={item.content} streaming={item.streaming} />;
  }

  if (item.kind === "tool_use") {
    return <ToolUseBlock item={item} />;
  }

  if (item.kind === "error") {
    return <ErrorBlock content={item.content} />;
  }

  return null;
}

function ThinkingBlock({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n");
  const isLong = lines.length > 3 || content.length > 200;
  const showCollapsed = !expanded && isLong;

  return (
    <div className="group rounded-lg border border-amber-500/20 bg-amber-950/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-amber-300/80 hover:text-amber-200 transition-colors"
      >
        <Brain className="size-3 shrink-0" />
        <span className="font-medium">Thinking</span>
        {streaming && (
          <span className="ml-1 text-amber-400/60 animate-pulse">...</span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <CopyButton text={content} />
          {expanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
        </span>
      </button>
      {(expanded || showCollapsed) && (
        <div className="relative px-2.5 pb-2">
          <div className={showCollapsed ? "max-h-[3.6em] overflow-hidden" : ""}>
            <MarkdownContent
              content={content}
              className="text-[11px] leading-[1.2em] text-amber-200/60"
            />
          </div>
          {showCollapsed && (
            <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-amber-950/40 to-transparent pointer-events-none rounded-b-lg" />
          )}
        </div>
      )}
      {!expanded && !showCollapsed && !isLong && (
        <div className="px-2.5 pb-2">
          <MarkdownContent
            content={content}
            className="text-[11px] leading-relaxed text-amber-200/60"
          />
        </div>
      )}
    </div>
  );
}

function ErrorBlock({ content }: { content: string }) {
  return (
    <div className="group relative rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <AlertCircle className="size-3.5 text-red-400 shrink-0" />
        <span className="text-[11px] font-medium text-red-300">Error</span>
        <span className="ml-auto">
          <CopyButton text={content} />
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-red-200/70">
        {content}
      </p>
    </div>
  );
}

function ToolUseBlock({
  item,
}: {
  item: Extract<ChatItem, { kind: "tool_use" }>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:text-zinc-100 transition-colors"
      >
        <Wrench className="size-3 shrink-0 text-zinc-500" />
        <Badge
          variant="outline"
          className="text-[10px] bg-zinc-700/50 border-zinc-600 text-zinc-300 px-1.5 py-0"
        >
          {item.toolName}
        </Badge>
        {item.result !== null && !item.resultStreaming ? (
          <span className="text-emerald-400/70 text-[10px]">done</span>
        ) : item.resultStreaming ? (
          <span className="text-blue-400/70 text-[10px] animate-pulse">
            running
          </span>
        ) : null}
        <span className="ml-auto">
          {expanded ? (
            <ChevronDown className="size-3" />
          ) : (
            <ChevronRight className="size-3" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-zinc-700/30 px-2.5 py-2 space-y-2">
          {item.args && Object.keys(item.args).length > 0 && (
            <div className="group">
              <div className="flex items-center mb-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                  Arguments
                </span>
                <span className="ml-auto">
                  <CopyButton text={JSON.stringify(item.args, null, 2)} />
                </span>
              </div>
              <pre className="text-[10px] text-zinc-400 bg-zinc-900/50 rounded p-1.5 overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {JSON.stringify(item.args, null, 2)}
              </pre>
            </div>
          )}
          {item.result !== null && (
            <div className="group">
              <div className="flex items-center mb-1">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                  Result
                </span>
                <span className="ml-auto">
                  <CopyButton text={item.result} />
                </span>
              </div>
              <pre className="text-[10px] text-zinc-400 bg-zinc-900/50 rounded p-1.5 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                {item.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
