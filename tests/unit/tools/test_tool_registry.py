from app.agent import Agent
from app.models import NodeConfig, NodeType
from app.tools import build_tool_registry


def test_empty_tools_list_grants_minimum_tools():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=[]))

    tools = build_tool_registry().get_tools_for_agent(agent)

    assert [tool.name for tool in tools] == [
        "idle",
        "sleep",
        "todo",
        "contacts",
        "send",
    ]


def test_tool_registry_merges_explicit_allow_list_with_minimum_tools():
    agent = Agent(NodeConfig(node_type=NodeType.AGENT, tools=["idle", "todo"]))

    tools = build_tool_registry().get_tools_for_agent(agent)

    assert [tool.name for tool in tools] == [
        "idle",
        "sleep",
        "todo",
        "contacts",
        "send",
    ]


def test_tool_registry_registers_connect_and_removes_create_root():
    tool_names = [tool.name for tool in build_tool_registry().list_tools()]

    assert "create_tab" in tool_names
    assert "delete_tab" in tool_names
    assert "set_permissions" in tool_names
    assert "create_agent" in tool_names
    assert "connect" in tool_names
    assert "send" in tool_names
    assert "list_tabs" in tool_names
    assert "create_root" not in tool_names
    assert "manage_providers" in tool_names
    assert "manage_roles" in tool_names
    assert "manage_settings" in tool_names
    assert "manage_prompts" in tool_names


def test_tool_registry_grants_tab_graph_tools_when_explicitly_allowed():
    agent = Agent(
        NodeConfig(
            node_type=NodeType.ASSISTANT,
            tools=[
                "create_tab",
                "delete_tab",
                "create_agent",
                "connect",
                "list_tabs",
            ],
        )
    )

    tools = build_tool_registry().get_tools_for_agent(agent)

    assert [tool.name for tool in tools] == [
        "idle",
        "sleep",
        "todo",
        "contacts",
        "send",
        "create_tab",
        "delete_tab",
        "create_agent",
        "connect",
        "list_tabs",
    ]


def test_tool_registry_shows_management_tools_in_agent_visible_list():
    visible_tool_names = {
        tool.name for tool in build_tool_registry().list_tools(agent_visible_only=True)
    }

    assert "manage_providers" in visible_tool_names
    assert "manage_roles" in visible_tool_names
    assert "manage_settings" in visible_tool_names
    assert "manage_prompts" in visible_tool_names
    assert "set_permissions" in visible_tool_names
    assert "send" in visible_tool_names
