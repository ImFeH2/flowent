from app.models import NodeConfig, NodeType
from app.prompts import get_system_prompt
from app.prompts.common import (
    COMMON_AGENT_PROMPT,
    DEFAULT_AGENT_ROLE_PROMPT,
    compose_system_prompt,
)
from app.prompts.steward import STEWARD_PROMPT
from app.settings import (
    CONDUCTOR_ROLE_SYSTEM_PROMPT,
    RoleConfig,
    Settings,
    build_conductor_role,
)


def test_compose_system_prompt_inserts_custom_prompt_between_common_and_role():
    result = compose_system_prompt(
        "Role-specific instructions.",
        custom_prompt="Global custom instructions.",
    )

    assert result == "\n\n".join(
        [
            COMMON_AGENT_PROMPT,
            "Global custom instructions.",
            "Role-specific instructions.",
        ]
    )


def test_compose_system_prompt_ignores_empty_custom_prompt():
    result = compose_system_prompt("Role-specific instructions.", custom_prompt="  ")

    assert result == "\n\n".join(
        [
            COMMON_AGENT_PROMPT,
            "Role-specific instructions.",
        ]
    )


def test_get_system_prompt_reads_global_custom_prompt(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            custom_prompt="Global custom instructions.",
            roles=[
                RoleConfig(
                    name="Reviewer",
                    system_prompt="Review code carefully.",
                )
            ],
        ),
    )

    prompt = get_system_prompt(
        NodeConfig(node_type=NodeType.AGENT, role_name="Reviewer")
    )

    assert prompt == "\n\n".join(
        [
            COMMON_AGENT_PROMPT,
            "Global custom instructions.",
            "Review code carefully.",
        ]
    )


def test_get_system_prompt_keeps_builtin_behavior_when_custom_prompt_is_empty(
    monkeypatch,
):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(custom_prompt=""),
    )

    prompt = get_system_prompt(NodeConfig(node_type=NodeType.STEWARD))

    assert prompt == compose_system_prompt(STEWARD_PROMPT, custom_prompt="")
    assert "create_root" in prompt
    assert "Conductor at startup" not in prompt
    assert "send(to=conductor_id" not in prompt


def test_get_system_prompt_reads_conductor_prompt_via_role_system(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[build_conductor_role()],
        ),
    )

    prompt = get_system_prompt(
        NodeConfig(node_type=NodeType.AGENT, role_name="Conductor")
    )

    assert prompt == compose_system_prompt(
        CONDUCTOR_ROLE_SYSTEM_PROMPT,
        custom_prompt="",
    )


def test_get_system_prompt_falls_back_when_role_is_missing(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[]),
    )

    prompt = get_system_prompt(NodeConfig(node_type=NodeType.AGENT, role_name="Ghost"))

    assert prompt == compose_system_prompt(DEFAULT_AGENT_ROLE_PROMPT, custom_prompt="")
