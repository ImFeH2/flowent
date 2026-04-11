import json
import threading
import time

import pytest
from loguru import logger

from app.agent import Agent, InterruptRequestedError, extract_routed_content
from app.events import event_bus
from app.models import (
    AgentState,
    AssistantText,
    AssistantThinking,
    ErrorEntry,
    EventType,
    LLMResponse,
    Message,
    NodeConfig,
    NodeType,
    ReceivedMessage,
    SentMessage,
    StateEntry,
    SystemEntry,
    Tab,
    TodoItem,
    ToolCall,
    ToolCallResult,
)
from app.providers.errors import LLMProviderError
from app.registry import registry
from app.settings import ModelSettings, ProviderConfig, Settings
from app.workspace_store import workspace_store


@pytest.fixture(autouse=True)
def reset_runtime_state(monkeypatch, tmp_path):
    import app.settings as settings_module

    settings_file = tmp_path / "settings.json"
    settings_file.write_text("{}", encoding="utf-8")
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)
    registry.reset()
    workspace_store.reset_cache()
    yield
    registry.reset()
    workspace_store.reset_cache()
    monkeypatch.setattr(settings_module, "_cached_settings", None)


def _register_tab_leader(*, tab_id: str = "tab-1", leader_id: str = "leader") -> Agent:
    workspace_store.upsert_tab(
        Tab(id=tab_id, title="Task", goal="", leader_id=leader_id)
    )
    leader = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            name="Leader",
            tab_id=tab_id,
        ),
        uuid=leader_id,
    )
    registry.register(leader)
    return leader


def test_agent_keeps_running_after_pure_text_response(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT))
    wait_calls = 0
    llm_messages: list[list[dict]] = []
    responses = iter([LLMResponse(content="working through the task"), LLMResponse()])

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            agent._append_history(
                ReceivedMessage(content="finish the task", from_id="tester")
            )
            agent.set_state(AgentState.RUNNING, "received message from tester")
            return
        raise AssertionError("agent should not auto-idle after pure assistant text")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        llm_messages.append(messages)
        if len(llm_messages) == 2:
            agent.request_termination("done")
        return next(responses)

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    agent._run()

    assert wait_calls == 1
    assert len(llm_messages) == 2
    assert agent.state == AgentState.TERMINATED
    assert any(
        isinstance(entry, AssistantText) and entry.content == "working through the task"
        for entry in agent.get_history_snapshot()
    )
    assert any(
        msg.get("role") == "assistant"
        and msg.get("content") == "working through the task"
        for msg in llm_messages[1]
    )


def test_agent_retries_transient_llm_errors_before_succeeding(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT))
    wait_calls = 0
    llm_calls = 0

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            agent._append_history(
                ReceivedMessage(content="finish the task", from_id="tester")
            )
            agent.set_state(AgentState.RUNNING, "received message from tester")
            return
        raise AssertionError("agent should not return to idle while retrying")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        nonlocal llm_calls
        llm_calls += 1
        if llm_calls < 3:
            raise LLMProviderError(
                f"temporary failure {llm_calls}",
                transient=True,
                status_code=429,
            )
        if llm_calls == 4:
            agent.request_termination("done")
            return LLMResponse()
        if llm_calls == 3:
            return LLMResponse(content="Recovered answer")
        raise AssertionError("unexpected extra LLM call")

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr(agent, "_get_llm_retry_delay", lambda retry_number: 0.0)
    monkeypatch.setattr(
        "app.agent.get_settings",
        lambda: Settings(model=ModelSettings(max_retries=2)),
    )
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    agent._run()

    assert wait_calls == 1
    assert llm_calls == 4
    assert agent.state == AgentState.TERMINATED
    assert not any(
        isinstance(entry, ErrorEntry) for entry in agent.get_history_snapshot()
    )
    assert any(
        isinstance(entry, AssistantText) and entry.content == "Recovered answer"
        for entry in agent.get_history_snapshot()
    )


def test_agent_does_not_retry_transient_llm_errors_when_retry_policy_is_no_retry(
    monkeypatch,
):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT))
    wait_calls = 0
    llm_calls = 0

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            agent._append_history(
                ReceivedMessage(content="finish the task", from_id="tester")
            )
            agent.set_state(AgentState.RUNNING, "received message from tester")
            return
        agent.request_termination("done")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        nonlocal llm_calls
        llm_calls += 1
        raise LLMProviderError(
            "temporary failure",
            transient=True,
            status_code=429,
        )

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr(
        "app.agent.get_settings",
        lambda: Settings(
            model=ModelSettings(
                retry_policy="no_retry",
                max_retries=5,
            )
        ),
    )
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    agent._run()

    assert llm_calls == 1
    assert wait_calls == 2
    assert any(
        isinstance(entry, ErrorEntry) and entry.content == "temporary failure"
        for entry in agent.get_history_snapshot()
    )


def test_agent_does_not_retry_non_transient_llm_errors(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT))
    wait_calls = 0
    llm_calls = 0
    error_summary = (
        "LLM API error\n"
        "Provider: Test Provider\n"
        "Type: openai\n"
        "Model: gpt-5.2\n"
        "Base URL: http://example.invalid\n"
        "Status: 401\n"
        "Detail: Invalid API key"
    )

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            agent._append_history(
                ReceivedMessage(content="finish the task", from_id="tester")
            )
            agent.set_state(AgentState.RUNNING, "received message from tester")
            return
        agent.request_termination("done")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        nonlocal llm_calls
        llm_calls += 1
        raise LLMProviderError(
            error_summary,
            transient=False,
            status_code=401,
        )

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr(
        "app.agent.get_settings",
        lambda: Settings(model=ModelSettings(max_retries=5)),
    )
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    agent._run()

    assert llm_calls == 1
    assert wait_calls == 2
    assert any(
        isinstance(entry, ErrorEntry) and entry.content == error_summary
        for entry in agent.get_history_snapshot()
    )
    assert any(
        isinstance(entry, StateEntry)
        and entry.state == AgentState.ERROR.value
        and entry.reason == error_summary
        for entry in agent.get_history_snapshot()
    )
    assert not any(
        isinstance(entry, ErrorEntry)
        and (
            "traceback" in entry.content.lower() or "LLMProviderError:" in entry.content
        )
        for entry in agent.get_history_snapshot()
    )


