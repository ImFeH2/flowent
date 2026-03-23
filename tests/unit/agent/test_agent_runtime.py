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
    Formation,
    LLMResponse,
    Message,
    NodeConfig,
    NodeType,
    ReceivedMessage,
    SentMessage,
    TodoItem,
    ToolCall,
    ToolCallResult,
)
from app.registry import registry
from app.settings import Settings


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

    def fake_chat(messages, tools=None, on_chunk=None, role_name=None):
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

    def fake_chat(messages, tools=None, on_chunk=None, role_name=None):
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


def test_finalize_termination_unregisters_empty_formation():
    registry.reset()
    try:
        formation = Formation(
            id="formation-1",
            owner_agent_id="worker",
            name="Test Formation",
        )
        worker = Agent(
            NodeConfig(node_type=NodeType.AGENT, formation_id=formation.id),
            uuid="worker",
        )
        registry.register_formation(formation)
        registry.register(worker)

        worker._finalize_termination("done")

        assert registry.get(worker.uuid) is None
        assert registry.get_formation(formation.id) is None
    finally:
        registry.reset()


def test_finalize_termination_keeps_formation_when_other_nodes_remain():
    registry.reset()
    try:
        formation = Formation(
            id="formation-1",
            owner_agent_id="worker-1",
            name="Shared Formation",
        )
        worker_1 = Agent(
            NodeConfig(node_type=NodeType.AGENT, formation_id=formation.id),
            uuid="worker-1",
        )
        worker_2 = Agent(
            NodeConfig(node_type=NodeType.AGENT, formation_id=formation.id),
            uuid="worker-2",
        )
        registry.register_formation(formation)
        registry.register(worker_1)
        registry.register(worker_2)

        worker_1._finalize_termination("done")

        assert registry.get(worker_1.uuid) is None
        assert registry.get(worker_2.uuid) is worker_2
        assert registry.get_formation(formation.id) is formation
    finally:
        registry.reset()


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
        NodeConfig(node_type=NodeType.ASSISTANT, tools=["idle"]),
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
    parent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="parent")
    child = Agent(
        NodeConfig(node_type=NodeType.AGENT, parent_id="parent"),
        uuid="child",
    )
    peer = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="peer")
    registry.register(parent)
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


def test_route_content_output_does_not_deliver_plain_content(monkeypatch):
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
    agent = Agent(
        NodeConfig(node_type=NodeType.AGENT, parent_id="parent"), uuid="child"
    )
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


def test_build_messages_adds_one_shot_notice_for_multiple_routed_headers(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())
    registry.reset()
    assistant = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")
    worker = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="worker")
    registry.register(assistant)
    registry.register(worker)
    assistant.add_connection(worker.uuid)

    try:
        assistant._record_content_output(
            "@worker: first task\n@other: second task",
            emitted_human_content=False,
        )

        first_messages = assistant._build_messages()
        second_messages = assistant._build_messages()
    finally:
        registry.reset()

    reminder = (
        "<system>Routing reminder: only the first `@target:` header in this content "
        "block was routed. Any later `@...:` lines were delivered as plain body "
        "text to the first target. If that was not intentional, send a correction "
        "to the first recipient and then send separate content blocks to the other "
        "targets.</system>"
    )

    assert any(msg.get("content") == reminder for msg in first_messages)
    assert not any(msg.get("content") == reminder for msg in second_messages)
    worker_signal = worker._wake_queue.get_nowait()
    assert (
        worker_signal.payload["message"]["content"] == "first task\n@other: second task"
    )


def test_record_content_output_records_sent_message_in_history(monkeypatch):
    registry.reset()
    child = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="child")
    peer = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="peer")
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
    assert len(history) == 1
    assert isinstance(history[0], SentMessage)
    assert history[0].content == "investigate the error"
    assert history[0].to_ids == ["peer"]
    assert history[0].message_id is not None
    assert not any(isinstance(entry, AssistantText) for entry in history)
    assert peer._wake_queue.get_nowait().payload == {
        "message": {
            "from": "child",
            "content": "investigate the error",
            "message_id": history[0].message_id,
        }
    }
    assert not any(event.type == EventType.ASSISTANT_CONTENT for event in events)


