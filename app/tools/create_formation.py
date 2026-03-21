from __future__ import annotations

import json
import uuid
from typing import TYPE_CHECKING, Any, ClassVar

from app.formation_runtime import emit_formation_created
from app.models import Formation
from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class CreateFormationTool(Tool):
    name = "create_formation"
    description = "Create a child formation owned by the current agent."
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Human-readable formation name",
            },
            "goal": {
                "type": "string",
                "description": "Goal or purpose of this formation",
            },
        },
        "required": [],
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.registry import registry

        name = args.get("name")
        goal = args.get("goal")
        if name is not None and not isinstance(name, str):
            return json.dumps({"error": "name must be a string"})
        if goal is not None and not isinstance(goal, str):
            return json.dumps({"error": "goal must be a string"})

        formation = Formation(
            id=str(uuid.uuid4()),
            owner_agent_id=agent.uuid,
            parent_formation_id=agent.config.formation_id,
            name=name.strip() if isinstance(name, str) and name.strip() else None,
            goal=goal.strip() if isinstance(goal, str) else "",
        )
        registry.register_formation(formation)
        emit_formation_created(formation)
        return json.dumps(formation.serialize())
