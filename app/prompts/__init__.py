from __future__ import annotations

from app.models import NodeConfig, NodeType
from app.prompts.common import IDLE_USAGE_GUIDANCE
from app.prompts.conductor import CONDUCTOR_PROMPT
from app.prompts.steward import STEWARD_PROMPT


def get_system_prompt(config: NodeConfig) -> str:
    if config.node_type == NodeType.STEWARD:
        prompt = STEWARD_PROMPT.strip()
    elif config.node_type == NodeType.CONDUCTOR:
        prompt = CONDUCTOR_PROMPT.strip()
    else:
        from app.settings import find_role, get_settings

        settings = get_settings()
        prompt = "You are a helpful agent. Complete the assigned task and report results back."
        if config.role_id:
            role = find_role(settings, config.role_id)
            if role:
                prompt = role.system_prompt.strip()

    return f"{IDLE_USAGE_GUIDANCE.strip()}\\n\\n{prompt}".strip()
