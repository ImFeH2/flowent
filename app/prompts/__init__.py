from __future__ import annotations

from app.models import NodeConfig, NodeType
from app.prompts.common import DEFAULT_AGENT_ROLE_PROMPT, compose_system_prompt
from app.prompts.conductor import CONDUCTOR_PROMPT
from app.prompts.steward import STEWARD_PROMPT


def get_system_prompt(config: NodeConfig) -> str:
    if config.node_type == NodeType.STEWARD:
        prompt = STEWARD_PROMPT
    elif config.node_type == NodeType.CONDUCTOR:
        prompt = CONDUCTOR_PROMPT
    else:
        from app.settings import find_role, get_settings

        prompt = DEFAULT_AGENT_ROLE_PROMPT
        if config.role_name:
            settings = get_settings()
            role = find_role(settings, config.role_name)
            if role:
                prompt = role.system_prompt

    return compose_system_prompt(prompt)