def test_agent_interrupt_stops_retry_backoff(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT))
    wait_calls = 0
    llm_calls = 0
    interrupter: threading.Thread | None = None

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            agent._append_history(
                ReceivedMessage(content="finish the task", from_id="tester")
            )
            agent.set_state(AgentState.RUNNING, "received message from tester")
            return
        agent.request_termination("done")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        nonlocal llm_calls, interrupter
        llm_calls += 1
        if llm_calls == 1:
            interrupter = threading.Thread(
                target=lambda: (time.sleep(0.01), agent.request_interrupt())
            )
            interrupter.start()
            raise LLMProviderError(
                "temporary failure",
                transient=True,
                status_code=429,
            )
        raise AssertionError("interrupt should stop retry before next attempt")

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr(agent, "_get_llm_retry_delay", lambda retry_number: 1.0)
    monkeypatch.setattr(
        "app.agent.get_settings",
        lambda: Settings(model=ModelSettings(max_retries=5)),
    )
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    agent._run()
    if interrupter is not None:
        interrupter.join(timeout=1.0)

    assert llm_calls == 1
    assert wait_calls == 2
    assert not any(
        isinstance(entry, ErrorEntry) for entry in agent.get_history_snapshot()
    )


def test_agent_retries_transient_errors_when_retry_policy_is_unlimited(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT))
    wait_calls = 0
    llm_calls = 0

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            agent._append_history(
                ReceivedMessage(content="finish the task", from_id="tester")
            )
            agent.set_state(AgentState.RUNNING, "received message from tester")
            return
        raise AssertionError("agent should not return to idle while retrying")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        nonlocal llm_calls
        llm_calls += 1
        if llm_calls < 4:
            raise LLMProviderError(
                f"temporary failure {llm_calls}",
                transient=True,
                status_code=429,
            )
        if llm_calls == 5:
            agent.request_termination("done")
            return LLMResponse()
        if llm_calls == 4:
            return LLMResponse(content="Recovered after unlimited retries")
        raise AssertionError("unexpected extra LLM call")

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr(agent, "_get_llm_retry_delay", lambda retry_number: 0.0)
    monkeypatch.setattr(
        "app.agent.get_settings",
        lambda: Settings(
            model=ModelSettings(
                retry_policy="unlimited",
                max_retries=1,
            )
        ),
    )
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    agent._run()

    assert wait_calls == 1
    assert llm_calls == 5
    assert agent.state == AgentState.TERMINATED
    assert any(
        isinstance(entry, AssistantText)
        and entry.content == "Recovered after unlimited retries"
        for entry in agent.get_history_snapshot()
    )


def test_get_llm_retry_delay_uses_configured_backoff_settings(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT))

    monkeypatch.setattr(
        "app.agent.get_settings",
        lambda: Settings(
            model=ModelSettings(
                retry_initial_delay_seconds=0.75,
                retry_max_delay_seconds=5.0,
                retry_backoff_cap_retries=3,
            )
        ),
    )

    assert agent._get_llm_retry_delay(1) == 0.75
    assert agent._get_llm_retry_delay(2) == 1.5
    assert agent._get_llm_retry_delay(3) == 3.0
    assert agent._get_llm_retry_delay(4) == 3.0


def test_get_llm_retry_429_delay_uses_active_provider_only_for_429(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, role_name="Worker"))

    monkeypatch.setattr(
        "app.agent.get_settings",
        lambda: Settings(
            model=ModelSettings(
                active_provider_id="provider-1",
                active_model="gpt-test",
            ),
            providers=[
                ProviderConfig(
                    id="provider-1",
                    name="Primary",
                    type="openai_compatible",
                    base_url="https://api.example.com/v1",
                    api_key="secret",
                    retry_429_delay_seconds=4,
                )
            ],
        ),
    )

    assert agent._get_llm_retry_429_delay(429) == 4.0
    assert agent._get_llm_retry_429_delay(500) == 0.0


def test_clear_assistant_chat_history_drops_conversation_entries():
    assistant = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    assistant.history.extend(
        [
            SystemEntry(content="system prompt"),
            ReceivedMessage(content="hello", from_id="human"),
            AssistantThinking(content="planning"),
            AssistantText(content="hi"),
            ToolCall(
                tool_name="idle",
                tool_call_id="tool-1",
                arguments={},
                result="idle 1.00s",
            ),
            ErrorEntry(content="boom"),
        ]
    )

    assistant.clear_chat_history()

    assert all(
        isinstance(entry, (SystemEntry, StateEntry))
        for entry in assistant.get_history_snapshot()
    )


def test_clear_assistant_chat_history_interrupts_running_agent(monkeypatch):
    assistant = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    assistant.set_state(AgentState.RUNNING, "processing")
    assistant.history.append(ReceivedMessage(content="hello", from_id="human"))

    def fake_request_interrupt() -> bool:
        assistant.set_state(AgentState.IDLE, "interrupted by clear chat")
        return True

    monkeypatch.setattr(assistant, "request_interrupt", fake_request_interrupt)

    assistant.clear_chat_history()

    assert assistant.state == AgentState.IDLE
    assert not any(
        isinstance(entry, ReceivedMessage) for entry in assistant.get_history_snapshot()
    )


