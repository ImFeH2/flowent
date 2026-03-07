from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, ClassVar

from app.tools import Tool

if TYPE_CHECKING:
    from app.agent import Agent


class IdleTool(Tool):
    name = "idle"
    description = (
        "Enter idle state. The agent suspends execution until a new message arrives. "
        "Use this only when the current step of work is finished or paused and you are waiting "
        "for another message from an agent or the human. Incoming messages will automatically "
        "re-activate you."
    )
    parameters: ClassVar[dict[str, Any]] = {
        "type": "object",
        "properties": {},
    }

    def execute(self, agent: Agent, args: dict[str, Any], **_kwargs: Any) -> str:
        from app.models import AgentState

        agent.set_state(AgentState.IDLE)
        agent._idle_requested = True
        return json.dumps({"status": "idle"})
