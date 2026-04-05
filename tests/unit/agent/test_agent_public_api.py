import json
import threading

from app.agent import Agent
from app.models import (
    AgentState,
    Message,
    NodeConfig,
    NodeType,
    ReceivedMessage,
    TodoItem,
)
from app.registry import registry
from app.settings import RoleConfig, Settings
from app.tools.contacts import ContactsTool
from app.tools.idle import IdleTool
from app.tools.list_roles import ListRolesTool
from app.tools.list_tabs import ListTabsTool
from app.tools.list_tools import ListToolsTool
from app.tools.sleep import SleepTool
from app.tools.todo import TodoTool


def test_idle_tool_uses_request_idle(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["idle"]))
    called: list[str | None] = []

    def fake_request_idle(*, tool_call_id: str | None = None) -> str:
        called.append(tool_call_id)
        return "idle 1.25s"

    monkeypatch.setattr(agent, "request_idle", fake_request_idle)

    result = IdleTool().execute(agent, {})

    assert result == "idle 1.25s"
    assert called == [None]


def test_idle_tool_blocks_until_message_and_returns_idle_duration():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["idle"]), uuid="agent-a")
    result: list[str] = []

    thread = threading.Thread(
        target=lambda: result.append(IdleTool().execute(agent, {})),
        daemon=True,
    )
    thread.start()

    agent.enqueue_message(
        Message(from_id="tester", to_id=agent.uuid, content="hello from queue")
    )
    thread.join(timeout=1.0)

    assert not thread.is_alive()
    assert len(result) == 1
    assert result[0].startswith("idle ")
    assert result[0].endswith("s")
    assert isinstance(agent.history[-1], ReceivedMessage)
    assert agent.history[-1].from_id == "tester"
    assert agent.history[-1].content == "hello from queue"


def test_idle_tool_returns_immediately_when_runtime_notice_is_pending():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["idle"]), uuid="agent-a")
    agent.set_state(AgentState.RUNNING, "processing")
    agent._queue_runtime_notice("fix the previous routing mistake")

    result = IdleTool().execute(agent, {})

    assert result == ""
    assert agent.state == AgentState.RUNNING
    assert agent._build_messages()[-1] == {
        "role": "user",
        "content": "<system>fix the previous routing mistake</system>",
    }


def test_sleep_tool_uses_request_sleep(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["sleep"]))
    called: list[float] = []

    def fake_request_sleep(*, seconds: float) -> str:
        called.append(seconds)
        return "slept 0.25s"

    monkeypatch.setattr(agent, "request_sleep", fake_request_sleep)

    result = SleepTool().execute(agent, {"seconds": 0.25})

    assert result == "slept 0.25s"
    assert called == [0.25]


def test_sleep_tool_rejects_negative_seconds():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["sleep"]))

    result = json.loads(SleepTool().execute(agent, {"seconds": -1}))

    assert result == {"error": "seconds must be a non-negative number"}


def test_sleep_tool_waits_and_returns_duration():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["sleep"]))

    result = SleepTool().execute(agent, {"seconds": 0.01})

    assert result.startswith("slept ")
    assert result.endswith("s")


def test_enqueue_message_enqueues_wake_signal_immediately():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent-a")

    agent.enqueue_message(
        Message(from_id="tester", to_id=agent.uuid, content="hello from queue")
    )

    signal = agent._wake_queue.get_nowait()

    assert signal.reason == "message"
    assert signal.payload == {
        "message": {"from": "tester", "content": "hello from queue"}
    }
    assert signal.resume_reason == "received message from tester"


def test_request_termination_enqueues_wake_signal_immediately():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT), uuid="agent-a")

    agent.request_termination("stop")

    signal = agent._wake_queue.get_nowait()

    assert agent._terminate.is_set()
    assert agent._termination_reason == "stop"
    assert signal.reason == "termination"
    assert signal.payload == {}
    assert signal.resume_reason == "termination requested"


