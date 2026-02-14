import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Rnd } from "react-rnd";
import { Group, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { X, Send, Wrench, ChevronDown, ChevronRight, Square, Brain, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgent, type WindowState } from "@/context/AgentContext";
import { useAgentDetail } from "@/hooks/useAgentDetail";
import { HistoryView } from "@/components/HistoryView";
import { roleIcon, stateBadgeColor } from "@/lib/constants";

type ChatItem =
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string; streaming?: boolean }
  | { kind: "thinking"; content: string; streaming?: boolean }
  | { kind: "tool_use"; toolName: string; toolCallId: string | null; args: Record<string, unknown> | null; result: string | null; resultStreaming?: boolean }
  | { kind: "error"; content: string };

interface AgentWindowProps {
  agentId: string;
  windowState: WindowState;
  zoom: number;
}

export function AgentWindow({ agentId, windowState, zoom }: AgentWindowProps) {
  const { closeAgentWindow, updateWindowPosition, updateWindowSize, selectAgent } = useAgent();
  const { detail } = useAgentDetail(agentId);
  const [viewMode, setViewMode] = useState<"chat" | "history">("chat");
  const [input, setInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.history, viewMode]);

  const sendMsg = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    fetch(`/api/agents/${agentId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
  }, [agentId, input]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMsg();
      }
    },
    [sendMsg],
  );

  const onTextareaInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const chatItems = useMemo(() => {
    if (!detail) return [];
    const items: ChatItem[] = [];
    for (const e of detail.history) {
      if (e.type === "received_message" && e.content && e.from_id === "human") {
        items.push({ kind: "user", content: e.content });
      } else if (e.type === "assistant_text" && e.content) {
        items.push({ kind: "assistant", content: e.content, streaming: e.streaming });
      } else if (e.type === "assistant_thinking" && e.content) {
        items.push({ kind: "thinking", content: e.content, streaming: e.streaming });
      } else if (e.type === "tool_call") {
        items.push({
          kind: "tool_use",
          toolName: e.tool_name ?? "unknown",
          toolCallId: e.tool_call_id,
          args: e.arguments,
          result: null,
        });
      } else if (e.type === "error" && e.content) {
        items.push({ kind: "error", content: e.content });
      } else if (e.type === "tool_result" && e.content != null) {
        for (let j = items.length - 1; j >= 0; j--) {
          const prev = items[j];
          if (prev.kind === "tool_use" && prev.toolCallId === e.tool_call_id && prev.result === null) {
            items[j] = { ...prev, result: e.content, resultStreaming: e.streaming };
            break;
          }
        }
        if (e.tool_call_id === null) {
          for (let j = items.length - 1; j >= 0; j--) {
            const prev = items[j];
            if (prev.kind === "tool_use" && prev.result === null) {
              items[j] = { ...prev, result: e.content, resultStreaming: e.streaming };
              break;
            }
          }
        }
      }
    }
    return items;
  }, [detail]);

  const terminateAgent = useCallback(() => {
    fetch(`/api/agents/${agentId}/terminate`, { method: "POST" });
  }, [agentId]);

  const displayName = detail
    ? detail.name ?? `${detail.role} ${agentId.slice(0, 8)}`
    : agentId.slice(0, 8);
  const Icon = detail ? roleIcon[detail.role] : roleIcon.worker;
  const canTerminate = detail && detail.state !== "terminated" && detail.state !== "error";

  return (
    <Rnd
      default={{
        x: windowState.x,
        y: windowState.y,
        width: windowState.width,
        height: windowState.height,
      }}
      minWidth={500}
      minHeight={350}
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
          <span className="text-[10px] text-zinc-500 font-mono">{agentId.slice(0, 8)}</span>
          {detail && (
            <Badge variant="outline" className={`text-[10px] ${stateBadgeColor[detail.state]}`}>
              {detail.state}
            </Badge>
          )}
          {canTerminate && (
            <button
              onClick={terminateAgent}
              title="Terminate agent"
              className="rounded p-0.5 text-zinc-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
            >
              <Square className="size-3" />
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setViewMode("chat")}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                viewMode === "chat"
                  ? "bg-zinc-600 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Chat
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
                      <span className="text-[10px] text-zinc-400 font-mono truncate block">{detail.id}</span>
                    </DetailField>
                    {detail.branch && (
                      <DetailField label="Branch">
                        <span className="text-xs text-zinc-300 font-mono break-all">{detail.branch}</span>
                      </DetailField>
                    )}
                    <DetailField label="Task">
                      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap break-words line-clamp-6">
                        {detail.task_prompt}
                      </p>
                    </DetailField>
                    <DetailField label="Status">
                      <p className="text-xs text-zinc-300 break-words">
                        {detail.status_description || "\u2014"}
                      </p>
                    </DetailField>
                    {detail.supervisor_id && (
                      <DetailField label="Supervisor">
                        <span className="text-xs text-zinc-400 font-mono truncate block">{detail.supervisor_id}</span>
                      </DetailField>
                    )}
                    {detail.children.length > 0 && (
                      <DetailField label="Children">
                        <div className="space-y-0.5">
                          {detail.children.map((c) => (
                            <div key={c.id} className="text-[11px] text-zinc-400">
                              <span className="text-zinc-300">{c.name ?? c.role}</span>{" "}
                              <span className="font-mono text-zinc-500">{c.id.slice(0, 8)}</span>
                            </div>
                          ))}
                        </div>
                      </DetailField>
                    )}
                    {Object.keys(detail.memory).length > 0 && (
                      <DetailField label="Memory">
                        <div className="space-y-0.5">
                          {Object.entries(detail.memory).map(([k, v]) => (
                            <div key={k} className="text-[11px]">
                              <span className="text-zinc-500 font-mono">{k}:</span>{" "}
                              <span className="text-zinc-300">{v}</span>
                            </div>
                          ))}
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
                <ScrollArea className="flex-1 min-h-0">
                  {viewMode === "chat" ? (
                    <div className="space-y-2 px-3 py-2">
                      {chatItems.map((item, i) => (
                        <ChatItemRenderer key={i} item={item} />
                      ))}
                      <div ref={chatEndRef} />
                    </div>
                  ) : (
                    <>
                      {detail?.history && <HistoryView history={detail.history} />}
                      <div ref={chatEndRef} />
                    </>
                  )}
                </ScrollArea>
                <div className="border-t border-zinc-700/60 p-2 flex gap-2 items-end">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    onInput={onTextareaInput}
                    rows={1}
                    placeholder="Send a message..."
                    className="flex-1 resize-none rounded bg-zinc-800 border border-zinc-700 px-2 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 scrollbar-none"
                    style={{ maxHeight: 200 }}
                  />
                  <button
                    onClick={sendMsg}
                    className="shrink-0 rounded bg-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-600 hover:text-zinc-100 transition-colors"
                  >
                    <Send className="size-3.5" />
                  </button>
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
        <div className="max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed bg-blue-600/20 text-blue-200">
          <p className="whitespace-pre-wrap break-words">{item.content}</p>
        </div>
      </div>
    );
  }

  if (item.kind === "assistant") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed bg-zinc-800/80 text-zinc-200">
          <p className="whitespace-pre-wrap break-words">{item.content}</p>
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

function ThinkingBlock({ content, streaming }: { content: string; streaming?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n");
  const isLong = lines.length > 3 || content.length > 200;
  const showCollapsed = !expanded && isLong;

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-950/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-amber-300/80 hover:text-amber-200 transition-colors"
      >
        <Brain className="size-3 shrink-0" />
        <span className="font-medium">Thinking</span>
        {streaming && <span className="ml-1 text-amber-400/60 animate-pulse">...</span>}
        <span className="ml-auto">
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </span>
      </button>
      {(expanded || showCollapsed) && (
        <div className="relative px-2.5 pb-2">
          <div className={showCollapsed ? "max-h-[3.6em] overflow-hidden" : ""}>
            <p className="whitespace-pre-wrap break-words text-[11px] leading-[1.2em] text-amber-200/60">
              {content}
            </p>
          </div>
          {showCollapsed && (
            <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-amber-950/40 to-transparent pointer-events-none rounded-b-lg" />
          )}
        </div>
      )}
      {!expanded && !showCollapsed && !isLong && (
        <div className="px-2.5 pb-2">
          <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-amber-200/60">
            {content}
          </p>
        </div>
      )}
    </div>
  );
}

function ErrorBlock({ content }: { content: string }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1">
        <AlertCircle className="size-3.5 text-red-400 shrink-0" />
        <span className="text-[11px] font-medium text-red-300">Error</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-red-200/70">
        {content}
      </p>
    </div>
  );
}

function ToolUseBlock({ item }: { item: Extract<ChatItem, { kind: "tool_use" }> }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-800/40">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-zinc-300 hover:text-zinc-100 transition-colors"
      >
        <Wrench className="size-3 shrink-0 text-zinc-500" />
        <Badge variant="outline" className="text-[10px] bg-zinc-700/50 border-zinc-600 text-zinc-300 px-1.5 py-0">
          {item.toolName}
        </Badge>
        {item.result !== null ? (
          <span className="text-emerald-400/70 text-[10px]">done</span>
        ) : item.resultStreaming ? (
          <span className="text-blue-400/70 text-[10px] animate-pulse">running</span>
        ) : null}
        <span className="ml-auto">
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-zinc-700/30 px-2.5 py-2 space-y-2">
          {item.args && Object.keys(item.args).length > 0 && (
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Arguments</div>
              <pre className="text-[10px] text-zinc-400 bg-zinc-900/50 rounded p-1.5 overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                {JSON.stringify(item.args, null, 2)}
              </pre>
            </div>
          )}
          {item.result !== null && (
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Result</div>
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

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{label}</div>
      <div>{children}</div>
    </div>
  );
}
