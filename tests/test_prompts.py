from app.models import NodeConfig, NodeType
from app.prompts import get_system_prompt
from app.prompts.common import (
    COMMON_AGENT_PROMPT,
    DEFAULT_AGENT_ROLE_PROMPT,
    compose_system_prompt,
)
from app.prompts.conductor import CONDUCTOR_PROMPT
from app.prompts.steward import STEWARD_PROMPT


def test_compose_system_prompt_appends_role_prompt():
    prompt = compose_system_prompt("Role-specific guidance")

    assert prompt == f"{COMMON_AGENT_PROMPT}\n\nRole-specific guidance"


def test_get_system_prompt_for_steward_uses_common_prefix():
    prompt = get_system_prompt(NodeConfig(node_type=NodeType.STEWARD))

    assert prompt == f"{COMMON_AGENT_PROMPT}\n\n{STEWARD_PROMPT.strip()}"


def test_get_system_prompt_for_conductor_uses_common_prefix():
    prompt = get_system_prompt(NodeConfig(node_type=NodeType.CONDUCTOR))

    assert prompt == f"{COMMON_AGENT_PROMPT}\n\n{CONDUCTOR_PROMPT.strip()}"


def test_get_system_prompt_for_default_agent_uses_common_prefix():
    prompt = get_system_prompt(NodeConfig(node_type=NodeType.AGENT))

    assert prompt == f"{COMMON_AGENT_PROMPT}\n\n{DEFAULT_AGENT_ROLE_PROMPT}"


def test_common_prompt_requires_immediate_delegation_on_clear_mismatch():
    assert (
        "your first reaction should be delegation or handoff, not solo execution"
        in COMMON_AGENT_PROMPT
    )
    assert (
        "Do not start with repeated local retries when the better move is obvious delegation."
        in COMMON_AGENT_PROMPT
    )