def test_contacts_tool_uses_agent_public_api(monkeypatch):
    agent = Agent(
        NodeConfig(node_type=NodeType.AGENT, tools=["contacts"]),
        uuid="agent-a",
    )
    expected = [
        {
            "id": "agent-b",
            "node_type": "agent",
            "role_name": "Worker",
            "name": "Worker",
            "state": "idle",
        }
    ]

    monkeypatch.setattr(agent, "get_contacts_info", lambda: expected)

    result = json.loads(ContactsTool().execute(agent, {}))

    assert result == {"contacts": expected}


def test_agent_get_contacts_info_includes_assistant_and_direct_peer():
    registry.reset()
    agent = Agent(
        NodeConfig(node_type=NodeType.AGENT, tab_id="tab-1"),
        uuid="agent-a",
    )
    assistant = Agent(
        NodeConfig(node_type=NodeType.ASSISTANT, role_name="Steward", name="Assistant"),
        uuid="assistant-a",
    )
    peer = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Worker",
            name="Worker",
            tab_id="tab-1",
        ),
        uuid="agent-b",
    )
    registry.register(agent)
    registry.register(assistant)
    registry.register(peer)
    agent.add_connection(peer.uuid)

    try:
        assert agent.get_contacts_info() == [
            {
                "id": "assistant-a",
                "node_type": "assistant",
                "role_name": "Steward",
                "name": "Assistant",
                "state": "initializing",
            },
            {
                "id": "agent-b",
                "node_type": "agent",
                "role_name": "Worker",
                "name": "Worker",
                "state": "initializing",
            },
        ]
    finally:
        registry.reset()


def test_agent_get_contacts_info_includes_peer_with_only_incoming_edge():
    registry.reset()
    agent = Agent(
        NodeConfig(node_type=NodeType.AGENT, tab_id="tab-1"),
        uuid="agent-a",
    )
    assistant = Agent(
        NodeConfig(node_type=NodeType.ASSISTANT, role_name="Steward", name="Assistant"),
        uuid="assistant-a",
    )
    peer = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Reviewer",
            name="Reviewer",
            tab_id="tab-1",
        ),
        uuid="agent-b",
    )
    registry.register(agent)
    registry.register(assistant)
    registry.register(peer)
    peer.add_connection(agent.uuid)

    try:
        assert agent.get_contacts_info() == [
            {
                "id": "assistant-a",
                "node_type": "assistant",
                "role_name": "Steward",
                "name": "Assistant",
                "state": "initializing",
            },
            {
                "id": "agent-b",
                "node_type": "agent",
                "role_name": "Reviewer",
                "name": "Reviewer",
                "state": "initializing",
            },
        ]
    finally:
        registry.reset()


def test_assistant_get_contacts_info_lists_registered_task_nodes():
    registry.reset()
    assistant = Agent(
        NodeConfig(node_type=NodeType.ASSISTANT, role_name="Steward", name="Assistant"),
        uuid="assistant-a",
    )
    worker = Agent(
        NodeConfig(node_type=NodeType.AGENT, role_name="Worker", name="Worker"),
        uuid="agent-b",
    )
    registry.register(assistant)
    registry.register(worker)

    try:
        assert assistant.get_contacts_info() == [
            {
                "id": "agent-b",
                "node_type": "agent",
                "role_name": "Worker",
                "name": "Worker",
                "state": "initializing",
            }
        ]
    finally:
        registry.reset()


def test_list_roles_tool_returns_registered_roles(monkeypatch):
    agent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tools=["list_roles"],
        )
    )

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(
                    name="Worker",
                    system_prompt="Do work.",
                    included_tools=["read", "exec"],
                ),
                RoleConfig(
                    name="Reviewer",
                    system_prompt="Review code.",
                    excluded_tools=["fetch"],
                ),
            ]
        ),
    )

    result = json.loads(ListRolesTool().execute(agent, {}))

    assert result == [
        {
            "name": "Worker",
            "system_prompt": "Do work.",
            "builtin_tools": [
                "idle",
                "sleep",
                "todo",
                "contacts",
                "read",
                "exec",
            ],
            "optional_tools": [
                "create_tab",
                "delete_tab",
                "create_agent",
                "connect",
                "manage_providers",
                "manage_roles",
                "manage_settings",
                "manage_prompts",
                "edit",
                "fetch",
                "list_roles",
                "list_tabs",
                "list_tools",
            ],
        },
        {
            "name": "Reviewer",
            "system_prompt": "Review code.",
            "builtin_tools": [
                "idle",
                "sleep",
                "todo",
                "contacts",
            ],
            "optional_tools": [
                "create_tab",
                "delete_tab",
                "create_agent",
                "connect",
                "manage_providers",
                "manage_roles",
                "manage_settings",
                "manage_prompts",
                "read",
                "edit",
                "exec",
                "list_roles",
                "list_tabs",
                "list_tools",
            ],
        },
    ]