def test_agent_normalizes_think_tags_in_final_content(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    wait_calls = 0
    llm_calls = 0

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            agent._append_history(
                ReceivedMessage(content="reply to me", from_id="human")
            )
            agent.set_state(AgentState.RUNNING, "received message from human")
            return
        agent.request_termination("done")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        nonlocal llm_calls
        llm_calls += 1
        if llm_calls == 2:
            agent.request_termination("done")
            return LLMResponse()
        return LLMResponse(content="<think>Drafting plan</think>\nHello there")

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    agent._run()

    history = agent.get_history_snapshot()

    assert any(
        isinstance(entry, AssistantThinking) and entry.content == "Drafting plan"
        for entry in history
    )
    assert any(
        isinstance(entry, AssistantText) and entry.content == "Hello there"
        for entry in history
    )
    assert not any(
        isinstance(entry, AssistantText) and "<think>" in entry.content
        for entry in history
    )


def test_agent_dedupes_structured_thinking_and_raw_think_tags(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    wait_calls = 0
    llm_calls = 0

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            agent._append_history(
                ReceivedMessage(content="reply to me", from_id="human")
            )
            agent.set_state(AgentState.RUNNING, "received message from human")
            return
        agent.request_termination("done")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        nonlocal llm_calls
        llm_calls += 1
        if llm_calls == 2:
            agent.request_termination("done")
            return LLMResponse()
        return LLMResponse(
            content="<think>Drafting plan</think>\nHello there",
            thinking="Drafting plan",
        )

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    agent._run()

    thinking_entries = [
        entry.content
        for entry in agent.get_history_snapshot()
        if isinstance(entry, AssistantThinking)
    ]

    assert thinking_entries == ["Drafting plan"]


def test_agent_unregisters_from_registry_after_termination_request(monkeypatch):
    registry.reset()
    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent-x")
    registry.register(agent)
    events = []

    def fake_wait_for_input() -> None:
        agent._append_history(
            ReceivedMessage(content="finish the task", from_id="tester")
        )
        agent.set_state(AgentState.RUNNING, "received message from tester")

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        agent.request_termination("done")
        return LLMResponse()

    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)
    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    agent._run()

    assert agent.state == AgentState.TERMINATED
    assert registry.get(agent.uuid) is None
    assert [event.type for event in events[-2:]] == [
        EventType.NODE_STATE_CHANGED,
        EventType.NODE_TERMINATED,
    ]
    assert events[-1].data == {"reason": "done"}


def test_finalize_termination_removes_bidirectional_connections():
    registry.reset()
    try:
        assistant = Agent(
            NodeConfig(node_type=NodeType.ASSISTANT),
        )
        worker = Agent(
            NodeConfig(node_type=NodeType.AGENT),
            uuid="worker",
        )
        registry.register(assistant)
        registry.register(worker)
        assistant.add_connection(worker.uuid)
        worker.add_connection(assistant.uuid)

        worker._finalize_termination("done")

        assert registry.get(worker.uuid) is None
        assert assistant.get_connections_snapshot() == []
        assert worker.get_connections_snapshot() == []
    finally:
        registry.reset()


def test_agent_interrupts_streaming_response_and_returns_to_idle(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())
    registry.reset()
    assistant = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    registry.register(assistant)
    events = []
    wait_calls = 0

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            assistant._append_history(
                ReceivedMessage(content="start working", from_id="human")
            )
            assistant.set_state(AgentState.RUNNING, "received message from human")
            return
        assistant.request_termination("done")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        assert on_chunk is not None
        on_chunk("thinking", "Drafting plan")
        on_chunk("content", "Working")
        assert assistant.request_interrupt() is True
        on_chunk("content", " on the task")
        raise AssertionError("interrupt should stop streaming before completion")

    monkeypatch.setattr(assistant, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)
    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    try:
        assistant._run()
    finally:
        registry.reset()

    history = assistant.get_history_snapshot()

    assert any(
        isinstance(entry, AssistantThinking) and entry.content == "Drafting plan"
        for entry in history
    )
    assert any(
        isinstance(entry, AssistantText) and entry.content == "Working"
        for entry in history
    )
    assert any(
        event.type == EventType.NODE_STATE_CHANGED
        and event.data.get("new_state") == "idle"
        for event in events
    )


def test_agent_normalizes_think_tags_in_streaming_content(monkeypatch):
    assistant = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    wait_calls = 0
    events = []
    llm_calls = 0

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            assistant._append_history(
                ReceivedMessage(content="reply to me", from_id="human")
            )
            assistant.set_state(AgentState.RUNNING, "received message from human")
            return
        assistant.request_termination("done")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        nonlocal llm_calls
        llm_calls += 1
        if llm_calls == 2:
            assistant.request_termination("done")
            return LLMResponse()
        assert on_chunk is not None
        on_chunk("content", "<think>Drafting plan</think>\nHello there")
        return LLMResponse(content="<think>Drafting plan</think>\nHello there")

    monkeypatch.setattr(assistant, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)
    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    assistant._run()

    history = assistant.get_history_snapshot()
    assistant_content_events = [
        event.data.get("content")
        for event in events
        if event.type == EventType.ASSISTANT_CONTENT
    ]

    assert any(
        isinstance(entry, AssistantThinking) and entry.content == "Drafting plan"
        for entry in history
    )
    assert any(
        isinstance(entry, AssistantText) and entry.content == "Hello there"
        for entry in history
    )
    assert assistant_content_events == ["Hello there"]


def test_agent_does_not_duplicate_thinking_when_provider_returns_both(monkeypatch):
    assistant = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    wait_calls = 0
    llm_calls = 0

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            assistant._append_history(
                ReceivedMessage(content="reply to me", from_id="human")
            )
            assistant.set_state(AgentState.RUNNING, "received message from human")
            return
        assistant.request_termination("done")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        nonlocal llm_calls
        llm_calls += 1
        if llm_calls == 2:
            assistant.request_termination("done")
            return LLMResponse()
        return LLMResponse(
            content="<think>Drafting plan</think>\nHello there",
            thinking="Drafting plan",
        )

    monkeypatch.setattr(assistant, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    assistant._run()

    thinking_entries = [
        entry
        for entry in assistant.get_history_snapshot()
        if isinstance(entry, AssistantThinking)
    ]

    assert [entry.content for entry in thinking_entries] == ["Drafting plan"]


def test_request_sleep_raises_interrupt_when_running_agent_is_interrupted():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent-a")
    agent.set_state(AgentState.RUNNING, "sleeping")
    assert agent.request_interrupt() is True

    try:
        agent.request_sleep(seconds=0.2)
    except InterruptRequestedError:
        pass
    else:
        raise AssertionError("expected interrupt during sleep")


def test_agent_interrupts_blocked_provider_without_streaming_output(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())
    registry.reset()
    assistant = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    registry.register(assistant)
    events = []
    wait_calls = 0
    provider_started = threading.Event()

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            assistant._append_history(
                ReceivedMessage(content="start working", from_id="human")
            )
            assistant.set_state(AgentState.RUNNING, "received message from human")
            return
        assistant.request_termination("done")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        closed = threading.Event()
        assert register_interrupt is not None
        register_interrupt(closed.set)
        provider_started.set()
        while not closed.wait(0.01):
            continue
        raise RuntimeError("stream closed")

    def request_interrupt() -> None:
        provider_started.wait(timeout=1.0)
        assistant.request_interrupt()

    interrupter = threading.Thread(target=request_interrupt, daemon=True)
    interrupter.start()

    monkeypatch.setattr(assistant, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)
    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    try:
        assistant._run()
    finally:
        registry.reset()

    interrupter.join(timeout=1.0)

    assert any(
        event.type == EventType.NODE_STATE_CHANGED
        and event.data.get("new_state") == "idle"
        for event in events
    )


def test_provider_resolution_error_is_recorded_in_history(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent-y")
    wait_calls = 0

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        if wait_calls == 1:
            agent._append_history(
                ReceivedMessage(content="do the task", from_id="tester")
            )
            agent.set_state(AgentState.RUNNING, "received message from tester")
            return
        agent.request_termination("stop")

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr(
        "app.agent.gateway.chat",
        lambda messages, tools=None, on_chunk=None, register_interrupt=None, role_name=None: (
            (_ for _ in ()).throw(RuntimeError("No active provider configured"))
        ),
    )

    agent._run()

    assert wait_calls == 2
    assert agent.state == AgentState.TERMINATED
    assert any(
        isinstance(entry, ErrorEntry)
        and "No active provider configured" in entry.content
        for entry in agent.get_history_snapshot()
    )


def test_assistant_content_streams_even_when_response_has_tool_calls(monkeypatch):
    registry.reset()
    assistant = Agent(
        NodeConfig(node_type=NodeType.ASSISTANT, tools=["idle"]),
    )
    registry.register(assistant)
    events = []

    def fake_wait_for_input() -> None:
        assistant._append_history(
            ReceivedMessage(content="report progress", from_id="human")
        )
        assistant.set_state(AgentState.RUNNING, "received message from human")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        if on_chunk is not None:
            on_chunk("content", "Working on it")
        return LLMResponse(
            content="Working on it",
            tool_calls=[
                ToolCallResult(
                    id="call-idle",
                    name="idle",
                    arguments={},
                )
            ],
        )

    monkeypatch.setattr(assistant, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)
    monkeypatch.setattr(
        assistant,
        "_handle_tool_call",
        lambda name, arguments, call_id: assistant.request_termination("done"),
    )
    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    assistant._run()

    assistant_events = [
        event for event in events if event.type == EventType.ASSISTANT_CONTENT
    ]
    assert [event.data for event in assistant_events] == [{"content": "Working on it"}]


def test_extract_routed_content_parses_single_target_block():
    parent_content, routed = extract_routed_content("@worker: review the diff")

    assert parent_content == ""
    assert routed == [(["worker"], "review the diff")]


def test_extract_routed_content_treats_comma_target_as_single_literal_target():
    parent_content, routed = extract_routed_content(
        "@alice, bob: check the latest output\nand confirm",
    )

    assert parent_content == ""
    assert routed == [(["alice, bob"], "check the latest output\nand confirm")]


def test_extract_routed_content_returns_plain_content_without_target_header():
    parent_content, routed = extract_routed_content(
        "Need a quick follow-up.\nStill investigating.",
    )

    assert parent_content == "Need a quick follow-up.\nStill investigating."
    assert routed == []


def test_extract_routed_content_treats_non_header_target_as_plain_content():
    parent_content, routed = extract_routed_content(
        "Need a quick follow-up.\n@alice: check the latest output",
    )

    assert parent_content == "Need a quick follow-up.\n@alice: check the latest output"
    assert routed == []


def test_route_content_output_delivers_to_single_target_when_header_present(
    monkeypatch,
):
    registry.reset()
    _register_tab_leader()
    child = Agent(NodeConfig(node_type=NodeType.AGENT, tab_id="tab-1"), uuid="child")
    peer = Agent(NodeConfig(node_type=NodeType.AGENT, tab_id="tab-1"), uuid="peer")
    registry.register(child)
    registry.register(peer)
    child.add_connection(peer.uuid)
    events = []

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    try:
        routed_result = child._route_content_output(
            "@peer: investigate the error\nwith the latest logs",
        )
    finally:
        registry.reset()

    peer_signal = peer._wake_queue.get_nowait()
    message_id = routed_result.sent_messages[0].message_id

    assert peer_signal.payload == {
        "message": {
            "from": "child",
            "content": "investigate the error\nwith the latest logs",
            "message_id": message_id,
        }
    }
    assert len(routed_result.sent_messages) == 1
    assert (
        routed_result.sent_messages[0].content
        == "investigate the error\nwith the latest logs"
    )
    assert routed_result.sent_messages[0].to_ids == ["peer"]
    assert routed_result.route_errors == []
    assert routed_result.had_additional_routed_headers is False
    assert message_id is not None
    assert [event.data for event in events if event.type == EventType.NODE_MESSAGE] == [
        {
            "to_id": "peer",
            "content": "investigate the error\nwith the latest logs",
            "message_id": message_id,
        },
    ]


def test_route_content_output_delivers_to_contact_from_incoming_edge(monkeypatch):
    registry.reset()
    _register_tab_leader()
    child = Agent(NodeConfig(node_type=NodeType.AGENT, tab_id="tab-1"), uuid="child")
    peer = Agent(NodeConfig(node_type=NodeType.AGENT, tab_id="tab-1"), uuid="peer")
    registry.register(child)
    registry.register(peer)
    peer.add_connection(child.uuid)
    events = []

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    try:
        routed_result = child._route_content_output("@peer: reply with the findings")
    finally:
        registry.reset()

    peer_signal = peer._wake_queue.get_nowait()
    message_id = routed_result.sent_messages[0].message_id

    assert peer_signal.payload == {
        "message": {
            "from": "child",
            "content": "reply with the findings",
            "message_id": message_id,
        }
    }
    assert routed_result.route_errors == []
    assert routed_result.sent_messages[0].to_ids == ["peer"]
    assert [event.data for event in events if event.type == EventType.NODE_MESSAGE] == [
        {
            "to_id": "peer",
            "content": "reply with the findings",
            "message_id": message_id,
        },
    ]


def test_route_content_output_reports_error_when_target_is_not_in_contacts():
    registry.reset()
    _register_tab_leader()
    child = Agent(NodeConfig(node_type=NodeType.AGENT, tab_id="tab-1"), uuid="child")
    peer = Agent(NodeConfig(node_type=NodeType.AGENT, tab_id="tab-1"), uuid="peer")
    registry.register(child)
    registry.register(peer)

    try:
        routed_result = child._route_content_output("@peer: reply with the findings")
    finally:
        registry.reset()

    assert routed_result.sent_messages == []
    assert routed_result.route_errors == [
        "Routing failed: target `peer` is not in contacts."
    ]


def test_route_content_output_reports_error_when_leader_lacks_explicit_edge():
    registry.reset()
    leader = _register_tab_leader()
    child = Agent(NodeConfig(node_type=NodeType.AGENT, tab_id="tab-1"), uuid="child")
    registry.register(child)

    try:
        routed_result = leader._route_content_output("@child: reply with the findings")
    finally:
        registry.reset()

    assert routed_result.sent_messages == []
    assert routed_result.route_errors == [
        "Routing failed: target `child` is not in contacts."
    ]


def test_route_content_output_does_not_deliver_plain_content(monkeypatch):
    registry.reset()
    parent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="parent")
    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="child")
    events = []
    registry.register(parent)
    registry.register(agent)

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    try:
        routed_result = agent._route_content_output("Status update.")
    finally:
        registry.reset()

    assert routed_result.sent_messages == []
    assert routed_result.had_routed_header is False
    assert parent._wake_queue.empty()
    assert not any(event.type == EventType.NODE_MESSAGE for event in events)


def test_route_content_output_treats_non_header_target_text_as_plain_content(
    monkeypatch,
):
    registry.reset()
    parent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="parent")
    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="child")
    events = []
    registry.register(parent)
    registry.register(agent)

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    try:
        routed_result = agent._route_content_output(
            "Status update.\n@peer: investigate the error"
        )
    finally:
        registry.reset()

    assert routed_result.sent_messages == []
    assert routed_result.had_routed_header is False
    assert parent._wake_queue.empty()
    assert not any(event.type == EventType.NODE_MESSAGE for event in events)


