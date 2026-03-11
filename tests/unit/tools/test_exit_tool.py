import json

from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.tools.exit import ExitTool


def test_exit_tool_rejects_steward():
    steward = Agent(NodeConfig(node_type=NodeType.STEWARD), uuid="steward")

    result = json.loads(ExitTool().execute(steward, {}))

    assert result == {"error": "steward cannot be terminated"}


def test_exit_tool_allows_conductor_role_agent():
    conductor = Agent(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
        ),
        uuid="conductor",
    )

    result = json.loads(ExitTool().execute(conductor, {"reason": "done"}))

    assert result == {"status": "terminating", "reason": "done"}
