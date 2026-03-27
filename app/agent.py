from __future__ import annotations

import json
import re
import threading
import time as _time
import traceback
import uuid as _uuid
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
    Message,
    NodeConfig,
    NodeType,
    ReceivedMessage,
    ReceivedMessageDelta,
    SentMessage,
    SentMessageDelta,
    SystemEntry,
    ThinkingDelta,
    TodoItem,
    ToolCall,
    ToolResultDelta,
)
from app.prompts import get_system_prompt
from app.providers.gateway import gateway
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
    emitted_human_content: bool = False
    streaming_message_id: str | None = None
    streamed_message_body: str = ""


@dataclass
class RoutedContentResult:
    sent_messages: list[SentMessage] = field(default_factory=list)
    had_routed_header: bool = False
    route_errors: list[str] = field(default_factory=list)
    had_additional_routed_headers: bool = False


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
        self._terminate = threading.Event()
        self._idle_state_event = threading.Event()
        self._idle_started_at: float | None = None
        self._idle_started_by_tool_call_id: str | None = None
        self._wake_queue: Queue[WakeSignal] = Queue()
        self._thread: threading.Thread | None = None
        self._termination_reason: str = ""
        self._connections_lock = threading.Lock()
        self._history_lock = threading.Lock()
        self._todos_lock = threading.Lock()
        self._runtime_notice_lock = threading.Lock()
        self._pending_runtime_notices: list[str] = []
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

    def set_todos(self, todos: list[TodoItem]) -> None:
        with self._todos_lock:
            self.todos = [TodoItem(text=t.text) for t in todos]
        self._persist_workspace_node()

    def request_idle(self, *, tool_call_id: str | None = None) -> str:
        if self._has_pending_runtime_notices():
            self._log.debug("Skipping idle because runtime notice is pending")
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
        if duration > 0:
            self._terminate.wait(timeout=duration)
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

    def get_connections_info(self) -> list[dict[str, Any]]:
        from app.registry import registry

        result: list[dict[str, Any]] = []
        if self.node_type == NodeType.ASSISTANT:
            connection_ids = [
                node.uuid for node in registry.get_all() if node.uuid != self.uuid
            ]
        else:
            with self._connections_lock:
                connection_ids = list(self.connections)

        for cid in connection_ids:
            node = registry.get(cid)
            if node is None:
                continue
            result.append(
                {
                    "uuid": node.uuid,
                    "node_type": node.config.node_type.value,
                    "role_name": node.config.role_name,
                    "name": node.config.name,
                    "state": node.state.value,
                }
            )

        assistant = registry.get_assistant()
        if assistant is not None and assistant.uuid != self.uuid:
            result.append(
                {
                    "uuid": assistant.uuid,
                    "node_type": assistant.config.node_type.value,
                    "role_name": assistant.config.role_name,
                    "name": assistant.config.name,
                    "state": assistant.state.value,
                }
            )

        return result

    def wait_until_idle(self, timeout: float | None = None) -> bool:
        if self.state == AgentState.IDLE:
            return True
        return self._idle_state_event.wait(timeout=timeout)

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
                    "role_name": self.config.role_name,
                    "name": self.config.name,
                    "tab_id": self.config.tab_id,
                },
            ),
        )
        self._persist_workspace_node()

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

            self.set_state(AgentState.IDLE, "initialized, awaiting first message")
            self._log.info("Agent started, waiting for first message")
            self._wait_for_input()

            if self._terminate.is_set():
                self._finalize_termination("terminated before first message")
                return

            while not self._terminate.is_set():
                try:
                    self._sync_system_prompt_entry()
                    self._drain_messages()

                    tools_schema = _get_tool_registry().get_tools_schema(self)
                    messages = self._build_messages()

                    self._log.debug(
                        "LLM request: messages={}, tools={}, history_len={}",
                        len(messages),
                        len(tools_schema) if tools_schema else 0,
                        len(self.history),
                    )
                    stream_state = StreamingContentState()

                    response = gateway.chat(
                        messages=messages,
                        tools=tools_schema or None,
                        on_chunk=partial(self._handle_llm_chunk, stream_state),
                        role_name=self.config.role_name,
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
                            self._record_content_output(
                                response.content,
                                emitted_human_content=stream_state.emitted_human_content,
                                message_id=stream_state.streaming_message_id,
                            )
                        for tc in response.tool_calls:
                            self._handle_tool_call(tc.name, tc.arguments, tc.id)
                            if self._terminate.is_set():
                                break
                    elif response.content:
                        self._record_content_output(
                            response.content,
                            emitted_human_content=stream_state.emitted_human_content,
                            message_id=stream_state.streaming_message_id,
                        )
                        self._log.debug(
                            "No tool calls, continuing execution after text response"
                        )
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
        delta: ContentDelta | ThinkingDelta
        if chunk_type == "content":
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
            return
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
        routed_result = self._route_content_output(content, message_id=message_id)
        if routed_result.had_additional_routed_headers and routed_result.sent_messages:
            self._queue_runtime_notice(self._build_multi_routed_header_notice())

        if routed_result.route_errors:
            for error in routed_result.route_errors:
                self._append_history(ErrorEntry(content=error))

        if routed_result.sent_messages:
            for entry in routed_result.sent_messages:
                self._append_history(entry)
            return

        if routed_result.had_routed_header:
            return

        if self.node_type == NodeType.ASSISTANT and not emitted_human_content:
            event_bus.emit(
                Event(
                    type=EventType.ASSISTANT_CONTENT,
                    agent_id=self.uuid,
                    data={"content": content},
                ),
            )

        self._append_history(AssistantText(content=content))

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
            if (
                self.node_type != NodeType.ASSISTANT
                and target.node_type != NodeType.ASSISTANT
                and not self.is_connected_to(target.uuid)
            ):
                if log_failures:
                    self._log.warning("@target routing failed: {}", target_ref)
                route_errors.append(
                    f"Routing failed: target `{target_ref}` is not directly connected."
                )
                continue
            if target.uuid in seen_target_ids:
                continue
            resolved_targets.append(target)
            seen_target_ids.add(target.uuid)
        return resolved_targets, route_errors

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
            result = tool.execute(
                self,
                arguments,
                on_output=_on_tool_output,
                tool_call_id=call_id,
            )
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
                        "role_name": self.config.role_name,
                        "name": self.config.name,
                        "todos": [t.serialize() for t in self.get_todos_snapshot()],
                    },
                ),
            )
        self._persist_workspace_node()

    def request_termination(self, reason: str = "") -> None:
        self._termination_reason = reason
        self._terminate.set()
        self._wake_queue.put(
            WakeSignal(
                reason="termination",
                payload={},
                resume_reason="termination requested",
            )
        )

    def terminate_and_wait(self, timeout: float = 10.0) -> None:
        self.request_termination("shutdown")
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=timeout)

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