def test_record_content_output_appends_error_entry_for_unmatched_target(monkeypatch):
    registry.reset()
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    registry.register(agent)
    events = []

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    try:
        agent._record_content_output(
            "@alice, bob: review the diff",
            emitted_human_content=False,
        )
    finally:
        registry.reset()

    history = agent.get_history_snapshot()

    assert any(
        isinstance(entry, ErrorEntry)
        and entry.content == "Routing failed: target `alice, bob` was not found."
        for entry in history
    )
    assert not any(isinstance(entry, AssistantText) for entry in history)
    assert not any(event.type == EventType.ASSISTANT_CONTENT for event in events)


def test_record_content_output_keeps_plain_prefix_and_drops_later_routed_text(
    monkeypatch,
):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())
    registry.reset()
    assistant = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    registry.register(assistant)
    events = []

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    try:
        assistant._record_content_output(
            "OK\n\n@worker: do the follow-up task",
            emitted_human_content=False,
        )
        messages = assistant._build_messages()
    finally:
        registry.reset()

    reminder = (
        "<system>Routing reminder: this response mixed plain text with a later "
        "`@target:` line. Only the leading plain text was kept as plain output. "
        "The later routed-looking lines were not delivered. If you intended to "
        "message a node, send that `@target:` message in a later response.</system>"
    )

    history = assistant.get_history_snapshot()
    assert isinstance(history[-1], AssistantText)
    assert history[-1].content == "OK"
    assert any(
        event.type == EventType.ASSISTANT_CONTENT and event.data == {"content": "OK"}
        for event in events
    )
    assert any(msg.get("content") == reminder for msg in messages)


