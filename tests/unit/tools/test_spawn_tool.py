import json

import pytest

from app.agent import Agent
from app.models import AgentState, NodeConfig, NodeType
from app.registry import registry
from app.settings import RoleConfig, Settings
from app.tools import MINIMUM_TOOLS
from app.tools.spawn import SpawnTool


@pytest.fixture(autouse=True)
def reset_registry():
    registry.reset()
    yield
    registry.reset()


def test_spawn_delivers_task_via_standard_send_after_idle(monkeypatch):
    parent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tools=["spawn", "send", "read", "edit"],
        ),
        uuid="parent",
    )
    registry.register(parent)

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(
                    name="Worker",
                    system_prompt="...",
                    included_tools=["read"],
                    excluded_tools=["fetch"],
                )
            ]
        ),
    )

    call_order: list[object] = []

    def fake_start(self: Agent) -> None:
        call_order.append(("start", self.uuid))

    def fake_wait_until_idle(self: Agent, timeout: float | None = None) -> bool:
        call_order.append(("wait_until_idle", self.uuid, timeout))
        self.state = AgentState.IDLE
        return True

    def fake_send_message(agent: Agent, target_ref: str, content: str) -> dict:
        call_order.append(("send_message", agent.uuid, target_ref, content))
        return {"status": "sent"}

    def fail_enqueue_message(self: Agent, _msg) -> None:
        raise AssertionError("spawn should not enqueue the task directly")

    monkeypatch.setattr(Agent, "start", fake_start)
    monkeypatch.setattr(Agent, "wait_until_idle", fake_wait_until_idle)
    monkeypatch.setattr(Agent, "enqueue_message", fail_enqueue_message)
    monkeypatch.setattr("app.tools.spawn.send_message", fake_send_message)

    result = json.loads(
        SpawnTool().execute(
            parent,
            {
                "role_name": "Worker",
                "task_prompt": "handle this task",
                "tools": ["fetch", "edit"],
            },
        )
    )

    child_id = result["agent_id"]
    assert result == {"agent_id": child_id, "role_name": "Worker"}
    child = registry.get(child_id)
    assert child is not None
    assert child.config.tools == [*MINIMUM_TOOLS, "read", "edit"]
    assert call_order == [
        ("start", child_id),
        ("wait_until_idle", child_id, 5.0),
        ("send_message", "parent", child_id, "handle this task"),
    ]


@pytest.mark.parametrize("task_prompt", [None, ""])
def test_spawn_skips_delivery_when_task_prompt_missing_or_empty(
    monkeypatch,
    task_prompt: str | None,
):
    parent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tools=["spawn", "send", "read"],
        ),
        uuid="parent",
    )
    registry.register(parent)

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(
                    name="Worker",
                    system_prompt="...",
                    included_tools=["read"],
                )
            ]
        ),
    )

    monkeypatch.setattr(Agent, "start", lambda self: None)
    monkeypatch.setattr(
        Agent,
        "wait_until_idle",
        lambda self, timeout=None: (_ for _ in ()).throw(
            AssertionError("wait_until_idle should not be called")
        ),
    )
    monkeypatch.setattr(
        "app.tools.spawn.send_message",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("send_message should not be called")
        ),
    )

    args = {"role_name": "Worker"}
    if task_prompt is not None:
        args["task_prompt"] = task_prompt

    result = json.loads(SpawnTool().execute(parent, args))

    assert result["role_name"] == "Worker"
    assert isinstance(result["agent_id"], str)
    child = registry.get(result["agent_id"])
    assert child is not None
    assert child.config.tools == [*MINIMUM_TOOLS, "read"]


def test_spawn_uses_base_tools_when_requested_tools_missing(monkeypatch):
    parent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tools=["spawn", "send", "exec"],
        ),
        uuid="parent",
    )
    registry.register(parent)

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(
                    name="Worker",
                    system_prompt="...",
                    included_tools=["exec"],
                    excluded_tools=["send"],
                )
            ]
        ),
    )

    result = json.loads(SpawnTool().execute(parent, {"role_name": "Worker"}))

    assert result["role_name"] == "Worker"
    child = registry.get(result["agent_id"])
    assert child is not None
    assert child.config.tools == [*MINIMUM_TOOLS, "exec"]


def test_spawn_allows_child_security_boundary_within_parent(monkeypatch, tmp_path):
    parent_dir = tmp_path / "workspace"
    child_dir = parent_dir / "child"
    parent_dir.mkdir()
    child_dir.mkdir()
    parent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tools=["spawn", "send", "read"],
            write_dirs=[str(parent_dir)],
            allow_network=True,
        ),
        uuid="parent",
    )
    registry.register(parent)

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(
                    name="Worker",
                    system_prompt="...",
                    included_tools=["read"],
                )
            ]
        ),
    )
    monkeypatch.setattr(Agent, "start", lambda self: None)

    result = json.loads(
        SpawnTool().execute(
            parent,
            {
                "role_name": "Worker",
                "write_dirs": [str(child_dir)],
                "allow_network": True,
            },
        )
    )

    assert result["role_name"] == "Worker"
    child = registry.get(result["agent_id"])
    assert child is not None
    assert child.config.write_dirs == [str(child_dir)]
    assert child.config.allow_network is True


def test_spawn_rejects_write_dir_escalation(monkeypatch, tmp_path):
    allowed_dir = tmp_path / "allowed"
    blocked_dir = tmp_path / "blocked"
    allowed_dir.mkdir()
    blocked_dir.mkdir()
    parent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tools=["spawn", "send"],
            write_dirs=[str(allowed_dir)],
        ),
        uuid="parent",
    )
    registry.register(parent)

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[RoleConfig(name="Worker", system_prompt="...")]),
    )

    result = json.loads(
        SpawnTool().execute(
            parent,
            {
                "role_name": "Worker",
                "write_dirs": [str(blocked_dir)],
            },
        )
    )

    assert result == {"error": f"write_dirs boundary exceeded: {blocked_dir}"}
    assert len(registry.get_all()) == 1


def test_spawn_rejects_network_escalation(monkeypatch):
    parent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tools=["spawn", "send"],
            allow_network=False,
        ),
        uuid="parent",
    )
    registry.register(parent)

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[RoleConfig(name="Worker", system_prompt="...")]),
    )

    result = json.loads(
        SpawnTool().execute(
            parent,
            {
                "role_name": "Worker",
                "allow_network": True,
            },
        )
    )

    assert result == {
        "error": "allow_network boundary exceeded: parent disallows network access"
    }
    assert len(registry.get_all()) == 1


def test_spawn_rejects_tool_escalation(monkeypatch):
    parent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tools=["spawn", "send"],
        ),
        uuid="parent",
    )
    registry.register(parent)

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(
                    name="Worker",
                    system_prompt="...",
                    included_tools=["read"],
                )
            ]
        ),
    )

    result = json.loads(SpawnTool().execute(parent, {"role_name": "Worker"}))

    assert result == {"error": "tool boundary exceeded: read"}
    assert len(registry.get_all()) == 1