def test_routed_message_emits_streaming_preview_for_sender_and_receiver(monkeypatch):
    registry.reset()
    child = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="child")
    peer = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="peer")
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

    def fake_chat(messages, tools=None, on_chunk=None, role_name=None):
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
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- A content block supports only one routed `@target:` header. If you need to message multiple nodes, use separate content blocks.\n- If there is no unfinished TODO and the task is finished with no immediate next action, call `idle`.</system>",
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
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- A content block supports only one routed `@target:` header. If you need to message multiple nodes, use separate content blocks.\n- If there is no unfinished TODO and the task is finished with no immediate next action, call `idle`.</system>",
        },
    ]


def test_build_messages_appends_runtime_todo_context_without_history_entry(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(ReceivedMessage(content="begin", from_id="human"))
    agent.set_todos([TodoItem(text="Inspect files"), TodoItem(text="Report results")])

    messages = agent._build_messages()
    history = agent.get_history_snapshot()

    assert len(history) == 1
    assert isinstance(history[0], ReceivedMessage)
    assert messages == [
        {"role": "system", "content": messages[0]["content"]},
        {"role": "user", "content": '<message from="human">begin</message>'},
        {
            "role": "user",
            "content": "<system>Current TODO list:\n  - Inspect files\n  - Report results</system>",
        },
        {
            "role": "user",
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- A content block supports only one routed `@target:` header. If you need to message multiple nodes, use separate content blocks.\n- If the TODO list is not complete yet, use `todo` to replace it with the latest remaining items.</system>",
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

    assert len(history) == 1
    assert isinstance(history[0], ReceivedMessage)
    assert messages == [
        {"role": "system", "content": messages[0]["content"]},
        {"role": "user", "content": '<message from="human">begin</message>'},
        {
            "role": "user",
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- A content block supports only one routed `@target:` header. If you need to message multiple nodes, use separate content blocks.\n- If there is no unfinished TODO and the task is finished with no immediate next action, call `idle`.</system>",
        },
        {
            "role": "user",
            "content": "<system>Append this after history.</system>",
        },
    ]


def test_build_messages_warns_about_spawned_agents_waiting_for_first_task(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(ReceivedMessage(content="begin", from_id="human"))
    agent._append_history(
        ToolCall(
            tool_name="spawn",
            tool_call_id="call-spawn",
            arguments={"role_name": "Worker", "formation_id": "formation-1"},
            result=json.dumps(
                {
                    "agent_id": "12345678-aaaa-bbbb-cccc-ddddeeeeffff",
                    "name": "Directory Worker",
                    "formation_id": "formation-1",
                    "role_name": "Worker",
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
                    "id": "call-spawn",
                    "type": "function",
                    "function": {
                        "name": "spawn",
                        "arguments": '{"role_name": "Worker", "formation_id": "formation-1"}',
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call-spawn",
            "content": '{"agent_id": "12345678-aaaa-bbbb-cccc-ddddeeeeffff", "name": "Directory Worker", "formation_id": "formation-1", "role_name": "Worker"}',
        },
        {
            "role": "user",
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- A content block supports only one routed `@target:` header. If you need to message multiple nodes, use separate content blocks.\n- Spawned agents still waiting for their first task: Directory Worker (`12345678`).\n- `spawn` only creates and connects a new agent. It does not start work by itself.\n- Before calling `idle`, send each waiting agent a concrete first task with `@<name-or-uuid>: ...`.</system>",
        },
    ]


def test_build_messages_warns_about_declaratively_created_agents_waiting_for_first_task(
    monkeypatch,
):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(ReceivedMessage(content="begin", from_id="human"))
    agent._append_history(
        ToolCall(
            tool_name="create_formation",
            tool_call_id="call-create",
            arguments={
                "name": "Delivery Plan",
                "nodes": [
                    {"name": "Planner", "role": "Worker"},
                    {"name": "Reviewer", "role": "Worker"},
                ],
            },
            result=json.dumps(
                {
                    "id": "formation-1",
                    "owner_agent_id": "agent",
                    "parent_formation_id": None,
                    "name": "Delivery Plan",
                    "goal": "",
                    "nodes": [
                        {
                            "agent_id": "12345678-aaaa-bbbb-cccc-ddddeeeeffff",
                            "name": "Planner",
                            "formation_id": "formation-1",
                            "role_name": "Worker",
                        },
                        {
                            "agent_id": "87654321-aaaa-bbbb-cccc-ddddeeeeffff",
                            "name": "Reviewer",
                            "formation_id": "formation-1",
                            "role_name": "Worker",
                        },
                    ],
                    "edges": [],
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
                    "id": "call-create",
                    "type": "function",
                    "function": {
                        "name": "create_formation",
                        "arguments": '{"name": "Delivery Plan", "nodes": [{"name": "Planner", "role": "Worker"}, {"name": "Reviewer", "role": "Worker"}]}',
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call-create",
            "content": '{"id": "formation-1", "owner_agent_id": "agent", "parent_formation_id": null, "name": "Delivery Plan", "goal": "", "nodes": [{"agent_id": "12345678-aaaa-bbbb-cccc-ddddeeeeffff", "name": "Planner", "formation_id": "formation-1", "role_name": "Worker"}, {"agent_id": "87654321-aaaa-bbbb-cccc-ddddeeeeffff", "name": "Reviewer", "formation_id": "formation-1", "role_name": "Worker"}], "edges": []}',
        },
        {
            "role": "user",
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- A content block supports only one routed `@target:` header. If you need to message multiple nodes, use separate content blocks.\n- Spawned agents still waiting for their first task: Planner (`12345678`), Reviewer (`87654321`).\n- `spawn` only creates and connects a new agent. It does not start work by itself.\n- Before calling `idle`, send each waiting agent a concrete first task with `@<name-or-uuid>: ...`.</system>",
        },
    ]


def test_build_messages_clears_spawn_warning_after_first_sent_message(monkeypatch):
    monkeypatch.setattr("app.agent.get_settings", lambda: Settings())

    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent")
    agent._append_history(ReceivedMessage(content="begin", from_id="human"))
    agent._append_history(
        ToolCall(
            tool_name="spawn",
            tool_call_id="call-spawn",
            arguments={"role_name": "Worker", "formation_id": "formation-1"},
            result=json.dumps(
                {
                    "agent_id": "12345678-aaaa-bbbb-cccc-ddddeeeeffff",
                    "name": "Directory Worker",
                    "formation_id": "formation-1",
                    "role_name": "Worker",
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
                    "id": "call-spawn",
                    "type": "function",
                    "function": {
                        "name": "spawn",
                        "arguments": '{"role_name": "Worker", "formation_id": "formation-1"}',
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call-spawn",
            "content": '{"agent_id": "12345678-aaaa-bbbb-cccc-ddddeeeeffff", "name": "Directory Worker", "formation_id": "formation-1", "role_name": "Worker"}',
        },
        {
            "role": "assistant",
            "content": "@12345678-aaaa-bbbb-cccc-ddddeeeeffff: inspect the current directory",
        },
        {
            "role": "user",
            "content": "<system>Runtime post prompt:\n- Only content whose first line starts with `@<name-or-uuid>:` is delivered to other agents.\n- Plain content is not delivered to other agents.\n- Do not combine a Human-facing reply and a routed `@target` message in the same content block.\n- A content block supports only one routed `@target:` header. If you need to message multiple nodes, use separate content blocks.\n- If there is no unfinished TODO and the task is finished with no immediate next action, call `idle`.</system>",
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
    assistant = Agent(
        NodeConfig(node_type=NodeType.ASSISTANT),
        uuid="assistant",
    )
    worker = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="worker")
    registry.register(assistant)
    registry.register(worker)
    assistant.add_connection(worker.uuid)
    events = []
    responses = iter(
        [
            LLMResponse(content="@worker: investigate the error"),
            LLMResponse(),
        ]
    )

    def fake_wait_for_input() -> None:
        assistant._append_history(
            ReceivedMessage(content="please investigate", from_id="human")
        )
        assistant.set_state(AgentState.RUNNING, "received message from human")

    def fake_chat(messages, tools=None, on_chunk=None, role_name=None):
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
        and entry.to_ids == ["worker"]
        for entry in assistant.get_history_snapshot()
    )
    assert not any(
        isinstance(entry, AssistantText)
        and entry.content == "@worker: investigate the error"
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

    def fake_chat(messages, tools=None, on_chunk=None, role_name=None):
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
