import json

from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.tools.exit import ExitTool


def test_exit_tool_rejects_assistant():
    assistant = Agent(NodeConfig(node_type=NodeType.ASSISTANT), uuid="assistant")

    result = json.loads(ExitTool().execute(assistant, {}))

    assert result == {"error": "assistant cannot be terminated"}


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
