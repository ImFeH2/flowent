from app.models import NodeConfig, NodeType
from app.prompts import get_system_prompt
from app.prompts.common import (
    ASSISTANT_ONLY_PROMPT,
    COMMUNICATION_USAGE_GUIDANCE,
    DEFAULT_AGENT_ROLE_PROMPT,
    DELEGATION_GENERAL_GUIDANCE,
    FILE_PATH_GUIDANCE,
    FORMATION_TOOL_GUIDANCE,
    IDLE_TOOL_GUIDANCE,
    LIST_ROLES_TOOL_GUIDANCE,
    LIST_TOOLS_TOOL_GUIDANCE,
    MANAGE_TOOLS_GUIDANCE,
    SLEEP_TOOL_GUIDANCE,
    SPAWN_TOOL_GUIDANCE,
    compose_system_prompt,
)
from app.prompts.steward import STEWARD_ROLE_SYSTEM_PROMPT
from app.settings import (
    CONDUCTOR_ROLE_INCLUDED_TOOLS,
    CONDUCTOR_ROLE_SYSTEM_PROMPT,
    STEWARD_ROLE_INCLUDED_TOOLS,
    STEWARD_ROLE_NAME,
    WORKER_ROLE_SYSTEM_PROMPT,
    RoleConfig,
    Settings,
    build_conductor_role,
)
from app.tools import MINIMUM_TOOLS


def _join(*parts: str) -> str:
    return "\n\n".join(part.strip() for part in parts if part.strip())


def _with_minimum_tools(*tools: str) -> list[str]:
    return list(dict.fromkeys([*tools, *MINIMUM_TOOLS]))


def test_compose_system_prompt_inserts_custom_prompt_between_tool_guidance_and_role():
    result = compose_system_prompt(
        "Role-specific instructions.",
        custom_prompt="Global custom instructions.",
        tools=["idle", "spawn"],
    )

    assert result == _join(
        COMMUNICATION_USAGE_GUIDANCE,
        FILE_PATH_GUIDANCE,
        IDLE_TOOL_GUIDANCE,
        DELEGATION_GENERAL_GUIDANCE,
        SPAWN_TOOL_GUIDANCE,
        "Global custom instructions.",
        "Role-specific instructions.",
    )


def test_compose_system_prompt_inserts_assistant_layer_before_custom_prompt():
    result = compose_system_prompt(
        "Role-specific instructions.",
        custom_prompt="Global custom instructions.",
        is_assistant=True,
        tools=["idle"],
    )

    assert result == _join(
        COMMUNICATION_USAGE_GUIDANCE,
        FILE_PATH_GUIDANCE,
        IDLE_TOOL_GUIDANCE,
        ASSISTANT_ONLY_PROMPT,
        "Global custom instructions.",
        "Role-specific instructions.",
    )


def test_compose_system_prompt_ignores_empty_custom_prompt():
    result = compose_system_prompt(
        "Role-specific instructions.",
        custom_prompt="  ",
        tools=["idle"],
    )

    assert result == _join(
        COMMUNICATION_USAGE_GUIDANCE,
        FILE_PATH_GUIDANCE,
        IDLE_TOOL_GUIDANCE,
        "Role-specific instructions.",
    )


def test_compose_system_prompt_injects_spawn_guidance_when_tool_present():
    result = compose_system_prompt("Role-specific instructions.", tools=["spawn"])

    assert DELEGATION_GENERAL_GUIDANCE in result
    assert SPAWN_TOOL_GUIDANCE in result
    assert FORMATION_TOOL_GUIDANCE not in result
    assert "dispatch tasks to ALL of them before calling" in SPAWN_TOOL_GUIDANCE
    assert "Do not insert tool calls between task dispatches" in SPAWN_TOOL_GUIDANCE


def test_compose_system_prompt_omits_spawn_guidance_when_tool_absent():
    result = compose_system_prompt("Role-specific instructions.", tools=["read"])

    assert DELEGATION_GENERAL_GUIDANCE not in result
    assert SPAWN_TOOL_GUIDANCE not in result


def test_compose_system_prompt_injects_formation_parallel_dispatch_guidance():
    result = compose_system_prompt(
        "Role-specific instructions.",
        tools=["create_formation"],
    )

    assert FORMATION_TOOL_GUIDANCE in result
    assert "dispatch tasks to all nodes" in FORMATION_TOOL_GUIDANCE
    assert "aggregator or synthesizer" in FORMATION_TOOL_GUIDANCE


def test_compose_system_prompt_injects_management_guidance_when_manage_tool_present():
    result = compose_system_prompt(
        "Role-specific instructions.",
        tools=["manage_providers"],
    )

    assert MANAGE_TOOLS_GUIDANCE in result
    assert "`manage_providers`" in result
    assert "`manage_roles`" in result
    assert "`manage_settings`" in result
    assert "`manage_prompts`" in result


