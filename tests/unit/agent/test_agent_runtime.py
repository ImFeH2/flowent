import json
import threading

from loguru import logger

from app.agent import Agent, extract_routed_content
from app.events import event_bus
from app.models import (
    AgentState,
    AssistantText,
    ErrorEntry,
    EventType,
    LLMResponse,
    Message,
    NodeConfig,
    NodeType,
    ReceivedMessage,
    ToolCall,
    ToolCallResult,
)
from app.registry import registry


def test_agent_keeps_running_after_pure_text_response(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["exit"]))
    wait_calls = 0
    llm_messages: list[list[dict]] = []
    responses = iter(
        [
            LLMResponse(content="working through the task"),
            LLMResponse(
                tool_calls=[
                    ToolCallResult(
                        id="call-exit",
                        name="exit",
                        arguments={"reason": "done"},
                    )
                ]
            ),
        ]
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
        raise AssertionError("agent should not auto-idle after pure assistant text")

    def fake_chat(messages, tools=None, on_chunk=None, role_name=None):
        llm_messages.append(messages)
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


def test_agent_unregisters_from_registry_after_exit_tool(monkeypatch):
    registry.reset()
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["exit"]), uuid="agent-x")
    registry.register(agent)
    events = []

    def fake_wait_for_input() -> None:
        agent._append_history(
            ReceivedMessage(content="finish the task", from_id="tester")
        )
        agent.set_state(AgentState.RUNNING, "received message from tester")

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr(
        "app.agent.gateway.chat",
        lambda messages, tools=None, on_chunk=None, role_name=None: LLMResponse(
            tool_calls=[
                ToolCallResult(
                    id="call-exit",
                    name="exit",
                    arguments={"reason": "done"},
                )
            ]
        ),
    )
    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    agent._run()

    assert agent.state == AgentState.TERMINATED
    assert registry.get(agent.uuid) is None
    assert [event.type for event in events[-2:]] == [
        EventType.NODE_STATE_CHANGED,
        EventType.NODE_TERMINATED,
    ]
    assert events[-1].data == {"reason": "done"}


def test_provider_resolution_error_is_recorded_in_history(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["exit"]), uuid="agent-y")
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
        lambda messages, tools=None, on_chunk=None, role_name=None: (
            _ for _ in ()
        ).throw(RuntimeError("No active provider configured")),
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
        NodeConfig(node_type=NodeType.ASSISTANT, tools=["exit"]),
        uuid="assistant",
    )
    registry.register(assistant)
    events = []

    def fake_wait_for_input() -> None:
        assistant._append_history(
            ReceivedMessage(content="report progress", from_id="human")
        )
        assistant.set_state(AgentState.RUNNING, "received message from human")

    def fake_chat(messages, tools=None, on_chunk=None, role_name=None):
        if on_chunk is not None:
            on_chunk("content", "Working on it")
        return LLMResponse(
            content="Working on it",
            tool_calls=[
                ToolCallResult(
                    id="call-exit",
                    name="exit",
                    arguments={"reason": "done"},
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


def test_extract_routed_content_parses_multiple_targets_and_parent_content():
    parent_content, routed = extract_routed_content(
        "@alice, bob: check the latest output\nand confirm",
    )

    assert parent_content == ""
    assert routed == [(["alice", "bob"], "check the latest output\nand confirm")]


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


def test_route_content_output_delivers_to_targets_when_header_present(monkeypatch):
    registry.reset()
    parent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="parent")
    child = Agent(
        NodeConfig(node_type=NodeType.AGENT, parent_id="parent"),
        uuid="child",
    )
    peer = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="peer")
    helper = Agent(
        NodeConfig(node_type=NodeType.AGENT, name="Helper"),
        uuid="helper",
    )
    registry.register(parent)
    registry.register(child)
    registry.register(peer)
    registry.register(helper)
    child.add_connection(peer.uuid)
    child.add_connection(helper.uuid)
    events = []

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    try:
        child._route_content_output(
            "@peer, Helper: investigate the error\nwith the latest logs",
        )
    finally:
        registry.reset()

    peer_signal = peer._wake_queue.get_nowait()
    helper_signal = helper._wake_queue.get_nowait()

    assert peer_signal.payload == {
        "message": {
            "from": "child",
            "content": "investigate the error\nwith the latest logs",
        }
    }
    assert helper_signal.payload == {
        "message": {
            "from": "child",
            "content": "investigate the error\nwith the latest logs",
        }
    }
    assert [event.data for event in events if event.type == EventType.NODE_MESSAGE] == [
        {"to_id": "peer", "content": "investigate the error\nwith the latest logs"},
        {"to_id": "helper", "content": "investigate the error\nwith the latest logs"},
    ]


def test_route_content_output_routes_plain_content_to_parent(monkeypatch):
    registry.reset()
    parent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="parent")
    agent = Agent(
        NodeConfig(node_type=NodeType.AGENT, parent_id="parent"), uuid="child"
    )
    events = []
    registry.register(parent)
    registry.register(agent)

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    try:
        agent._route_content_output("Status update.")
    finally:
        registry.reset()

    parent_signal = parent._wake_queue.get_nowait()
    assert parent_signal.payload == {
        "message": {"from": "child", "content": "Status update."}
    }
    assert [event.data for event in events if event.type == EventType.NODE_MESSAGE] == [
        {"to_id": "parent", "content": "Status update."},
    ]


