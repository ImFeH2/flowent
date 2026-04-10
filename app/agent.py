from __future__ import annotations

import json
import re
import threading
import time as _time
import traceback
import uuid as _uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from functools import lru_cache, partial
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
    LLMResponse,
    Message,
    NodeConfig,
    NodeType,
    ReceivedMessage,
    ReceivedMessageDelta,
    SentMessage,
    SentMessageDelta,
    StateEntry,
    SystemEntry,
    ThinkingDelta,
    TodoItem,
    ToolCall,
    ToolResultDelta,
)
from app.prompts import get_system_prompt
from app.providers.errors import LLMProviderError
from app.providers.gateway import gateway
from app.providers.thinking import ThinkTagParser, split_thinking_content
from app.security import authorize
from app.settings import get_settings


@lru_cache(maxsize=1)
def _get_tool_registry() -> Any:
    from app.tools import build_tool_registry

    return build_tool_registry()


@dataclass
class WakeSignal:
    reason: str
    payload: dict[str, Any]
    resume_reason: str = ""


@dataclass
class StreamingContentState:
    mode: str = "pending"
    pending_chunks: list[str] = field(default_factory=list)
    content_buffer: str = ""
    thinking_buffer: str = ""
    saw_content_chunks: bool = False
    think_parser: ThinkTagParser = field(default_factory=ThinkTagParser)
    emitted_human_content: bool = False
    streaming_message_id: str | None = None
    streamed_message_body: str = ""


@dataclass
class RoutedContentResult:
    sent_messages: list[SentMessage] = field(default_factory=list)
    had_routed_header: bool = False
    route_errors: list[str] = field(default_factory=list)
    had_additional_routed_headers: bool = False


class InterruptRequestedError(Exception):
    def __init__(self, stream_state: StreamingContentState | None = None) -> None:
        super().__init__("interrupt requested")
        self.stream_state = stream_state


_HEADER_RE = re.compile(r"^@([^:\n]+):[ \t]*(.*)$", re.DOTALL)
_LINE_HEADER_RE = re.compile(r"^@[^:\n]+:[ \t]*", re.MULTILINE)


def extract_routed_content(content: str) -> tuple[str, list[tuple[list[str], str]]]:
    first_line_end = content.find("\n")
    first_line = content[:first_line_end] if first_line_end != -1 else content
    rest = content[first_line_end + 1 :] if first_line_end != -1 else ""

    match = _HEADER_RE.match(first_line)
    if not match:
        return content, []

    target_ref = match.group(1).strip()
    body_first_line = match.group(2).strip()
    body = (body_first_line + ("\n" + rest if rest else "")).strip()

    if not target_ref or not body:
        return content, []

    return "", [([target_ref], body)]


def extract_routed_header(content: str) -> tuple[list[str], str] | None:
    first_line_end = content.find("\n")
    first_line = content[:first_line_end] if first_line_end != -1 else content
    rest = content[first_line_end + 1 :] if first_line_end != -1 else ""

    match = _HEADER_RE.match(first_line)
    if not match:
        return None

    target_ref = match.group(1).strip()
    if not target_ref:
        return None

    body_first_line = match.group(2)
    body = body_first_line + ("\n" + rest if rest else "")
    return [target_ref], body


def has_additional_routed_headers(content: str) -> bool:
    first_line_end = content.find("\n")
    first_line = content[:first_line_end] if first_line_end != -1 else content
    if not _HEADER_RE.match(first_line):
        return False
    if first_line_end == -1:
        return False
    rest = content[first_line_end + 1 :]
    return bool(_LINE_HEADER_RE.search(rest))


def split_plain_content_before_later_routed_header(
    content: str,
) -> tuple[str, str | None]:
    first_line_end = content.find("\n")
    if first_line_end == -1:
        return content, None
    first_line = content[:first_line_end]
    if _HEADER_RE.match(first_line):
        return content, None
    rest = content[first_line_end + 1 :]
    match = _LINE_HEADER_RE.search(rest)
    if match is None:
        return content, None
    header_start = first_line_end + 1 + match.start()
    return content[:header_start].rstrip(), content[header_start:].strip()


def classify_streaming_content(content: str) -> str:
    if not content:
        return "pending"

    if not content.startswith("@"):
        return "plain"

    first_line_end = content.find("\n")
    first_line = content[:first_line_end] if first_line_end != -1 else content

    if ":" in first_line:
        return "routed"

    if first_line_end != -1:
        return "plain"

    return "pending"


def build_routed_content(target_refs: list[str], body: str) -> str:
    targets = ", ".join(target_refs)
    first_line, separator, rest = body.partition("\n")
    header = f"@{targets}: {first_line}"
    if not separator:
        return header
    return f"{header}\n{rest}"


def build_error_context(content: str) -> str:
    return f"<system>Previous runtime error:\n{content}</system>"