def test_common_communication_guidance_requires_explicit_target_routing():
    assert (
        "must start with `@<name-or-uuid>: message body`"
        in COMMUNICATION_USAGE_GUIDANCE
    )
    assert "Only one target ref is supported" in COMMUNICATION_USAGE_GUIDANCE
    assert "Do not use commas in the target field." in COMMUNICATION_USAGE_GUIDANCE
    assert (
        "emit separate content blocks with one `@target:` header per block"
        in COMMUNICATION_USAGE_GUIDANCE
    )
    assert "Prefer using node names" in COMMUNICATION_USAGE_GUIDANCE
    assert (
        "A single content block is either plain output or a `@target:` routed message"
        in COMMUNICATION_USAGE_GUIDANCE
    )
    assert (
        "later `@...:` lines are treated as body text for the first target"
        in COMMUNICATION_USAGE_GUIDANCE
    )
    assert (
        "Plain content that does not start with `@target:` will not be seen by any other node."
        in COMMUNICATION_USAGE_GUIDANCE
    )
    assert (
        "route the result to the appropriate destination"
        in COMMUNICATION_USAGE_GUIDANCE
    )
    assert (
        "Do not call `idle` after completing a task without first routing the result"
        in COMMUNICATION_USAGE_GUIDANCE
    )
    assert "automatically delivered to your parent" not in COMMUNICATION_USAGE_GUIDANCE


def test_file_path_guidance_requires_relative_paths():
    assert "relative paths" in FILE_PATH_GUIDANCE
    assert "Do not guess absolute paths like /workspace or /home." in FILE_PATH_GUIDANCE
    assert "run `pwd` first" in FILE_PATH_GUIDANCE


def test_compose_system_prompt_always_includes_file_path_guidance():
    result = compose_system_prompt("Role-specific instructions.", tools=["read"])

    assert FILE_PATH_GUIDANCE in result
    assert result.index(COMMUNICATION_USAGE_GUIDANCE) < result.index(FILE_PATH_GUIDANCE)


def test_assistant_only_prompt_keeps_frontend_semantics_without_repeating_block_rule():
    assert "frontend chat panel" in ASSISTANT_ONLY_PROMPT
    assert (
        "Plain content that does not start with `@target:` is a reply to the Human."
        in ASSISTANT_ONLY_PROMPT
    )
    assert "A single content block is either" not in ASSISTANT_ONLY_PROMPT


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
        NodeConfig(node_type=NodeType.AGENT, role_name="Reviewer", tools=["read"])
    )

    assert prompt == compose_system_prompt(
        "Review code carefully.",
        custom_prompt="Global custom instructions.",
        tools=_with_minimum_tools("read"),
    )
    assert "Runtime-only reminder." not in prompt


def test_get_system_prompt_merges_minimum_tools_for_guidance(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(
                    name="Reviewer",
                    system_prompt="Review code carefully.",
                )
            ],
        ),
    )

    prompt = get_system_prompt(
        NodeConfig(node_type=NodeType.AGENT, role_name="Reviewer", tools=["read"])
    )

    assert IDLE_TOOL_GUIDANCE in prompt
    assert SLEEP_TOOL_GUIDANCE in prompt


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
        NodeConfig(
            node_type=NodeType.ASSISTANT,
            role_name=STEWARD_ROLE_NAME,
            tools=list(STEWARD_ROLE_INCLUDED_TOOLS),
        )
    )

    assert prompt == compose_system_prompt(
        STEWARD_ROLE_SYSTEM_PROMPT,
        custom_prompt="",
        is_assistant=True,
        tools=_with_minimum_tools(*STEWARD_ROLE_INCLUDED_TOOLS),
    )
    assert ASSISTANT_ONLY_PROMPT in prompt
    assert LIST_ROLES_TOOL_GUIDANCE in prompt
    assert LIST_TOOLS_TOOL_GUIDANCE in prompt
    assert MANAGE_TOOLS_GUIDANCE in prompt
    assert "## Tools Available" not in prompt
    assert (
        "create_formation(name=..., goal=..., nodes=[{name, role, tools}])"
        in STEWARD_ROLE_SYSTEM_PROMPT
    )
    assert (
        "When a task contains two or more independent subtasks that can run in parallel"
        in STEWARD_ROLE_SYSTEM_PROMPT
    )
    assert (
        "When in doubt between a single Worker and multiple agents, prefer multiple agents."
        in STEWARD_ROLE_SYSTEM_PROMPT
    )
    assert "instruct each node where to send its result" in STEWARD_ROLE_SYSTEM_PROMPT
    assert (
        "Use `spawn` only when you need to add nodes to an existing formation dynamically, not as the primary creation method"
        in STEWARD_ROLE_SYSTEM_PROMPT
    )
    assert (
        "If role or tool availability is uncertain, use `list_roles` and `list_tools` to inspect the current options before acting"
        in STEWARD_ROLE_SYSTEM_PROMPT
    )
    assert "call `idle` in the same response" in prompt
    assert "Do not repeat or restate a Human-facing reply" in prompt