def test_build_messages_adds_one_shot_notice_for_multiple_routed_headers(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())
    registry.reset()
    leader = _register_tab_leader()
    assistant = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    registry.register(assistant)

    try:
        assistant._record_content_output(
            "@leader: first task\n@other: second task",
            emitted_human_content=False,
        )

        first_messages = assistant._build_messages()
        second_messages = assistant._build_messages()
    finally:
        registry.reset()

    reminder = (
        "<system>Routing reminder: each response can route to only one node. Only "
        "the first `@target:` header in this content block was routed. Any later "
        "`@...:` lines were delivered as plain body text to the first target. If "
        "that was not intentional, send a correction to the first recipient and "
        "then send the remaining node messages in later responses, one target at "
        "a time.</system>"
    )

    assert any(msg.get("content") == reminder for msg in first_messages)
    assert not any(msg.get("content") == reminder for msg in second_messages)
    leader_signal = leader._wake_queue.get_nowait()
    assert (
        leader_signal.payload["message"]["content"] == "first task\n@other: second task"
    )


def test_multiple_routed_headers_prevent_idle_until_notice_is_seen(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())
    registry.reset()
    _register_tab_leader()
    assistant = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    registry.register(assistant)
    assistant.set_state(AgentState.RUNNING, "processing")

    try:
        assistant._record_content_output(
            "@leader: first task\n@other: second task",
            emitted_human_content=False,
        )
        idle_result = assistant.request_idle()
        first_messages = assistant._build_messages()
    finally:
        registry.reset()

    reminder = (
        "<system>Routing reminder: each response can route to only one node. Only "
        "the first `@target:` header in this content block was routed. Any later "
        "`@...:` lines were delivered as plain body text to the first target. If "
        "that was not intentional, send a correction to the first recipient and "
        "then send the remaining node messages in later responses, one target at "
        "a time.</system>"
    )

    assert idle_result == ""
    assert assistant.state == AgentState.RUNNING
    assert any(msg.get("content") == reminder for msg in first_messages)