def test_list_tools_tool_returns_registered_tool_names_and_descriptions():
    agent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tools=["list_tools"],
        )
    )

    result = json.loads(ListToolsTool().execute(agent, {}))

    assert {item["name"] for item in result} == {
        "idle",
        "sleep",
        "todo",
        "contacts",
        "read",
        "edit",
        "exec",
        "fetch",
        "create_tab",
        "delete_tab",
        "create_agent",
        "connect",
        "manage_providers",
        "manage_roles",
        "manage_settings",
        "manage_prompts",
        "list_roles",
        "list_tabs",
        "list_tools",
    }
    assert all(set(item) == {"name", "description"} for item in result)
    assert all(
        isinstance(item["description"], str) and item["description"] for item in result
    )


def test_list_tabs_tool_returns_summaries_and_details(monkeypatch, tmp_path):
    import app.settings as settings_module
    from app.graph_service import create_agent_node, create_edge, create_tab
    from app.workspace_store import workspace_store

    settings_file = tmp_path / "settings.json"
    settings_file.write_text(
        json.dumps(
            {
                "event_log": {"timestamp_format": "absolute"},
                "model": {"active_provider_id": "", "active_model": ""},
                "custom_prompt": "",
                "custom_post_prompt": "",
                "providers": [],
                "roles": [],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(settings_module, "_SETTINGS_FILE", settings_file)
    monkeypatch.setattr(settings_module, "_cached_settings", None)
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(
                    name="Worker",
                    system_prompt="Do work.",
                    included_tools=["read"],
                )
            ]
        ),
    )
    workspace_store.reset_cache()
    registry.reset()

    try:
        tab = create_tab(title="Review", goal="Inspect code")
        left, error = create_agent_node(role_name="Worker", tab_id=tab.id, name="Left")
        assert error is None and left is not None
        right, error = create_agent_node(
            role_name="Worker", tab_id=tab.id, name="Right"
        )
        assert error is None and right is not None
        edge, error = create_edge(from_node_id=left.id, to_node_id=right.id)
        assert error is None and edge is not None

        agent = Agent(
            NodeConfig(node_type=NodeType.ASSISTANT, tools=["list_tabs"]),
            uuid="assistant",
        )

        summaries = json.loads(ListTabsTool().execute(agent, {}))
        assert len(summaries) == 1
        assert summaries[0]["id"] == tab.id
        assert summaries[0]["title"] == tab.title
        assert summaries[0]["goal"] == tab.goal
        assert summaries[0]["created_at"] == tab.created_at
        assert isinstance(summaries[0]["updated_at"], float)
        assert summaries[0]["node_count"] == 2
        assert summaries[0]["edge_count"] == 1

        detail = json.loads(ListTabsTool().execute(agent, {"tab_id": tab.id}))
        assert detail["tab"]["id"] == tab.id
        assert {node["name"] for node in detail["nodes"]} == {"Left", "Right"}
        assert detail["edges"] == [edge.serialize()]
    finally:
        registry.reset()
        workspace_store.reset_cache()
        monkeypatch.setattr(settings_module, "_cached_settings", None)


def test_todo_tool_writes_via_set_todos(monkeypatch):
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["todo"]))
    applied: list[list[TodoItem]] = []

    def fake_set_todos(todos: list[TodoItem]) -> None:
        applied.append(todos)
        agent.todos = list(todos)

    monkeypatch.setattr(agent, "set_todos", fake_set_todos)

    result = json.loads(TodoTool().execute(agent, {"todos": ["step 1", "step 2"]}))

    assert result == {"todos": ["step 1", "step 2"]}
    assert len(applied) == 1
    assert [item.text for item in applied[0]] == ["step 1", "step 2"]
