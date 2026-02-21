from __future__ import annotations

from app.models import NodeConfig, NodeType
from app.prompts.conductor import CONDUCTOR_PROMPT
from app.prompts.steward import STEWARD_PROMPT


def get_system_prompt(config: NodeConfig) -> str:
    if config.node_type == NodeType.STEWARD:
        return STEWARD_PROMPT.strip()

    if config.node_type == NodeType.CONDUCTOR:
        return CONDUCTOR_PROMPT.strip()

    from app.settings import find_role, get_settings

    settings = get_settings()
    if config.role_id:
        role = find_role(settings, config.role_id)
        if role:
            return role.system_prompt.strip()

    return (
        "You are a helpful agent. Complete the assigned task and report results back."
    )
