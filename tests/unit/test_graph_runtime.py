from app.agent import Agent
from app.graph_runtime import resolve_node_ref
from app.models import NodeConfig, NodeType
from app.registry import registry


def setup_function():
    registry.reset()


def teardown_function():
    registry.reset()


def test_resolve_node_ref_matches_exact_uuid():
    planner = Agent(
        NodeConfig(node_type=NodeType.AGENT),
        uuid="12345678-aaaa-bbbb-cccc-ddddeeeeffff",
    )
    registry.register(planner)

    assert resolve_node_ref("12345678-aaaa-bbbb-cccc-ddddeeeeffff") is planner


def test_resolve_node_ref_matches_exact_name():
    planner = Agent(
        NodeConfig(node_type=NodeType.AGENT, name="Planner"),
        uuid="12345678-aaaa-bbbb-cccc-ddddeeeeffff",
    )
    registry.register(planner)

    assert resolve_node_ref("Planner") is planner


def test_resolve_node_ref_matches_short_uuid_prefix():
    planner = Agent(
        NodeConfig(node_type=NodeType.AGENT),
        uuid="12345678-aaaa-bbbb-cccc-ddddeeeeffff",
    )
    reviewer = Agent(
        NodeConfig(node_type=NodeType.AGENT),
        uuid="87654321-aaaa-bbbb-cccc-ddddeeeeffff",
    )
    registry.register(planner)
    registry.register(reviewer)

    assert resolve_node_ref("12345678") is planner


def test_resolve_node_ref_rejects_ambiguous_prefix():
    planner = Agent(
        NodeConfig(node_type=NodeType.AGENT),
        uuid="1234aaaa-aaaa-bbbb-cccc-ddddeeeeffff",
    )
    reviewer = Agent(
        NodeConfig(node_type=NodeType.AGENT),
        uuid="1234bbbb-aaaa-bbbb-cccc-ddddeeeeffff",
    )
    registry.register(planner)
    registry.register(reviewer)

    assert resolve_node_ref("1234") is None


def test_resolve_node_ref_rejects_too_short_prefix():
    planner = Agent(
        NodeConfig(node_type=NodeType.AGENT),
        uuid="12345678-aaaa-bbbb-cccc-ddddeeeeffff",
    )
    registry.register(planner)

    assert resolve_node_ref("123") is None
