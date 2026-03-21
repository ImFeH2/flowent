import json

import pytest

from app.agent import Agent
from app.models import Formation, NodeConfig, NodeType
from app.registry import registry
from app.settings import RoleConfig, Settings
from app.tools import MINIMUM_TOOLS
from app.tools.spawn import SpawnTool


@pytest.fixture(autouse=True)
def reset_registry():
    registry.reset()
    yield
    registry.reset()


def test_spawn_creates_connected_child_without_task_delivery(monkeypatch):
    parent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            formation_id="formation-parent",
            role_name="Conductor",
            tools=["spawn", "send", "read", "edit"],
        ),
        uuid="parent",
    )
    registry.register_formation(
        Formation(
            id="formation-parent",
            owner_agent_id="parent",
            name="Parent Formation",
        )
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

    monkeypatch.setattr(Agent, "start", fake_start)

    result = json.loads(
        SpawnTool().execute(
            parent,
            {
                "role_name": "Worker",
                "formation_id": "formation-parent",
                "tools": ["fetch", "edit"],
            },
        )
    )

    child_id = result["agent_id"]
    formation_id = result["formation_id"]
    assert result == {
        "agent_id": child_id,
        "name": "Worker",
        "formation_id": formation_id,
        "role_name": "Worker",
    }
    child = registry.get(child_id)
    assert child is not None
    assert child.config.formation_id == "formation-parent"
    assert child.config.parent_id == "parent"
    assert child.config.tools == [*MINIMUM_TOOLS, "read", "edit"]
    assert call_order == [("start", child_id)]


def test_spawn_uses_default_termination_timeout_when_setup_fails(monkeypatch):
    parent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            formation_id="formation-parent",
            role_name="Conductor",
            tools=["spawn", "send", "read"],
        ),
        uuid="parent",
    )
    registry.register_formation(
        Formation(
            id="formation-parent",
            owner_agent_id="parent",
            name="Parent Formation",
        )
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

    termination_timeouts: list[float | None] = []

    monkeypatch.setattr(Agent, "start", lambda self: None)
    monkeypatch.setattr(
        Agent,
        "terminate_and_wait",
        lambda self, timeout=None: termination_timeouts.append(timeout),
    )
    monkeypatch.setattr(
        "app.tools.spawn.connect_nodes",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    result = json.loads(
        SpawnTool().execute(
            parent,
            {
                "role_name": "Worker",
                "formation_id": "formation-parent",
            },
        )
    )

    assert result == {"error": "Failed to spawn agent: boom"}
    assert termination_timeouts == [30.0]
    assert len(registry.get_all()) == 1


def test_spawn_uses_base_tools_when_requested_tools_missing(monkeypatch):
    parent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            formation_id="formation-parent",
            role_name="Conductor",
            tools=["spawn", "send", "exec"],
        ),
        uuid="parent",
    )
    registry.register_formation(
        Formation(
            id="formation-parent",
            owner_agent_id="parent",
            name="Parent Formation",
        )
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

    result = json.loads(
        SpawnTool().execute(
            parent,
            {
                "role_name": "Worker",
                "formation_id": "formation-parent",
            },
        )
    )

    assert result["role_name"] == "Worker"
    assert result["formation_id"] == "formation-parent"
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
            formation_id="formation-parent",
            role_name="Conductor",
            tools=["spawn", "send", "read"],
            write_dirs=[str(parent_dir)],
            allow_network=True,
        ),
        uuid="parent",
    )
    registry.register_formation(
        Formation(
            id="formation-parent",
            owner_agent_id="parent",
            name="Parent Formation",
        )
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
                "formation_id": "formation-parent",
                "write_dirs": [str(child_dir)],
                "allow_network": True,
            },
        )
    )

    assert result["role_name"] == "Worker"
    assert result["formation_id"] == "formation-parent"
    child = registry.get(result["agent_id"])
    assert child is not None
    assert child.config.write_dirs == [str(child_dir)]
    assert child.config.allow_network is True
    assert child.config.parent_id == "parent"


def test_spawn_rejects_write_dir_escalation(monkeypatch, tmp_path):
    allowed_dir = tmp_path / "allowed"
    blocked_dir = tmp_path / "blocked"
    allowed_dir.mkdir()
    blocked_dir.mkdir()
    parent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            formation_id="formation-parent",
            role_name="Conductor",
            tools=["spawn", "send"],
            write_dirs=[str(allowed_dir)],
        ),
        uuid="parent",
    )
    registry.register_formation(
        Formation(
            id="formation-parent",
            owner_agent_id="parent",
            name="Parent Formation",
        )
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
                "formation_id": "formation-parent",
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
            formation_id="formation-parent",
            role_name="Conductor",
            tools=["spawn", "send"],
            allow_network=False,
        ),
        uuid="parent",
    )
    registry.register_formation(
        Formation(
            id="formation-parent",
            owner_agent_id="parent",
            name="Parent Formation",
        )
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
                "formation_id": "formation-parent",
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
            formation_id="formation-parent",
            role_name="Conductor",
            tools=["spawn", "send"],
        ),
        uuid="parent",
    )
    registry.register_formation(
        Formation(
            id="formation-parent",
            owner_agent_id="parent",
            name="Parent Formation",
        )
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

    result = json.loads(
        SpawnTool().execute(
            parent,
            {
                "role_name": "Worker",
                "formation_id": "formation-parent",
            },
        )
    )

    assert result == {"error": "tool boundary exceeded: read"}
    assert len(registry.get_all()) == 1


def test_spawn_requires_formation_id(monkeypatch):
    parent = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            formation_id="formation-parent",
            role_name="Conductor",
            tools=["spawn"],
        ),
        uuid="parent",
    )
    registry.register_formation(
        Formation(
            id="formation-parent",
            owner_agent_id="parent",
            name="Parent Formation",
        )
    )
    registry.register(parent)

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[RoleConfig(name="Worker", system_prompt="...")]),
    )

    result = json.loads(SpawnTool().execute(parent, {"role_name": "Worker"}))

    assert result == {"error": "formation_id is required"}
    assert len(registry.get_all()) == 1


def test_spawn_assistant_bypasses_inherited_boundaries(monkeypatch, tmp_path):
    writable_dir = tmp_path / "worker"
    writable_dir.mkdir()
    assistant = Agent(
        NodeConfig(
            node_type=NodeType.ASSISTANT,
            role_name="Steward",
            tools=["create_formation", "spawn"],
            allow_network=False,
        ),
        uuid="assistant",
    )
    registry.register_formation(
        Formation(
            id="formation-owned",
            owner_agent_id="assistant",
            name="Owned Formation",
        )
    )
    registry.register(assistant)

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(
                    name="Worker",
                    system_prompt="...",
                    included_tools=["read", "exec"],
                )
            ]
        ),
    )
    monkeypatch.setattr(Agent, "start", lambda self: None)

    result = json.loads(
        SpawnTool().execute(
            assistant,
            {
                "role_name": "Worker",
                "formation_id": "formation-owned",
                "tools": ["fetch"],
                "write_dirs": [str(writable_dir)],
                "allow_network": True,
            },
        )
    )

    child = registry.get(result["agent_id"])

    assert result["formation_id"] == "formation-owned"
    assert child is not None
    assert child.config.tools == [*MINIMUM_TOOLS, "read", "exec", "fetch"]
    assert child.config.write_dirs == [str(writable_dir)]
    assert child.config.allow_network is True