class Agent:
    def __init__(
        self,
        config: NodeConfig,
        uuid: str | None = None,
    ) -> None:
        self.uuid = uuid or str(_uuid.uuid4())
        self.config = config
        self.node_type = config.node_type
        self.role_name = config.role_name
        self.state = AgentState.INITIALIZING
        self.todos: list[TodoItem] = []
        self.connections: list[str] = []
        self.history: list[HistoryEntry] = []
        self.history.append(StateEntry(state=self.state.value, reason="created"))
        self._terminate = threading.Event()
        self._interrupt_requested = threading.Event()
        self._interrupt_callback_lock = threading.Lock()
        self._interrupt_callback: Callable[[], None] | None = None
        self._idle_state_event = threading.Event()
        self._idle_started_at: float | None = None
        self._idle_started_by_tool_call_id: str | None = None
        self._wake_queue: Queue[WakeSignal] = Queue()
        self._thread: threading.Thread | None = None
        self._termination_reason: str = ""
        self._preserve_workspace_state_on_exit = False
        self._connections_lock = threading.Lock()
        self._history_lock = threading.Lock()
        self._todos_lock = threading.Lock()
        self._runtime_notice_lock = threading.Lock()
        self._pending_runtime_notices: list[str] = []
        self._pending_input_turn = False
        self._turn_started_with_pending_input = False
        self._turn_made_progress = False
        self._log = logger.bind(
            agent_id=self.uuid[:8], node_type=self.config.node_type.value
        )

    def _persist_workspace_node(self) -> None:
        if not self.config.tab_id:
            return
        from app.models import GraphNodeRecord
        from app.workspace_store import workspace_store

        existing = workspace_store.get_node_record(self.uuid)
        record = GraphNodeRecord(
            id=self.uuid,
            config=self.config,
            state=self.state,
            todos=self.get_todos_snapshot(),
            history=self.get_history_snapshot(),
            position=existing.position if existing is not None else None,
            created_at=existing.created_at if existing is not None else _time.time(),
            updated_at=_time.time(),
        )
        workspace_store.upsert_node_record(record)

    def add_connection(self, other_uuid: str) -> None:
        with self._connections_lock:
            if other_uuid not in self.connections:
                self.connections.append(other_uuid)

    def remove_connection(self, other_uuid: str) -> None:
        with self._connections_lock:
            if other_uuid in self.connections:
                self.connections.remove(other_uuid)

    def is_connected_to(self, uuid: str) -> bool:
        with self._connections_lock:
            return uuid in self.connections

    def get_connections_snapshot(self) -> list[str]:
        with self._connections_lock:
            return list(self.connections)

    def get_history_snapshot(self) -> list[HistoryEntry]:
        with self._history_lock:
            return list(self.history)

    def get_todos_snapshot(self) -> list[TodoItem]:
        with self._todos_lock:
            return [TodoItem(text=t.text) for t in self.todos]

    def prime_runtime_state(self, state: AgentState) -> None:
        self.state = state
        if state == AgentState.IDLE:
            self._idle_started_at = _time.perf_counter()
            self._idle_state_event.set()
        else:
            self._idle_started_at = None
            self._idle_started_by_tool_call_id = None
            self._idle_state_event.clear()

    def set_todos(self, todos: list[TodoItem]) -> None:
        with self._todos_lock:
            self.todos = [TodoItem(text=t.text) for t in todos]
        self._persist_workspace_node()

    def request_idle(self, *, tool_call_id: str | None = None) -> str:
        if self._has_pending_runtime_notices():
            self._log.debug("Skipping idle because runtime notice is pending")
            return ""
        if (
            self.node_type == NodeType.ASSISTANT
            and self._turn_started_with_pending_input
            and not self._turn_made_progress
        ):
            self._queue_runtime_notice(self._build_idle_without_progress_notice())
            self._log.debug("Skipping idle because fresh input is still unhandled")
            return ""
        actionable_todo = self._get_first_actionable_todo()
        if actionable_todo is not None:
            self._queue_runtime_notice(
                self._build_actionable_todo_notice(actionable_todo)
            )
            self._log.debug("Skipping idle because TODO is still actionable")
            return ""
        self._idle_started_by_tool_call_id = tool_call_id
        self.set_state(AgentState.IDLE)
        signal = self._wait_for_wakeup()
        elapsed = self._get_idle_elapsed_seconds(tool_call_id=tool_call_id)
        self._resume_from_wakeup(signal)
        return f"idle {elapsed:.2f}s"

    def request_sleep(self, *, seconds: float) -> str:
        duration = max(0.0, seconds)
        started_at = _time.perf_counter()
        remaining = duration
        while remaining > 0 and not self._terminate.is_set():
            self._raise_if_interrupt_requested()
            step_started_at = _time.perf_counter()
            self._terminate.wait(timeout=min(remaining, 0.1))
            remaining -= _time.perf_counter() - step_started_at
        elapsed = max(0.0, _time.perf_counter() - started_at)
        return f"slept {elapsed:.2f}s"

    def _get_idle_elapsed_seconds(self, *, tool_call_id: str | None) -> float:
        started_at = self._idle_started_at
        if started_at is None:
            return 0.0
        if tool_call_id is not None and self._idle_started_by_tool_call_id not in {
            None,
            tool_call_id,
        }:
            return 0.0
        return max(0.0, _time.perf_counter() - started_at)

    def get_contact_ids_snapshot(self) -> list[str]:
        from app.graph_service import get_tab_leader_id
        from app.registry import registry
        from app.workspace_store import workspace_store

        if self.node_type == NodeType.ASSISTANT:
            return [
                leader_id
                for leader_id in (
                    get_tab_leader_id(tab.id) for tab in workspace_store.list_tabs()
                )
                if leader_id and registry.get(leader_id) is not None
            ]

        seen_ids: set[str] = set()
        contact_ids: list[str] = []

        def append_contact(node_id: str) -> None:
            if node_id == self.uuid or node_id in seen_ids:
                return
            if registry.get(node_id) is None:
                return
            seen_ids.add(node_id)
            contact_ids.append(node_id)

        if self.config.tab_id is None:
            return contact_ids

        leader_id = get_tab_leader_id(self.config.tab_id)
        is_leader = leader_id == self.uuid
        assistant = registry.get_assistant()
        if is_leader:
            if assistant is not None:
                append_contact(assistant.uuid)
            for node in registry.get_all():
                if (
                    node.uuid == self.uuid
                    or node.node_type != NodeType.AGENT
                    or node.config.tab_id != self.config.tab_id
                    or node.uuid == leader_id
                ):
                    continue
                append_contact(node.uuid)
            return contact_ids

        if leader_id is not None:
            append_contact(leader_id)

        with self._connections_lock:
            for node_id in self.connections:
                append_contact(node_id)

        for node in registry.get_all():
            if node.uuid == self.uuid or node.node_type != NodeType.AGENT:
                continue
            if node.config.tab_id != self.config.tab_id:
                continue
            if node.uuid == leader_id:
                continue
            if node.is_connected_to(self.uuid):
                append_contact(node.uuid)

        return contact_ids

    def get_contacts_info(self) -> list[dict[str, Any]]:
        from app.graph_service import is_tab_leader
        from app.registry import registry

        result: list[dict[str, Any]] = []
        for contact_id in self.get_contact_ids_snapshot():
            node = registry.get(contact_id)
            if node is None:
                continue
            result.append(
                {
                    "id": node.uuid,
                    "node_type": node.config.node_type.value,
                    "role_name": node.config.role_name,
                    "name": node.config.name,
                    "state": node.state.value,
                    "is_leader": (
                        node.config.tab_id is not None
                        and is_tab_leader(node_id=node.uuid, tab_id=node.config.tab_id)
                    ),
                }
            )
        return result

    def can_contact(self, node_id: str) -> bool:
        return node_id in set(self.get_contact_ids_snapshot())

    def wait_until_idle(self, timeout: float | None = None) -> bool:
        if self.state == AgentState.IDLE:
            return True
        return self._idle_state_event.wait(timeout=timeout)

    def start(self) -> None:
        from app.graph_service import is_tab_leader

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
                    "role_name": self.config.role_name,
                    "name": self.config.name,
                    "tab_id": self.config.tab_id,
                    "is_leader": is_tab_leader(
                        node_id=self.uuid,
                        tab_id=self.config.tab_id,
                    ),
                },
            ),
        )
        self._persist_workspace_node()

    def _append_history(self, entry: HistoryEntry) -> None:
        with self._history_lock:
            self.history.append(entry)
            if isinstance(entry, ReceivedMessage):
                self._pending_input_turn = True
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
        self._persist_workspace_node()

    def _clear_pending_message_wakeups(self) -> None:
        preserved_signals: list[WakeSignal] = []

        while True:
            try:
                signal = self._wake_queue.get_nowait()
            except Empty:
                break

            if signal.reason != "message":
                preserved_signals.append(signal)

        for signal in preserved_signals:
            self._wake_queue.put(signal)

    def clear_chat_history(self, *, interrupt_timeout: float = 5.0) -> None:
        if self.node_type != NodeType.ASSISTANT:
            raise RuntimeError("Only assistant chat history can be cleared")

        if self.state == AgentState.RUNNING:
            if not self.request_interrupt():
                raise RuntimeError("Assistant is not interruptible")
            if not self.wait_until_idle(timeout=interrupt_timeout):
                raise TimeoutError("Assistant did not reach idle before clearing")

        self._clear_pending_message_wakeups()
        with self._runtime_notice_lock:
            self._pending_runtime_notices.clear()
        with self._history_lock:
            self.history = [
                entry
                for entry in self.history
                if isinstance(entry, (SystemEntry, StateEntry))
            ]
            self._pending_input_turn = False
            self._turn_started_with_pending_input = False
            self._turn_made_progress = False

        event_bus.emit(
            Event(
                type=EventType.HISTORY_CLEARED,
                agent_id=self.uuid,
                data={"scope": "assistant_chat"},
            )
        )
        self._persist_workspace_node()

    def _run(self) -> None:
        with logger.contextualize(
            agent_id=self.uuid[:8],
            node_type=self.config.node_type.value,
        ):
            with self._history_lock:
                has_system_entry = any(
                    isinstance(entry, SystemEntry) for entry in self.history
                )
            if has_system_entry:
                self._sync_system_prompt_entry()
            else:
                self._append_history(
                    SystemEntry(content=get_system_prompt(self.config))
                )

            if self.state == AgentState.INITIALIZING:
                self.set_state(AgentState.IDLE, "initialized, awaiting first message")
                self._log.info("Agent started, waiting for first message")
            else:
                self._log.info(
                    "Agent restored in state {}, waiting for input",
                    self.state.value,
                )
            self._wait_for_input()

            if self._terminate.is_set():
                if self._should_preserve_workspace_state_on_exit():
                    self._log.info(
                        "Agent stopped for process exit with state {}",
                        self.state.value,
                    )
                    return
                self._finalize_termination("terminated before first message")
                return

            while not self._terminate.is_set():
                try:
                    self._sync_system_prompt_entry()
                    self._drain_messages()
                    self._turn_started_with_pending_input = self._pending_input_turn
                    self._turn_made_progress = False

                    tools_schema = _get_tool_registry().get_tools_schema(self)
                    messages = self._build_messages()

                    self._log.debug(
                        "LLM request: messages={}, tools={}, history_len={}",
                        len(messages),
                        len(tools_schema) if tools_schema else 0,
                        len(self.history),
                    )
                    stream_state: StreamingContentState | None = None
                    try:
                        response, stream_state = self._chat_with_retries(
                            messages=messages,
                            tools_schema=tools_schema,
                        )
                        self._flush_streaming_think_parser(stream_state)

                        self._log.debug(
                            "LLM response: content_len={}, thinking_len={}, tool_calls={}",
                            len(response.content) if response.content else 0,
                            len(response.thinking) if response.thinking else 0,
                            [tc.name for tc in response.tool_calls]
                            if response.tool_calls
                            else None,
                        )

                        final_thinking = (
                            response.thinking or stream_state.thinking_buffer
                        )
                        final_content = (
                            stream_state.content_buffer
                            if stream_state.saw_content_chunks
                            else response.content
                        )
                        if final_content and final_thinking:
                            final_content, _ = split_thinking_content(final_content)

                        if final_thinking:
                            self._append_history(
                                AssistantThinking(content=final_thinking),
                            )
                            stream_state.thinking_buffer = ""

                        if response.tool_calls:
                            self._log.debug(
                                "Processing {} tool call(s)",
                                len(response.tool_calls),
                            )
                            if final_content:
                                self._record_content_output(
                                    final_content,
                                    emitted_human_content=stream_state.emitted_human_content,
                                    message_id=stream_state.streaming_message_id,
                                )
                                stream_state.content_buffer = ""
                                stream_state.pending_chunks.clear()
                            self._raise_if_interrupt_requested()
                            for tc in response.tool_calls:
                                self._handle_tool_call(tc.name, tc.arguments, tc.id)
                                self._raise_if_interrupt_requested()
                                if self._terminate.is_set():
                                    break
                        elif final_content:
                            self._record_content_output(
                                final_content,
                                emitted_human_content=stream_state.emitted_human_content,
                                message_id=stream_state.streaming_message_id,
                            )
                            stream_state.content_buffer = ""
                            stream_state.pending_chunks.clear()
                            self._log.debug(
                                "No tool calls, continuing execution after text response"
                            )
                        else:
                            self._log.warning(
                                "LLM returned empty response (no content, no tool_calls)",
                            )
                    except InterruptRequestedError as exc:
                        self._handle_interrupt(exc.stream_state or stream_state)
                        if self._terminate.is_set():
                            break
                        continue

                except LLMProviderError as exc:
                    self._interrupt_requested.clear()
                    self.set_interrupt_callback(None)
                    self._log.warning("Agent LLM provider error: {}", exc)
                    error_summary = str(exc)
                    self._append_history(ErrorEntry(content=error_summary))
                    self.set_state(AgentState.ERROR, error_summary)
                    self._wait_for_input()
                    if self._terminate.is_set():
                        break

                except Exception as exc:
                    self._interrupt_requested.clear()
                    self.set_interrupt_callback(None)
                    self._log.exception("Agent error")
                    tb_str = traceback.format_exc()
                    self._append_history(
                        ErrorEntry(content=f"{type(exc).__name__}: {exc}\n\n{tb_str}"),
                    )
                    self.set_state(AgentState.ERROR, f"{type(exc).__name__}: {exc}")
                    self._wait_for_input()
                    if self._terminate.is_set():
                        break

            if self._should_preserve_workspace_state_on_exit():
                self._log.info(
                    "Agent stopped for process exit with state {}",
                    self.state.value,
                )
                return

            self._finalize_termination(self._termination_reason or "finished")

    def _sync_system_prompt_entry(self) -> None:
        system_prompt = get_system_prompt(self.config)
        with self._history_lock:
            for entry in self.history:
                if isinstance(entry, SystemEntry):
                    entry.content = system_prompt
                    break
            else:
                self.history.insert(0, SystemEntry(content=system_prompt))

    @staticmethod
    def _build_runtime_system_message(content: str) -> dict[str, str]:
        return {"role": "user", "content": f"<system>{content}</system>"}

    def _build_runtime_tail_messages(self) -> list[dict[str, str]]:
        with self._todos_lock:
            todos = [TodoItem(text=t.text) for t in self.todos]
        with self._history_lock:
            history_snapshot = list(self.history)
        runtime_notices = self._consume_runtime_notices()
        custom_post_prompt = get_settings().custom_post_prompt.strip()
        messages: list[dict[str, str]] = []
        todo_message = self._build_runtime_todo_message(todos)
        if todo_message is not None:
            messages.append(todo_message)
        messages.append(
            self._build_runtime_post_prompt_message(
                has_todos=bool(todos),
                pending_agent_dispatches=self._get_pending_agent_dispatches(
                    history_snapshot
                ),
            )
        )
        for notice in runtime_notices:
            messages.append(self._build_runtime_system_message(notice))
        if custom_post_prompt:
            messages.append(self._build_runtime_system_message(custom_post_prompt))
        return messages

    def _build_runtime_todo_message(
        self,
        todos: list[TodoItem],
    ) -> dict[str, str] | None:
        if not todos:
            return None
        lines = []
        for todo in todos:
            lines.append(f"  - {todo.text}")
        todo_text = "Current TODO list:\n" + "\n".join(lines)
        return self._build_runtime_system_message(todo_text)

    @staticmethod
    def _get_created_agent_label(payload: dict[str, Any]) -> str | None:
        agent_id = payload.get("agent_id")
        if not isinstance(agent_id, str) or not agent_id:
            agent_id = payload.get("id")
        if not isinstance(agent_id, str) or not agent_id:
            return None
        name = payload.get("name")
        if (not isinstance(name, str) or not name.strip()) and isinstance(
            payload.get("config"), dict
        ):
            config = payload["config"]
            config_name = config.get("name")
            config_role_name = config.get("role_name")
            if isinstance(config_name, str) and config_name.strip():
                name = config_name
            elif isinstance(config_role_name, str) and config_role_name.strip():
                name = config_role_name
        short_id = agent_id[:8]
        if isinstance(name, str) and name.strip():
            return f"{name.strip()} (`{short_id}`)"
        return f"`{short_id}`"

    @classmethod
    def _iter_dispatched_agent_payloads(
        cls,
        tool_name: str,
        payload: dict[str, Any],
    ) -> list[tuple[str, str]]:
        if tool_name == "create_agent":
            label = cls._get_created_agent_label(payload)
            agent_id = payload.get("id")
            if isinstance(agent_id, str) and label is not None:
                return [(agent_id, label)]
            return []
        return []

    def _get_pending_agent_dispatches(
        self,
        history_snapshot: list[HistoryEntry],
    ) -> list[str]:
        pending: dict[str, str] = {}

        for entry in history_snapshot:
            if isinstance(entry, ToolCall):
                if entry.tool_name != "create_agent":
                    continue
                if entry.result is None:
                    continue
                try:
                    payload = json.loads(entry.result)
                except json.JSONDecodeError:
                    continue
                if not isinstance(payload, dict) or payload.get("error") is not None:
                    continue
                for agent_id, label in self._iter_dispatched_agent_payloads(
                    entry.tool_name,
                    payload,
                ):
                    pending[agent_id] = label
                continue

            if isinstance(entry, SentMessage):
                for target_id in entry.to_ids:
                    pending.pop(target_id, None)

        return list(pending.values())

    def _build_runtime_post_prompt_message(
        self,
        *,
        has_todos: bool,
        pending_agent_dispatches: list[str],
    ) -> dict[str, str]:
        lines = [
            "Runtime post prompt:",
            "- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.",
            "- Plain content is not delivered to other agents.",
            "- Do not combine a Human-facing reply and a routed `@target` message in the same content block.",
            "- Each response can route to only one node. A content block supports only one routed `@target:` header. If you need to message multiple nodes, send one routed message now and continue with another routed message on the next response.",
        ]
        if pending_agent_dispatches:
            targets = ", ".join(pending_agent_dispatches)
            lines.append(
                f"- Newly created agents still waiting for their first task: {targets}."
            )
            lines.append(
                "- `create_agent` only creates a new graph node. It does not start work by itself."
            )
            lines.append(
                "- Before calling `idle`, send each waiting agent a concrete first task with `@<name-or-uuid>: ...`. If several agents are waiting, route to one agent per response until all of them have been dispatched."
            )
        elif has_todos:
            lines.append(
                "- If the TODO list is not complete yet, use `todo` to replace it with the latest remaining items."
            )
        else:
            lines.append(
                "- If there is no unfinished TODO and the task is finished with no immediate next action, call `idle`."
            )
        return self._build_runtime_system_message("\n".join(lines))

    @staticmethod
    def _build_multi_routed_header_notice() -> str:
        return (
            "Routing reminder: each response can route to only one node. Only "
            "the first `@target:` header in this content block was routed. Any "
            "later `@...:` lines were delivered as plain body text to the first "
            "target. If that was not intentional, send a correction to the "
            "first recipient and then send the remaining node messages in later "
            "responses, one target at a time."
        )

    @staticmethod
    def _build_plain_then_routed_notice() -> str:
        return (
            "Routing reminder: this response mixed plain text with a later "
            "`@target:` line. Only the leading plain text was kept as plain "
            "output. The later routed-looking lines were not delivered. If you "
            "intended to message a node, send that `@target:` message in a "
            "later response."
        )

    @staticmethod
    def _build_idle_without_progress_notice() -> str:
        return (
            "Idle reminder: you received a new message this turn, but this "
            "response did not send a reply, route a message, or use any "
            "non-idle tool. Do not call `idle` yet. First reply to the Human, "
            "dispatch/delegate work, or take another concrete step."
        )

    @staticmethod
    def _build_actionable_todo_notice(todo_text: str) -> str:
        return (
            "Idle reminder: your first remaining TODO still looks actionable "
            f"(`{todo_text}`). Do that next, or update the TODO list so the "
            "first remaining item is the actual waiting step, before calling "
            "`idle`."
        )

    def _queue_runtime_notice(self, content: str) -> None:
        with self._runtime_notice_lock:
            if content not in self._pending_runtime_notices:
                self._pending_runtime_notices.append(content)

    def _has_pending_runtime_notices(self) -> bool:
        with self._runtime_notice_lock:
            return bool(self._pending_runtime_notices)

    def _consume_runtime_notices(self) -> list[str]:
        with self._runtime_notice_lock:
            notices = list(self._pending_runtime_notices)
            self._pending_runtime_notices.clear()
        return notices

    def _emit_routed_message_preview(
        self,
        state: StreamingContentState,
        full_content: str,
    ) -> None:
        routed_header = extract_routed_header(full_content)
        if routed_header is None:
            return

        target_refs, raw_body = routed_header
        targets, _ = self._resolve_routed_targets(
            target_refs,
            log_failures=False,
        )
        if not targets:
            return

        preview_body = (
            raw_body.lstrip() if not state.streamed_message_body else raw_body
        )
        if preview_body.startswith(state.streamed_message_body):
            delta_text = preview_body[len(state.streamed_message_body) :]
        else:
            delta_text = preview_body

        if not delta_text:
            return

        if state.streaming_message_id is None:
            state.streaming_message_id = str(_uuid.uuid4())

        state.streamed_message_body = preview_body
        self._emit_message_stream_deltas(
            message_id=state.streaming_message_id,
            target_ids=[target.uuid for target in targets],
            text=delta_text,
        )

    def _handle_llm_chunk(
        self,
        state: StreamingContentState,
        chunk_type: str,
        text: str,
    ) -> None:
        self._raise_if_interrupt_requested()
        if chunk_type == "content":
            state.saw_content_chunks = True
            for normalized_type, normalized_text in state.think_parser.feed(text):
                if normalized_type == "thinking":
                    self._handle_streaming_thinking_chunk(state, normalized_text)
                else:
                    self._handle_streaming_content_chunk(state, normalized_text)
            return
        if chunk_type != "thinking":
            return
        self._handle_streaming_thinking_chunk(state, text)

    def _handle_streaming_content_chunk(
        self,
        state: StreamingContentState,
        text: str,
    ) -> None:
        if not text:
            return
        state.content_buffer += text
        if state.mode == "plain":
            delta = ContentDelta(text=text)
            event_bus.emit(
                Event(
                    type=EventType.HISTORY_ENTRY_DELTA,
                    agent_id=self.uuid,
                    data=delta.serialize(),
                ),
            )
            if self.node_type == NodeType.ASSISTANT:
                state.emitted_human_content = True
                event_bus.emit(
                    Event(
                        type=EventType.ASSISTANT_CONTENT,
                        agent_id=self.uuid,
                        data={"content": text},
                    ),
                )
            return

        if state.mode == "routed":
            state.pending_chunks.append(text)
            self._emit_routed_message_preview(
                state,
                "".join(state.pending_chunks),
            )
            return

        state.pending_chunks.append(text)
        state.mode = classify_streaming_content("".join(state.pending_chunks))
        if state.mode == "routed":
            self._emit_routed_message_preview(
                state,
                "".join(state.pending_chunks),
            )
            return
        if state.mode != "plain":
            return

        buffered_text = "".join(state.pending_chunks)
        state.pending_chunks.clear()
        delta = ContentDelta(text=buffered_text)
        event_bus.emit(
            Event(
                type=EventType.HISTORY_ENTRY_DELTA,
                agent_id=self.uuid,
                data=delta.serialize(),
            ),
        )
        if self.node_type == NodeType.ASSISTANT:
            state.emitted_human_content = True
            event_bus.emit(
                Event(
                    type=EventType.ASSISTANT_CONTENT,
                    agent_id=self.uuid,
                    data={"content": buffered_text},
                ),
            )

    def _handle_streaming_thinking_chunk(
        self,
        state: StreamingContentState,
        text: str,
    ) -> None:
        if not text:
            return
        state.thinking_buffer += text
        delta = ThinkingDelta(text=text)
        event_bus.emit(
            Event(
                type=EventType.HISTORY_ENTRY_DELTA,
                agent_id=self.uuid,
                data=delta.serialize(),
            ),
        )

    def _flush_streaming_think_parser(self, state: StreamingContentState) -> None:
        for normalized_type, normalized_text in state.think_parser.flush():
            if normalized_type == "thinking":
                self._handle_streaming_thinking_chunk(state, normalized_text)
            else:
                self._handle_streaming_content_chunk(state, normalized_text)

    def _deliver_message(self, target: Agent, content: str, message_id: str) -> None:
        target.enqueue_message(
            Message(
                from_id=self.uuid,
                to_id=target.uuid,
                content=content,
                message_id=message_id,
            )
        )
        self._log.debug(
            "Message routed: {} -> {} ({} chars)",
            self.uuid[:8],
            target.uuid[:8],
            len(content),
        )
        event_bus.emit(
            Event(
                type=EventType.NODE_MESSAGE,
                agent_id=self.uuid,
                data={
                    "to_id": target.uuid,
                    "content": content,
                    "message_id": message_id,
                },
            ),
        )

    def _emit_message_stream_deltas(
        self,
        *,
        message_id: str,
        target_ids: list[str],
        text: str,
    ) -> None:
        if not target_ids or not text:
            return

        event_bus.emit(
            Event(
                type=EventType.HISTORY_ENTRY_DELTA,
                agent_id=self.uuid,
                data=SentMessageDelta(
                    message_id=message_id,
                    to_ids=target_ids,
                    text=text,
                ).serialize(),
            ),
        )

        for target_id in target_ids:
            event_bus.emit(
                Event(
                    type=EventType.HISTORY_ENTRY_DELTA,
                    agent_id=target_id,
                    data=ReceivedMessageDelta(
                        message_id=message_id,
                        from_id=self.uuid,
                        text=text,
                    ).serialize(),
                ),
            )

    def _record_content_output(
        self,
        content: str,
        *,
        emitted_human_content: bool,
        message_id: str | None = None,
    ) -> None:
        normalized_content, normalized_thinking = split_thinking_content(content)

        if normalized_thinking.strip():
            self._mark_turn_progress()
            self._append_history(AssistantThinking(content=normalized_thinking))

        content = normalized_content
        plain_content, mixed_routed_suffix = (
            split_plain_content_before_later_routed_header(content)
        )
        if mixed_routed_suffix is not None:
            self._queue_runtime_notice(self._build_plain_then_routed_notice())

        routed_result = self._route_content_output(content, message_id=message_id)
        if routed_result.had_additional_routed_headers and routed_result.sent_messages:
            self._queue_runtime_notice(self._build_multi_routed_header_notice())

        if routed_result.route_errors:
            for error in routed_result.route_errors:
                self._append_history(ErrorEntry(content=error))

        if routed_result.sent_messages:
            self._mark_turn_progress()
            for entry in routed_result.sent_messages:
                self._append_history(entry)
            return

        if routed_result.had_routed_header:
            return

        if not plain_content.strip():
            return

        self._mark_turn_progress()

        if self.node_type == NodeType.ASSISTANT and not emitted_human_content:
            event_bus.emit(
                Event(
                    type=EventType.ASSISTANT_CONTENT,
                    agent_id=self.uuid,
                    data={"content": plain_content},
                ),
            )

        self._append_history(AssistantText(content=plain_content))

    def _route_content_output(
        self,
        content: str,
        *,
        message_id: str | None = None,
    ) -> RoutedContentResult:
        _, routed_messages = extract_routed_content(content)
        if not routed_messages:
            return RoutedContentResult()

        result = RoutedContentResult(
            had_routed_header=True,
            had_additional_routed_headers=has_additional_routed_headers(content),
        )

        for target_refs, body in routed_messages:
            resolved_targets, route_errors = self._resolve_routed_targets(
                target_refs,
                log_failures=True,
            )
            result.route_errors.extend(route_errors)
            delivered_to: list[str] = []
            current_message_id = message_id or str(_uuid.uuid4())
            for target in resolved_targets:
                self._deliver_message(target, body, current_message_id)
                delivered_to.append(target.uuid)

            if delivered_to:
                result.sent_messages.append(
                    SentMessage(
                        content=body,
                        to_ids=delivered_to,
                        message_id=current_message_id,
                    ),
                )

        return result

    def _resolve_routed_targets(
        self,
        target_refs: list[str],
        *,
        log_failures: bool,
    ) -> tuple[list[Agent], list[str]]:
        from app.graph_runtime import resolve_node_ref

        resolved_targets: list[Agent] = []
        seen_target_ids: set[str] = set()
        route_errors: list[str] = []
        for target_ref in target_refs:
            target = resolve_node_ref(target_ref)
            if target is None:
                if log_failures:
                    self._log.warning("@target routing failed: {}", target_ref)
                route_errors.append(
                    f"Routing failed: target `{target_ref}` was not found."
                )
                continue
            if not self.can_contact(target.uuid):
                if log_failures:
                    self._log.warning("@target routing failed: {}", target_ref)
                route_errors.append(
                    f"Routing failed: target `{target_ref}` is not in contacts."
                )
                continue
            if target.uuid in seen_target_ids:
                continue
            resolved_targets.append(target)
            seen_target_ids.add(target.uuid)
        return resolved_targets, route_errors

    def _mark_turn_progress(self) -> None:
        self._turn_made_progress = True
        self._pending_input_turn = False

    def _get_first_actionable_todo(self) -> str | None:
        with self._todos_lock:
            if not self.todos:
                return None
            first_todo = self.todos[0].text.strip()
        if not first_todo:
            return None
        normalized = first_todo.lower()
        waiting_prefixes = (
            "wait",
            "await",
            "waiting",
            "awaiting",
            "monitor",
            "listen",
            "idle",
            "sleep",
        )
        if normalized.startswith(waiting_prefixes) or first_todo.startswith(
            ("等待", "等候", "监听", "休眠", "空闲")
        ):
            return None
        return first_todo

    def _raise_if_interrupt_requested(self) -> None:
        if self._interrupt_requested.is_set():
            raise InterruptRequestedError()

    def _get_llm_retry_policy(self) -> str:
        return get_settings().model.retry_policy

    def _get_llm_max_retries(self) -> int:
        settings = get_settings()
        if settings.model.retry_policy != "limited":
            return 0
        return settings.model.max_retries

    def _get_llm_retry_delay(self, retry_number: int) -> float:
        settings = get_settings()
        capped_retry_number = min(
            max(retry_number - 1, 0),
            settings.model.retry_backoff_cap_retries - 1,
        )
        return min(
            settings.model.retry_max_delay_seconds,
            settings.model.retry_initial_delay_seconds * (2**capped_retry_number),
        )

    def _get_llm_retry_429_delay(self, status_code: int | None) -> float:
        if status_code != 429:
            return 0.0
        from app.settings import find_provider, find_role

        settings = get_settings()
        provider_id = settings.model.active_provider_id
        role_cfg = (
            find_role(settings, self.config.role_name)
            if self.config.role_name
            else None
        )
        if (
            role_cfg is not None
            and role_cfg.model is not None
            and role_cfg.model.provider_id
            and role_cfg.model.model
        ):
            provider_id = role_cfg.model.provider_id
        if not provider_id:
            return 0.0
        provider = find_provider(settings, provider_id)
        if provider is None:
            return 0.0
        return float(provider.retry_429_delay_seconds)

    def _wait_for_llm_retry_delay(self, delay_seconds: float) -> None:
        self.set_interrupt_callback(self._interrupt_requested.set)
        try:
            if self._interrupt_requested.wait(max(delay_seconds, 0.0)):
                raise InterruptRequestedError()
        finally:
            self.set_interrupt_callback(None)

    def _chat_with_retries(
        self,
        *,
        messages: list[dict[str, Any]],
        tools_schema: list[dict[str, Any]] | None,
    ) -> tuple[LLMResponse, StreamingContentState]:
        retry_policy = self._get_llm_retry_policy()
        retry_limit = self._get_llm_max_retries()
        retry_count = 0

        while True:
            stream_state = StreamingContentState()
            try:
                try:
                    response = gateway.chat(
                        messages=messages,
                        tools=tools_schema or None,
                        on_chunk=partial(self._handle_llm_chunk, stream_state),
                        register_interrupt=self.set_interrupt_callback,
                        role_name=self.config.role_name,
                    )
                except Exception:
                    if self._interrupt_requested.is_set():
                        raise InterruptRequestedError(stream_state) from None
                    raise
                finally:
                    self.set_interrupt_callback(None)
                self._raise_if_interrupt_requested()
                return response, stream_state
            except LLMProviderError as exc:
                should_retry = False
                if exc.transient:
                    if retry_policy == "limited":
                        should_retry = retry_count < retry_limit
                    elif retry_policy == "unlimited":
                        should_retry = True
                if not should_retry:
                    raise
                retry_count += 1
                delay_seconds = self._get_llm_retry_delay(
                    retry_count
                ) + self._get_llm_retry_429_delay(exc.status_code)
                self._log.warning(
                    "Transient LLM error, retry {} ({}) in {:.2f}s: {}",
                    retry_count,
                    retry_policy,
                    delay_seconds,
                    exc,
                )
                self._wait_for_llm_retry_delay(delay_seconds)

    def _handle_interrupt(self, stream_state: StreamingContentState | None) -> None:
        if stream_state is not None:
            self._flush_streaming_think_parser(stream_state)
            if stream_state.thinking_buffer:
                self._append_history(
                    AssistantThinking(content=stream_state.thinking_buffer),
                )
            if stream_state.content_buffer:
                self._record_content_output(
                    stream_state.content_buffer,
                    emitted_human_content=stream_state.emitted_human_content,
                    message_id=stream_state.streaming_message_id,
                )
        self._interrupt_requested.clear()
        self.set_interrupt_callback(None)
        self._pending_input_turn = False
        self.set_state(AgentState.IDLE, "interrupted by human")
        self._wait_for_input()

    def _build_messages(self) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": get_system_prompt(self.config)}
        ]
        pending_tool_calls: list[dict[str, Any]] = []

        with self._history_lock:
            history_snapshot = list(self.history)

        for entry in history_snapshot:
            if isinstance(entry, SystemEntry):
                continue

            elif isinstance(entry, ReceivedMessage):
                self._flush_tool_calls(messages, pending_tool_calls)
                payload = f'<message from="{entry.from_id}">{entry.content}</message>'
                messages.append({"role": "user", "content": payload})

            elif isinstance(entry, AssistantText):
                self._flush_tool_calls(messages, pending_tool_calls)
                messages.append({"role": "assistant", "content": entry.content})

            elif isinstance(entry, SentMessage):
                self._flush_tool_calls(messages, pending_tool_calls)
                for target_id in entry.to_ids:
                    messages.append(
                        {
                            "role": "assistant",
                            "content": build_routed_content([target_id], entry.content),
                        }
                    )

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
                self._flush_tool_calls(messages, pending_tool_calls)
                messages.append(
                    {
                        "role": "user",
                        "content": build_error_context(entry.content),
                    }
                )

        self._flush_tool_calls(messages, pending_tool_calls)
        messages.extend(self._build_runtime_tail_messages())
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
        drained: list[WakeSignal] = []
        while True:
            try:
                signal = self._wake_queue.get_nowait()
            except Empty:
                break
            if signal.reason == "message":
                drained.append(signal)
                continue
            if signal.reason == "termination":
                self._terminate.set()
                break

        if drained:
            self._log.debug("Drained {} message(s) from queue", len(drained))

        for signal in drained:
            message = signal.payload.get("message", {})
            content = message.get("content", "")
            from_id = message.get("from", "")
            message_id = message.get("message_id")
            if (
                not isinstance(content, str)
                or not isinstance(from_id, str)
                or (message_id is not None and not isinstance(message_id, str))
            ):
                continue
            self._log.debug(
                "Message from {}: {}",
                from_id,
                (content[:100] + "...") if len(content) > 100 else content,
            )
            self._append_history(
                ReceivedMessage(
                    content=content,
                    from_id=from_id,
                    message_id=message_id,
                ),
            )

    def _wait_for_input(self) -> None:
        signal = self._wait_for_wakeup()
        self._resume_from_wakeup(signal)

    def _resume_from_wakeup(self, signal: WakeSignal) -> None:
        if signal.reason == "message":
            message = signal.payload.get("message")
            if isinstance(message, dict):
                content = message.get("content")
                from_id = message.get("from")
                message_id = message.get("message_id")
                if (
                    isinstance(content, str)
                    and isinstance(from_id, str)
                    and (message_id is None or isinstance(message_id, str))
                ):
                    self._append_history(
                        ReceivedMessage(
                            content=content,
                            from_id=from_id,
                            message_id=message_id,
                        )
                    )

        if signal.reason != "termination":
            self.set_state(
                AgentState.RUNNING,
                signal.resume_reason or f"woke due to {signal.reason}",
            )

    def _wait_for_wakeup(self) -> WakeSignal:
        while not self._terminate.is_set():
            try:
                return self._wake_queue.get(timeout=2.0)
            except Empty:
                continue

        return WakeSignal(
            reason="termination",
            payload={},
            resume_reason="termination requested",
        )

    def _handle_tool_call(
        self,
        name: str,
        arguments: dict[str, Any],
        call_id: str,
    ) -> str | None:
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

        authorization_error = authorize(name, self, arguments)
        if authorization_error is not None:
            self._log.warning(
                "Tool denied by security policy: {} ({})",
                name,
                authorization_error,
            )
            error_msg = json.dumps({"error": authorization_error})
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
        streamed_result_parts: list[str] = []

        def _on_tool_output(text: str) -> None:
            self._raise_if_interrupt_requested()
            streamed_result_parts.append(text)
            delta = ToolResultDelta(tool_call_id=call_id, text=text)
            event_bus.emit(
                Event(
                    type=EventType.HISTORY_ENTRY_DELTA,
                    agent_id=self.uuid,
                    data=delta.serialize(),
                ),
            )
            self._raise_if_interrupt_requested()

        t0 = _time.perf_counter()
        try:
            self._raise_if_interrupt_requested()
            result = tool.execute(
                self,
                arguments,
                on_output=_on_tool_output,
                tool_call_id=call_id,
            )
            self._raise_if_interrupt_requested()
            elapsed = _time.perf_counter() - t0
            self._log.debug(
                "Tool {} completed in {:.2f}s, result_len={}",
                name,
                elapsed,
                len(result) if result else 0,
            )

            self._finalize_tool_call(call_id, name, arguments, result)
            return result
        except InterruptRequestedError:
            partial_result = "".join(streamed_result_parts) or None
            self._finalize_tool_call(call_id, name, arguments, partial_result)
            raise
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
        result: str | None,
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
        payload = {
            "from": msg.from_id,
            "content": msg.content,
        }
        if msg.message_id is not None:
            payload["message_id"] = msg.message_id
        self._wake_queue.put(
            WakeSignal(
                reason="message",
                payload={"message": payload},
                resume_reason=f"received message from {msg.from_id}",
            )
        )

    def set_state(
        self,
        state: AgentState,
        reason: str = "",
        *,
        force_emit: bool = False,
    ) -> None:
        from app.graph_service import is_tab_leader

        old = self.state
        self.state = state
        if state == AgentState.IDLE:
            if old != AgentState.IDLE:
                self._idle_started_at = _time.perf_counter()
            self._idle_state_event.set()
        else:
            if old == AgentState.IDLE:
                self._idle_started_at = None
                self._idle_started_by_tool_call_id = None
            self._idle_state_event.clear()
        if old != state or force_emit:
            if old != state:
                self._append_history(
                    StateEntry(state=state.value, reason=reason),
                )
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
                        "tab_id": self.config.tab_id,
                        "role_name": self.config.role_name,
                        "name": self.config.name,
                        "is_leader": is_tab_leader(
                            node_id=self.uuid,
                            tab_id=self.config.tab_id,
                        ),
                        "todos": [t.serialize() for t in self.get_todos_snapshot()],
                    },
                ),
            )
        self._persist_workspace_node()

    def request_termination(self, reason: str = "") -> None:
        self._preserve_workspace_state_on_exit = False
        self._termination_reason = reason
        self._terminate.set()
        self._wake_queue.put(
            WakeSignal(
                reason="termination",
                payload={},
                resume_reason="termination requested",
            )
        )

    def request_process_exit(self) -> None:
        self._preserve_workspace_state_on_exit = bool(self.config.tab_id)
        self._termination_reason = "process_exit"
        self._terminate.set()
        self._wake_queue.put(
            WakeSignal(
                reason="termination",
                payload={},
                resume_reason="process exit requested",
            )
        )

    def request_interrupt(self) -> bool:
        if self.state != AgentState.RUNNING:
            return False
        self._interrupt_requested.set()
        self._invoke_interrupt_callback()
        return True

    def is_interrupt_requested(self) -> bool:
        return self._interrupt_requested.is_set()

    def set_interrupt_callback(self, callback: Callable[[], None] | None) -> None:
        with self._interrupt_callback_lock:
            self._interrupt_callback = callback
        if callback is not None and self._interrupt_requested.is_set():
            self._invoke_interrupt_callback()

    def _invoke_interrupt_callback(self) -> None:
        with self._interrupt_callback_lock:
            callback = self._interrupt_callback
        if callback is None:
            return
        try:
            callback()
        except Exception:
            self._log.debug("Interrupt callback raised")

    def terminate_and_wait(self, timeout: float = 10.0) -> None:
        self.request_termination("shutdown")
        self.wait_for_termination(timeout=timeout)

    def wait_for_termination(self, timeout: float = 10.0) -> bool:
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=timeout)
        return not (self._thread and self._thread.is_alive())

    def _should_preserve_workspace_state_on_exit(self) -> bool:
        return self._preserve_workspace_state_on_exit and bool(self.config.tab_id)

    def _finalize_termination(self, reason: str) -> None:
        from app.registry import registry

        self.set_state(AgentState.TERMINATED, reason)
        self._log.info("Agent terminated (reason: {})", reason)
        event_bus.emit(
            Event(
                type=EventType.NODE_TERMINATED,
                agent_id=self.uuid,
                data={"reason": reason},
            ),
        )
        registry.unregister(self.uuid)

        peer_ids = self.get_connections_snapshot()
        for peer_id in peer_ids:
            peer = registry.get(peer_id)
            if peer is not None:
                peer.remove_connection(self.uuid)
            self.remove_connection(peer_id)

        self._persist_workspace_node()
