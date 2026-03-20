from app.models import NodeConfig, NodeType
from app.prompts import get_system_prompt
from app.prompts.common import (
    ASSISTANT_ONLY_PROMPT,
    COMMON_AGENT_PROMPT,
    COMMUNICATION_USAGE_GUIDANCE,
    DEFAULT_AGENT_ROLE_PROMPT,
    compose_system_prompt,
)
from app.prompts.steward import STEWARD_ROLE_SYSTEM_PROMPT
from app.settings import (
    CONDUCTOR_ROLE_SYSTEM_PROMPT,
    STEWARD_ROLE_NAME,
    WORKER_ROLE_SYSTEM_PROMPT,
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


def test_compose_system_prompt_inserts_assistant_layer_before_custom_prompt():
    result = compose_system_prompt(
        "Role-specific instructions.",
        custom_prompt="Global custom instructions.",
        is_assistant=True,
    )

    assert result == "\n\n".join(
        [
            COMMON_AGENT_PROMPT,
            ASSISTANT_ONLY_PROMPT,
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


def test_common_communication_guidance_requires_explicit_target_routing():
    assert (
        "must start with `@<name-or-uuid>: message body`"
        in COMMUNICATION_USAGE_GUIDANCE
    )
    assert (
        "Do not combine a Human-facing reply and a routed `@target` message"
        in COMMUNICATION_USAGE_GUIDANCE
    )
    assert "automatically delivered to your parent" not in COMMUNICATION_USAGE_GUIDANCE
    assert "`spawn` only creates and connects a new agent" in COMMON_AGENT_PROMPT
    assert (
        "send it a concrete first task with a content block whose first line starts with `@target: ...`"
        in COMMON_AGENT_PROMPT
    )
    assert "`idle` will return the idle duration" in COMMON_AGENT_PROMPT
    assert "`sleep(seconds)`" in COMMON_AGENT_PROMPT
    assert "`sleep` returns the actual waited duration" in COMMON_AGENT_PROMPT


def test_get_system_prompt_reads_global_custom_prompt(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            custom_prompt="Global custom instructions.",
            custom_post_prompt="Runtime-only reminder.",
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
    assert "Runtime-only reminder." not in prompt


def test_get_system_prompt_reads_assistant_role_prompt_when_custom_prompt_is_empty(
    monkeypatch,
):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            custom_prompt="",
            roles=[
                RoleConfig(
                    name=STEWARD_ROLE_NAME,
                    system_prompt=STEWARD_ROLE_SYSTEM_PROMPT,
                )
            ],
        ),
    )

    prompt = get_system_prompt(
        NodeConfig(node_type=NodeType.ASSISTANT, role_name=STEWARD_ROLE_NAME)
    )

    assert prompt == compose_system_prompt(
        STEWARD_ROLE_SYSTEM_PROMPT,
        custom_prompt="",
        is_assistant=True,
    )
    assert ASSISTANT_ONLY_PROMPT in prompt
    assert "create_graph" in prompt
    assert "spawn" in prompt
    assert "manage_providers" in prompt
    assert "manage_roles" in prompt
    assert "manage_settings" in prompt
    assert "manage_prompts" in prompt
    assert "Conductor at startup" not in prompt
    assert "send(to=conductor_id" not in prompt
    assert "Immediately send that new node its first task" in prompt
    assert "call `idle` in the same response" in prompt
    assert "Do not repeat or restate a Human-facing reply" in prompt
    assert "A single content block is either a Human-facing reply or a routed" in prompt


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
    assert ASSISTANT_ONLY_PROMPT not in prompt
    assert "@target:" not in CONDUCTOR_ROLE_SYSTEM_PROMPT
    assert "plain text output" not in CONDUCTOR_ROLE_SYSTEM_PROMPT
    assert "plain content" not in CONDUCTOR_ROLE_SYSTEM_PROMPT
    assert "your parent" not in CONDUCTOR_ROLE_SYSTEM_PROMPT
    assert "**Dispatch immediately** after each `spawn`" in CONDUCTOR_ROLE_SYSTEM_PROMPT


def test_get_system_prompt_falls_back_when_role_is_missing(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[]),
    )

    prompt = get_system_prompt(NodeConfig(node_type=NodeType.AGENT, role_name="Ghost"))

    assert prompt == compose_system_prompt(DEFAULT_AGENT_ROLE_PROMPT, custom_prompt="")
    assert ASSISTANT_ONLY_PROMPT not in prompt
    assert "@target:" not in WORKER_ROLE_SYSTEM_PROMPT
    assert "your parent" not in WORKER_ROLE_SYSTEM_PROMPT


def test_get_system_prompt_falls_back_to_steward_role_for_assistant(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[]),
    )

    prompt = get_system_prompt(
        NodeConfig(node_type=NodeType.ASSISTANT, role_name="Ghost")
    )

    assert prompt == compose_system_prompt(
        STEWARD_ROLE_SYSTEM_PROMPT,
        custom_prompt="",
        is_assistant=True,
    )
    assert ASSISTANT_ONLY_PROMPT in prompt
