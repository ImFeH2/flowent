from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.tools import build_tool_registry


def test_empty_tools_list_grants_minimum_tools():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=[]))

    tools = build_tool_registry().get_tools_for_agent(agent)

    assert [tool.name for tool in tools] == [
        "send",
        "list_connections",
        "todo",
        "idle",
        "exit",
    ]


def test_tool_registry_merges_explicit_allow_list_with_minimum_tools():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["idle", "todo"]))

    tools = build_tool_registry().get_tools_for_agent(agent)

    assert [tool.name for tool in tools] == [
        "send",
        "list_connections",
        "todo",
        "idle",
        "exit",
    ]