def test_route_content_output_routes_non_header_target_text_to_parent(monkeypatch):
    registry.reset()
    parent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="parent")
    agent = Agent(
        NodeConfig(node_type=NodeType.AGENT, parent_id="parent"), uuid="child"
    )
    events = []
    registry.register(parent)
    registry.register(agent)

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    try:
        agent._route_content_output("Status update.\n@peer: investigate the error")
    finally:
        registry.reset()

    parent_signal = parent._wake_queue.get_nowait()
    assert parent_signal.payload == {
        "message": {
            "from": "child",
            "content": "Status update.\n@peer: investigate the error",
        }
    }
    assert [event.data for event in events if event.type == EventType.NODE_MESSAGE] == [
        {"to_id": "parent", "content": "Status update.\n@peer: investigate the error"},
    ]


def test_route_content_output_skips_parent_delivery_without_parent(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="child")
    events = []

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    agent._route_content_output("Status update.")

    assert not any(event.type == EventType.NODE_MESSAGE for event in events)


def test_route_content_output_skips_parent_delivery_for_assistant(monkeypatch):
    assistant = Agent(
        NodeConfig(node_type=NodeType.ASSISTANT, parent_id="human"),
        uuid="assistant",
    )
    events = []

    monkeypatch.setattr(event_bus, "emit", lambda event: events.append(event))

    assistant._route_content_output("Reply to human")

    assert not any(event.type == EventType.NODE_MESSAGE for event in events)


def test_idle_tool_records_wakeup_message_as_new_input_block(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["idle", "exit"]))
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
            LLMResponse(
                tool_calls=[
                    ToolCallResult(
                        id="call-exit",
                        name="exit",
                        arguments={"reason": "done"},
                    )
                ]
            ),
        ]
    )

    def fake_wait_for_input() -> None:
        nonlocal wait_calls
        wait_calls += 1
        agent._append_history(
            ReceivedMessage(content="start waiting", from_id="tester")
        )
        agent.set_state(AgentState.RUNNING, "received message from tester")

    def fake_chat(messages, tools=None, on_chunk=None, role_name=None):
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
        return next(responses)

    monkeypatch.setattr(agent, "_wait_for_input", fake_wait_for_input)
    monkeypatch.setattr("app.agent.gateway.chat", fake_chat)

    agent._run()

    assert wait_calls == 1
    assert agent.state == AgentState.TERMINATED
    second_round = llm_messages[1]
    assert not any(
        msg.get("role") == "tool"
        or (msg.get("role") == "assistant" and msg.get("tool_calls"))
        for msg in second_round
    )
    assert any(
        msg.get("role") == "user"
        and msg.get("content") == '<message from="human">wake up now</message>'
        for msg in second_round
    )


def test_agent_contextualizes_plain_loguru_calls(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["exit"]), uuid="agent-z")
    captured: list[tuple[str, str | None]] = []
    sink_id = logger.add(
        lambda message: captured.append(
            (message.record["message"], message.record["extra"].get("agent_id"))
        )
    )

    def fake_wait_for_input() -> None:
        agent._append_history(ReceivedMessage(content="do the task", from_id="tester"))
        agent.set_state(AgentState.RUNNING, "received message from tester")

    def fake_chat(messages, tools=None, on_chunk=None, role_name=None):
        logger.info("plain log inside agent")
        return LLMResponse(
            tool_calls=[
                ToolCallResult(
                    id="call-exit",
                    name="exit",
                    arguments={"reason": "done"},
                )
            ]
        )

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