def test_idle_is_blocked_when_fresh_input_has_no_progress(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    agent.set_state(AgentState.RUNNING, "processing")
    agent._turn_started_with_pending_input = True
    agent._turn_made_progress = False

    idle_result = agent.request_idle()
    messages = agent._build_messages()

    reminder = (
        "<system>Idle reminder: you received a new message this turn, but this "
        "response did not send a reply, route a message, or use any non-idle "
        "tool. Do not call `idle` yet. First reply to the Human, dispatch/"
        "delegate work, or take another concrete step.</system>"
    )

    assert idle_result == ""
    assert agent.state == AgentState.RUNNING
    assert any(msg.get("content") == reminder for msg in messages)


def test_idle_is_blocked_when_first_todo_is_actionable(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())
    agent = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    agent.set_state(AgentState.RUNNING, "processing")
    agent.set_todos(
        [
            TodoItem(text="Forward pyproject summary to Project Synthesizer"),
            TodoItem(text="Wait for final synthesis"),
        ]
    )

    idle_result = agent.request_idle()
    messages = agent._build_messages()

    reminder = (
        "<system>Idle reminder: your first remaining TODO still looks actionable "
        "(`Forward pyproject summary to Project Synthesizer`). Do that next, or "
        "update the TODO list so the first remaining item is the actual waiting "
        "step, before calling `idle`.</system>"
    )

    assert idle_result == ""
    assert agent.state == AgentState.RUNNING
    assert any(msg.get("content") == reminder for msg in messages)


def test_record_content_output_records_sent_message_in_history(monkeypatch):
    registry.reset()
    _register_tab_leader()
    child = Agent(NodeConfig(node_type=NodeType.AGENT, tab_id="tab-1"), uuid="child")
    peer = Agent(NodeConfig(node_type=NodeType.AGENT, tab_id="tab-1"), uuid="peer")
    registry.register(child)
    registry.register(peer)
    child.add_connection(peer.uuid)
    events = []

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    try:
        child._record_content_output(
            "@peer: investigate the error",
            emitted_human_content=False,
        )
    finally:
        registry.reset()

    history = child.get_history_snapshot()
    sent_entries = [entry for entry in history if isinstance(entry, SentMessage)]
    assert len(sent_entries) == 1
    assert sent_entries[0].content == "investigate the error"
    assert sent_entries[0].to_ids == ["peer"]
    assert sent_entries[0].message_id is not None
    assert not any(isinstance(entry, AssistantText) for entry in history)
    assert peer._wake_queue.get_nowait().payload == {
        "message": {
            "from": "child",
            "content": "investigate the error",
            "message_id": sent_entries[0].message_id,
        }
    }
    assert not any(event.type == EventType.ASSISTANT_CONTENT for event in events)


def test_routed_message_emits_streaming_preview_for_sender_and_receiver(monkeypatch):
    registry.reset()
    _register_tab_leader()
    child = Agent(NodeConfig(node_type=NodeType.AGENT, tab_id="tab-1"), uuid="child")
    peer = Agent(NodeConfig(node_type=NodeType.AGENT, tab_id="tab-1"), uuid="peer")
    registry.register(child)
    registry.register(peer)
    child.add_connection(peer.uuid)
    events = []
    responses = iter(
        [
            LLMResponse(content="@peer: investigate the error"),
            LLMResponse(),
        ]
    )

    def fake_wait_for_input() -> None:
        child._append_history(ReceivedMessage(content="start", from_id="human"))
        child.set_state(AgentState.RUNNING, "received message from human")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        response = next(responses)
        if response.content and on_chunk is not None:
            for chunk in ["@peer: inv", "estigate", " the error"]:
                on_chunk("content", chunk)
        if response.content is None:
            child.request_termination("done")
        return response

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))
    monkeypatch.setattr(child, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    try:
        child._run()
    finally:
        registry.reset()

    sent_deltas = [
        event.data
        for event in events
        if event.type == EventType.HISTORY_ENTRY_DELTA
        and event.agent_id == "child"
        and event.data.get("type") == "SentMessageDelta"
    ]
    received_deltas = [
        event.data
        for event in events
        if event.type == EventType.HISTORY_ENTRY_DELTA
        and event.agent_id == "peer"
        and event.data.get("type") == "ReceivedMessageDelta"
    ]

    assert "".join(delta["text"] for delta in sent_deltas) == "investigate the error"
    assert (
        "".join(delta["text"] for delta in received_deltas) == "investigate the error"
    )
    assert len({delta["message_id"] for delta in sent_deltas}) == 1
    assert len({delta["message_id"] for delta in received_deltas}) == 1
    assert sent_deltas[0]["message_id"] == received_deltas[0]["message_id"]

    final_sent = next(
        entry
        for entry in child.get_history_snapshot()
        if isinstance(entry, SentMessage)
    )
    assert final_sent.message_id == sent_deltas[0]["message_id"]
    assert peer._wake_queue.get_nowait().payload == {
        "message": {
            "from": "child",
            "content": "investigate the error",
            "message_id": final_sent.message_id,
        }
    }


def test_build_messages_replays_sent_messages_as_routed_assistant_content(
    monkeypatch,
):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(ReceivedMessage(content="begin", from_id="human"))
    agent._append_history(SentMessage(content="to peer", to_ids=["peer"]))
    agent._append_history(AssistantText(content="final answer"))

    messages = agent._build_messages()

    assert messages == [
        {"role": "system", "content": messages[0]["content"]},
        {"role": "user", "content": '<message from="human">begin</message>'},
        {"role": "assistant", "content": "@peer: to peer"},
        {"role": "assistant", "content": "final answer"},
        {
            "role": "user",
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- Each response can route to only one node. A content block supports only one routed `@target:` header. If you need to message multiple nodes, send one routed message now and continue with another routed message on the next response.\n- If there is no unfinished TODO and the task is finished with no immediate next action, call `idle`.</system>",
        },
    ]


def test_build_messages_replays_each_sent_target_as_separate_routed_content(
    monkeypatch,
):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(ReceivedMessage(content="begin", from_id="human"))
    agent._append_history(
        SentMessage(
            content="investigate the error\nwith the latest logs",
            to_ids=["peer", "helper"],
        )
    )

    messages = agent._build_messages()

    assert messages == [
        {"role": "system", "content": messages[0]["content"]},
        {"role": "user", "content": '<message from="human">begin</message>'},
        {
            "role": "assistant",
            "content": "@peer: investigate the error\nwith the latest logs",
        },
        {
            "role": "assistant",
            "content": "@helper: investigate the error\nwith the latest logs",
        },
        {
            "role": "user",
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- Each response can route to only one node. A content block supports only one routed `@target:` header. If you need to message multiple nodes, send one routed message now and continue with another routed message on the next response.\n- If there is no unfinished TODO and the task is finished with no immediate next action, call `idle`.</system>",
        },
    ]


def test_build_messages_appends_runtime_todo_context_without_history_entry(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(ReceivedMessage(content="begin", from_id="human"))
    agent.set_todos([TodoItem(text="Inspect files"), TodoItem(text="Report results")])

    messages = agent._build_messages()
    history = agent.get_history_snapshot()

    received_entries = [
        entry for entry in history if isinstance(entry, ReceivedMessage)
    ]
    assert len(received_entries) == 1
    assert messages == [
        {"role": "system", "content": messages[0]["content"]},
        {"role": "user", "content": '<message from="human">begin</message>'},
        {
            "role": "user",
            "content": "<system>Current TODO list:\n  - Inspect files\n  - Report results</system>",
        },
        {
            "role": "user",
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- Each response can route to only one node. A content block supports only one routed `@target:` header. If you need to message multiple nodes, send one routed message now and continue with another routed message on the next response.\n- If the TODO list is not complete yet, use `todo` to replace it with the latest remaining items.</system>",
        },
    ]


def test_build_messages_appends_runtime_post_prompt_and_idle_guidance(monkeypatch):
    monkeypatch.setattr(
        "app.agent.get_settings",
        lambda: Settings(custom_post_prompt="Append this after history."),
    )

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(ReceivedMessage(content="begin", from_id="human"))
    agent.set_todos([TodoItem(text="Inspect files")])
    agent.set_todos([])

    messages = agent._build_messages()
    history = agent.get_history_snapshot()

    received_entries = [
        entry for entry in history if isinstance(entry, ReceivedMessage)
    ]
    assert len(received_entries) == 1
    assert messages == [
        {"role": "system", "content": messages[0]["content"]},
        {"role": "user", "content": '<message from="human">begin</message>'},
        {
            "role": "user",
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- Each response can route to only one node. A content block supports only one routed `@target:` header. If you need to message multiple nodes, send one routed message now and continue with another routed message on the next response.\n- If there is no unfinished TODO and the task is finished with no immediate next action, call `idle`.</system>",
        },
        {
            "role": "user",
            "content": "<system>Append this after history.</system>",
        },
    ]


def test_build_messages_warns_about_newly_created_agents_waiting_for_first_task(
    monkeypatch,
):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(ReceivedMessage(content="begin", from_id="human"))
    agent._append_history(
        ToolCall(
            tool_name="create_agent",
            tool_call_id="call-create-agent",
            arguments={
                "tab_id": "tab-1",
                "role_name": "Worker",
                "name": "Directory Worker",
            },
            result=json.dumps(
                {
                    "id": "12345678-aaaa-bbbb-cccc-ddddeeeeffff",
                    "config": {
                        "node_type": "agent",
                        "role_name": "Worker",
                        "tab_id": "tab-1",
                        "name": "Directory Worker",
                        "tools": ["idle", "sleep", "todo", "contacts", "read"],
                        "write_dirs": [],
                        "allow_network": False,
                    },
                    "state": "initializing",
                    "todos": [],
                    "history": [],
                    "position": None,
                    "created_at": 1.0,
                    "updated_at": 1.0,
                }
            ),
        )
    )

    messages = agent._build_messages()

    assert messages == [
        {"role": "system", "content": messages[0]["content"]},
        {"role": "user", "content": '<message from="human">begin</message>'},
        {
            "role": "assistant",
            "tool_calls": [
                {
                    "id": "call-create-agent",
                    "type": "function",
                    "function": {
                        "name": "create_agent",
                        "arguments": '{"tab_id": "tab-1", "role_name": "Worker", "name": "Directory Worker"}',
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call-create-agent",
            "content": '{"id": "12345678-aaaa-bbbb-cccc-ddddeeeeffff", "config": {"node_type": "agent", "role_name": "Worker", "tab_id": "tab-1", "name": "Directory Worker", "tools": ["idle", "sleep", "todo", "contacts", "read"], "write_dirs": [], "allow_network": false}, "state": "initializing", "todos": [], "history": [], "position": null, "created_at": 1.0, "updated_at": 1.0}',
        },
        {
            "role": "user",
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- Each response can route to only one node. A content block supports only one routed `@target:` header. If you need to message multiple nodes, send one routed message now and continue with another routed message on the next response.\n- Newly created agents still waiting for their first task: Directory Worker (`12345678`).\n- `create_agent` only creates a new graph node. It does not start work by itself.\n- Before calling `idle`, send each waiting agent a concrete first task with `@<name-or-uuid>: ...`. If several agents are waiting, route to one agent per response until all of them have been dispatched.</system>",
        },
    ]


def test_build_messages_uses_role_name_when_created_agent_has_no_explicit_name(
    monkeypatch,
):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(ReceivedMessage(content="begin", from_id="human"))
    agent._append_history(
        ToolCall(
            tool_name="create_agent",
            tool_call_id="call-create-agent",
            arguments={"tab_id": "tab-1", "role_name": "Worker"},
            result=json.dumps(
                {
                    "id": "12345678-aaaa-bbbb-cccc-ddddeeeeffff",
                    "config": {
                        "node_type": "agent",
                        "role_name": "Worker",
                        "tab_id": "tab-1",
                        "name": None,
                        "tools": ["idle", "sleep", "todo", "contacts", "read"],
                        "write_dirs": [],
                        "allow_network": False,
                    },
                    "state": "initializing",
                    "todos": [],
                    "history": [],
                    "position": None,
                    "created_at": 1.0,
                    "updated_at": 1.0,
                }
            ),
        )
    )

    messages = agent._build_messages()

    assert messages == [
        {"role": "system", "content": messages[0]["content"]},
        {"role": "user", "content": '<message from="human">begin</message>'},
        {
            "role": "assistant",
            "tool_calls": [
                {
                    "id": "call-create-agent",
                    "type": "function",
                    "function": {
                        "name": "create_agent",
                        "arguments": '{"tab_id": "tab-1", "role_name": "Worker"}',
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call-create-agent",
            "content": '{"id": "12345678-aaaa-bbbb-cccc-ddddeeeeffff", "config": {"node_type": "agent", "role_name": "Worker", "tab_id": "tab-1", "name": null, "tools": ["idle", "sleep", "todo", "contacts", "read"], "write_dirs": [], "allow_network": false}, "state": "initializing", "todos": [], "history": [], "position": null, "created_at": 1.0, "updated_at": 1.0}',
        },
        {
            "role": "user",
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- Each response can route to only one node. A content block supports only one routed `@target:` header. If you need to message multiple nodes, send one routed message now and continue with another routed message on the next response.\n- Newly created agents still waiting for their first task: Worker (`12345678`).\n- `create_agent` only creates a new graph node. It does not start work by itself.\n- Before calling `idle`, send each waiting agent a concrete first task with `@<name-or-uuid>: ...`. If several agents are waiting, route to one agent per response until all of them have been dispatched.</system>",
        },
    ]


def test_build_messages_clears_new_agent_warning_after_first_sent_message(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(ReceivedMessage(content="begin", from_id="human"))
    agent._append_history(
        ToolCall(
            tool_name="create_agent",
            tool_call_id="call-create-agent",
            arguments={
                "tab_id": "tab-1",
                "role_name": "Worker",
                "name": "Directory Worker",
            },
            result=json.dumps(
                {
                    "id": "12345678-aaaa-bbbb-cccc-ddddeeeeffff",
                    "config": {
                        "node_type": "agent",
                        "role_name": "Worker",
                        "tab_id": "tab-1",
                        "name": "Directory Worker",
                        "tools": ["idle", "sleep", "todo", "contacts", "read"],
                        "write_dirs": [],
                        "allow_network": False,
                    },
                    "state": "initializing",
                    "todos": [],
                    "history": [],
                    "position": None,
                    "created_at": 1.0,
                    "updated_at": 1.0,
                }
            ),
        )
    )
    agent._append_history(
        SentMessage(
            content="inspect the current directory",
            to_ids=["12345678-aaaa-bbbb-cccc-ddddeeeeffff"],
        )
    )

    messages = agent._build_messages()

    assert messages == [
        {"role": "system", "content": messages[0]["content"]},
        {"role": "user", "content": '<message from="human">begin</message>'},
        {
            "role": "assistant",
            "tool_calls": [
                {
                    "id": "call-create-agent",
                    "type": "function",
                    "function": {
                        "name": "create_agent",
                        "arguments": '{"tab_id": "tab-1", "role_name": "Worker", "name": "Directory Worker"}',
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call-create-agent",
            "content": '{"id": "12345678-aaaa-bbbb-cccc-ddddeeeeffff", "config": {"node_type": "agent", "role_name": "Worker", "tab_id": "tab-1", "name": "Directory Worker", "tools": ["idle", "sleep", "todo", "contacts", "read"], "write_dirs": [], "allow_network": false}, "state": "initializing", "todos": [], "history": [], "position": null, "created_at": 1.0, "updated_at": 1.0}',
        },
        {
            "role": "assistant",
            "content": "@12345678-aaaa-bbbb-cccc-ddddeeeeffff: inspect the current directory",
        },
        {
            "role": "user",
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- Each response can route to only one node. A content block supports only one routed `@target:` header. If you need to message multiple nodes, send one routed message now and continue with another routed message on the next response.\n- If there is no unfinished TODO and the task is finished with no immediate next action, call `idle`.</system>",
        },
    ]


def test_build_messages_keeps_sleep_tool_results_in_context(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(
        ReceivedMessage(content="pause before continuing", from_id="human")
    )
    agent._append_history(
        ToolCall(
            tool_name="sleep",
            tool_call_id="call-sleep",
            arguments={"seconds": 0.5},
            result="slept 0.50s",
        )
    )

    messages = agent._build_messages()

    assert any(
        msg.get("role") == "assistant"
        and msg.get("tool_calls")
        == [
            {
                "id": "call-sleep",
                "type": "function",
                "function": {
                    "name": "sleep",
                    "arguments": '{"seconds": 0.5}',
                },
            }
        ]
        for msg in messages
    )
    assert any(
        msg.get("role") == "tool"
        and msg.get("tool_call_id") == "call-sleep"
        and msg.get("content") == "slept 0.50s"
        for msg in messages
    )


def test_build_messages_keeps_idle_tool_results_in_context(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(ReceivedMessage(content="resume after wait", from_id="human"))
    agent._append_history(
        ToolCall(
            tool_name="idle",
            tool_call_id="call-idle",
            arguments={},
            result="idle 1.25s",
        )
    )

    messages = agent._build_messages()

    assert any(
        msg.get("role") == "assistant"
        and msg.get("tool_calls")
        == [
            {
                "id": "call-idle",
                "type": "function",
                "function": {
                    "name": "idle",
                    "arguments": "{}",
                },
            }
        ]
        for msg in messages
    )
    assert any(
        msg.get("role") == "tool"
        and msg.get("tool_call_id") == "call-idle"
        and msg.get("content") == "idle 1.25s"
        for msg in messages
    )


def test_build_messages_keeps_error_entries_in_context(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(ReceivedMessage(content="begin", from_id="human"))
    agent._append_history(ErrorEntry(content="RuntimeError: boom\n\ntraceback"))

    messages = agent._build_messages()

    assert any(
        msg.get("role") == "user"
        and msg.get("content")
        == "<system>Previous runtime error:\nRuntimeError: boom\n\ntraceback</system>"
        for msg in messages
    )


def test_assistant_does_not_emit_human_content_for_routed_message(monkeypatch):
    registry.reset()
    _register_tab_leader()
    assistant = Agent(
        NodeConfig(node_type=NodeType.ASSISTANT),
        uuid="assistant",
    )
    registry.register(assistant)
    events = []
    responses = iter(
        [
            LLMResponse(content="@leader: investigate the error"),
            LLMResponse(),
        ]
    )

    def fake_wait_for_input() -> None:
        assistant._append_history(
            ReceivedMessage(content="please investigate", from_id="human")
        )
        assistant.set_state(AgentState.RUNNING, "received message from human")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        response = next(responses)
        if response.content and on_chunk is not None:
            on_chunk("content", response.content)
        if response.content is None:
            assistant.request_termination("done")
        return response

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))
    monkeypatch.setattr(assistant, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    try:
        assistant._run()
    finally:
        registry.reset()

    assert not any(event.type == EventType.ASSISTANT_CONTENT for event in events)
    assert any(
        isinstance(entry, SentMessage)
        and entry.content == "investigate the error"
        and entry.to_ids == ["leader"]
        for entry in assistant.get_history_snapshot()
    )
    assert not any(
        isinstance(entry, AssistantText)
        and entry.content == "@leader: investigate the error"
        for entry in assistant.get_history_snapshot()
    )


def test_idle_tool_records_wakeup_message_as_new_input_block(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["idle"]))
    wait_calls = 0
    llm_messages: list[list[dict]] = []
    responses = iter(
        [
            LLMResponse(
                tool_calls=[
                    ToolCallResult(
                        id="call-idle",
                        name="idle",
                        arguments={},
                    )
                ]
            ),
            LLMResponse(),
        ]
    )

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        agent._append_history(
            ReceivedMessage(content="start waiting", from_id="tester")
        )
        agent.set_state(AgentState.RUNNING, "received message from tester")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        llm_messages.append(messages)
        if len(llm_messages) == 1:
            timer = threading.Timer(
                0.01,
                lambda: agent.enqueue_message(
                    Message(
                        from_id="human",
                        to_id=agent.uuid,
                        content="wake up now",
                    )
                ),
            )
            timer.start()
        if len(llm_messages) == 2:
            agent.request_termination("done")
        return next(responses)

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    agent._run()

    assert wait_calls == 1
    assert agent.state == AgentState.TERMINATED
    second_round = llm_messages[1]
    assert any(
        msg.get("role") == "assistant"
        and msg.get("tool_calls")
        == [
            {
                "id": "call-idle",
                "type": "function",
                "function": {
                    "name": "idle",
                    "arguments": "{}",
                },
            }
        ]
        for msg in second_round
    )
    assert any(
        msg.get("role") == "tool"
        and msg.get("tool_call_id") == "call-idle"
        and isinstance(msg.get("content"), str)
        and msg.get("content", "").startswith("idle ")
        for msg in second_round
    )
    assert any(
        msg.get("role") == "user"
        and msg.get("content") == '<message from="human">wake up now</message>'
        for msg in second_round
    )
    assert any(
        isinstance(entry, ToolCall)
        and entry.tool_name == "idle"
        and isinstance(entry.result, str)
        and entry.result.startswith("idle ")
        for entry in agent.get_history_snapshot()
    )


def test_agent_contextualizes_plain_loguru_calls(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent-z")
    captured: list[tuple[str, str | None]] = []
    sink_id = logger.add(
        lambda message: captured.append(
            (message.record["message"], message.record["extra"].get("agent_id"))
        )
    )

    def fake_wait_for_input() -> None:
        agent._append_history(ReceivedMessage(content="do the task", from_id="tester"))
        agent.set_state(AgentState.RUNNING, "received message from tester")

    def fake_chat(
        messages,
        tools=None,
        on_chunk=None,
        register_interrupt=None,
        role_name=None,
    ):
        logger.info("plain log inside agent")
        agent.request_termination("done")
        return LLMResponse()

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    try:
        agent._run()
    finally:
        logger.remove(sink_id)

    assert ("plain log inside agent", "agent-z") in captured


def test_agent_denies_tool_call_before_edit_execute(monkeypatch, tmp_path):
    agent = Agent(
        NodeConfig(node_type=NodeType.AGENT, tools=["edit"]),
        uuid="agent-security",
    )

    def fail_execute(*_args, **_kwargs):
        raise AssertionError("edit execute should not be called")

    monkeypatch.setattr("app.tools.edit.EditTool.execute", fail_execute)

    result = agent._handle_tool_call(
        "edit",
        {
            "path": str(tmp_path / "blocked.txt"),
            "edits": [
                {
                    "start_line": 1,
                    "end_line": 1,
                    "new_content": "hello\n",
                }
            ],
        },
        "call-edit",
    )

    assert result == json.dumps({"error": "Write access is disabled for this agent"})
    assert isinstance(agent.history[-1], ToolCall)
    assert agent.history[-1].result == result


def test_handle_tool_call_emits_streaming_tool_result_deltas(monkeypatch):
    agent = Agent(
        NodeConfig(node_type=NodeType.AGENT, tools=["streaming_tool"]),
        uuid="agent-stream",
    )
    events = []

    class FakeTool:
        def execute(self, agent, args, **kwargs):
            on_output = kwargs.get("on_output")
            assert on_output is not None
            on_output("chunk 1\n")
            on_output("chunk 2\n")
            return json.dumps({"status": "done"})

    class FakeRegistry:
        def get(self, name):
            if name == "streaming_tool":
                return FakeTool()
            return None

    monkeypatch.setattr("app.agent._get_tool_registry", lambda: FakeRegistry())
    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    result = agent._handle_tool_call("streaming_tool", {}, "call-stream")

    assert result == json.dumps({"status": "done"})
    assert isinstance(agent.history[-1], ToolCall)
    assert agent.history[-1].tool_call_id == "call-stream"
    assert agent.history[-1].result == result
    assert agent.history[-1].streaming is False
    assert [
        event.data["text"]
        for event in events
        if event.type == EventType.HISTORY_ENTRY_DELTA
    ] == [
        "chunk 1\n",
        "chunk 2\n",
    ]
