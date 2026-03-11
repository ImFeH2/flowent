from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.tools import build_tool_registry


def test_empty_tools_list_grants_minimum_tools():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=[]))

    tools = build_tool_registry().get_tools_for_agent(agent)

    assert [tool.name for tool in tools] == [
        "send",
        "idle",
        "todo",
        "list_connections",
        "exit",
    ]


def test_tool_registry_merges_explicit_allow_list_with_minimum_tools():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["idle", "todo"]))

    tools = build_tool_registry().get_tools_for_agent(agent)

    assert [tool.name for tool in tools] == [
        "send",
        "idle",
        "todo",
        "list_connections",
        "exit",
    ]


def test_tool_registry_does_not_register_connect_tool():
    tool_names = [tool.name for tool in build_tool_registry().list_tools()]

    assert "connect" not in tool_names
    assert "create_root" in tool_names


def test_tool_registry_grants_create_root_when_explicitly_allowed():
    agent = Agent(NodeConfig(node_type=NodeType.STEWARD, tools=["create_root"]))

    tools = build_tool_registry().get_tools_for_agent(agent)

    assert [tool.name for tool in tools] == [
        "send",
        "idle",
        "todo",
        "list_connections",
        "exit",
        "create_root",
    ]
