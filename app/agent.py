from __future__ import annotations

import json
import threading
from dataclasses import asdict
from queue import Empty, Queue
from typing import Any

from loguru import logger

from app.events import event_bus
from app.models import (
    AgentConfig,
    AgentState,
    ContentDelta,
    Event,
    EventType,
    HistoryEntry,
    HistoryType,
    Message,
    ThinkingDelta,
    ToolResultDelta,
)
from app.prompts import get_system_prompt
from app.providers import LLMProvider
from app.tools import build_tool_registry, is_tool_available

_tool_registry = build_tool_registry()


class Agent:
    def __init__(
        self,
        config: AgentConfig,
        provider: LLMProvider,
        uuid: str | None = None,
    ) -> None:
        import uuid as _uuid

        self.uuid = uuid or str(_uuid.uuid4())
        self.config = config
        self.provider = provider
        self.state = AgentState.INITIALIZING
        self.memory: dict[str, str] = {}
        self.status_description: str = ""
        self.children_ids: list[str] = []
        self.history: list[HistoryEntry] = []
        self._message_queue: Queue[Message] = Queue()
        self._terminate = threading.Event()
        self._thread: threading.Thread | None = None
        self._termination_reason: str = ""
        self._log = logger.bind(agent_id=self.uuid[:8], role=self.config.role.value)

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run,
            name=f"agent-{self.uuid[:8]}",
            daemon=True,
        )
        self._thread.start()
        event_bus.emit(
            Event(
                type=EventType.AGENT_CREATED,
                agent_id=self.uuid,
                data={
                    "role": self.config.role.value,
                    "task": self.config.task_prompt[:200],
                    "parent_id": self.config.supervisor_id,
                    "name": self.config.name,
                },
            ),
        )

    def _append_history(self, entry: HistoryEntry) -> None:
        self.history.append(entry)
        self._log.debug(
            "History append: type={}, streaming={}, content_len={}, tool={}",
            entry.type.value,
            entry.streaming,
            len(entry.content) if entry.content else 0,
            entry.tool_name,
        )
        event_bus.emit(
            Event(
                type=EventType.HISTORY_ENTRY_ADDED,
                agent_id=self.uuid,
                data=asdict(entry) | {"type": entry.type.value},
            ),
        )

    def _run(self) -> None:
        system_prompt = get_system_prompt(self.config)
        self._append_history(
            HistoryEntry(type=HistoryType.SYSTEM, content=system_prompt),
        )

        self.set_state(AgentState.IDLE, "initialized, awaiting first message")
        self._log.info("Agent started, waiting for first message")
        self._wait_for_input()

        if self._terminate.is_set():
            self.set_state(AgentState.TERMINATED, "terminated before first message")
            return

        while not self._terminate.is_set():
            try:
                self._drain_messages()

                tools_schema = _tool_registry.get_tools_schema(self)
                messages = self._build_messages()

                self._log.debug(
                    "LLM request: messages={}, tools={}, history_len={}",
                    len(messages),
                    len(tools_schema) if tools_schema else 0,
                    len(self.history),
                )
                for idx, msg in enumerate(messages):
                    role = msg.get("role", "?")
                    content = msg.get("content", "")
                    tool_calls = msg.get("tool_calls")
                    tool_call_id = msg.get("tool_call_id")
                    content_preview = (
                        (content[:200] + "...")
                        if isinstance(content, str) and len(content) > 200
                        else content
                    )
                    if tool_calls:
                        tc_names = [
                            tc.get("function", {}).get("name", "?") for tc in tool_calls
                        ]
                        self._log.debug(
                            "  msg[{}] role={} tool_calls={}",
                            idx,
                            role,
                            tc_names,
                        )
                    elif tool_call_id:
                        self._log.debug(
                            "  msg[{}] role={} tool_call_id={} content_len={}",
                            idx,
                            role,
                            tool_call_id,
                            len(content) if isinstance(content, str) else 0,
                        )
                    else:
                        self._log.debug(
                            "  msg[{}] role={} content={}",
                            idx,
                            role,
                            content_preview,
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
                            data=asdict(delta),
                        ),
                    )

                response = self.provider.chat(
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
                        HistoryEntry(
                            type=HistoryType.ASSISTANT_THINKING,
                            content=response.thinking,
                        ),
                    )

                if response.tool_calls:
                    self._log.debug(
                        "Processing {} tool call(s)",
                        len(response.tool_calls),
                    )
                    if response.content:
                        self._append_history(
                            HistoryEntry(
                                type=HistoryType.ASSISTANT_TEXT,
                                content=response.content,
                            ),
                        )
                    for tc in response.tool_calls:
                        self._handle_tool_call(tc.name, tc.arguments, tc.id)
                        if self._terminate.is_set():
                            break
                elif response.content:
                    self._append_history(
                        HistoryEntry(
                            type=HistoryType.ASSISTANT_TEXT,
                            content=response.content,
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
                import traceback

                tb_str = traceback.format_exc()
                self._append_history(
                    HistoryEntry(
                        type=HistoryType.ERROR,
                        content=f"{type(exc).__name__}: {exc}\n\n{tb_str}",
                    ),
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
                type=EventType.AGENT_TERMINATED,
                agent_id=self.uuid,
                data={"reason": self._termination_reason or "finished"},
            ),
        )

    def _build_messages(self) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        pending_tool_calls: list[dict[str, Any]] = []

        for entry in self.history:
            if entry.type == HistoryType.SYSTEM:
                messages.append({"role": "system", "content": entry.content})

            elif entry.type == HistoryType.RECEIVED_MESSAGE:
                self._flush_tool_calls(messages, pending_tool_calls)
                prefixed = f"[Message from {entry.from_id}]: {entry.content}"
                messages.append({"role": "user", "content": prefixed})

            elif entry.type == HistoryType.SYSTEM_INJECTION:
                self._flush_tool_calls(messages, pending_tool_calls)
                prefixed = f"[System]: {entry.content}"
                messages.append({"role": "user", "content": prefixed})

            elif entry.type == HistoryType.ASSISTANT_TEXT:
                self._flush_tool_calls(messages, pending_tool_calls)
                messages.append({"role": "assistant", "content": entry.content})

            elif entry.type == HistoryType.ASSISTANT_THINKING:
                pass

            elif entry.type == HistoryType.TOOL_CALL:
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
                    },
                )

                if entry.content is not None:
                    self._flush_tool_calls(messages, pending_tool_calls)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": entry.tool_call_id,
                            "content": entry.content,
                        },
                    )

            elif entry.type in (HistoryType.SENT_MESSAGE, HistoryType.ERROR):
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
                HistoryEntry(
                    type=HistoryType.RECEIVED_MESSAGE,
                    content=msg.content,
                    from_id=msg.from_id,
                ),
            )

    def _wait_for_input(self) -> None:
        while not self._terminate.is_set():
            msg = self.try_get_message(timeout=2.0)
            if msg:
                self._append_history(
                    HistoryEntry(
                        type=HistoryType.RECEIVED_MESSAGE,
                        content=msg.content,
                        from_id=msg.from_id,
                    ),
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

        tool = _tool_registry.get(name)
        if tool is None:
            self._log.warning("Unknown tool: {}", name)
            error_msg = json.dumps({"error": f"Unknown tool: {name}"})
            self._append_history(
                HistoryEntry(
                    type=HistoryType.TOOL_CALL,
                    tool_name=name,
                    tool_call_id=call_id,
                    arguments=arguments,
                    content=error_msg,
                    streaming=False,
                ),
            )
            return error_msg

        if not is_tool_available(self.config.permissions, name):
            self._log.warning("Permission denied for tool: {}", name)
            error_msg = json.dumps({"error": f"Permission denied for tool: {name}"})
            self._append_history(
                HistoryEntry(
                    type=HistoryType.TOOL_CALL,
                    tool_name=name,
                    tool_call_id=call_id,
                    arguments=arguments,
                    content=error_msg,
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

        self._append_history(
            HistoryEntry(
                type=HistoryType.TOOL_CALL,
                tool_name=name,
                tool_call_id=call_id,
                arguments=arguments,
                streaming=True,
            ),
        )

        def _on_tool_output(text: str) -> None:
            delta = ToolResultDelta(tool_call_id=call_id, text=text)
            event_bus.emit(
                Event(
                    type=EventType.HISTORY_ENTRY_DELTA,
                    agent_id=self.uuid,
                    data=asdict(delta),
                ),
            )

        import time as _time

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

            for i in range(len(self.history) - 1, -1, -1):
                entry = self.history[i]
                if (
                    entry.type == HistoryType.TOOL_CALL
                    and entry.tool_call_id == call_id
                    and entry.streaming
                ):
                    self.history[i] = HistoryEntry(
                        type=HistoryType.TOOL_CALL,
                        tool_name=name,
                        tool_call_id=call_id,
                        arguments=arguments,
                        content=result,
                        streaming=False,
                    )
                    event_bus.emit(
                        Event(
                            type=EventType.HISTORY_ENTRY_ADDED,
                            agent_id=self.uuid,
                            data=asdict(self.history[i])
                            | {"type": self.history[i].type.value},
                        ),
                    )
                    break

            return result
        except Exception as e:
            elapsed = _time.perf_counter() - t0
            self._log.exception("Tool {} failed after {:.2f}s", name, elapsed)
            error_msg = json.dumps({"error": str(e)})

            for i in range(len(self.history) - 1, -1, -1):
                entry = self.history[i]
                if (
                    entry.type == HistoryType.TOOL_CALL
                    and entry.tool_call_id == call_id
                    and entry.streaming
                ):
                    self.history[i] = HistoryEntry(
                        type=HistoryType.TOOL_CALL,
                        tool_name=name,
                        tool_call_id=call_id,
                        arguments=arguments,
                        content=error_msg,
                        streaming=False,
                    )
                    event_bus.emit(
                        Event(
                            type=EventType.HISTORY_ENTRY_ADDED,
                            agent_id=self.uuid,
                            data=asdict(self.history[i])
                            | {"type": self.history[i].type.value},
                        ),
                    )
                    break

            return error_msg

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
        self._append_history(
            HistoryEntry(
                type=HistoryType.SYSTEM_INJECTION,
                content=content,
            ),
        )

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
                    type=EventType.AGENT_STATE_CHANGED,
                    agent_id=self.uuid,
                    data={
                        "old_state": old.value,
                        "new_state": state.value,
                        "status_description": self.status_description,
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
