from __future__ import annotations

import json
import threading
import time as _time
import traceback
import uuid as _uuid
from functools import lru_cache
from queue import Empty, Queue
from typing import Any

from loguru import logger

from app.events import event_bus
from app.models import (
    AgentState,
    AssistantText,
    AssistantThinking,
    ContentDelta,
    ErrorEntry,
    Event,
    EventType,
    HistoryEntry,
    Message,
    NodeConfig,
    NodeType,
    ReceivedMessage,
    SystemEntry,
    SystemInjection,
    ThinkingDelta,
    TodoItem,
    ToolCall,
    ToolResultDelta,
)
from app.prompts import get_system_prompt
from app.providers.gateway import gateway


@lru_cache(maxsize=1)
def _get_tool_registry() -> Any:
    from app.tools import build_tool_registry

    return build_tool_registry()


class Agent:
    def __init__(
        self,
        config: NodeConfig,
        uuid: str | None = None,
    ) -> None:
        self.uuid = uuid or str(_uuid.uuid4())
        self.config = config
        self.node_type = config.node_type
        self.role_id = config.role_id
        self.state = AgentState.INITIALIZING
        self.todos: list[TodoItem] = []
        self.connections: list[str] = []
        self.history: list[HistoryEntry] = []
        self._message_queue: Queue[Message] = Queue()
        self._terminate = threading.Event()
        self._idle_requested: bool = False
        self._thread: threading.Thread | None = None
        self._termination_reason: str = ""
        self._connections_lock = threading.Lock()
        self._history_lock = threading.Lock()
        self._log = logger.bind(
            agent_id=self.uuid[:8], node_type=self.config.node_type.value
        )

    def add_connection(self, other_uuid: str) -> None:
        with self._connections_lock:
            if other_uuid not in self.connections:
                self.connections.append(other_uuid)

    def is_connected_to(self, uuid: str) -> bool:
        with self._connections_lock:
            return uuid in self.connections

    def get_connections_snapshot(self) -> list[str]:
        with self._connections_lock:
            return list(self.connections)

    def get_history_snapshot(self) -> list[HistoryEntry]:
        with self._history_lock:
            return list(self.history)

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run,
            name=f"agent-{self.uuid[:8]}",
            daemon=True,
        )
        self._thread.start()
        event_bus.emit(
            Event(
                type=EventType.NODE_CREATED,
                agent_id=self.uuid,
                data={
                    "node_type": self.config.node_type.value,
                    "role_id": self.config.role_id,
                    "name": self.config.name,
                },
            ),
        )

    def _append_history(self, entry: HistoryEntry) -> None:
        with self._history_lock:
            self.history.append(entry)
        data = entry.serialize()
        self._log.debug(
            "History append: type={}, content_len={}",
            data.get("type"),
            len(getattr(entry, "content", None) or "")
            if hasattr(entry, "content")
            else 0,
        )
        event_bus.emit(
            Event(
                type=EventType.HISTORY_ENTRY_ADDED,
                agent_id=self.uuid,
                data=data,
            ),
        )

    def _run(self) -> None:
        system_prompt = get_system_prompt(self.config)
        self._append_history(SystemEntry(content=system_prompt))

        self.set_state(AgentState.IDLE, "initialized, awaiting first message")
        self._log.info("Agent started, waiting for first message")
        self._wait_for_input()

        if self._terminate.is_set():
            self.set_state(AgentState.TERMINATED, "terminated before first message")
            return

        while not self._terminate.is_set():
            try:
                self._drain_messages()
                self._inject_system_context()

                tools_schema = _get_tool_registry().get_tools_schema(self)
                messages = self._build_messages()

                self._log.debug(
                    "LLM request: messages={}, tools={}, history_len={}",
                    len(messages),
                    len(tools_schema) if tools_schema else 0,
                    len(self.history),
                )

                def _on_llm_chunk(chunk_type: str, text: str) -> None:
                    delta: ContentDelta | ThinkingDelta
                    if chunk_type == "content":
                        delta = ContentDelta(text=text)
                    elif chunk_type == "thinking":
                        delta = ThinkingDelta(text=text)
                    else:
                        return

                    event_bus.emit(
                        Event(
                            type=EventType.HISTORY_ENTRY_DELTA,
                            agent_id=self.uuid,
                            data=delta.serialize(),
                        ),
                    )

                response = gateway.chat(
                    messages=messages,
                    tools=tools_schema or None,
                    on_chunk=_on_llm_chunk,
                )

                self._log.debug(
                    "LLM response: content_len={}, thinking_len={}, tool_calls={}",
                    len(response.content) if response.content else 0,
                    len(response.thinking) if response.thinking else 0,
                    [tc.name for tc in response.tool_calls]
                    if response.tool_calls
                    else None,
                )

                if response.thinking:
                    self._append_history(
                        AssistantThinking(content=response.thinking),
                    )

                if response.tool_calls:
                    self._log.debug(
                        "Processing {} tool call(s)",
                        len(response.tool_calls),
                    )
                    if response.content:
                        self._append_history(
                            AssistantText(content=response.content),
                        )
                    for tc in response.tool_calls:
                        self._handle_tool_call(tc.name, tc.arguments, tc.id)
                        if self._terminate.is_set() or self._idle_requested:
                            break
                    if self._idle_requested:
                        self._idle_requested = False
                        if not self._terminate.is_set():
                            self._log.debug("Idle requested, waiting for input")
                            self._wait_for_input()
                elif response.content:
                    entry = AssistantText(content=response.content)
                    self._append_history(entry)

                    if self.node_type == NodeType.STEWARD:
                        event_bus.emit(
                            Event(
                                type=EventType.STEWARD_CONTENT,
                                agent_id=self.uuid,
                                data={"content": response.content},
                            ),
                        )

                    self._log.debug("No tool calls, transitioning to IDLE")
                    self.set_state(AgentState.IDLE, "text response, no tool calls")
                    self._wait_for_input()
                else:
                    self._log.warning(
                        "LLM returned empty response (no content, no tool_calls)",
                    )

            except Exception as exc:
                self._log.exception("Agent error")
                tb_str = traceback.format_exc()
                self._append_history(
                    ErrorEntry(content=f"{type(exc).__name__}: {exc}\n\n{tb_str}"),
                )
                self.set_state(AgentState.ERROR, f"{type(exc).__name__}: {exc}")
                self._wait_for_input()
                if self._terminate.is_set():
                    break

        self.set_state(AgentState.TERMINATED, self._termination_reason or "finished")
        self._log.info(
            "Agent terminated (reason: {})",
            self._termination_reason or "finished",
        )
        event_bus.emit(
            Event(
                type=EventType.NODE_TERMINATED,
                agent_id=self.uuid,
                data={"reason": self._termination_reason or "finished"},
            ),
        )

    def _inject_system_context(self) -> None:
        if not self.todos:
            return
        lines = []
        for t in self.todos:
            mark = "[x]" if t.done else "[ ]"
            lines.append(f"  {mark} {t.text}")
        todo_text = "Current TODO list:\n" + "\n".join(lines)
        with self._history_lock:
            for i in range(len(self.history) - 1, -1, -1):
                entry = self.history[i]
                if isinstance(entry, SystemInjection) and entry.content.startswith(
                    "Current TODO list:"
                ):
                    self.history.pop(i)
                    break
        self._append_history(SystemInjection(content=todo_text))

    def _build_messages(self) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        pending_tool_calls: list[dict[str, Any]] = []

        with self._history_lock:
            history_snapshot = list(self.history)

        for entry in history_snapshot:
            if isinstance(entry, SystemEntry):
                messages.append({"role": "system", "content": entry.content})

            elif isinstance(entry, ReceivedMessage):
                self._flush_tool_calls(messages, pending_tool_calls)
                payload = json.dumps({"from": entry.from_id, "content": entry.content})
                messages.append({"role": "user", "content": payload})

            elif isinstance(entry, SystemInjection):
                self._flush_tool_calls(messages, pending_tool_calls)
                payload = json.dumps({"system": entry.content})
                messages.append({"role": "user", "content": payload})

            elif isinstance(entry, AssistantText):
                self._flush_tool_calls(messages, pending_tool_calls)
                messages.append({"role": "assistant", "content": entry.content})

            elif isinstance(entry, AssistantThinking):
                pass

            elif isinstance(entry, ToolCall):
                if entry.streaming:
                    continue

                pending_tool_calls.append(
                    {
                        "id": entry.tool_call_id,
                        "type": "function",
                        "function": {
                            "name": entry.tool_name,
                            "arguments": json.dumps(entry.arguments)
                            if entry.arguments
                            else "{}",
                        },
                    }
                )

                if entry.result is not None:
                    self._flush_tool_calls(messages, pending_tool_calls)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": entry.tool_call_id,
                            "content": entry.result,
                        }
                    )

            elif isinstance(entry, ErrorEntry):
                pass

        self._flush_tool_calls(messages, pending_tool_calls)
        return messages

    @staticmethod
    def _flush_tool_calls(
        messages: list[dict[str, Any]],
        pending: list[dict[str, Any]],
    ) -> None:
        if not pending:
            return
        last = messages[-1] if messages else None
        if last and last["role"] == "assistant":
            last.setdefault("tool_calls", []).extend(pending)
        else:
            messages.append({"role": "assistant", "tool_calls": list(pending)})
        pending.clear()

    def _drain_messages(self) -> None:
        drained: list[Message] = []
        while True:
            try:
                drained.append(self._message_queue.get_nowait())
            except Empty:
                break

        if drained:
            self._log.debug("Drained {} message(s) from queue", len(drained))

        for msg in drained:
            self._log.debug(
                "Message from {}: {}",
                msg.from_id,
                (msg.content[:100] + "...") if len(msg.content) > 100 else msg.content,
            )
            self._append_history(
                ReceivedMessage(content=msg.content, from_id=msg.from_id),
            )

    def _wait_for_input(self) -> None:
        while not self._terminate.is_set():
            msg = self.try_get_message(timeout=2.0)
            if msg:
                self._append_history(
                    ReceivedMessage(content=msg.content, from_id=msg.from_id),
                )
                self.set_state(
                    AgentState.RUNNING,
                    f"received message from {msg.from_id}",
                )
                return

    def _handle_tool_call(
        self,
        name: str,
        arguments: dict[str, Any],
        call_id: str,
    ) -> str:
        self._log.debug(
            "Tool call: name={}, call_id={}, args={}",
            name,
            call_id[:8],
            json.dumps(arguments, ensure_ascii=False)[:200],
        )

        tool = _get_tool_registry().get(name)
        if tool is None:
            self._log.warning("Unknown tool: {}", name)
            error_msg = json.dumps({"error": f"Unknown tool: {name}"})
            self._append_history(
                ToolCall(
                    tool_name=name,
                    tool_call_id=call_id,
                    arguments=arguments,
                    result=error_msg,
                    streaming=False,
                ),
            )
            return error_msg

        event_bus.emit(
            Event(
                type=EventType.TOOL_CALLED,
                agent_id=self.uuid,
                data={"tool": name, "arguments": arguments},
            ),
        )

        streaming_entry = ToolCall(
            tool_name=name,
            tool_call_id=call_id,
            arguments=arguments,
            streaming=True,
        )
        self._append_history(streaming_entry)

        def _on_tool_output(text: str) -> None:
            delta = ToolResultDelta(tool_call_id=call_id, text=text)
            event_bus.emit(
                Event(
                    type=EventType.HISTORY_ENTRY_DELTA,
                    agent_id=self.uuid,
                    data=delta.serialize(),
                ),
            )

        t0 = _time.perf_counter()
        try:
            result = tool.execute(self, arguments, on_output=_on_tool_output)
            elapsed = _time.perf_counter() - t0
            self._log.debug(
                "Tool {} completed in {:.2f}s, result_len={}",
                name,
                elapsed,
                len(result) if result else 0,
            )

            self._finalize_tool_call(call_id, name, arguments, result)
            return result
        except Exception as e:
            elapsed = _time.perf_counter() - t0
            self._log.exception("Tool {} failed after {:.2f}s", name, elapsed)
            error_msg = json.dumps({"error": str(e)})
            self._finalize_tool_call(call_id, name, arguments, error_msg)
            return error_msg

    def _finalize_tool_call(
        self,
        call_id: str,
        name: str,
        arguments: dict[str, Any],
        result: str,
    ) -> None:
        final: ToolCall | None = None
        with self._history_lock:
            for i in range(len(self.history) - 1, -1, -1):
                entry = self.history[i]
                if (
                    isinstance(entry, ToolCall)
                    and entry.tool_call_id == call_id
                    and entry.streaming
                ):
                    final = ToolCall(
                        tool_name=name,
                        tool_call_id=call_id,
                        arguments=arguments,
                        result=result,
                        streaming=False,
                    )
                    self.history[i] = final
                    break

        if final is not None:
            event_bus.emit(
                Event(
                    type=EventType.HISTORY_ENTRY_ADDED,
                    agent_id=self.uuid,
                    data=final.serialize(),
                ),
            )

    def enqueue_message(self, msg: Message) -> None:
        self._message_queue.put(msg)

    def try_get_message(self, timeout: float = 0) -> Message | None:
        try:
            return (
                self._message_queue.get(timeout=timeout)
                if timeout > 0
                else self._message_queue.get_nowait()
            )
        except Empty:
            return None

    def inject_system_message(self, content: str) -> None:
        self._append_history(SystemInjection(content=content))

    def set_state(self, state: AgentState, reason: str = "") -> None:
        old = self.state
        self.state = state
        if old != state:
            self._log.debug(
                "State: {} -> {}{}",
                old.value,
                state.value,
                f" ({reason})" if reason else "",
            )
            event_bus.emit(
                Event(
                    type=EventType.NODE_STATE_CHANGED,
                    agent_id=self.uuid,
                    data={
                        "old_state": old.value,
                        "new_state": state.value,
                        "todos": [t.serialize() for t in self.todos],
                    },
                ),
            )

    def request_termination(self, reason: str = "") -> None:
        self._termination_reason = reason
        self._terminate.set()

    def terminate_and_wait(self, timeout: float = 10.0) -> None:
        self.request_termination("shutdown")
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=timeout)
