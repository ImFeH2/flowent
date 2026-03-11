import json

import pytest

from app.agent import Agent
from app.models import AgentState, NodeConfig, NodeType
from app.registry import registry
from app.settings import RoleConfig, RootBoundary, Settings
from app.tools import MINIMUM_TOOLS
from app.tools.create_root import CreateRootTool


@pytest.fixture(autouse=True)
def reset_registry():
    registry.reset()
    yield
    registry.reset()


def test_create_root_registers_root_agent_and_connects_to_steward(
    monkeypatch,
    tmp_path,
):
    steward = Agent(
        NodeConfig(
            node_type=NodeType.STEWARD,
            tools=["create_root"],
            write_dirs=[],
            allow_network=False,
        ),
        uuid="steward",
    )
    registry.register(steward)

    workspace = tmp_path / "workspace"
    notes_dir = workspace / "notes"
    notes_dir.mkdir(parents=True)

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            root_boundary=RootBoundary(write_dirs=[str(workspace)]),
            roles=[
                RoleConfig(
                    name="Worker",
                    system_prompt="...",
                    included_tools=["read"],
                    excluded_tools=["fetch"],
                )
            ],
        ),
    )
    monkeypatch.setattr(Agent, "start", lambda self: None)

    result = json.loads(
        CreateRootTool().execute(
            steward,
            {
                "role_name": "Worker",
                "name": "Root Worker",
                "tools": ["edit", "fetch"],
                "write_dirs": [str(notes_dir)],
            },
        )
    )

    child_id = result["agent_id"]
    child = registry.get(child_id)

    assert result == {"agent_id": child_id, "role_name": "Worker"}
    assert child is not None
    assert child.config.node_type == NodeType.AGENT
    assert child.config.role_name == "Worker"
    assert child.config.name == "Root Worker"
    assert child.config.tools == [*MINIMUM_TOOLS, "read", "edit"]
    assert child.config.write_dirs == [str(notes_dir)]
    assert steward.is_connected_to(child_id) is True
    assert child.is_connected_to("steward") is True


def test_create_root_rejects_write_dir_outside_root_boundary(monkeypatch, tmp_path):
    steward = Agent(
        NodeConfig(node_type=NodeType.STEWARD, tools=["create_root"]),
        uuid="steward",
    )
    registry.register(steward)

    allowed_dir = tmp_path / "allowed"
    blocked_dir = tmp_path / "blocked"
    allowed_dir.mkdir()
    blocked_dir.mkdir()

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            root_boundary=RootBoundary(write_dirs=[str(allowed_dir)]),
            roles=[RoleConfig(name="Worker", system_prompt="...")],
        ),
    )

    result = json.loads(
        CreateRootTool().execute(
            steward,
            {
                "role_name": "Worker",
                "write_dirs": [str(blocked_dir)],
            },
        )
    )

    assert result == {"error": f"write_dirs boundary exceeded: {blocked_dir}"}
    assert len(registry.get_all()) == 1


def test_create_root_rejects_network_outside_root_boundary(monkeypatch):
    steward = Agent(
        NodeConfig(node_type=NodeType.STEWARD, tools=["create_root"]),
        uuid="steward",
    )
    registry.register(steward)

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            root_boundary=RootBoundary(allow_network=False),
            roles=[RoleConfig(name="Worker", system_prompt="...")],
        ),
    )

    result = json.loads(
        CreateRootTool().execute(
            steward,
            {
                "role_name": "Worker",
                "allow_network": True,
            },
        )
    )

    assert result == {
        "error": "allow_network boundary exceeded: root boundary disallows network access"
    }
    assert len(registry.get_all()) == 1


def test_create_root_delivers_initial_task_after_idle(monkeypatch):
    steward = Agent(
        NodeConfig(node_type=NodeType.STEWARD, tools=["create_root"]),
        uuid="steward",
    )
    registry.register(steward)

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
        raise AssertionError("create_root should not enqueue the task directly")

    monkeypatch.setattr(Agent, "start", fake_start)
    monkeypatch.setattr(Agent, "wait_until_idle", fake_wait_until_idle)
    monkeypatch.setattr(Agent, "enqueue_message", fail_enqueue_message)
    monkeypatch.setattr("app.tools.create_root.send_message", fake_send_message)

    result = json.loads(
        CreateRootTool().execute(
            steward,
            {
                "role_name": "Worker",
                "task": "handle this task",
                "tools": ["edit"],
            },
        )
    )

    child_id = result["agent_id"]
    child = registry.get(child_id)

    assert result == {"agent_id": child_id, "role_name": "Worker"}
    assert child is not None
    assert child.config.tools == [*MINIMUM_TOOLS, "read", "edit"]
    assert call_order == [
        ("start", child_id),
        ("wait_until_idle", child_id, 5.0),
        ("send_message", "steward", child_id, "handle this task"),
    ]


def test_create_root_ignores_caller_boundary_and_uses_root_boundary(
    monkeypatch,
    tmp_path,
):
    steward = Agent(
        NodeConfig(
            node_type=NodeType.STEWARD,
            tools=["create_root"],
            write_dirs=[],
            allow_network=False,
        ),
        uuid="steward",
    )
    registry.register(steward)

    workspace = tmp_path / "workspace"
    output_dir = workspace / "output"
    output_dir.mkdir(parents=True)

    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            root_boundary=RootBoundary(
                write_dirs=[str(workspace)],
                allow_network=True,
            ),
            roles=[RoleConfig(name="Worker", system_prompt="...")],
        ),
    )
    monkeypatch.setattr(Agent, "start", lambda self: None)

    result = json.loads(
        CreateRootTool().execute(
            steward,
            {
                "role_name": "Worker",
                "write_dirs": [str(output_dir)],
                "allow_network": True,
            },
        )
    )

    child = registry.get(result["agent_id"])

    assert result["role_name"] == "Worker"
    assert child is not None
    assert child.config.write_dirs == [str(output_dir)]
    assert child.config.allow_network is True
