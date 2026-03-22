from __future__ import annotations

from app.models import NodeConfig, NodeType
from app.prompts.common import DEFAULT_AGENT_ROLE_PROMPT, compose_system_prompt
from app.prompts.steward import STEWARD_ROLE_SYSTEM_PROMPT


def get_system_prompt(config: NodeConfig) -> str:
    from app.settings import STEWARD_ROLE_NAME, find_role, get_settings

    settings = get_settings()

    if config.node_type == NodeType.ASSISTANT:
        role_name = (
            config.role_name or settings.assistant.role_name or STEWARD_ROLE_NAME
        )
        role = find_role(settings, role_name)
        prompt = role.system_prompt if role is not None else STEWARD_ROLE_SYSTEM_PROMPT
    else:
        prompt = DEFAULT_AGENT_ROLE_PROMPT
        if config.role_name:
            role = find_role(settings, config.role_name)
            if role:
                prompt = role.system_prompt

    return compose_system_prompt(
        prompt,
        custom_prompt=settings.custom_prompt,
        is_assistant=config.node_type == NodeType.ASSISTANT,
        tools=config.tools,
    )