def test_get_system_prompt_reads_conductor_prompt_via_role_system(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[build_conductor_role()],
        ),
    )

    prompt = get_system_prompt(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Conductor",
            tools=list(CONDUCTOR_ROLE_INCLUDED_TOOLS),
        )
    )

    assert prompt == compose_system_prompt(
        CONDUCTOR_ROLE_SYSTEM_PROMPT,
        custom_prompt="",
        tools=_with_minimum_tools(*CONDUCTOR_ROLE_INCLUDED_TOOLS),
    )
    assert ASSISTANT_ONLY_PROMPT not in prompt
    assert LIST_ROLES_TOOL_GUIDANCE in prompt
    assert LIST_TOOLS_TOOL_GUIDANCE in prompt
    assert SPAWN_TOOL_GUIDANCE in prompt
    assert FORMATION_TOOL_GUIDANCE in prompt
    assert "## Tools Available" not in CONDUCTOR_ROLE_SYSTEM_PROMPT
    assert (
        "Prefer multi-agent parallelism over serial single-agent execution."
        in CONDUCTOR_ROLE_SYSTEM_PROMPT
    )
    assert (
        "specify where each node should send its result" in CONDUCTOR_ROLE_SYSTEM_PROMPT
    )
    assert (
        "prefer one declarative `create_formation(name=..., goal=..., nodes=[...], edges=[...])` call"
        in CONDUCTOR_ROLE_SYSTEM_PROMPT
    )
    assert (
        "**Create the formation structure** declaratively when possible"
        in CONDUCTOR_ROLE_SYSTEM_PROMPT
    )
    assert "**Dispatch immediately** after creation" in CONDUCTOR_ROLE_SYSTEM_PROMPT


def test_get_system_prompt_for_worker_omits_spawn_and_formation_guidance(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(
            roles=[
                RoleConfig(
                    name="Worker",
                    system_prompt=WORKER_ROLE_SYSTEM_PROMPT,
                )
            ],
        ),
    )

    prompt = get_system_prompt(
        NodeConfig(
            node_type=NodeType.AGENT,
            role_name="Worker",
            tools=["read", "exec"],
        )
    )

    assert SPAWN_TOOL_GUIDANCE not in prompt
    assert FORMATION_TOOL_GUIDANCE not in prompt
    assert DELEGATION_GENERAL_GUIDANCE not in prompt


def test_get_system_prompt_falls_back_when_role_is_missing(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[]),
    )

    prompt = get_system_prompt(
        NodeConfig(node_type=NodeType.AGENT, role_name="Ghost", tools=["read"])
    )

    assert prompt == compose_system_prompt(
        DEFAULT_AGENT_ROLE_PROMPT,
        custom_prompt="",
        tools=_with_minimum_tools("read"),
    )
    assert ASSISTANT_ONLY_PROMPT not in prompt
    assert "@target:" not in WORKER_ROLE_SYSTEM_PROMPT
    assert "your parent" not in WORKER_ROLE_SYSTEM_PROMPT


def test_get_system_prompt_falls_back_to_steward_role_for_assistant(monkeypatch):
    monkeypatch.setattr(
        "app.settings.get_settings",
        lambda: Settings(roles=[]),
    )

    prompt = get_system_prompt(
        NodeConfig(
            node_type=NodeType.ASSISTANT,
            role_name="Ghost",
            tools=list(STEWARD_ROLE_INCLUDED_TOOLS),
        )
    )

    assert prompt == compose_system_prompt(
        STEWARD_ROLE_SYSTEM_PROMPT,
        custom_prompt="",
        is_assistant=True,
        tools=_with_minimum_tools(*STEWARD_ROLE_INCLUDED_TOOLS),
    )
    assert ASSISTANT_ONLY_PROMPT in prompt


def test_steward_included_tools_contains_list_roles_and_list_tools():
    assert "list_roles" in STEWARD_ROLE_INCLUDED_TOOLS
    assert "list_tools" in STEWARD_ROLE_INCLUDED_TOOLS


def test_steward_prompt_requires_same_response_dispatch_and_no_rebroadcast():
    assert "In the same assistant turn after creation" in STEWARD_ROLE_SYSTEM_PROMPT
    assert (
        "Each block must contain exactly one routed header"
        in STEWARD_ROLE_SYSTEM_PROMPT
    )
    assert "Do not re-send a task to a node" in STEWARD_ROLE_SYSTEM_PROMPT
    assert (
        "Do not insert tool calls such as `list_connections`"
        in STEWARD_ROLE_SYSTEM_PROMPT
    )
